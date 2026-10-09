// Outreach sender for Companit Expert (Kona AI).
// Sends ONLY the campaign emails a signed-in workspace member approved in the
// Campaigns screen. Per email: renders the current step, appends the required
// sender address + unsubscribe link, sends through Resend, logs it, and moves
// the prospect to the next step.
//
// Safety rails:
// - Caller must be a member of the tenant (checked here, not trusted from body).
// - Refuses to send without a business mailing address (CAN-SPAM).
// - Skips unsubscribed / suppressed / bounced / replied prospects.
// - Enforces each campaign's daily cap.
// - EMAIL_TEST_TO set => every email goes to that address instead, and
//   prospects are NOT advanced, so testing never burns a real sequence.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
// Cold outreach can (and ideally should) come from a separate domain so spam
// complaints never touch the invoicing domain. Falls back to FROM_EMAIL.
const FROM_EMAIL = Deno.env.get("OUTREACH_FROM_EMAIL") || Deno.env.get("FROM_EMAIL") || "";
const REPLY_TO = Deno.env.get("OUTREACH_REPLY_TO") ?? "";
const TEST_TO = (Deno.env.get("EMAIL_TEST_TO") ?? "").trim();

const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Lang = "en" | "ru";
type Row = Record<string, unknown>;

const nyDay = (offset = 0) =>
  new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

function nyMidnightIso(): string {
  // Start of today in New York, as a UTC timestamp.
  const day = nyDay();
  const probe = new Date(`${day}T12:00:00Z`);
  const nyNoon = new Date(probe.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const offsetMs = probe.getTime() - nyNoon.getTime();
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + offsetMs).toISOString();
}

// ---- KEEP IN SYNC with src/lib/outreach.ts --------------------------------
const FALLBACK = {
  en: { first_name: "there", company: "your company", building: "your buildings" },
  ru: { first_name: "", company: "вашей компании", building: "ваших домах" },
};

function firstNameOf(name: string): string {
  const n = (name ?? "").trim();
  if (!n || /\b(llc|inc|corp|co\.|mgmt|management|realty|group|associates|properties|property|services|holdings|partners|nyc)\b/i.test(n)) return "";
  return n.split(/\s+/)[0];
}

