-- A stable per-unit key for matching incoming bank transfers/CSV
-- statement rows to a unit, independent of unit_number (which can
-- change on renovation/renumbering) or invoice id (a new one every
-- period). Optional -- most associations won't need this until CSV
-- reconciliation is built, but the field has to exist before that work
-- can read from it.
alter table public.units add column payment_account_code text;

alter table public.units
  add constraint units_payment_account_code_not_blank
  check (payment_account_code is null or char_length(trim(payment_account_code)) > 0);

-- Scoped to tenant rather than globally unique -- two different
-- associations independently choosing the same code is not a
-- collision worth blocking.
create unique index units_payment_account_code_unique
  on public.units (tenant_id, payment_account_code)
  where payment_account_code is not null;
