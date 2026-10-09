-- Invite-only workspace (Kona AI / Companit Expert).
-- Before: any account that signed in joined the first workspace, so anyone who
-- self-registered could see customers, invoices and bank details.
-- After: you get in only if you own the workspace or were added as a member.
-- The very first sign-in on an empty project still creates the workspace.

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

  select t.id into v_tenant from public.tenants t
   where t.owner_user_id = auth.uid() limit 1;
  if v_tenant is not null then return v_tenant; end if;

  select m.tenant_id into v_tenant from public.tenant_members m
   where m.user_id = auth.uid() limit 1;
  if v_tenant is not null then return v_tenant; end if;

  if exists (select 1 from public.tenants) then
    raise exception 'This login has not been invited to a workspace.';
  end if;

  insert into public.tenants (name, owner_name, owner_user_id)
  values ('Companit Expert', 'Yan', auth.uid())
  returning id into v_tenant;
  insert into public.tenant_settings (tenant_id) values (v_tenant)
  on conflict (tenant_id) do nothing;
  insert into public.tenant_members (tenant_id, user_id, role)
  values (v_tenant, auth.uid(), 'owner') on conflict do nothing;
  return v_tenant;
end;
$$;
grant execute on function public.join_workspace() to authenticated;

-- Membership check for edge functions that act with the service key.
create or replace function public.is_member_of(p_tenant uuid, p_user uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.tenants t where t.id = p_tenant and t.owner_user_id = p_user)
      or exists (select 1 from public.tenant_members m where m.tenant_id = p_tenant and m.user_id = p_user);
$$;
revoke all on function public.is_member_of(uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_member_of(uuid, uuid) to service_role;

-- Admin helper (run via the SQL API): add an existing auth user to the workspace.
create or replace function public.add_workspace_member(p_email text, p_role text default 'member')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid; v_tenant uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then return 'no auth user with email ' || p_email; end if;
  select id into v_tenant from public.tenants order by created_at limit 1;
  if v_tenant is null then return 'no workspace exists yet'; end if;
  insert into public.tenant_members (tenant_id, user_id, role)
  values (v_tenant, v_user, p_role)
  on conflict (tenant_id, user_id) do update set role = excluded.role;
  if p_role = 'owner' then
    update public.tenants set owner_user_id = v_user where id = v_tenant and owner_user_id is null;
  end if;
  return 'added ' || p_email || ' as ' || p_role;
end;
$$;
revoke all on function public.add_workspace_member(text, text) from public, anon, authenticated;

-- Who is in the workspace right now (review before and after go-live).
create or replace view public.workspace_access as
  select t.name as workspace, u.email, 'owner'::text as role, u.created_at, u.last_sign_in_at
    from public.tenants t join auth.users u on u.id = t.owner_user_id
  union
  select t.name, u.email, m.role, u.created_at, u.last_sign_in_at
    from public.tenant_members m
    join public.tenants t on t.id = m.tenant_id
    join auth.users u on u.id = m.user_id;
revoke all on public.workspace_access from public, anon, authenticated;
