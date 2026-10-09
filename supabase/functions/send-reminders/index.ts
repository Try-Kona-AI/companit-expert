// Automatic payment reminders for Companit Expert (Kona AI).
// Runs once a day from pg_cron. Flips past-due invoices to overdue, then sends
// reminder 1, 2 and 3 at 3, 7 and 14 days past the due date (or past the sent
// date when an invoice has no due date). Each reminder goes through send-email,
// so it renders in the customer's own language and respects EMAIL_TEST_TO.
//
// Auth: the cron job sends header x-cron-secret, which must equal the
// CRON_SECRET function secret. POST {"dryRun": true} lists what would go out
// without sending anything.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const db = createClient(SUPABASE_URL, SERVICE_KEY);

// Days past due at which reminder N (index) goes out. Max 3 automatic reminders.
const SCHEDULE = [3, 7, 14];
const DAY = 86_400_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function daysBetween(fromIso: string, to: Date) {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const today = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((today - from) / DAY);
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let dryRun = false;
  try { dryRun = Boolean((await req.json())?.dryRun); } catch { /* empty body */ }

  try {
    const { data: flipped, error: flipErr } = dryRun
      ? { data: null, error: null }
      : await db.rpc("mark_overdue_invoices");
    if (flipErr) throw new Error(`mark_overdue_invoices: ${flipErr.message}`);

    const { data: invoices, error } = await db
      .from("invoices")
      .select("id, tenant_id, number, amount, status, sent_date, due_date, last_reminder_date, reminder_count, customer:customers(name, email, language)")
      .in("status", ["sent", "overdue"])
      .eq("auto_reminder", true)
      .lt("reminder_count", SCHEDULE.length);
    if (error) throw new Error(error.message);

    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const due: NonNullable<typeof invoices> = [];
    const skipped: { number: string; reason: string }[] = [];

    for (const inv of invoices ?? []) {
      const customer = inv.customer as { email?: string | null } | null;
      const base = (inv.due_date ?? inv.sent_date) as string | null;
      if (!base) { skipped.push({ number: inv.number, reason: "no due or sent date" }); continue; }
      if (inv.last_reminder_date === todayIso) continue;
      const late = daysBetween(base, now);
      if (late < SCHEDULE[inv.reminder_count]) continue;
      if (!customer?.email) { skipped.push({ number: inv.number, reason: "customer has no email" }); continue; }
      due.push(inv);
    }

    if (dryRun) {
      return json({
        ok: true, dryRun: true,
        wouldSend: due.map((i) => ({ number: i.number, reminder: i.reminder_count + 1, amount: i.amount, status: i.status })),
        skipped,
      });
    }

    const sent: { number: string; reminder: number; to: string }[] = [];
    const failed: { number: string; error: string }[] = [];

    for (const inv of due) {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "invoice_reminder", tenantId: inv.tenant_id, invoiceId: inv.id }),
      });
      const body = await res.json().catch(() => ({}));
      // send-email bumps reminder_count and last_reminder_date on success.
      if (res.ok && body.ok) sent.push({ number: inv.number, reminder: inv.reminder_count + 1, to: body.to });
      else failed.push({ number: inv.number, error: body.error ?? `HTTP ${res.status}` });
    }

    const summary = { ok: failed.length === 0, markedOverdue: flipped ?? 0, sent, failed, skipped };
    console.log("send-reminders", JSON.stringify(summary));
    return json(summary, failed.length && !sent.length ? 500 : 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("send-reminders error:", message);
    return json({ ok: false, error: message }, 500);
  }
});
