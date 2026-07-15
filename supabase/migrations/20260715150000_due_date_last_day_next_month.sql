-- Due date was billing_period_end + 30 days -- a fixed offset that
-- landed on an arbitrary day. Now that invoice generation always
-- produces full calendar-month periods, "last day of the month after
-- the billing period" is both the real-world convention and a stable
-- date regardless of how long the billing month was. Only affects
-- invoices published from here on; already-issued invoices keep the
-- due_date they were actually published with.
create or replace function public.publish_invoices(p_invoice_ids uuid[])
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_invoice record;
  v_count integer := 0;
  v_next_number integer;
begin
  for v_invoice in
    select id, tenant_id, unit_id, billing_period_end
    from public.invoices
    where id = any(p_invoice_ids) and status = 'draft'
  loop
    if not (
      public.has_capability(v_invoice.tenant_id, 'finance.payment.record', public.unit_association_id(v_invoice.unit_id))
      or public.has_capability(v_invoice.tenant_id, 'finance.invoice.publish', public.unit_association_id(v_invoice.unit_id))
    ) then
      raise exception 'Not authorized';
    end if;

    insert into public.invoice_number_counters (tenant_id, next_number)
    values (v_invoice.tenant_id, 2)
    on conflict (tenant_id) do update set next_number = invoice_number_counters.next_number + 1
    returning next_number - 1 into v_next_number;

    update public.invoices
    set status = 'issued',
        invoice_number = v_next_number,
        issued_at = now(),
        due_date = (date_trunc('month', v_invoice.billing_period_end) + interval '2 months' - interval '1 day')::date
    where id = v_invoice.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.publish_invoices(uuid[]) from public, anon;
grant execute on function public.publish_invoices(uuid[]) to authenticated;
