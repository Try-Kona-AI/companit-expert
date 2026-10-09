#!/usr/bin/env bash
# Take Companit Expert fully live on Kona AI accounts. Safe to re-run.
#
#   bash scripts/kona-golive.sh                         # everything except logins
#   bash scripts/kona-golive.sh yan@email.com           # + create Yan's owner login
#   bash scripts/kona-golive.sh yan@email.com me@kona   # + add you as a member
#
# Reads .env.kona and ~/.config/org/kona.env. Keys it looks for there:
#   RESEND_API_KEY  FROM_EMAIL  REPLY_TO  ANTHROPIC_API_KEY  APOLLO_API_KEY
#   OUTREACH_FROM_EMAIL  OUTREACH_REPLY_TO  EMAIL_TEST_TO
# No card payments: Stripe functions are not deployed. Customers pay by
# Zelle, ACH or check, shown on every invoice email and on the pay page.
# Blank keys are skipped and reported, never overwritten with blanks.
# Never touches CYMBUL. Never prints a secret value.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[ -f .env.kona ] || { echo "no .env.kona"; exit 1; }
# Shared org env first, then this project's .env.kona so project values win.
if [ -f "$HOME/.config/org/kona.env" ]; then set -a; . "$HOME/.config/org/kona.env"; set +a; fi
set -a; . ./.env.kona; set +a
: "${KONA_SUPABASE_REF:?}"; : "${SUPABASE_ACCESS_TOKEN:?}"
REF="$KONA_SUPABASE_REF"; URL="https://$REF.supabase.co"
MGMT="https://api.supabase.com/v1/projects/$REF"
AUTHH="Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
OWNER_EMAIL="${1:-}"; MEMBER_EMAIL="${2:-}"
sql() { bash scripts/kona-sql.sh "$@"; }

echo "==> 1. close public signups (logins are invite-only)"
bash scripts/kona-auth.sh '{"disable_signup": true}' >/dev/null && echo "    signups disabled"

echo "==> 2. database migrations not yet applied"
APPLIED="$(sql "select coalesce(string_agg(version, ','), '') as v from supabase_migrations.schema_migrations;" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d[0]["v"] if isinstance(d,list) and d else "")' 2>/dev/null || true)"
PENDING=()
for f in supabase/migrations/*.sql; do
  ver="$(basename "$f" .sql)"; ver="${ver%%_*}"
  [[ ",$APPLIED," == *",$ver,"* ]] || PENDING+=("$f")
done
if [ ${#PENDING[@]} -eq 0 ]; then echo "    none pending"; fi
if [ ${#PENDING[@]} -gt 0 ]; then
  printf '    pending: %s\n' "${PENDING[@]##*/}"
  read -r -p "    apply these now? [y/N] " ok
  [ "$ok" = "y" ] || { echo "    stopped before migrations"; exit 1; }
  for f in "${PENDING[@]}"; do
  base="$(basename "$f" .sql)"; ver="${base%%_*}"; name="${base#*_}"
  echo "    applying $base"
  OUT="$(sql --file "$f")"
  if echo "$OUT" | grep -q '"message"'; then echo "    FAILED: $OUT"; exit 1; fi
  sql "insert into supabase_migrations.schema_migrations (version, name) values ('$ver', '$name') on conflict do nothing;" >/dev/null
  done
fi

echo "==> 3. function secrets"
for k in RESEND_API_KEY FROM_EMAIL REPLY_TO ANTHROPIC_API_KEY APOLLO_API_KEY \
         OUTREACH_FROM_EMAIL OUTREACH_REPLY_TO OUTREACH_FROM_NAME OUTREACH_SIGNER_PHONE \
         OUTREACH_WEBSITE OUTREACH_TIKTOK OUTREACH_LOGO_URL EMAIL_TEST_TO; do
  v="${!k:-}"
  if [ -n "$v" ]; then supabase secrets set "$k=$v" --project-ref "$REF" >/dev/null; echo "    set     $k"
  else echo "    blank   $k"; fi
done

echo "==> 4. deploy every edge function"
for d in supabase/functions/*/; do
  fn="$(basename "$d")"
  case "$fn" in send-reminders|stripe-checkout|stripe-webhook) continue ;; esac
  supabase functions deploy "$fn" --project-ref "$REF" >/dev/null && echo "    deployed $fn"
done

echo "==> 5. automatic reminders"
bash scripts/kona-reminders.sh | sed 's/^/    /'

if [ -n "$OWNER_EMAIL" ]; then
  echo "==> 6. logins"
  SRK="$(curl -sS -H "$AUTHH" "$MGMT/api-keys?reveal=true" \
    | python3 -c 'import sys,json;k=[x for x in json.load(sys.stdin) if x.get("name")=="service_role"];print(k[0]["api_key"] if k else "")')"
  [ -n "$SRK" ] || { echo "    could not read service key"; exit 1; }
  make_login() {
    local email="$1" role="$2" pw
    pw="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
    local res; res="$(curl -sS -X POST "$URL/auth/v1/admin/users" -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
      -H "Content-Type: application/json" -d "{\"email\":\"$email\",\"password\":\"$pw\",\"email_confirm\":true}")"
    if echo "$res" | grep -q '"id"'; then
      local f="${email%%@*}-login.txt"
      printf 'App: https://companit-expert.vercel.app\nEmail: %s\nTemporary password: %s\n' "$email" "$pw" > "$f"; chmod 600 "$f"
      echo "    created $email -> password saved in ./$f (gitignored; hand it over, then delete the file)"
    else
      echo "    $email already exists or could not be created, leaving its password alone"
    fi
    sql "select public.add_workspace_member('$email', '$role') as result;" | sed 's/^/    /'
  }
  make_login "$OWNER_EMAIL" owner
  [ -n "$MEMBER_EMAIL" ] && make_login "$MEMBER_EMAIL" member
fi

echo "==> 7. who can get in right now (remove anyone you don't recognise)"
sql "select email, role, last_sign_in_at from public.workspace_access order by role, email;" \
  | python3 -c 'import sys,json;[print("   ",r["role"].ljust(7),r["email"],"| last sign-in:",r["last_sign_in_at"]) for r in json.load(sys.stdin)]' 2>/dev/null || true

echo
echo "==> Done. Still to do by hand: git push (deploys the app), and paste this output to Claude."
