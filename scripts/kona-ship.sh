#!/usr/bin/env bash
# Ship companit-expert (Kona AI) to production: apply Supabase migrations,
# push to GitHub, deploy to Vercel. Non-interactive. Reads .env.kona.
#
# Scoped per invocation (per-command tokens / --token --scope). It never runs a
# login or switch, so the CYMBUL credentials on this Mac are untouched.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

[ -f .env.kona ] || { echo "no .env.kona (see scripts/kona-setup.sh)"; exit 1; }
# .env.kona is clean KEY=VALUE, maintained by kona-setup.sh — safe to source.
set -a; . ./.env.kona; set +a
: "${KONA_SUPABASE_REF:?}" "${KONA_VERCEL_SCOPE:?}" "${KONA_DB_PASSWORD:?}" "${VERCEL_TOKEN:?}"

vc() { npx --yes vercel@latest "$@" --token "$VERCEL_TOKEN" --scope "$KONA_VERCEL_SCOPE"; }

echo "==> Supabase: apply migrations -> $KONA_SUPABASE_REF"
supabase db push --project-ref "$KONA_SUPABASE_REF" -p "$KONA_DB_PASSWORD" --include-all

echo "==> GitHub: push main (Try-Kona-AI/companit-expert)"
git push origin main

echo "==> Vercel: production deploy"
vc link --yes --project companit-expert >/dev/null 2>&1 || true
URL="$(vc deploy --prod 2>/dev/null | tail -1 || true)"
echo "    ${URL:-https://companit-expert.vercel.app}"
echo "==> Done."
