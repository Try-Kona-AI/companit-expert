#!/usr/bin/env bash
# Report the Companit Expert Kona project's org and billing plan (free vs pro),
# via the Management API. Read-only. Reads .env.kona. Never touches CYMBUL.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[ -f .env.kona ] || { echo "no .env.kona"; exit 1; }
set -a; . ./.env.kona; set +a
: "${KONA_SUPABASE_REF:?}"; : "${SUPABASE_ACCESS_TOKEN:?}"
AUTH="Authorization: Bearer $SUPABASE_ACCESS_TOKEN"

ORG="$(curl -sS -H "$AUTH" "https://api.supabase.com/v1/projects/$KONA_SUPABASE_REF" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('organization_id',''))" 2>/dev/null || true)"
echo "project org: ${ORG:-unknown}"

echo "--- subscription (raw, status) ---"
curl -sS -w "\nHTTP %{http_code}\n" -H "$AUTH" \
  "https://api.supabase.com/v1/organizations/$ORG/billing/subscription" | head -c 700
echo
echo "--- org list (name / plan) ---"
curl -sS -H "$AUTH" "https://api.supabase.com/v1/organizations" | head -c 500
echo
