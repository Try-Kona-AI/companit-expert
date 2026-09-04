-- Companit Expert (Kona AI) — full schema, RLS, and workspace provisioning.
-- Run in the Supabase SQL editor of the Kona AI project. Idempotent.

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------ tables --
create table if not exists public.tenants (
  id               uuid primary key default gen_random_uuid(),
  name             text not null default 'Companit Expert',
  owner_name       text,
  owner_user_id    uuid references auth.users(id) on delete set null,
  default_language text not null default 'en' check (default_language in ('en','ru')),
  created_at       timestamptz not null default now()
);

create table if not exists public.tenant_members (
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table if not exists public.customers (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  name              text not null,
  contact_name      text,
  phone             text,
  email             text,
  address           text,
  status            text not null default 'active'
                      check (status in ('active','due_for_service','win_back')),
  language          text not null default 'en' check (language in ('en','ru')),
  last_service_date date,
  notes             text,
  created_at        timestamptz not null default now()
);

create table if not exists public.jobs (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  customer_id    uuid not null references public.customers(id) on delete cascade,
  title          text not null,
  description    text,
  status         text not null default 'quote'
                   check (status in ('quote','scheduled','in_progress','done')),
  amount         numeric(12,2) not null default 0,
  scheduled_date date,
  created_at     timestamptz not null default now()
);

create table if not exists public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  customer_id        uuid not null references public.customers(id) on delete cascade,
  job_id             uuid references public.jobs(id) on delete set null,
  number             text not null,
  description        text,
  amount             numeric(12,2) not null default 0,
  status             text not null default 'draft'
                       check (status in ('draft','sent','overdue','paid')),
  sent_date          date not null default current_date,
  due_date           date,
  paid_date          date,
  last_reminder_date date,
  reminder_count     int not null default 0,
  auto_reminder      boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (tenant_id, number)
);

create table if not exists public.tenant_settings (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null unique references public.tenants(id) on delete cascade,
  zelle_contact      text,
  bank_name          text,
  bank_routing       text,
  bank_account       text,
  mailing_name       text,
  mailing_address    text,
  contact_phone      text,
  other_instructions text,
  updated_at         timestamptz not null default now()
);

create index if not exists customers_tenant_idx on public.customers(tenant_id);
create index if not exists jobs_tenant_idx      on public.jobs(tenant_id);
create index if not exists invoices_tenant_idx  on public.invoices(tenant_id);
create index if not exists invoices_status_idx  on public.invoices(tenant_id, status);

-- ------------------------------------------------- membership + provisioning --
-- Security definer so the policies below can call it without recursing on RLS.
create or replace function public.is_tenant_member(p_tenant uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenants t
     where t.id = p_tenant and t.owner_user_id = auth.uid()
  ) or exists (
    select 1 from public.tenant_members m
     where m.tenant_id = p_tenant and m.user_id = auth.uid()
  );
$$;

-- First sign-in creates the workspace; everyone after joins the existing one.
create or replace function public.join_workspace()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select t.id into v_tenant
    from public.tenants t
   where t.owner_user_id = auth.uid()
   limit 1;
  if v_tenant is not null then
    return v_tenant;
  end if;

  select m.tenant_id into v_tenant
    from public.tenant_members m
   where m.user_id = auth.uid()
   limit 1;
  if v_tenant is not null then
    return v_tenant;
  end if;

  select t.id into v_tenant from public.tenants t order by t.created_at limit 1;

  if v_tenant is null then
    insert into public.tenants (name, owner_name, owner_user_id)
    values ('Companit Expert', 'Yan', auth.uid())
    returning id into v_tenant;

    insert into public.tenant_settings (tenant_id) values (v_tenant)
    on conflict (tenant_id) do nothing;
  end if;

  insert into public.tenant_members (tenant_id, user_id, role)
  values (v_tenant, auth.uid(), 'member')
  on conflict do nothing;

  return v_tenant;
end;
$$;

grant execute on function public.join_workspace() to authenticated;

-- --------------------------------------------------------------------- RLS --
alter table public.tenants         enable row level security;
alter table public.tenant_members  enable row level security;
alter table public.customers       enable row level security;
alter table public.jobs            enable row level security;
alter table public.invoices        enable row level security;
alter table public.tenant_settings enable row level security;

drop policy if exists tenants_read   on public.tenants;
drop policy if exists tenants_write  on public.tenants;
create policy tenants_read on public.tenants
  for select to authenticated using (public.is_tenant_member(id));
create policy tenants_write on public.tenants
  for update to authenticated using (public.is_tenant_member(id))
  with check (public.is_tenant_member(id));

drop policy if exists members_read on public.tenant_members;
create policy members_read on public.tenant_members
  for select to authenticated using (user_id = auth.uid() or public.is_tenant_member(tenant_id));

-- customers / jobs / invoices / settings: full access scoped to the workspace
do $$
declare
  tbl text;
begin
  foreach tbl in array array['customers','jobs','invoices','tenant_settings'] loop
    execute format('drop policy if exists %I_all on public.%I', tbl, tbl);
    execute format(
      'create policy %I_all on public.%I for all to authenticated
         using (public.is_tenant_member(tenant_id))
         with check (public.is_tenant_member(tenant_id))', tbl, tbl);
  end loop;
end $$;

-- Public payment page: no anon table access. A security-definer function
-- returns exactly one invoice by id, so knowing the link is the only capability
-- and the customer book stays unreadable to anonymous callers.
drop policy if exists invoices_public_pay  on public.invoices;
drop policy if exists customers_public_pay on public.customers;

create or replace function public.get_public_invoice(p_id uuid)
returns table (
  id uuid, number text, description text, amount numeric,
  status text, tenant_id uuid, customer_name text, tenant_name text
)
language sql
security definer
set search_path = public
as $$
  select i.id, i.number, i.description, i.amount, i.status, i.tenant_id,
         c.name, t.name
    from public.invoices i
    join public.customers c on c.id = i.customer_id
    join public.tenants   t on t.id = i.tenant_id
   where i.id = p_id;
$$;

revoke all on function public.get_public_invoice(uuid) from public;
grant execute on function public.get_public_invoice(uuid) to anon, authenticated;

-- ------------------------------------------------------- overdue maintenance --
-- Flips sent invoices past their due date to overdue. Call from a cron job.
create or replace function public.mark_overdue_invoices()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.invoices
     set status = 'overdue'
   where status = 'sent'
     and due_date is not null
     and due_date < current_date;
  get diagnostics n = row_count;
  return n;
end;
$$;
