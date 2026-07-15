-- Real invoices carry the occasional one-off correction on a single
-- line -- a "Recalcul" for one unit's one fee type, shown separately
-- from the calculated base amount, not merged into it. Applies
-- regardless of allocation method: a tariff_rate or cota_parte line
-- can equally carry one.
alter table public.invoice_lines
  add column adjustment_amount numeric(12, 2) not null default 0,
  add column adjustment_reason text;

-- A non-zero adjustment with no explanation is exactly the kind of
-- silent discrepancy this field exists to prevent.
alter table public.invoice_lines
  add constraint invoice_lines_adjustment_reason_required
  check (adjustment_amount = 0 or adjustment_reason is not null);

-- Same boundary as invoices_delete / invoice_lines_insert: once an
-- invoice is issued its lines are permanent record, corrections go on
-- a future invoice instead of mutating history.
create policy invoice_lines_update on public.invoice_lines for update
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_lines.invoice_id
        and i.status = 'draft'
        and public.has_capability(invoice_lines.tenant_id, 'finance.invoice.generate', public.unit_association_id(i.unit_id))
    )
  )
  with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_lines.invoice_id
        and i.status = 'draft'
        and public.has_capability(invoice_lines.tenant_id, 'finance.invoice.generate', public.unit_association_id(i.unit_id))
    )
  );

-- Keeps invoices.total_amount consistent with its lines the moment an
-- adjustment is applied, without relying on every write path to also
-- remember to patch the parent invoice by hand. SECURITY DEFINER with
-- no capability check is deliberate, same reasoning as
-- fn_sync_unit_resident_count: this only ever runs as a trigger on an
-- invoice_lines write that RLS on invoice_lines already authorized.
create function public.fn_sync_invoice_total_from_lines()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.invoices
  set total_amount = (
    select coalesce(sum(amount + adjustment_amount), 0)
    from public.invoice_lines
    where invoice_id = new.invoice_id
  )
  where id = new.invoice_id;
  return new;
end;
$$;

revoke execute on function public.fn_sync_invoice_total_from_lines() from public, anon, authenticated;

create trigger sync_invoice_total_from_lines
  after update of adjustment_amount on public.invoice_lines
  for each row execute function public.fn_sync_invoice_total_from_lines();
