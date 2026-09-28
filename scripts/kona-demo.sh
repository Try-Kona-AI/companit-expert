#!/usr/bin/env bash
# Deploy a PUBLIC, no-login demo of Companit Expert to its own Vercel URL.
# A fresh Vercel project with no Supabase env vars builds the app in demo mode
# (LIVE=false), which seeds sample data and auto-signs-in, so the link opens
# straight into the app. Non-interactive. Reads .env.kona. Never touches CYMBUL.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[ -f .env.kona ] || { echo "no .env.kona"; exit 1; }
set -a; . ./.env.kona; set +a
: "${VERCEL_TOKEN:?set VERCEL_TOKEN in .env.kona}"

SCOPE="${KONA_VERCEL_SCOPE:-}"
if [ -z "$SCOPE" ]; then
  SCOPE="$(curl -sS -H "Authorization: Bearer $VERCEL_TOKEN" https://api.vercel.com/v2/teams \
    | python3 -c "import sys,json;d=json.load(sys.stdin);t=(d.get('teams') if isinstance(d,dict) else d) or [];print(t[0]['slug'] if len(t)==1 else '')" 2>/dev/null || true)"
fi
vc() { npx --yes vercel@latest "$@" --token "$VERCEL_TOKEN" ${SCOPE:+--scope "$SCOPE"}; }

DEMO_PROJECT="companit-expert-demo"
echo "==> link/create project '$DEMO_PROJECT' (scope: ${SCOPE:-personal})"
vc link --yes --project "$DEMO_PROJECT" >/dev/null 2>&1 || true

echo "==> deploy (no env vars -> demo mode)"
URL="$(vc deploy --prod --yes 2>/dev/null | tail -1 || true)"
echo "    demo URL: ${URL:-check the Vercel dashboard}"

# Re-link this checkout to the live project so other tooling stays pointed there.
vc link --yes --project companit-expert >/dev/null 2>&1 || true
echo "==> Done."
