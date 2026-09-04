#!/usr/bin/env bash
# One-shot Kona AI hosting setup for Companit Expert.
#
# Reads Kona credentials from .env.kona and does the whole chain: GitHub repo,
# push, Supabase project, schema, keys, secrets, edge function, Vercel project,
# env vars, git connection, production deploy.
#
# Every call is scoped per invocation (GH_TOKEN / SUPABASE_ACCESS_TOKEN /
# --token --scope). It never runs a login or switch command, so the CYMBUL
# credentials on this Mac are untouched.
#
# Safe to re-run: each step checks for what already exists and skips it.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$(pwd)"

REPO="${KONA_GITHUB_REPO:-Try-Kona-AI/companit-expert}"
PROJECT="${KONA_PROJECT_NAME:-companit-expert}"
REGION="${KONA_SUPABASE_REGION:-us-east-1}"
ENV_FILE="$ROOT/.env.kona"

bold()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
info()  { printf '    %s\n' "$*"; }
warn()  { printf '\033[33m !  %s\033[0m\n' "$*"; }
die()   { printf '\033[31m x  %s\033[0m\n' "$*" >&2; exit 1; }

# --------------------------------------------------------------- preflight ---
for cmd in git gh supabase curl python3 npx; do
  command -v "$cmd" >/dev/null 2>&1 || die "$cmd is not on PATH"
done

[ -f "$ENV_FILE" ] || die "No .env.kona. Run: cp .env.kona.example .env.kona && chmod 600 .env.kona, then fill in the three tokens."
set -a; . "$ENV_FILE"; set +a

[ -n "${GH_TOKEN:-}" ]               || die "GH_TOKEN missing from .env.kona"
[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]  || die "SUPABASE_ACCESS_TOKEN missing from .env.kona"
[ -n "${VERCEL_TOKEN:-}" ]           || die "VERCEL_TOKEN missing from .env.kona"

# Writes a derived value back into .env.kona so re-runs pick it up.
save_env() {
  python3 - "$ENV_FILE" "$1" "$2" <<'PY'
import sys, re
path, key, val = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(path).read().splitlines()
out, seen = [], False
for line in lines:
    if re.match(rf'^{re.escape(key)}=', line):
        out.append(f'{key}={val}'); seen = True
    else:
        out.append(line)
if not seen:
    out.append(f'{key}={val}')
open(path, 'w').write('\n'.join(out) + '\n')
PY
  export "$1=$2"
}

