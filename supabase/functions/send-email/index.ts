// Bilingual transactional email for Companit Expert (Kona AI).
// Every customer-facing email renders in that customer's own language:
// customers.language ('en' | 'ru'), overridable per call with `lang`.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "hello@trykona.ai";
const APP_URL = Deno.env.get("APP_URL") ?? "https://companit-expert.vercel.app";
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Lang = "en" | "ru";
type Row = Record<string, unknown>;

const isLang = (v: unknown): v is Lang => v === "en" || v === "ru";

// ---------------------------------------------------------------- copy ------
const COPY = {
  en: {
    invoiceLabel: "Invoice",
    description: "Description",
    dueDate: "Due date",
    amountDue: "Amount due",
    servicesRendered: "Services rendered",
    howToPay: "How to pay",
    zelle: "Zelle",
    achWire: "ACH / Wire",
    routing: "Routing",
    account: "Account",
    checkPayable: "Check by mail, payable to",
    questions: "Questions? Call or text",
    payByCard: "Pay by card →",
    stripeNote: "Secure payment powered by Stripe",
    sentBy: "Sent by",
    hi: (n: string) => `Hi ${n},`,
    newTitle: "Here is your invoice",
    newMeta: (num: string, d: string) => `Invoice ${num} · Sent ${d}`,
    newSubject: (biz: string, amt: string) => `Your invoice from ${biz} – ${amt}`,
    newBody: (biz: string) =>
      `Thanks for choosing ${biz}. Your invoice is below. Reach out any time if you have questions about the work.`,
    newSignoff: "We look forward to working with you again.",
    remindTitle: "Invoice reminder",
    overdueTitle: "Invoice overdue",
    remindSubject: (over: boolean, num: string, biz: string, amt: string) =>
      `${over ? "Overdue" : "Reminder"}: invoice ${num} from ${biz} – ${amt}`,
    remindBody: (num: string, amt: string, due: string) =>
      `This is a friendly reminder that invoice <strong>${num}</strong> for <strong>${amt}</strong> is due on <strong>${due}</strong>.`,
    overdueBody: (num: string, amt: string) =>
      `A heads-up that invoice <strong>${num}</strong> for <strong>${amt}</strong> is now past due. If payment is already on its way, thank you, please ignore this. Otherwise we would appreciate you taking care of it when you get a chance.`,
    thanksBusiness: "Thank you for your business.",
    receiptTitle: "Payment received",
    receiptSubject: (biz: string, amt: string) => `Receipt from ${biz} – ${amt}`,
    receiptBody: (amt: string, num: string) =>
      `We have received your payment of <strong>${amt}</strong> for invoice <strong>${num}</strong>. Thank you. This email is your receipt.`,
    receiptSignoff: "Thanks again for your business.",
    quoteTitle: "Your quote is ready",
    quoteSubject: (biz: string, amt: string) => `Your quote from ${biz} – ${amt}`,
    quoteBody: "Thanks for reaching out. Here is the quote for the work we discussed. This estimate is valid for 30 days.",
    work: "Work",
    details: "Details",
    proposedDate: "Proposed date",
    estimateTotal: "Estimate total",
    quoteClose: (phone: string) =>
      `To move forward, just reply to this email${phone ? ` or call/text <strong>${phone}</strong>` : ""}. We will get you on the schedule right away.`,
    winTitle: "Let us reconnect",
    dueTitle: "Time for a check-in",
    winSubject: (n: string) => `Checking in, ${n} — time to reconnect`,
    dueSubject: (n: string) => `${n}, time for your next job with us`,
    winBody: "It has been a while since we last worked together and I wanted to reach out personally. If anything on the property needs attention, we can take a look and get you a quote quickly.",
    dueBody: "Based on the last work we did, now is a good time to reconnect, make sure everything is holding up, and plan what comes next.",
    winClose: (phone: string) =>
      `Reply to this email${phone ? ` or call/text <strong>${phone}</strong>` : ""} and we will find a time that works for you.`,
    winSignoff: "Looking forward to connecting,",
  },
  ru: {
    invoiceLabel: "Счёт",
    description: "Описание",
    dueDate: "Срок оплаты",
    amountDue: "К оплате",
    servicesRendered: "Выполненные работы",
    howToPay: "Как оплатить",
    zelle: "Zelle",
    achWire: "ACH / Wire",
    routing: "Routing",
    account: "Счёт",
    checkPayable: "Чек по почте, выписать на",
    questions: "Вопросы? Звоните или пишите:",
    payByCard: "Оплатить картой →",
    stripeNote: "Безопасная оплата через Stripe",
    sentBy: "Отправлено:",
    hi: (n: string) => `Здравствуйте, ${n}!`,
    newTitle: "Ваш счёт",
    newMeta: (num: string, d: string) => `Счёт ${num} · отправлен ${d}`,
    newSubject: (biz: string, amt: string) => `Счёт от ${biz} – ${amt}`,
    newBody: (biz: string) =>
      `Спасибо, что выбрали ${biz}. Ваш счёт ниже. Если по работам есть вопросы, напишите нам в любое время.`,
    newSignoff: "Будем рады работать с вами снова.",
    remindTitle: "Напоминание об оплате",
    overdueTitle: "Счёт просрочен",
    remindSubject: (over: boolean, num: string, biz: string, amt: string) =>
      `${over ? "Просрочен" : "Напоминание"}: счёт ${num} от ${biz} – ${amt}`,
    remindBody: (num: string, amt: string, due: string) =>
      `Напоминаем, что счёт <strong>${num}</strong> на сумму <strong>${amt}</strong> нужно оплатить до <strong>${due}</strong>.`,
    overdueBody: (num: string, amt: string) =>
      `Обращаем внимание: срок оплаты счёта <strong>${num}</strong> на сумму <strong>${amt}</strong> уже прошёл. Если оплата уже в пути, спасибо, это письмо можно не учитывать. Если нет, будем признательны, если решите вопрос при первой возможности.`,
    thanksBusiness: "Спасибо за сотрудничество.",
    receiptTitle: "Платёж получен",
    receiptSubject: (biz: string, amt: string) => `Квитанция от ${biz} – ${amt}`,
    receiptBody: (amt: string, num: string) =>
      `Мы получили ваш платёж на <strong>${amt}</strong> по счёту <strong>${num}</strong>. Спасибо. Это письмо является квитанцией.`,
    receiptSignoff: "Ещё раз спасибо за сотрудничество.",
    quoteTitle: "Ваша смета готова",
    quoteSubject: (biz: string, amt: string) => `Смета от ${biz} – ${amt}`,
    quoteBody: "Спасибо за обращение. Ниже смета на обсуждённые работы. Оценка действительна 30 дней.",
    work: "Работы",
    details: "Детали",
    proposedDate: "Предполагаемая дата",
    estimateTotal: "Итого по смете",
    quoteClose: (phone: string) =>
      `Чтобы двигаться дальше, просто ответьте на это письмо${phone ? ` или позвоните и напишите на <strong>${phone}</strong>` : ""}. Мы сразу поставим работы в график.`,
    winTitle: "Давайте снова на связи",
    dueTitle: "Пора проверить, как дела",
    winSubject: (n: string) => `${n}, давно не работали вместе`,
    dueSubject: (n: string) => `${n}, пора запланировать следующие работы`,
    winBody: "Мы давно не работали вместе, и я решил написать лично. Если по объекту что-то требует внимания, посмотрим и быстро подготовим смету.",
    dueBody: "С учётом последних работ сейчас хороший момент связаться, проверить, что всё в порядке, и спланировать следующие шаги.",
    winClose: (phone: string) =>
      `Ответьте на это письмо${phone ? ` или позвоните и напишите на <strong>${phone}</strong>` : ""}, и мы подберём удобное время.`,
    winSignoff: "С уважением,",
  },
} as const;

