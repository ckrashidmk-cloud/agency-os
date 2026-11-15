import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function corsHeaders(origin: string | null) {
  const configuredOrigin = Deno.env.get("APP_SITE_URL")?.replace(/\/$/, "");
  const allowedOrigins = new Set([
    configuredOrigin,
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
  ].filter(Boolean));
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function response(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  const cors = corsHeaders(origin);
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (origin && cors["Access-Control-Allow-Origin"] === "null") return response({ error: "This application origin is not allowed." }, 403, origin);
  if (request.method !== "POST") return response({ error: "Use POST to create checkout sessions." }, 405, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const siteUrl = Deno.env.get("APP_SITE_URL");
  if (!url || !anonKey || !serviceRole) return response({ error: "Supabase server configuration is incomplete." }, 503, origin);
  if (!stripeKey || !siteUrl) return response({ error: "Payment checkout is not configured. Set STRIPE_SECRET_KEY and APP_SITE_URL as Edge Function secrets." }, 503, origin);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return response({ error: "Sign in before creating a checkout session." }, 401, origin);
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await caller.auth.getUser();
  if (authError || !auth.user) return response({ error: "Your session is invalid or expired." }, 401, origin);

  const service = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await service
    .from("agency_profiles").select("role,status").eq("id", auth.user.id).maybeSingle();
  if (profileError || profile?.role !== "admin" || profile.status !== "active") {
    return response({ error: "Administrator access is required to create a payment link." }, 403, origin);
  }

  let invoiceId: string;
  try {
    invoiceId = (await request.json()).invoice_id;
  } catch {
    return response({ error: "Invalid request body." }, 400, origin);
  }
  if (!invoiceId) return response({ error: "invoice_id is required." }, 400, origin);
  const { data: storedInvoice, error: invoiceError } = await service
    .from("agency_records").select("payload").eq("entity", "Invoice").eq("record_id", invoiceId).maybeSingle();
  if (invoiceError) return response({ error: "Could not load the invoice." }, 500, origin);
  if (!storedInvoice) return response({ error: "Invoice not found." }, 404, origin);

  const invoice = storedInvoice.payload;
  const amount = Math.round(Number(invoice.total_amount) * 100);
  if (!Number.isSafeInteger(amount) || amount < 100) return response({ error: "Invoice amount must be at least 1.00 in the configured currency." }, 400, origin);
  if (invoice.status === "paid") return response({ error: "This invoice is already paid." }, 409, origin);

  const currency = String(invoice.currency || "INR").toLowerCase();
  const params = new URLSearchParams({
    mode: "payment",
    success_url: `${siteUrl.replace(/\/$/, "")}/invoices?paid=1`,
    cancel_url: `${siteUrl.replace(/\/$/, "")}/invoices?canceled=1`,
    client_reference_id: invoiceId,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": currency,
    "line_items[0][price_data][unit_amount]": String(amount),
    "line_items[0][price_data][product_data][name]": `Invoice ${invoice.invoice_number || invoiceId}`,
    "metadata[invoice_id]": invoiceId,
  });
  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `invoice-${invoiceId}`,
    },
    body: params,
    signal: AbortSignal.timeout(15000),
  });
  const checkout = await stripeResponse.json();
  if (!stripeResponse.ok) {
    console.error("Stripe checkout creation failed:", checkout.error?.type || stripeResponse.status);
    return response({ error: checkout.error?.message || "Payment provider could not create a checkout session." }, 502, origin);
  }

  const { error: updateError } = await service
    .from("agency_records")
    .update({ payload: { ...invoice, payment_link: checkout.url, status: "sent" }, updated_at: new Date().toISOString() })
    .eq("entity", "Invoice").eq("record_id", invoiceId);
  if (updateError) return response({ error: "Checkout was created but the invoice payment link could not be saved." }, 500, origin);
  return response({ url: checkout.url }, 200, origin);
});
