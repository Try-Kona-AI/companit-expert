-- Payment instructions for the public pay page (no card payments).
-- Returns the same Zelle / ACH / check details already printed on every
-- invoice email, for the workspace that issued this one invoice. Callers need
-- the invoice's unguessable id; there is no way to list workspaces.
create or replace function public.get_public_payment_info(p_invoice uuid)
returns table (
  zelle_contact text, bank_name text, bank_routing text, bank_account text,
  mailing_name text, mailing_address text, contact_phone text, other_instructions text
)
language sql
security definer
set search_path = public
as $$
  select s.zelle_contact, s.bank_name, s.bank_routing, s.bank_account,
         s.mailing_name, s.mailing_address, s.contact_phone, s.other_instructions
    from public.invoices i
    join public.tenant_settings s on s.tenant_id = i.tenant_id
   where i.id = p_invoice;
$$;
revoke all on function public.get_public_payment_info(uuid) from public;
grant execute on function public.get_public_payment_info(uuid) to anon, authenticated;
