-- A published invoice needs a real, gapless-per-tenant number, an
-- issue date, and a due date -- none of which make sense for a draft
-- (it isn't a real invoice yet, hence nullable). Assigned atomically
-- at publish time, not at generation time.
alter table public.invoices
  add column invoice_number integer,
  add column issued_at timestamptz,
  add column due_date date;

create unique index invoices_tenant_invoice_number_unique
  on public.invoices (tenant_id, invoice_number)
  where invoice_number is not null;

-- One row per tenant, incremented atomically inside publish_invoices
-- below. RLS with no policies denies all direct client access on
-- purpose -- this table is only ever touched from inside that
-- SECURITY DEFINER function, never queried or written directly.
create table public.invoice_number_counters (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  next_number integer not null default 1
);

alter table public.invoice_number_counters enable row level security;

-- The owner shown on an invoice needs a fiscal identifier (IDNP/cod
-- fiscal), same as any real Moldovan utility invoice.
alter table public.owners add column personal_code text;

-- Replaces the plain RLS-governed status update publishing used to
-- do: invoice_number now requires an atomic per-tenant increment,
-- which needs SECURITY DEFINER to reach invoice_number_counters (no
-- policies grant it directly). Re-checks the exact same capability
-- invoices_update already required, since bypassing RLS means this
-- function is now the only thing standing between a caller and
-- publishing someone else's draft.
create function public.publish_invoices(p_invoice_ids uuid[])
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
        due_date = v_invoice.billing_period_end + 30
    where id = v_invoice.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Supabase's platform default privileges grant EXECUTE to anon and
-- authenticated separately from PUBLIC on function creation -- both
-- have to be revoked explicitly, "from public" alone leaves anon
-- still able to call this (see 20260714200000's anon-grant finding).
revoke execute on function public.publish_invoices(uuid[]) from public, anon;
grant execute on function public.publish_invoices(uuid[]) to authenticated;
