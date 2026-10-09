#!/usr/bin/env bash
# Turn on automatic payment reminders for Companit Expert (Kona AI only).
# Safe to re-run. Steps:
#   1. shared cron secret (kept in .env.kona) -> CRON_SECRET function secret
#   2. Resend key, if RESEND_API_KEY is in ~/.config/org/kona.env or the shell
#   3. Vault entries the cron job reads (project_url, reminders_cron_secret)
#   4. deploy send-email + send-reminders
#   5. schedule the daily cron job (applies only the reminder migration)
#   6. dry run: lists what would go out today, sends nothing
# Never touches CYMBUL. Usage: bash scripts/kona-reminders.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[ -f .env.kona ] || { echo "no .env.kona"; exit 1; }
# Shared org env first, then this project's .env.kona so project values win.
if [ -f "$HOME/.config/org/kona.env" ]; then set -a; . "$HOME/.config/org/kona.env"; set +a; fi
set -a; . ./.env.kona; set +a
: "${KONA_SUPABASE_REF:?}"; : "${SUPABASE_ACCESS_TOKEN:?}"
URL="https://$KONA_SUPABASE_REF.supabase.co"

echo "==> 1. cron secret"
if [ -z "${KONA_CRON_SECRET:-}" ]; then
  KONA_CRON_SECRET="$(openssl rand -hex 24)"
  printf '\n# Shared secret between pg_cron and the send-reminders function\nKONA_CRON_SECRET=%s\n' "$KONA_CRON_SECRET" >> .env.kona
  echo "    generated and saved to .env.kona"
fi
supabase secrets set "CRON_SECRET=$KONA_CRON_SECRET" --project-ref "$KONA_SUPABASE_REF" >/dev/null
echo "    CRON_SECRET set"

echo "==> 2. Resend"
if [ -n "${RESEND_API_KEY:-}" ]; then
  supabase secrets set "RESEND_API_KEY=$RESEND_API_KEY" --project-ref "$KONA_SUPABASE_REF" >/dev/null
  echo "    RESEND_API_KEY set"
else
  echo "    RESEND_API_KEY not found locally. Reminders will fail until it is set:"
  echo "    supabase secrets set RESEND_API_KEY=re_... --project-ref $KONA_SUPABASE_REF"
fi

echo "==> 3. Vault entries"
bash scripts/kona-sql.sh "do \$\$ declare v uuid; begin
  select id into v from vault.secrets where name = 'project_url';
  if v is null then perform vault.create_secret('$URL', 'project_url');
  else perform vault.update_secret(v, '$URL'); end if;
  select id into v from vault.secrets where name = 'reminders_cron_secret';
  if v is null then perform vault.create_secret('$KONA_CRON_SECRET', 'reminders_cron_secret');
  else perform vault.update_secret(v, '$KONA_CRON_SECRET'); end if;
end \$\$;"

echo "==> 4. deploy functions"
supabase functions deploy send-email --project-ref "$KONA_SUPABASE_REF"
supabase functions deploy send-reminders --project-ref "$KONA_SUPABASE_REF" --no-verify-jwt

echo "==> 5. schedule daily job"
bash scripts/kona-sql.sh --file supabase/migrations/20261008120000_reminder_cron.sql
bash scripts/kona-sql.sh "select jobname, schedule, active from cron.job where jobname = 'send-reminders';"

echo "==> 6. dry run (sends nothing)"
sleep 5
curl -sS -X POST "$URL/functions/v1/send-reminders" \
  -H "x-cron-secret: $KONA_CRON_SECRET" -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
echo
echo "==> Done. The job runs daily at 14:00 UTC. Send one for real now with:"
echo "    curl -sS -X POST $URL/functions/v1/send-reminders -H \"x-cron-secret: \$KONA_CRON_SECRET\""
