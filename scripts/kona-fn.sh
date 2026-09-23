#!/usr/bin/env bash
# Deploy a Companit Expert (Kona AI) edge function and set its secrets.
# Non-interactive. Reads .env.kona (project ref + access token); the model API
# key comes from the shared org env (~/.config/org/kona.env). Scoped per
# invocation; never touches CYMBUL. Usage: bash scripts/kona-fn.sh [function]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

[ -f .env.kona ] || { echo "no .env.kona (see scripts/kona-setup.sh)"; exit 1; }
set -a; . ./.env.kona; set +a
: "${KONA_SUPABASE_REF:?set KONA_SUPABASE_REF in .env.kona}"
: "${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN in .env.kona}"

# The model key lives in the shared org env, not the project .env.kona.
if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -f "$HOME/.config/org/kona.env" ]; then
  . "$HOME/.config/org/kona.env"
fi
: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY not found (checked .env.kona and ~/.config/org/kona.env)}"

FN="${1:-translate}"

echo "==> Supabase: set secret ANTHROPIC_API_KEY -> $KONA_SUPABASE_REF"
supabase secrets set "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" --project-ref "$KONA_SUPABASE_REF" >/dev/null

echo "==> Supabase: deploy function '$FN' -> $KONA_SUPABASE_REF"
supabase functions deploy "$FN" --project-ref "$KONA_SUPABASE_REF"

echo "==> Done. Function '$FN' is live."
