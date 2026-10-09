#!/usr/bin/env bash
# Read-only: dump customers, jobs, invoices, leads and campaigns from the live
# Companit Expert workspace to snapshot/live.json (gitignored). Kona only.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
mkdir -p snapshot
Q="select json_build_object(
 'customers', (select coalesce(json_agg(c order by c.created_at),'[]') from (select id,name,contact_name,phone,email,status,language,created_at from public.customers) c),
 'jobs',      (select coalesce(json_agg(j order by j.created_at),'[]') from (select j.id,j.title,j.status,j.amount,cu.name as customer,j.created_at from public.jobs j left join public.customers cu on cu.id=j.customer_id) j),
 'invoices',  (select coalesce(json_agg(i order by i.created_at),'[]') from (select i.id,i.number,i.amount,i.status,cu.name as customer,i.created_at from public.invoices i left join public.customers cu on cu.id=i.customer_id) i),
 'leads',     (select coalesce(json_agg(l order by l.created_at),'[]') from (select id,name,company,email,phone,source,status,created_at from public.leads) l),
 'campaigns', (select coalesce(json_agg(c),'[]') from (select id,name,created_at from public.campaigns) c)
) as snapshot;"
bash scripts/kona-sql.sh "$Q" > snapshot/live.json
python3 -c 'import json;d=json.load(open("snapshot/live.json"))[0]["snapshot"];print("  ".join(f"{k}: {len(v)}" for k,v in d.items()))'
echo "saved snapshot/live.json"
