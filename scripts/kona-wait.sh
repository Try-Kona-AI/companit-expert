#!/usr/bin/env bash
# Poll the Kona Supabase project until it reaches a target status (default
# ACTIVE_HEALTHY), e.g. after a restore. Reads .env.kona. Never touches CYMBUL.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[ -f .env.kona ] || { echo "no .env.kona"; exit 1; }
set -a; . ./.env.kona; set +a
: "${KONA_SUPABASE_REF:?}"; : "${SUPABASE_ACCESS_TOKEN:?}"
AUTH="Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
target="${1:-ACTIVE_HEALTHY}"
for i in $(seq 1 24); do
  s=$(curl -sS -H "$AUTH" "https://api.supabase.com/v1/projects" \
     | python3 -c "import sys,json;r=[p for p in json.load(sys.stdin) if p.get('id')=='$KONA_SUPABASE_REF'];print(r[0]['status'] if r else 'NA')" 2>/dev/null || echo ERR)
  echo "poll $i: $s"
  [ "$s" = "$target" ] && { echo READY; exit 0; }
  sleep 15
done
echo TIMEOUT; exit 1