function renderOutreach(
  text: string, lead: Row, ctx: { ownerName: string; business: string; phone: string; lang: Lang },
): string {
  const fb = FALLBACK[ctx.lang];
  const values: Record<string, string> = {
    first_name: firstNameOf(String(lead.name ?? "")) || fb.first_name,
    company: String(lead.company ?? "").trim() || fb.company,
    building: String(lead.building ?? "").trim() || fb.building,
    owner_name: ctx.ownerName,
    business: ctx.business,
    phone: ctx.phone,
  };
  return text
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in values ? values[k] : m))
    .replace(/,\s*!/g, "!");
}
// ---------------------------------------------------------------------------

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FOOTER = {
  en: (biz: string, addr: string, url: string) => ({
    text: `\n\n--\n${biz}, ${addr}\nDon't want to hear from us? Unsubscribe: ${url}`,
    html: `<p style="margin:28px 0 0;font-size:12px;color:#94a3b8;">${esc(biz)}, ${esc(addr)}<br>` +
      `Don't want to hear from us? <a href="${url}" style="color:#94a3b8;">Unsubscribe</a></p>`,
  }),
  ru: (biz: string, addr: string, url: string) => ({
    text: `\n\n--\n${biz}, ${addr}\nНе хотите получать письма? Отписаться: ${url}`,
    html: `<p style="margin:28px 0 0;font-size:12px;color:#94a3b8;">${esc(biz)}, ${esc(addr)}<br>` +
      `Не хотите получать письма? <a href="${url}" style="color:#94a3b8;">Отписаться</a></p>`,
  }),
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    // ---- who is calling -----------------------------------------------------
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await db.auth.getUser(jwt);
    if (!user) return json({ error: "Not authenticated" }, 401);

    const { tenantId, enrollmentIds } = await req.json() as { tenantId?: string; enrollmentIds?: string[] };
    if (!tenantId || !Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
      return json({ error: "tenantId and enrollmentIds required" }, 400);
    }
    if (enrollmentIds.length > 200) return json({ error: "Too many at once (max 200)" }, 400);

    const [{ data: tenant }, { data: member }] = await Promise.all([
      db.from("tenants").select("id, name, owner_name, owner_user_id").eq("id", tenantId).maybeSingle(),
      db.from("tenant_members").select("user_id").eq("tenant_id", tenantId).eq("user_id", user.id).maybeSingle(),
    ]);
    if (!tenant || (tenant.owner_user_id !== user.id && !member)) return json({ error: "Not allowed" }, 403);

    // ---- sender identity + legal footer -------------------------------------
    const { data: settings } = await db.from("tenant_settings").select("*").eq("tenant_id", tenantId).maybeSingle();
    const business = String(settings?.mailing_name || tenant.name || "Companit Expert");
    const mailingAddress = String(settings?.mailing_address ?? "").replace(/\s*\n\s*/g, ", ").trim();
    if (!mailingAddress) {
      return json({ error: "Add your business mailing address in Settings first. US law requires it on every outreach email." });
    }
    if (!RESEND_API_KEY || !FROM_EMAIL) {
      return json({ error: "Email sending is not set up yet (RESEND_API_KEY / OUTREACH_FROM_EMAIL)." });
    }
    const ownerName = String(tenant.owner_name ?? "");
    const phone = String(settings?.contact_phone ?? "");

    // ---- what to send -------------------------------------------------------
    const { data: enrollments, error: enErr } = await db
      .from("campaign_enrollments")
      .select("*, lead:leads(*), campaign:campaigns(*)")
      .eq("tenant_id", tenantId)
      .in("id", enrollmentIds);
    if (enErr) throw new Error(enErr.message);

    const { data: sup } = await db.from("email_suppressions").select("email").eq("tenant_id", tenantId);
    const suppressed = new Set((sup ?? []).map((r) => String(r.email).toLowerCase()));

    // Daily cap, per campaign, counted from midnight New York time.
    const since = nyMidnightIso();
    const { data: todays } = await db
      .from("outreach_messages").select("campaign_id")
      .eq("tenant_id", tenantId).eq("test_mode", false).gte("sent_at", since);
    const sentToday = new Map<string, number>();
    for (const m of todays ?? []) {
      const k = String(m.campaign_id);
      sentToday.set(k, (sentToday.get(k) ?? 0) + 1);
    }

    const today = nyDay();
    const fnBase = `${SUPABASE_URL}/functions/v1/outreach-unsubscribe`;
    let sent = 0, skipped = 0;
    const errors: string[] = [];

    for (const e of enrollments ?? []) {
      const lead = e.lead as Row | null;
      const campaign = e.campaign as Row | null;
      const email = String(lead?.email ?? "").trim();
      const label = String(lead?.name ?? e.id);

      if (!lead || !campaign || e.status !== "active" || campaign.status !== "active" ||
          String(e.next_send_on) > today || !email || lead.unsubscribed_at ||
          suppressed.has(email.toLowerCase())) {
        skipped++; continue;
      }
      const used = sentToday.get(String(campaign.id)) ?? 0;
      if (!TEST_TO && used >= Number(campaign.daily_cap)) {
        skipped++; errors.push(`${label}: daily limit reached for "${campaign.name}"`); continue;
      }

      const { data: step } = await db.from("campaign_steps").select("*")
        .eq("campaign_id", campaign.id).eq("step_no", e.next_step).maybeSingle();
      if (!step) { skipped++; continue; }

      const lang: Lang = campaign.language === "ru" ? "ru" : "en";
      const ctx = { ownerName, business, phone, lang };
      const subject = renderOutreach(String(step.subject), lead, ctx);
      const body = renderOutreach(String(step.body), lead, ctx);
      const unsubUrl = `${fnBase}?t=${e.id}`;
      const footer = FOOTER[lang](business, mailingAddress, unsubUrl);

      const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1e293b;">` +
        esc(body).replace(/\n/g, "<br>") + footer.html + `</div>`;

      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${ownerName ? `${ownerName}, ` : ""}${business} <${FROM_EMAIL}>`,
          to: TEST_TO || email,
          subject: TEST_TO ? `[TEST -> ${email}] ${subject}` : subject,
          html,
          text: body + footer.text,
          ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
          headers: {
            "List-Unsubscribe": `<${unsubUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }),
      });
      if (!resp.ok) {
        errors.push(`${label}: ${resp.status} ${(await resp.text()).slice(0, 160)}`);
        skipped++; continue;
      }
      const result = await resp.json();

      await db.from("outreach_messages").insert({
        tenant_id: tenantId, campaign_id: campaign.id, enrollment_id: e.id, lead_id: lead.id,
        step_no: e.next_step, to_email: email, subject, provider_id: result.id ?? null,
        test_mode: Boolean(TEST_TO),
      });

      if (!TEST_TO) {
        sentToday.set(String(campaign.id), used + 1);
        const { data: next } = await db.from("campaign_steps").select("step_no, delay_days")
          .eq("campaign_id", campaign.id).eq("step_no", Number(e.next_step) + 1).maybeSingle();
        await db.from("campaign_enrollments").update(
          next
            ? { next_step: next.step_no, next_send_on: nyDay(Number(next.delay_days)), last_sent_at: new Date().toISOString() }
            : { status: "completed", last_sent_at: new Date().toISOString() },
        ).eq("id", e.id);
        if (lead.status === "new") await db.from("leads").update({ status: "contacted" }).eq("id", lead.id);
      }
      sent++;
      // Stay well under Resend's default rate limit.
      await new Promise((r) => setTimeout(r, 600));
    }

    return json({ sent, skipped, testMode: Boolean(TEST_TO), errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("send-campaign error:", message);
    return json({ error: message }, 500);
  }
});
