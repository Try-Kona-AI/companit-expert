-- Companit Expert (Kona AI) — leads pipeline.
-- Additive: adds the leads table for the lead-generation feature. Idempotent.
-- Safe to run on the live project; touches nothing that already exists.

create table if not exists public.leads (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null,
  phone      text,
  email      text,
  address    text,
  service    text,
  source     text not null default 'other'
               check (source in ('google_lsa','google_search','facebook','nextdoor',
                                 'referral','pm_outreach','website','other')),
  status     text not null default 'new'
               check (status in ('new','contacted','quoted','won','lost')),
  est_value  numeric(12,2) not null default 0,
  notes      text,
  created_at timestamptz not null default now()
);

create index if not exists leads_tenant_idx        on public.leads(tenant_id);
create index if not exists leads_tenant_status_idx on public.leads(tenant_id, status);

-- Same workspace-scoped RLS as customers / jobs / invoices.
alter table public.leads enable row level security;

drop policy if exists leads_all on public.leads;
create policy leads_all on public.leads
  for all to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
