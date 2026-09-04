# Hosting Companit Expert on Kona AI accounts only

Every command here passes Kona credentials per invocation. Nothing runs
`gh auth login`, `supabase login`, `vercel login`, or `vercel switch`, so the
CYMBUL logins in the macOS keychain and in `~/Library/Application
Support/com.vercel.cli` are never read or rewritten, and no other project on this
Mac changes.

| Tool | How Kona is selected | What it writes |
| --- | --- | --- |
| gh | `GH_TOKEN` env var, which takes precedence over the keychain for that one process | nothing |
| git | repo-local remote over the `github-kona` SSH alias, repo-local `user.email` | `.git/config` in this repo |
| supabase | `SUPABASE_ACCESS_TOKEN` env var instead of the `Supabase CLI` keychain item, plus `--project-ref` on every call | nothing outside this repo |
| vercel | `--token` and `--scope` on every call | `./.vercel/project.json` (gitignored) |

Never run these while working on this project: `gh auth login`, `gh auth switch`,
`supabase login`, `supabase link`, `vercel login`, `vercel switch`.

## The short way

Fill in one file, run one command:

```bash
cd ~/Projects/companit-expert
cp .env.kona.example .env.kona && chmod 600 .env.kona && open -t .env.kona
```

Paste the three Kona tokens, save, then:

```bash
npm run kona:setup
```

It does the whole chain and is safe to re-run: GitHub repo, push, Supabase
project, schema, API keys, `.env.local`, Vercel project, env vars, git
connection, production deploy, Supabase secrets, and the `send-email` function.
It prompts only for what it cannot derive: the Postgres password you choose, the
Resend key, and the org or team to use when a token can see more than one.
Derived values (project ref, team slug) are written back into `.env.kona`, so a
second run skips everything already done.

Two things it deliberately leaves to you: creating the owner login, and closing
signups afterwards. It prints both commands when it finishes.

The step-by-step below is the same sequence by hand, for when something needs
doing out of order.

## Step by step

### 0. Credentials, once

```bash
cd ~/Projects/companit-expert
cp .env.kona.example .env.kona
$EDITOR .env.kona          # paste the three Kona tokens
chmod 600 .env.kona
```

Load them into the shell (repeat in any new terminal tab):

```bash
cd ~/Projects/companit-expert
set -a; source .env.kona; set +a
```

`.env.kona` is gitignored. Tokens live only in that file and in the current shell.

### 1. GitHub

```bash
GH_TOKEN="$GH_TOKEN" gh repo create Try-Kona-AI/companit-expert \
  --public --description "Companit Expert bilingual RU/EN invoicing, by Kona AI"

git push -u origin main
```

The push uses the `github-kona` SSH key, not the token.

### 2. Supabase

```bash
supabase orgs list                                    # copy the Kona org id
supabase projects create companit-expert \
  --org-id <KONA_ORG_ID> --region us-east-1           # prompts for a DB password
supabase projects list                                # copy the new project ref
```

Put the ref in `.env.kona` as `KONA_SUPABASE_REF`, re-source, then:

```bash
supabase db push --project-ref "$KONA_SUPABASE_REF" -p '<DB_PASSWORD>'
supabase projects api-keys --project-ref "$KONA_SUPABASE_REF"
```

Local env for `npm run dev`:

```bash
cat > .env.local <<EOF
VITE_SUPABASE_URL=https://$KONA_SUPABASE_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key from the command above>
EOF
```

Secrets and functions:

```bash
supabase secrets set --project-ref "$KONA_SUPABASE_REF" \
  RESEND_API_KEY='<kona resend key>' \
  FROM_EMAIL='hello@trykona.ai' \
  APP_URL='https://companit-expert.vercel.app'

supabase functions deploy send-email --project-ref "$KONA_SUPABASE_REF" --use-api
```

Close signups so only invited logins work (create the owner login in the
dashboard, Authentication > Users, then run this):

```bash
curl -sS -X PATCH "https://api.supabase.com/v1/projects/$KONA_SUPABASE_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"disable_signup": true}'
```

Daily overdue sweep, in the SQL editor:

```
select cron.schedule('mark-overdue', '0 8 * * *', $$select public.mark_overdue_invoices()$$);
```

### 3. Vercel

```bash
npx vercel@latest teams ls --token "$VERCEL_TOKEN"    # copy the Kona team slug
```

Put it in `.env.kona` as `KONA_VERCEL_SCOPE`, re-source, then:

```bash
npx vercel@latest link --yes --project companit-expert \
  --token "$VERCEL_TOKEN" --scope "$KONA_VERCEL_SCOPE"

printf '%s' "https://$KONA_SUPABASE_REF.supabase.co" | \
  npx vercel@latest env add VITE_SUPABASE_URL production \
  --token "$VERCEL_TOKEN" --scope "$KONA_VERCEL_SCOPE"

printf '%s' '<publishable key>' | \
  npx vercel@latest env add VITE_SUPABASE_PUBLISHABLE_KEY production \
  --token "$VERCEL_TOKEN" --scope "$KONA_VERCEL_SCOPE"

npx vercel@latest git connect --yes --token "$VERCEL_TOKEN" --scope "$KONA_VERCEL_SCOPE"
npx vercel@latest deploy --prod --token "$VERCEL_TOKEN" --scope "$KONA_VERCEL_SCOPE"
```

`git connect` makes every push to `main` deploy on its own. Keep deployment
protection off and the repo public, or deploys fail on this plan.

If the production URL differs from the guess above, update `APP_URL`:

```bash
supabase secrets set --project-ref "$KONA_SUPABASE_REF" APP_URL='https://<real-url>'
```

### 4. Verify

```bash
git -C . remote -v                                     # github-kona:Try-Kona-AI/...
supabase projects list                                 # only Kona projects listed
npx vercel@latest project ls --token "$VERCEL_TOKEN" --scope "$KONA_VERCEL_SCOPE"
gh auth status                                         # unchanged, still TeamCYMBUL
```

Then open the production URL, sign in as the owner, and confirm: the RU/EN switch
flips the whole interface, a new invoice saves and survives a refresh, and
"Send invoice" to a customer marked RU arrives in Russian.
