#!/usr/bin/env bash
# Deploy Companit Expert (Kona AI) edge functions and wire their runtime secrets.
# Non-interactive. Reads .env.kona (project ref + access token); runtime API keys
# come from the shared org env (~/.config/org/kona.env) when filled in. Secrets
# that are blank locally are skipped with a warning, so the deploy still runs.
# Scoped per invocation; never touches CYMBUL. Usage: bash scripts/kona-fn.sh [function]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

[ -f .env.kona ] || { echo "no .env.kona (see scripts/kona-setup.sh)"; exit 1; }
set -a; . ./.env.kona; set +a
: "${KONA_SUPABASE_REF:?set KONA_SUPABASE_REF in .env.kona}"
: "${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN in .env.kona}"

# Runtime API keys live in the shared org env, not the project .env.kona.
if [ -f "$HOME/.config/org/kona.env" ]; then . "$HOME/.config/org/kona.env"; fi

FN="${1:-translate}"

set_secret() {
  local name="$1" val="${2:-}"
  if [ -n "$val" ]; then
    echo "==> secret: $name -> $KONA_SUPABASE_REF"
    supabase secrets set "$name=$val" --project-ref "$KONA_SUPABASE_REF" >/dev/null
  else
    echo "    skip: $name is blank locally (set it in the Supabase dashboard or fill ~/.config/org/kona.env)"
  fi
}

# Translator needs Anthropic; invoice/reminder emails need Resend.
set_secret ANTHROPIC_API_KEY "${ANTHROPIC_API_KEY:-}"
set_secret RESEND_API_KEY "${RESEND_API_KEY:-}"

echo "==> deploy function '$FN' -> $KONA_SUPABASE_REF"
supabase functions deploy "$FN" --project-ref "$KONA_SUPABASE_REF"

echo "==> Done."
