import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { safeEmailActivityError } from "../_shared/emailActivity.ts";

const MAX_TIMESTAMP_AGE_SECONDS = 300;

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function verifySignature(request: Request, rawBody: string, secret: string) {
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signatures = request.headers.get("svix-signature");
  if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false;
  const timestampNumber = Number(timestamp);
  if (!Number.isSafeInteger(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > MAX_TIMESTAMP_AGE_SECONDS) return false;

  const secretValue = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let keyBytes: Uint8Array;
  try {
    keyBytes = decodeBase64(secretValue);
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signedContent = new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`);
  const candidates = signatures.split(" ").flatMap((item) => {
    const [version, signature] = item.split(",", 2);
    if (version !== "v1" || !signature) return [];
    try {
      return [decodeBase64(signature)];
    } catch {
      return [];
    }
  });
  for (const signature of candidates) {
    if (await crypto.subtle.verify("HMAC", key, signature, signedContent)) return true;
  }
  return false;
}

function safeProviderError(value: string) {
  return value
    .replace(/re_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/(token|secret|password|authorization)\s*[:=]\s*["']?[^ "'&,}]+/gi, "$1=[redacted]")
    .slice(0, 240);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Use POST for Resend webhook events." }, { status: 405 });
  const signingSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!signingSecret || !supabaseUrl || !serviceRoleKey) {
    console.error("Resend webhook server configuration is incomplete.");
    return Response.json({ error: "Webhook server configuration is incomplete." }, { status: 503 });
  }

  const rawBody = await request.text();
  if (!await verifySignature(request, rawBody, signingSecret)) {
    return Response.json({ error: "Webhook signature is invalid or expired." }, { status: 401 });
  }
  let event: { type?: string; data?: { email_id?: string; reason?: string; bounce?: { message?: string }; error?: { message?: string } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid webhook event body." }, { status: 400 });
  }
  const messageId = event.data?.email_id;
  const eventType = event.type;
  const deliveryStatus: Record<string, string> = {
    "email.delivered": "delivered",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.failed": "failed",
    "email.delivery_delayed": "delivery_delayed",
  };
  const providerStatus = eventType ? deliveryStatus[eventType] : null;
  if (!providerStatus || !messageId || messageId.length > 200) {
    return Response.json({ received: true, ignored: true }, { status: 200 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: matchingEvent, error: lookupError } = await adminClient
    .from("agency_email_activity")
    .select("id")
    .eq("provider_message_id", messageId)
    .maybeSingle();
  if (lookupError) {
    console.error("Resend webhook activity lookup failed:", lookupError.code || "unknown");
    return Response.json({ error: "Could not update email activity." }, { status: 500 });
  }
  if (!matchingEvent) return Response.json({ received: true, matched: false }, { status: 200 });
  const rawProviderError = event.data?.reason || event.data?.bounce?.message || event.data?.error?.message;
  const providerError = rawProviderError ? safeEmailActivityError(rawProviderError) : null;
  const { error: updateError } = await adminClient
    .from("agency_email_activity")
    .update({
      delivery_status: providerStatus,
      delivery_status_updated_at: new Date().toISOString(),
      ...(providerError ? { error_text: providerError } : {}),
    })
    .eq("id", matchingEvent.id);
  if (updateError) {
    console.error("Resend webhook activity update failed:", updateError.code || "unknown");
    return Response.json({ error: "Could not update email activity." }, { status: 500 });
  }
  return Response.json({ received: true, matched: true });
});