# Reads JSON on stdin and runs a snippet with `d` already unwrapped to a list.
jq_py() { python3 -c "
import json,sys
raw=sys.stdin.read().strip()
try:
    d=json.loads(raw) if raw else []
except Exception:
    d=[]
if isinstance(d,dict):
    for k in ('projects','organizations','orgs','teams','data','result','keys'):
        if isinstance(d.get(k),list):
            d=d[k]; break
    else:
        d=[d]
$1
" ; }

# ------------------------------------------------------------------ github ---
bold "GitHub: $REPO"
if gh repo view "$REPO" >/dev/null 2>&1; then
  info "repo already exists"
else
  gh repo create "$REPO" --public \
    --description "Companit Expert bilingual RU/EN invoicing, by Kona AI"
  info "created"
fi

git remote get-url origin >/dev/null 2>&1 || \
  git remote add origin "git@github-kona:${REPO}.git"

if git push -u origin main 2>/dev/null; then
  info "pushed main"
else
  warn "push failed. Check the github-kona SSH key has access to $REPO, then re-run."
fi

# ---------------------------------------------------------------- supabase ---
bold "Supabase project: $PROJECT"

find_ref() {
  supabase projects list -o json 2>/dev/null | jq_py "
m=[p for p in d if p.get('name')=='$PROJECT']
print(m[0].get('id') or m[0].get('ref','') if m else '')
" 2>/dev/null || true
}

project_status() {
  supabase projects list -o json 2>/dev/null | jq_py "
m=[p for p in d if (p.get('id') or p.get('ref'))=='$1']
print(m[0].get('status','') if m else '')
" 2>/dev/null || true
}

REF="${KONA_SUPABASE_REF:-}"
[ -n "$REF" ] || REF="$(find_ref)"

if [ -z "$REF" ]; then
  ORG="${KONA_SUPABASE_ORG:-}"
  if [ -z "$ORG" ]; then
    ORGS_JSON="$(supabase orgs list -o json)"
    ORG_COUNT="$(printf '%s' "$ORGS_JSON" | jq_py "print(len(d))")"
    if [ "$ORG_COUNT" = "1" ]; then
      ORG="$(printf '%s' "$ORGS_JSON" | jq_py "print(d[0]['id'])")"
      info "one org on this token, using it"
    else
      printf '%s' "$ORGS_JSON" | jq_py "
for o in d: print('   ', o['id'], o.get('name',''))
"
      read -rp "    Kona org id: " ORG
    fi
    save_env KONA_SUPABASE_ORG "$ORG"
  fi

  printf '    New Postgres password (save it in your password manager): '
  read -rs DB_PASSWORD; printf '\n'
  [ -n "$DB_PASSWORD" ] || die "empty password"

  info "creating project in $REGION"
  supabase projects create "$PROJECT" --org-id "$ORG" --region "$REGION" \
    --db-password "$DB_PASSWORD" >/dev/null

  for _ in $(seq 1 30); do
    REF="$(find_ref)"; [ -n "$REF" ] && break
    sleep 4
  done
  [ -n "$REF" ] || die "project created but no ref came back. Run supabase projects list and put it in .env.kona as KONA_SUPABASE_REF, then re-run."
else
  info "project exists: $REF"
fi

save_env KONA_SUPABASE_REF "$REF"

info "waiting for the database to come up"
for _ in $(seq 1 60); do
  S="$(project_status "$REF")"
  [ "$S" = "ACTIVE_HEALTHY" ] && break
  sleep 5
done

if [ -z "${DB_PASSWORD:-}" ]; then
  printf '    Postgres password for %s: ' "$REF"
  read -rs DB_PASSWORD; printf '\n'
fi

bold "Applying schema"
supabase db push --project-ref "$REF" -p "$DB_PASSWORD" --include-all

bold "Reading API keys"
KEYS_JSON="$(supabase projects api-keys --project-ref "$REF" -o json)"
PUBLISHABLE="$(printf '%s' "$KEYS_JSON" | jq_py "
pub=[k for k in d if str(k.get('api_key','')).startswith('sb_publishable_')]
anon=[k for k in d if k.get('name')=='anon']
print((pub or anon)[0]['api_key'] if (pub or anon) else '')
")"
[ -n "$PUBLISHABLE" ] || die "could not read a publishable key. Run: supabase projects api-keys --project-ref $REF"

printf 'VITE_SUPABASE_URL=https://%s.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=%s\n' \
  "$REF" "$PUBLISHABLE" > "$ROOT/.env.local"
info "wrote .env.local (npm run dev now hits the live database)"

# ------------------------------------------------------------------ vercel ---
bold "Vercel"
vc() { npx --yes vercel@latest "$@" --token "$VERCEL_TOKEN" --scope "$SCOPE"; }

SCOPE="${KONA_VERCEL_SCOPE:-}"
if [ -z "$SCOPE" ]; then
  TEAMS_JSON="$(curl -sS -H "Authorization: Bearer $VERCEL_TOKEN" https://api.vercel.com/v2/teams)"
  TEAM_COUNT="$(printf '%s' "$TEAMS_JSON" | jq_py "print(len(d))")"
  if [ "$TEAM_COUNT" = "1" ]; then
    SCOPE="$(printf '%s' "$TEAMS_JSON" | jq_py "print(d[0]['slug'])")"
    info "one team on this token: $SCOPE"
  else
    printf '%s' "$TEAMS_JSON" | jq_py "
for t in d: print('   ', t['slug'], '-', t.get('name',''))
"
    read -rp "    Kona team slug: " SCOPE
  fi
  save_env KONA_VERCEL_SCOPE "$SCOPE"
fi

info "linking project"
vc link --yes --project "$PROJECT" >/dev/null

set_vercel_env() {
  local name="$1" value="$2"
  for target in production preview; do
    vc env rm "$name" "$target" --yes >/dev/null 2>&1 || true
    printf '%s' "$value" | vc env add "$name" "$target" >/dev/null 2>&1 || \
      warn "could not set $name for $target"
  done
  info "set $name"
}
set_vercel_env VITE_SUPABASE_URL "https://$REF.supabase.co"
set_vercel_env VITE_SUPABASE_PUBLISHABLE_KEY "$PUBLISHABLE"

info "connecting the git repo for push-to-deploy"
vc git connect --yes >/dev/null 2>&1 || \
  warn "git connect failed. Link it once in the Vercel dashboard (Settings > Git)."

bold "Deploying to production"
DEPLOY_URL="$(vc deploy --prod 2>/dev/null | tail -1 || true)"
PROD_URL="${DEPLOY_URL:-}"
if [ -z "$PROD_URL" ]; then
  warn "no deploy URL captured. Check: npx vercel@latest ls --token ... --scope $SCOPE"
  PROD_URL="https://$PROJECT.vercel.app"
fi
info "$PROD_URL"

# --------------------------------------------------------- secrets + email ---
bold "Supabase secrets and the bilingual email function"
if [ -z "${RESEND_API_KEY:-}" ]; then
  printf '    Kona Resend API key (blank to skip email for now): '
  read -rs RESEND_API_KEY; printf '\n'
fi

if [ -n "${RESEND_API_KEY:-}" ]; then
  supabase secrets set --project-ref "$REF" \
    "RESEND_API_KEY=$RESEND_API_KEY" \
    "FROM_EMAIL=${FROM_EMAIL:-hello@trykona.ai}" \
    "APP_URL=$PROD_URL" >/dev/null
  info "secrets set"
else
  supabase secrets set --project-ref "$REF" "APP_URL=$PROD_URL" >/dev/null
  warn "no Resend key set. Sends will report the missing key until you add it."
fi

supabase functions deploy send-email --project-ref "$REF" --use-api >/dev/null
info "send-email deployed"

# ------------------------------------------------------------------ finish ---
bold "Done"
cat <<TXT
    App          $PROD_URL
    Supabase     https://supabase.com/dashboard/project/$REF
    Repo         https://github.com/$REPO

    Two things only you can do:
      1. Create the owner login: Supabase dashboard > Authentication > Users.
      2. Then close signups so the app is invite only:
           curl -sS -X PATCH "https://api.supabase.com/v1/projects/$REF/config/auth" \\
             -H "Authorization: Bearer \$SUPABASE_ACCESS_TOKEN" \\
             -H "Content-Type: application/json" \\
             -d '{"disable_signup": true}'

    Nothing here touched your CYMBUL logins. Confirm with:
      gh auth status
TXT
