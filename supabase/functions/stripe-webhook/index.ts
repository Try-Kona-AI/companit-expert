// Marks an invoice paid when Stripe confirms checkout. Deploy with
// --no-verify-jwt so Stripe can reach it.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Stripe signature check: t=timestamp,v1=hmac_sha256(t + "." + body). */
async function verify(body: string, header: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET || !header) return false;
  const parts = new Map(header.split(",").map(p => p.split("=") as [string, string]));
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1) return false;

  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return hex === v1;
}

Deno.serve(async (req) => {
  const body = await req.text();

  if (!await verify(body, req.headers.get("stripe-signature"))) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid signature" }), { status: 400 });
  }

  const event = JSON.parse(body);
  if (event.type === "checkout.session.completed") {
    const invoiceId = event.data?.object?.metadata?.invoice_id;
    if (invoiceId) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: inv } = await db
        .from("invoices").select("customer_id").eq("id", invoiceId).single();
      await db.from("invoices")
        .update({ status: "paid", paid_date: today }).eq("id", invoiceId);
      if (inv?.customer_id) {
        await db.from("customers")
          .update({ status: "active", last_service_date: today })
          .eq("id", inv.customer_id);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
