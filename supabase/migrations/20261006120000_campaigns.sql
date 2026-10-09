-- Companit Expert (Kona AI): outreach campaigns to property managers and
-- small landlords. Additive and idempotent: new columns on leads, new tables
-- for campaigns / steps / enrollments / sent log / suppression list.
-- Nothing sends from the database; the send-campaign edge function does that,
-- only for batches a signed-in owner approves.

-- ---------------------------------------------------------------- leads -----
alter table public.leads add column if not exists company         text;
alter table public.leads add column if not exists title           text;
-- One real building the prospect manages/owns, used for personalization.
alter table public.leads add column if not exists building        text;
-- Where the prospect came from, for de-duplication: 'hpd:agent:<name>',
-- 'hpd:owner:<name|address>', 'apollo:<id>'.
alter table public.leads add column if not exists external_ref    text;
alter table public.leads add column if not exists unsubscribed_at timestamptz;

-- New lead source for prospects pulled from NYC building registrations.
alter table public.leads drop constraint if exists leads_source_check;
alter table public.leads add constraint leads_source_check
  check (source in ('google_lsa','google_search','facebook','nextdoor',
                    'referral','pm_outreach','nyc_records','website','other'));

create unique index if not exists leads_tenant_external_ref_uidx
  on public.leads(tenant_id, external_ref) where external_ref is not null;

-- ------------------------------------------------------------- campaigns ----
create table if not exists public.campaigns (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null,
  audience   text not null default 'pm' check (audience in ('pm','landlord','any')),
  language   text not null default 'en' check (language in ('en','ru')),
  status     text not null default 'draft' check (status in ('draft','active','paused')),
  daily_cap  int  not null default 30 check (daily_cap between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists campaigns_tenant_idx on public.campaigns(tenant_id);

create table if not exists public.campaign_steps (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step_no     int  not null check (step_no >= 1),
  -- Days to wait after the previous step (step 1: after enrollment).
  delay_days  int  not null default 0 check (delay_days >= 0),
  subject     text not null,
  body        text not null,
  unique (campaign_id, step_no)
);
create index if not exists campaign_steps_campaign_idx on public.campaign_steps(campaign_id);

create table if not exists public.campaign_enrollments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  lead_id      uuid not null references public.leads(id) on delete cascade,
  -- The next step to send (1-based).
  next_step    int  not null default 1,
  next_send_on date not null default current_date,
  status       text not null default 'active'
                 check (status in ('active','replied','unsubscribed','completed','bounced','stopped')),
  last_sent_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (campaign_id, lead_id)
);
create index if not exists campaign_enrollments_due_idx
  on public.campaign_enrollments(tenant_id, status, next_send_on);

create table if not exists public.outreach_messages (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  campaign_id   uuid references public.campaigns(id) on delete set null,
  enrollment_id uuid references public.campaign_enrollments(id) on delete set null,
  lead_id       uuid references public.leads(id) on delete set null,
  step_no       int  not null,
  to_email      text not null,
  subject       text not null,
  provider_id   text,
  test_mode     boolean not null default false,
  sent_at       timestamptz not null default now()
);
create index if not exists outreach_messages_tenant_sent_idx
  on public.outreach_messages(tenant_id, sent_at desc);

-- Anyone who unsubscribed or bounced, by address, so a re-imported lead with
-- the same email can never be emailed again.
create table if not exists public.email_suppressions (
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  email      text not null,
  reason     text not null default 'unsubscribed',
  created_at timestamptz not null default now(),
  primary key (tenant_id, email)
);

-- ------------------------------------------------------------------ RLS -----
do $$
declare tbl text;
begin
  foreach tbl in array array['campaigns','campaign_steps','campaign_enrollments',
                             'outreach_messages','email_suppressions'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_all', tbl);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.is_tenant_member(tenant_id))
         with check (public.is_tenant_member(tenant_id))', tbl || '_all', tbl);
  end loop;
end $$;
