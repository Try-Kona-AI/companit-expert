// Creates a Stripe Checkout session for one invoice. Optional: the Pay by card
// button only appears once STRIPE_SECRET_KEY is set in project secrets.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://companit-expert.vercel.app";
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    if (!STRIPE_SECRET_KEY) throw new Error("Card payments are not enabled for this account.");
    const { invoiceId } = await req.json();
    if (!invoiceId) throw new Error("invoiceId required");

    const { data: inv, error } = await db
      .from("invoices")
      .select("id, number, description, amount, status, tenant_id")
      .eq("id", invoiceId).single();
    if (error || !inv) throw new Error("Invoice not found");
    if (inv.status === "paid") throw new Error("This invoice is already paid.");

    const { data: tenant } = await db
      .from("tenants").select("name").eq("id", inv.tenant_id).single();

    const form = new URLSearchParams({
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(Math.round(Number(inv.amount) * 100)),
      "line_items[0][price_data][product_data][name]":
        `${tenant?.name ?? "Companit Expert"} — ${inv.number}`,
      "line_items[0][price_data][product_data][description]":
        (inv.description as string) ?? inv.number,
      "metadata[invoice_id]": inv.id,
      success_url: `${APP_URL}/pay/success?invoice=${inv.id}`,
      cancel_url: `${APP_URL}/pay/${inv.id}`,
    });

    const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    if (!resp.ok) throw new Error(`Stripe error (${resp.status}): ${await resp.text()}`);

    const session = await resp.json();
    return new Response(JSON.stringify({ ok: true, url: session.url }), {
      headers: { "Content-Type": "application/json", ...cors },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400, headers: { "Content-Type": "application/json", ...cors },
    });
  }
});
