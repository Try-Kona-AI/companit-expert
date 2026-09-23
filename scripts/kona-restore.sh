#!/usr/bin/env bash
# Restore (unpause) the Companit Expert Kona Supabase project via the Management
# API. Free-tier projects pause when idle; this brings it back so the app and
# edge functions work. Non-interactive. Reads .env.kona. Never touches CYMBUL.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[ -f .env.kona ] || { echo "no .env.kona"; exit 1; }
set -a; . ./.env.kona; set +a
: "${KONA_SUPABASE_REF:?set KONA_SUPABASE_REF in .env.kona}"
: "${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN in .env.kona}"
AUTH="Authorization: Bearer $SUPABASE_ACCESS_TOKEN"

status() {
  curl -sS -H "$AUTH" "https://api.supabase.com/v1/projects" \
    | python3 -c "import sys,json;r=[p for p in json.load(sys.stdin) if p.get('id')=='$KONA_SUPABASE_REF'];print(r[0]['status'] if r else 'NOT_FOUND')" 2>/dev/null || echo "UNKNOWN"
}

echo "status before: $(status)"
echo "==> requesting restore..."
curl -sS -X POST -H "$AUTH" -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/$KONA_SUPABASE_REF/restore" -d '{}'; echo
echo "status now: $(status)"