// ------------------------------------------------------------- helpers ------
function money(n: number) {
  // Amounts stay in US dollars in both languages.
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function shortDate(s: string | null, lang: Lang) {
  if (!s) return "—";
  return new Date(s + "T12:00:00Z").toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function firstName(raw: string | null) {
  const name = raw ?? "";
  const first = name.split(" ")[0];
  return first && !first.endsWith(".") ? first : name;
}

function wrap(content: string, businessName: string, lang: Lang) {
  const c = COPY[lang];
  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">
        <tr><td style="background:#0c2340;border-radius:12px 12px 0 0;padding:22px 32px;">
          <span style="color:#fff;font-size:15px;font-weight:600;letter-spacing:-0.01em;">${businessName}</span>
        </td></tr>
        <tr><td style="background:#ffffff;padding:36px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">${content}</td></tr>
        <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:18px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">${c.sentBy} ${businessName}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function paymentBlock(
  s: Record<string, string> | null,
  lang: Lang,
  invoiceId?: string,
  cardEnabled = false,
) {
  const c = COPY[lang];
  const cell = (label: string, value: string, last = false) =>
    `<tr><td style="padding:10px 0;${last ? "" : "border-bottom:1px solid #f1f5f9;"}">
      <span style="font-size:13px;color:#64748b;display:block;margin-bottom:2px;">${label}</span>
      <span style="font-size:14px;color:#1e293b;font-weight:500;">${value}</span></td></tr>`;

  const rows: string[] = [];
  if (s?.zelle_contact) rows.push(cell(c.zelle, s.zelle_contact));
  if (s?.bank_name && s?.bank_routing && s?.bank_account) {
    rows.push(cell(
      `${c.achWire} — ${s.bank_name}`,
      `${c.routing}: ${s.bank_routing} &nbsp;&middot;&nbsp; ${c.account}: ${s.bank_account}`,
    ));
  }
  if (s?.mailing_name && s?.mailing_address) {
    rows.push(cell(
      `${c.checkPayable} ${s.mailing_name}`,
      s.mailing_address.replace(/\n/g, " &middot; "),
      true,
    ));
  }

  const card = cardEnabled && invoiceId
    ? `<div style="text-align:center;margin-top:20px;">
        <a href="${APP_URL}/pay/${invoiceId}" style="display:inline-block;background:#0c2340;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">${c.payByCard}</a>
        <p style="margin:8px 0 0;font-size:12px;color:#94a3b8;">${c.stripeNote}</p>
      </div>`
    : "";

  const howToPay = rows.length
    ? `<div style="margin-top:28px;padding:20px 24px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
        <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">${c.howToPay}</p>
        <table width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table>
        ${s?.contact_phone ? `<p style="margin:12px 0 0;font-size:13px;color:#94a3b8;">${c.questions} ${s.contact_phone}</p>` : ""}
      </div>`
    : "";

  return `${howToPay}${card}`;
}

function invoiceBox(inv: Row, lang: Lang, overdue = false) {
  const c = COPY[lang];
  const label = (s: string) =>
    `<span style="font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">${s}</span>`;
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${overdue ? "#fca5a5" : "#e2e8f0"};border-radius:10px;">
    <tr><td style="padding:14px 20px;border-bottom:1px solid #f1f5f9;">${label(c.invoiceLabel)}<span style="float:right;font-size:13px;color:#475569;">${inv.number}</span></td></tr>
    <tr><td style="padding:14px 20px;border-bottom:1px solid #f1f5f9;">${label(c.description)}<span style="float:right;font-size:13px;color:#475569;">${(inv.description as string) ?? c.servicesRendered}</span></td></tr>
    ${inv.due_date ? `<tr><td style="padding:14px 20px;border-bottom:1px solid #f1f5f9;">${label(c.dueDate)}<span style="float:right;font-size:13px;color:${overdue ? "#dc2626" : "#475569"};">${shortDate(inv.due_date as string, lang)}</span></td></tr>` : ""}
    <tr><td style="padding:16px 20px;background:#f8fafc;border-radius:0 0 10px 10px;"><span style="font-size:14px;font-weight:600;color:#0f172a;">${c.amountDue}</span><span style="float:right;font-size:20px;font-weight:700;color:${overdue ? "#dc2626" : "#0f172a"};">${money(Number(inv.amount))}</span></td></tr>
  </table>`;
}

const heading = (s: string) =>
  `<p style="margin:0 0 6px;font-size:24px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">${s}</p>`;
const meta = (s: string) => `<p style="margin:0 0 28px;font-size:14px;color:#94a3b8;">${s}</p>`;
const para = (s: string, bottom = 28) =>
  `<p style="margin:0 0 ${bottom}px;font-size:15px;color:#334155;line-height:1.7;">${s}</p>`;
const signoff = (line: string, biz: string) =>
  `<p style="margin:24px 0 0;font-size:14px;color:#94a3b8;line-height:1.7;">${line}<br><strong style="color:#475569;">${biz}</strong></p>`;

// ----------------------------------------------------------- templates ------
function invoiceTemplate(
  kind: "invoice_new" | "invoice_reminder" | "invoice_receipt",
  inv: Row, customer: Row, settings: Record<string, string> | null,
  biz: string, lang: Lang, cardEnabled: boolean,
) {
  const c = COPY[lang];
  const name = firstName((customer.contact_name as string) ?? (customer.name as string));
  const amt = money(Number(inv.amount));
  const overdue = inv.status === "overdue";

  if (kind === "invoice_receipt") {
    return {
      subject: c.receiptSubject(biz, amt),
      html: wrap(
        heading(c.receiptTitle) +
        meta(`${c.invoiceLabel} ${inv.number}`) +
        para(c.hi(name), 14) +
        para(c.receiptBody(amt, inv.number as string)) +
        invoiceBox(inv, lang) +
        signoff(c.receiptSignoff, biz),
        biz, lang,
      ),
    };
  }

  if (kind === "invoice_reminder") {
    return {
      subject: c.remindSubject(overdue, inv.number as string, biz, amt),
      html: wrap(
        heading(overdue ? c.overdueTitle : c.remindTitle) +
        meta(`${c.invoiceLabel} ${inv.number}`) +
        para(c.hi(name), 14) +
        para(overdue
          ? c.overdueBody(inv.number as string, amt)
          : c.remindBody(inv.number as string, amt, shortDate(inv.due_date as string, lang))) +
        invoiceBox(inv, lang, overdue) +
        paymentBlock(settings, lang, inv.id as string, cardEnabled) +
        signoff(c.thanksBusiness, biz),
        biz, lang,
      ),
    };
  }

  return {
    subject: c.newSubject(biz, amt),
    html: wrap(
      heading(c.newTitle) +
      meta(c.newMeta(inv.number as string, shortDate(inv.sent_date as string, lang))) +
      para(c.hi(name), 14) +
      para(c.newBody(biz)) +
      invoiceBox(inv, lang) +
      paymentBlock(settings, lang, inv.id as string, cardEnabled) +
      signoff(c.newSignoff, biz),
      biz, lang,
    ),
  };
}

function quoteTemplate(
  job: Row, customer: Row, settings: Record<string, string> | null, biz: string, lang: Lang,
) {
  const c = COPY[lang];
  const name = firstName((customer.contact_name as string) ?? (customer.name as string));
  const label = (s: string) =>
    `<span style="font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">${s}</span>`;

  return {
    subject: c.quoteSubject(biz, money(Number(job.amount))),
    html: wrap(
      heading(c.quoteTitle) +
      meta(job.title as string) +
      para(c.hi(name), 14) +
      para(c.quoteBody) +
      `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;margin-bottom:28px;">
        <tr><td style="padding:14px 20px;border-bottom:1px solid #f1f5f9;">${label(c.work)}<span style="float:right;font-size:13px;color:#475569;">${job.title}</span></td></tr>
        ${job.description ? `<tr><td style="padding:14px 20px;border-bottom:1px solid #f1f5f9;">${label(c.details)}<span style="float:right;font-size:13px;color:#475569;max-width:280px;text-align:right;display:block;">${job.description}</span></td></tr>` : ""}
        ${job.scheduled_date ? `<tr><td style="padding:14px 20px;border-bottom:1px solid #f1f5f9;">${label(c.proposedDate)}<span style="float:right;font-size:13px;color:#475569;">${shortDate(job.scheduled_date as string, lang)}</span></td></tr>` : ""}
        <tr><td style="padding:16px 20px;background:#f8fafc;border-radius:0 0 10px 10px;"><span style="font-size:14px;font-weight:600;color:#0f172a;">${c.estimateTotal}</span><span style="float:right;font-size:20px;font-weight:700;color:#0c2340;">${money(Number(job.amount))}</span></td></tr>
      </table>` +
      para(c.quoteClose(settings?.contact_phone ?? "")) +
      signoff(c.thanksBusiness, biz),
      biz, lang,
    ),
  };
}

function winBackTemplate(
  customer: Row, settings: Record<string, string> | null, biz: string, lang: Lang,
) {
  const c = COPY[lang];
  const name = firstName((customer.contact_name as string) ?? (customer.name as string));
  const isWinBack = customer.status === "win_back";

  return {
    subject: isWinBack ? c.winSubject(name) : c.dueSubject(name),
    html: wrap(
      heading(isWinBack ? c.winTitle : c.dueTitle) +
      meta("") +
      para(c.hi(name), 14) +
      para(isWinBack ? c.winBody : c.dueBody, 18) +
      para(c.winClose(settings?.contact_phone ?? "")) +
      signoff(c.winSignoff, biz),
      biz, lang,
    ),
  };
}

// ------------------------------------------------------------- handler ------
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { type, tenantId, invoiceId, customerId, jobId, recipientEmail, lang: langOverride } =
      await req.json();

    const [{ data: tenant }, { data: settings }] = await Promise.all([
      db.from("tenants").select("name, default_language").eq("id", tenantId).single(),
      db.from("tenant_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
    ]);

    const biz = (tenant?.name as string) ?? settings?.mailing_name ?? "Companit Expert";
    const fallbackLang: Lang = isLang(tenant?.default_language) ? tenant.default_language : "en";
    const cardEnabled = Boolean(Deno.env.get("STRIPE_SECRET_KEY"));

    let subject = "", html = "", to = "", lang: Lang = isLang(langOverride) ? langOverride : fallbackLang;

    if (type === "invoice_new" || type === "invoice_reminder" || type === "invoice_receipt") {
      if (!invoiceId) throw new Error("invoiceId required");
      const { data: inv, error } = await db
        .from("invoices")
        .select("*, customer:customers(id,name,contact_name,email,phone,language)")
        .eq("id", invoiceId).single();
      if (error || !inv) throw new Error("Invoice not found");

      const customer = inv.customer as Row;
      to = recipientEmail ?? (customer.email as string) ?? "";
      if (!to) throw new Error("Customer has no email address. Add one under Customers first.");
      if (!isLang(langOverride) && isLang(customer.language)) lang = customer.language;

      ({ subject, html } = invoiceTemplate(type, inv as Row, customer, settings ?? {}, biz, lang, cardEnabled));

      if (type === "invoice_reminder") {
        const { data: cur } = await db.from("invoices").select("reminder_count").eq("id", invoiceId).single();
        await db.from("invoices").update({
          last_reminder_date: new Date().toISOString().slice(0, 10),
          reminder_count: ((cur?.reminder_count as number) ?? 0) + 1,
        }).eq("id", invoiceId);
      }

    } else if (type === "win_back") {
      if (!customerId) throw new Error("customerId required");
      const { data: customer, error } = await db
        .from("customers").select("*").eq("id", customerId).single();
      if (error || !customer) throw new Error("Customer not found");
      to = recipientEmail ?? (customer.email as string) ?? "";
      if (!to) throw new Error("Customer has no email address. Add one under Customers first.");
      if (!isLang(langOverride) && isLang(customer.language)) lang = customer.language;
      ({ subject, html } = winBackTemplate(customer as Row, settings ?? {}, biz, lang));

    } else if (type === "quote") {
      if (!jobId) throw new Error("jobId required");
      const { data: job, error } = await db
        .from("jobs")
        .select("*, customer:customers(id,name,contact_name,email,language)")
        .eq("id", jobId).single();
      if (error || !job) throw new Error("Job not found");
      const customer = job.customer as Row;
      to = recipientEmail ?? (customer.email as string) ?? "";
      if (!to) throw new Error("Customer has no email address. Add one under Customers first.");
      if (!isLang(langOverride) && isLang(customer.language)) lang = customer.language;
      ({ subject, html } = quoteTemplate(job as Row, customer, settings ?? {}, biz, lang));

    } else {
      throw new Error(`Unknown email type: ${type}`);
    }

    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not set in Supabase project secrets");

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${biz} <${FROM_EMAIL}>`, to, subject, html }),
    });
    if (!resp.ok) throw new Error(`Resend error (${resp.status}): ${await resp.text()}`);

    const result = await resp.json();
    return new Response(JSON.stringify({ ok: true, id: result.id, to, subject, lang }), {
      headers: { "Content-Type": "application/json", ...cors },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("send-email error:", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }
});
