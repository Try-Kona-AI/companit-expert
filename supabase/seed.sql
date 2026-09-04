-- Optional starter rows for Companit Expert. Run AFTER schema.sql and after the
-- first sign-in has provisioned a tenant. Uses the newest tenant.
do $$
declare
  t uuid;
  c1 uuid; c2 uuid; c3 uuid;
begin
  select id into t from public.tenants order by created_at desc limit 1;
  if t is null then
    raise notice 'No tenant yet. Sign in once, then re-run.';
    return;
  end if;

  insert into public.customers (tenant_id, name, contact_name, phone, email, address, status, language, last_service_date)
  values (t, 'Marcado Property Group', 'Lisa Marcado', '212-555-0100', 'lisa@example.com', '100 Church St, New York, NY 10007', 'active', 'en', current_date - 12)
  returning id into c1;

  insert into public.customers (tenant_id, name, contact_name, phone, email, address, status, language, last_service_date)
  values (t, 'Solntse Realty LLC', 'Игорь Ковалёв', '718-555-0142', 'igor@example.com', '2145 Ocean Ave, Brooklyn, NY 11229', 'active', 'ru', current_date - 6)
  returning id into c2;

  insert into public.customers (tenant_id, name, contact_name, phone, email, address, status, language, last_service_date)
  values (t, 'Vostok Contracting', 'Андрей Мельник', '347-555-0190', 'andrey@example.com', '3021 Brighton 6th St, Brooklyn, NY 11235', 'win_back', 'ru', current_date - 264)
  returning id into c3;

  insert into public.invoices (tenant_id, customer_id, number, description, amount, status, sent_date, due_date)
  values (t, c1, 'INV-1100', 'Lobby renovation, phase 2 finish work', 14800, 'overdue', current_date - 38, current_date - 24);

  insert into public.invoices (tenant_id, customer_id, number, description, amount, status, sent_date, due_date)
  values (t, c2, 'INV-1101', 'Ремонт кухни, квартира 4B', 6400, 'sent', current_date - 9, current_date + 5);

  insert into public.jobs (tenant_id, customer_id, title, description, status, amount)
  values (t, c2, 'Ремонт кухни, квартира 6C', 'Демонтаж, сантехника, плитка, установка шкафов', 'quote', 18400);

  insert into public.tenant_settings (tenant_id) values (t) on conflict (tenant_id) do nothing;
end $$;
