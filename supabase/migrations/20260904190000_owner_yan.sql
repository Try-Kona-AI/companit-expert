-- The workspace owner is Yan, so a first sign-in should name him rather than
-- leaving the greeting blank. Replaces the provisioning function only.
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

-- If a workspace already exists without an owner name, set it.
update public.tenants set owner_name = 'Yan' where owner_name is null;
