-- Nothing stopped generating "June 1-30" and then "June 15-July 15"
-- for the same unit and double-charging the overlap -- the only
-- guard was a unique constraint on the exact (unit_id, start, end)
-- triple, which a different-but-overlapping range sails past. Replace
-- it with a real overlap guard (a GiST exclusion constraint over the
-- period as a daterange), which subsumes the exact-match case too.
-- Cancelled invoices are excluded from the check so a cancelled
-- invoice never blocks re-generating a real one for the same period.
create extension if not exists btree_gist;

alter table public.invoices
  drop constraint invoices_unit_id_billing_period_start_billing_period_end_key;

alter table public.invoices
  add constraint invoices_no_overlapping_periods
  exclude using gist (
    unit_id with =,
    daterange(billing_period_start, billing_period_end, '[]') with &&
  )
  where (status <> 'cancelled');
