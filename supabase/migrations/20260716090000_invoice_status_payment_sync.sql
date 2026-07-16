-- Invoice paid/partially-paid status used to be recomputed by
-- application code after each payment insert/match -- which meant any
-- other write path (imports, future payment webhooks, manual SQL)
-- silently left statuses stale. Move the recompute into the database
-- so it holds no matter where a payment comes from.

create function public.sync_invoice_payment_status(p_invoice_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_paid numeric;
  v_status text;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id;
  -- Drafts aren't payable and cancelling supersedes payment-driven
  -- status: a payment touching either must never revive it.
  if not found or v_invoice.status in ('draft', 'cancelled') then
    return;
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where matched_invoice_id = p_invoice_id;

  v_status := case
    when v_paid <= 0 then 'issued'
    when v_paid < v_invoice.total_amount then 'partially_paid'
    else 'paid'
  end;

  update public.invoices set status = v_status
  where id = p_invoice_id and status <> v_status;
end;
$$;

revoke execute on function public.sync_invoice_payment_status(uuid) from public, anon;
grant execute on function public.sync_invoice_payment_status(uuid) to authenticated;

-- Fires on every payment change that could affect a matched invoice:
-- new matched payment, amount edit, re-match (sync BOTH invoices),
-- unmatch, delete.
create function public.fn_payments_sync_invoice_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.matched_invoice_id is not null then
    perform public.sync_invoice_payment_status(new.matched_invoice_id);
  end if;
  if tg_op = 'DELETE' and old.matched_invoice_id is not null then
    perform public.sync_invoice_payment_status(old.matched_invoice_id);
  end if;
  if tg_op = 'UPDATE'
     and old.matched_invoice_id is not null
     and old.matched_invoice_id is distinct from new.matched_invoice_id then
    perform public.sync_invoice_payment_status(old.matched_invoice_id);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger sync_invoice_status
  after insert or update or delete on public.payments
  for each row execute function public.fn_payments_sync_invoice_status();

-- Backfill: recompute every invoice that has (or ever had) a matched
-- payment, so pre-trigger data converges to the same rules.
select public.sync_invoice_payment_status(t.invoice_id)
from (
  select distinct matched_invoice_id as invoice_id
  from public.payments
  where matched_invoice_id is not null
) t;
