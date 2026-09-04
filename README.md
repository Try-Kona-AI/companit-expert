# Companit Expert — Invoicing

A Kona AI client app. Same product spine as Pro Piper: quote → schedule → complete →
invoice → get paid → win the customer back. The one difference is that the whole
interface runs in **Russian or English**, switched instantly from the sidebar,
Settings, the login screen, or the public payment page.

Stack: React 19 + Vite + Tailwind v4 + Supabase (Kona AI account) + Resend, on Vercel.

## How the two languages work

| Layer | Behaviour |
| --- | --- |
| Interface | `src/lib/i18n.tsx` holds one dictionary. English is the source of truth; the Russian map is typed against it, so a missing translation fails `npm run build`. |
| Persistence | The choice is saved per device (`localStorage`), and to `tenants.default_language` when Settings is saved. First visit guesses from the browser language. |
| Dates | Localised (`ru-RU` / `en-US`). |
| Money | Always US dollars, in both languages. What a customer owes must not change shape with the interface language. |
| Customer emails | Each customer has their own `language`, set in the customer form and shown as an EN/RU tag in the list. Invoices, reminders, receipts, quotes, and win-back emails all render in that customer's language, not the owner's. |
| Win-back drafts | Shown on screen in the interface language so the owner can read what goes out, and sent in the customer's language. |

Adding a string: add the key to `en` in `src/lib/i18n.tsx`, then the Russian value.
TypeScript will point at the gap until you do.

## Running locally

```bash
npm install
npm run dev        # http://localhost:5185
```

With no `.env.local` the app runs in **demo mode**: a seeded book of business in
`localStorage`, any email and password signs in, and email sends are simulated.
Everything you change is saved and survives a refresh. Add the two Supabase
variables and it switches to the live database automatically (`LIVE` in
`src/lib/supabase.ts`).

```bash
cp .env.example .env.local   # then fill in from Supabase > Project Settings > API
```

## Live setup (Kona AI accounts only)

Nothing here goes on a CYMBUL account.

**1. Supabase** (Kona AI org, project `companit-expert`)
- Paste `supabase/schema.sql` into the SQL editor and run it. Idempotent, safe to re-run.
- Optional: `supabase/seed.sql` for starter rows, after the first sign-in.
- Auth: create the owner login yourself, then turn signups off (invite only).
- The first sign-in calls `join_workspace()`, which creates the workspace and adds
  everyone after that to the same book.

**2. Vercel** (Kona AI team) — import the GitHub repo, then set:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable (`sb_publishable_…`) key |

Build settings come from `vercel.json`. Keep deployment protection off and the repo
public, or deploys fail on this plan.

**3. Resend + edge functions**

```bash
supabase link --project-ref <kona-project-ref>
supabase functions deploy send-email
supabase functions deploy stripe-checkout                      # optional
supabase functions deploy stripe-webhook --no-verify-jwt       # optional
```

Project secrets (Supabase → Edge Functions → Secrets):

| Secret | Purpose |
| --- | --- |
| `RESEND_API_KEY` | required for any email to go out |
| `FROM_EMAIL` | verified sender, e.g. `hello@trykona.ai` |
| `APP_URL` | production URL, used in payment links |
| `STRIPE_SECRET_KEY` | optional. Adds the Pay by card button |
| `STRIPE_WEBHOOK_SECRET` | optional. Marks invoices paid automatically |

Without `RESEND_API_KEY` the app still works end to end; the send just reports the
missing key instead of pretending it sent.

**4. Overdue invoices** — schedule `select public.mark_overdue_invoices();` daily
(Supabase cron) to flip sent invoices past their due date.

## Layout

```
src/lib/i18n.tsx      both dictionaries, provider, useI18n()
src/lib/api.ts        every read and write, one function per operation
src/lib/supabase.ts   LIVE flag and client
src/lib/demoStore.ts  localStorage fallback + seed book of business
src/pages/            Dashboard, Invoices, Customers, Jobs, Winback, Settings, Guide, Login, Pay
supabase/schema.sql   tables, RLS, workspace provisioning, public invoice lookup
supabase/functions/   send-email (bilingual, Resend), stripe-checkout, stripe-webhook
```

Pages never talk to Supabase directly. They call `src/lib/api.ts`, which is what
lets the same screens run against the live database or the local fallback.

## Security notes

- Every table is behind RLS scoped to workspace membership (`is_tenant_member`).
- The public payment page has no anonymous table access. It reads one invoice
  through `get_public_invoice(uuid)`, so knowing the link is the only capability
  and the customer book stays private.
- Bank details live in `tenant_settings` behind RLS. Stripe and Resend keys live in
  Supabase secrets, never in the database or the client bundle.
