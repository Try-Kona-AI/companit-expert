// Public unsubscribe link for Companit Expert outreach emails (Kona AI).
// GET  ?t=<enrollment id>  -> person clicked the link in the email
// POST ?t=<enrollment id>  -> mail client "one-click unsubscribe" (RFC 8058)
// Stops every campaign for that prospect and adds the address to the
// suppression list so they can never be emailed again, even if re-imported.
// The token is the enrollment's random UUID; it reveals nothing and only
// ever turns emails OFF.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const page = (title: string, body: string) =>
  new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${title}</title></head><body style="margin:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">` +
    `<div style="max-width:480px;margin:64px auto;padding:32px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;">` +
    `<h1 style="margin:0 0 12px;font-size:20px;color:#0c2340;">${title}</h1>` +
    `<p style="margin:0;font-size:15px;line-height:1.55;color:#475569;">${body}</p></div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!UUID.test(token)) {
    return page("Link not valid", "This unsubscribe link is incomplete. Reply to the email with \"unsubscribe\" and we will remove you.");
  }

  try {
    const { data: e } = await db
      .from("campaign_enrollments")
      .select("id, tenant_id, lead_id, lead:leads(email)")
      .eq("id", token).maybeSingle();

    if (e) {
      const email = String((e.lead as { email?: string } | null)?.email ?? "").trim().toLowerCase();
      await db.from("campaign_enrollments").update({ status: "unsubscribed" })
        .eq("lead_id", e.lead_id).in("status", ["active", "completed"]);
      await db.from("leads").update({ unsubscribed_at: new Date().toISOString() }).eq("id", e.lead_id);
      if (email) {
        await db.from("email_suppressions")
          .upsert({ tenant_id: e.tenant_id, email, reason: "unsubscribed" }, { onConflict: "tenant_id,email" });
      }
    }
  } catch (err) {
    console.error("unsubscribe error:", err instanceof Error ? err.message : String(err));
  }

  if (req.method === "POST") return new Response("ok");
  // Same answer whether or not the token matched, so links can't be probed.
  return page(
    "You're unsubscribed",
    "You won't receive any more emails from us. Sorry for the bother.<br><br>" +
    "<span style=\"color:#94a3b8;\">Вы отписаны и больше не будете получать наши письма.</span>",
  );
});
