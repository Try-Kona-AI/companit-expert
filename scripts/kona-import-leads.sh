#!/usr/bin/env bash
# Import a leads CSV into the Companit Expert workspace (Kona AI only).
# CSV columns: name,company,phone,email,address,service,source,status,notes
# Skips any lead whose company+phone already exists, so it is safe to re-run.
# Usage: bash scripts/kona-import-leads.sh leads/pm-south-brooklyn-2026-10-09.csv
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
CSV="${1:?pass a CSV path}"
[ -f "$CSV" ] || { echo "no such file: $CSV"; exit 1; }

HAS_COMPANY="$(bash scripts/kona-sql.sh "select count(*) as n from information_schema.columns where table_schema='public' and table_name='leads' and column_name='company';" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["n"])')"
[ "$HAS_COMPANY" = "1" ] || { echo "leads.company column missing: run scripts/kona-golive.sh first (applies the campaigns migration)"; exit 1; }

SQL="$(python3 - "$CSV" <<'PY'
import csv, sys
q = lambda v: "null" if v is None or str(v).strip() == "" else "'" + str(v).strip().replace("'", "''") + "'"
rows = list(csv.DictReader(open(sys.argv[1], newline="")))
vals = []
for r in rows:
    name = r.get("name") or r.get("company")
    vals.append("(" + ", ".join([q(name), q(r.get("company")), q(r.get("phone")), q(r.get("email")),
        q(r.get("address")), q(r.get("service")), q(r.get("source") or "pm_outreach"),
        q(r.get("status") or "new"), q(r.get("notes"))]) + ")")
print("""with t as (select id from public.tenants order by created_at limit 1),
src(name, company, phone, email, address, service, source, status, notes) as (values
""" + ",\n".join(vals) + """
),
ins as (
  insert into public.leads (tenant_id, name, company, phone, email, address, service, source, status, notes)
  select t.id, s.name, s.company, s.phone, s.email, s.address, s.service, s.source, s.status, s.notes
    from src s cross join t
   where not exists (select 1 from public.leads l
                      where l.tenant_id = t.id
                        and coalesce(l.company,'') = coalesce(s.company,'')
                        and coalesce(l.phone,'') = coalesce(s.phone,''))
  returning 1)
select (select count(*) from ins) as inserted, %d as in_file;""" % len(rows))
PY
)"
bash scripts/kona-sql.sh "$SQL"
