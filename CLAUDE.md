# Companit Expert (Kona AI)

Bilingual EN/RU invoicing, reminders and outreach app for Companit Expert LLC (Yan's
painting and renovation company, Brooklyn). Built and run by Kona AI (Michael). This
project is 100% Kona. Never use, sign in to, or reference CYMBUL or Galeta accounts.

## Accounts (Kona only)
- GitHub: Try-Kona-AI/companit-expert (public repo; push over the `github-kona` SSH alias)
- Vercel: auto-deploys `main` to https://companit-expert.vercel.app
- Supabase: project ref `rixejuoodlwqswnhxsjx`; creds in `.env.kona` (gitignored)
- Resend: team "trykona", sending domain companitexpert.com, sender info@companitexpert.com
- Public marketing site companitexpert.com is a separate Lovable project (not this repo)

## Stack
React 19 + Vite + TypeScript, Supabase (Postgres + RLS + edge functions in Deno), Resend.
No Stripe (card payments intentionally off; pay page shows Zelle/ACH/check).

## Commands
- `npx tsc -b --noEmit` typecheck before every commit
- `bash scripts/kona-golive.sh` sets secrets, applies pending migrations, deploys all functions
- `bash scripts/kona-snapshot.sh` read-only dump of live data to snapshot/
- `bash scripts/kona-sql.sh "select ..."` run SQL against the live project
- `bash scripts/kona-import-leads.sh <csv>` import leads (dedupes on company+phone)
- Pushing `supabase/**` to main triggers .github/workflows/supabase-deploy.yml

## Rules
- Never commit secrets. Keys live in `.env.kona` and `~/.config/org/kona.env`.
- `leads/`, `snapshot/`, `*.log` stay out of git (prospect data, repo is public).
- Never delete live data without listing exactly what goes and getting a yes.
- Logins are invite-only (`join_workspace` raises for uninvited users; signups disabled).
- Outreach copy: from "Michael K, Companit Expert". Use {{greeting}} and {{signature}}.
  No "licensed and insured" claims. Keep src/lib/outreach.ts and
  supabase/functions/send-campaign/index.ts render logic in sync.
- Writing style: no emojis, no em dashes, plain founder voice.
- EMAIL_TEST_TO redirects every email to one inbox; check it is unset before real sends.
