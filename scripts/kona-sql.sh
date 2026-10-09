#!/usr/bin/env bash
# Run a SQL query against the Companit Expert Kona Supabase project via the
# Management API. For diagnostics and admin fixes. Reads .env.kona. Never CYMBUL.
# Usage: bash scripts/kona-sql.sh "select ..."
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[ -f .env.kona ] || { echo "no .env.kona"; exit 1; }
set -a; . ./.env.kona; set +a
: "${KONA_SUPABASE_REF:?}"; : "${SUPABASE_ACCESS_TOKEN:?}"
if [ "${1:-}" = "--file" ]; then
  Q="$(cat "${2:?pass a .sql file path}")"
else
  Q="${1:?pass a SQL query as the first argument}"
fi
BODY="$(python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$Q")"
curl -sS -X POST \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/$KONA_SUPABASE_REF/database/query" \
  -d "$BODY"
echo
