import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const encoder = new TextEncoder();

async function verifyStripeSignature(body: string, signature: string, secret: string) {
  const entries = signature.split(",").map((item) => item.split("=", 2));
  const timestamp = entries.find(([key]) => key === "t")?.[1];
  const signatures = entries.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return null;

  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`)));
  const expected = [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
  const verified = signatures.some((value) => {
    if (value.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ value.charCodeAt(index);
    return difference === 0;
  });
  if (!verified) return null;
  return JSON.parse(body);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !url || !serviceRole) return Response.json({ error: "Stripe webhook configuration is incomplete." }, { status: 503 });

  const body = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  const event = await verifyStripeSignature(body, signature, secret);
  if (!event) return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });

  const service = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: eventError } = await service.from("stripe_webhook_events").insert({ id: event.id }).select("id").single();
  if (eventError?.code === "23505") return Response.json({ received: true, duplicate: true });
  if (eventError) return Response.json({ error: "Could not record webhook event." }, { status: 500 });

  if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
    const session = event.data?.object;
    const invoiceId = session?.client_reference_id || session?.metadata?.invoice_id;
    if (invoiceId && session?.payment_status === "paid") {
      const { data: invoiceRow, error: loadError } = await service
        .from("agency_records").select("payload").eq("entity", "Invoice").eq("record_id", invoiceId).maybeSingle();
      if (loadError) return Response.json({ error: "Could not load the invoice for the payment event." }, { status: 500 });
      if (invoiceRow) {
        const { error: updateError } = await service
          .from("agency_records")
          .update({
            payload: { ...invoiceRow.payload, status: "paid", paid_date: new Date().toISOString().slice(0, 10) },
            updated_at: new Date().toISOString(),
          })
          .eq("entity", "Invoice").eq("record_id", invoiceId);
        if (updateError) return Response.json({ error: "Could not update the invoice after payment." }, { status: 500 });
      }
    }
  }
  return Response.json({ received: true });
});
