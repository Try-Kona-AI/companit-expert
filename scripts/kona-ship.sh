#!/usr/bin/env bash
# Ship companit-expert (Kona AI) to production: apply Supabase migrations,
# push to GitHub (which triggers the connected Vercel deploy), and, when a
# Vercel scope is available, also run an explicit Vercel production deploy.
# Non-interactive. Reads .env.kona. Scoped per invocation; never touches CYMBUL.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

[ -f .env.kona ] || { echo "no .env.kona (see scripts/kona-setup.sh)"; exit 1; }
set -a; . ./.env.kona; set +a
: "${KONA_SUPABASE_REF:?set KONA_SUPABASE_REF in .env.kona}"
: "${KONA_DB_PASSWORD:?set KONA_DB_PASSWORD in .env.kona}"

echo "==> Supabase: apply migrations -> $KONA_SUPABASE_REF"
supabase db push --project-ref "$KONA_SUPABASE_REF" -p "$KONA_DB_PASSWORD" --include-all

echo "==> GitHub: push main (Try-Kona-AI/companit-expert)"
git push origin main

echo "==> Vercel: production deploy"
SCOPE="${KONA_VERCEL_SCOPE:-}"
if [ -z "$SCOPE" ] && [ -n "${VERCEL_TOKEN:-}" ]; then
  SCOPE="$(curl -sS -H "Authorization: Bearer $VERCEL_TOKEN" https://api.vercel.com/v2/teams \
    | python3 -c "import sys,json;d=json.load(sys.stdin);t=(d.get('teams') if isinstance(d,dict) else d) or [];print(t[0]['slug'] if len(t)==1 else '')" 2>/dev/null || true)"
fi
if [ -n "$SCOPE" ] && [ -n "${VERCEL_TOKEN:-}" ]; then
  vc() { npx --yes vercel@latest "$@" --token "$VERCEL_TOKEN" --scope "$SCOPE"; }
  vc link --yes --project companit-expert >/dev/null 2>&1 || true
  URL="$(vc deploy --prod 2>/dev/null | tail -1 || true)"
  echo "    deployed: ${URL:-check the Vercel dashboard}"
else
  echo "    pushed to GitHub; the connected Vercel project deploys main automatically."
  echo "    live at https://companit-expert.vercel.app"
fi
echo "==> Done."
