#!/usr/bin/env bash
# Read or update the Companit Expert Kona project's auth config via the
# Management API. No arg = GET (read). One JSON arg = PATCH. Reads .env.kona.
# Never touches CYMBUL. Usage: bash scripts/kona-auth.sh ['{"mailer_autoconfirm":true}']
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[ -f .env.kona ] || { echo "no .env.kona"; exit 1; }
set -a; . ./.env.kona; set +a
: "${KONA_SUPABASE_REF:?}"; : "${SUPABASE_ACCESS_TOKEN:?}"
API="https://api.supabase.com/v1/projects/$KONA_SUPABASE_REF/config/auth"
if [ -n "${1:-}" ]; then
  curl -sS -X PATCH -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" "$API" -d "$1"
else
  curl -sS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$API"
fi
echo
