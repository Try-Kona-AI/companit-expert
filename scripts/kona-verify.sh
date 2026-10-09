#!/usr/bin/env bash
# Read-only ownership check for Companit Expert. Uses .env.kona (Kona creds only).
# Prints account/org names and which secrets are SET. Never prints secret values.
# Never touches CYMBUL. Usage: bash scripts/kona-verify.sh
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[ -f .env.kona ] || { echo "no .env.kona"; exit 1; }
set -a; . ./.env.kona; set +a
SB="Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
py() { python3 -c "$1" 2>/dev/null || echo "  (could not read response)"; }

echo "== GitHub repo"
curl -sS -H "Authorization: token ${GH_TOKEN:-}" https://api.github.com/repos/Try-Kona-AI/companit-expert \
 | py 'import sys,json;d=json.load(sys.stdin);print("  repo:",d.get("full_name"),"| owner:",d.get("owner",{}).get("login"),"|",("private" if d.get("private") else "public"),d.get("message",""))'

echo "== Supabase project $KONA_SUPABASE_REF"
ORG="$(curl -sS -H "$SB" "https://api.supabase.com/v1/projects/$KONA_SUPABASE_REF" | py 'import sys,json;print(json.load(sys.stdin).get("organization_id",""))')"
curl -sS -H "$SB" https://api.supabase.com/v1/organizations \
 | py "import sys,json;[print('  org:',o['name'],'| id:',o['id'],'<- THIS PROJECT' if o['id']=='$ORG' else '') for o in json.load(sys.stdin)]"

echo "== Supabase secrets that are SET (names only)"
curl -sS -H "$SB" "https://api.supabase.com/v1/projects/$KONA_SUPABASE_REF/secrets" \
 | py 'import sys,json;n={s["name"] for s in json.load(sys.stdin)};need=["RESEND_API_KEY","FROM_EMAIL","APP_URL","STRIPE_SECRET_KEY","STRIPE_WEBHOOK_SECRET","ANTHROPIC_API_KEY","APOLLO_API_KEY","OUTREACH_FROM_EMAIL"];[print("  ",k.ljust(22),"SET" if k in n else "MISSING") for k in need]'

echo "== Edge functions deployed"
curl -sS -H "$SB" "https://api.supabase.com/v1/projects/$KONA_SUPABASE_REF/functions" \
 | py 'import sys,json;[print("  ",f["slug"],f.get("status"),"v"+str(f.get("version"))) for f in json.load(sys.stdin)]'

echo "== Vercel"
if [ -n "${VERCEL_TOKEN:-}" ]; then
  curl -sS -H "Authorization: Bearer $VERCEL_TOKEN" https://api.vercel.com/v2/user \
   | py 'import sys,json;u=json.load(sys.stdin).get("user",{});print("  token belongs to:",u.get("username"),u.get("email"))'
  curl -sS -H "Authorization: Bearer $VERCEL_TOKEN" "https://api.vercel.com/v9/projects/companit-expert${KONA_VERCEL_SCOPE:+?slug=$KONA_VERCEL_SCOPE}" \
   | py 'import sys,json;d=json.load(sys.stdin);print("  project:",d.get("name"),"| account id:",d.get("accountId"),"| git:",(d.get("link") or {}).get("org"),"/",(d.get("link") or {}).get("repo"),d.get("error",""))'
else
  echo "  VERCEL_TOKEN is empty in .env.kona. Check by hand: Kona Chrome profile -> vercel.com -> companit-expert -> Settings."
fi
echo "== Resend / Stripe"
echo "  Secret values can't be read back. Confirm in the Kona Chrome profile:"
echo "  resend.com -> Domains (which domain sends) ; dashboard.stripe.com -> account name top-left."
