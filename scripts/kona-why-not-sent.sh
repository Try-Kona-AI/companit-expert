#!/usr/bin/env bash
# Read-only diagnosis of outreach sends. Writes snapshot/send-check.json.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
mkdir -p snapshot
bash scripts/kona-sql.sh "select json_build_object(
 'sent', (select coalesce(json_agg(m order by m.sent_at desc),'[]') from (select sent_at,to_email,subject,step_no,test_mode,provider_id from public.outreach_messages order by sent_at desc limit 10) m),
 'campaigns', (select coalesce(json_agg(c),'[]') from (select id,name,status,language,daily_cap,created_at from public.campaigns) c),
 'enrollments', (select coalesce(json_agg(e),'[]') from (select e.status,e.next_step,e.next_send_on,l.name,l.email from public.campaign_enrollments e left join public.leads l on l.id=e.lead_id) e),
 'mailing_address_set', (select bool_and(coalesce(mailing_address,'')<>'') from public.tenant_settings),
 'mailing_name', (select max(mailing_name) from public.tenant_settings)
) as r;" > snapshot/send-check.json 2>&1 || true
cat snapshot/send-check.json | head -c 3000; echo
