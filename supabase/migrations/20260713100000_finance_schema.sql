-- Finance module core schema: fee types (configurable entities that
-- reference an allocation method, per spec §2.2), versioned allocation
-- rules, invoices/invoice lines, opening balances, payments, and meter
-- readings (needed for the by_meter allocation method).
--
-- "per_resident" allocation needs a *declared* resident count per unit,
-- deliberately separate from the occupancies table -- occupancies model
-- the legal owner/renter relationship (who has the right to occupy),
-- not a billing headcount, and owner-occupied units have no occupancy
-- row at all. So we add a plain declared count on units instead.
alter table public.units
  add column resident_count integer check (resident_count is null or resident_count >= 0);

create table public.fee_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  association_id uuid not null references public.associations(id) on delete cascade,
  key text not null,
  label text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (association_id, key)
);

create index idx_fee_types_tenant on public.fee_types(tenant_id);
create index idx_fee_types_association on public.fee_types(association_id);

create trigger set_updated_at
  before update on public.fee_types
  for each row execute function public.set_updated_at();

-- Allocation rules are append-only/versioned: changing a fee type's
-- method or config inserts a new row (higher version, is_active=true)
-- and flips the previous row's is_active to false. The method/config
-- of a version, once created, is never mutated -- invoice_lines below
-- snapshot the exact allocation_rule_id used, so a bill can always be
-- explained later even after the association votes to change methods.
create table public.allocation_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  fee_type_id uuid not null references public.fee_types(id) on delete cascade,
  method text not null check (method in ('cota_parte', 'by_area', 'per_unit', 'per_resident', 'by_meter')),
  config jsonb not null default '{}'::jsonb,
  version integer not null,
  is_active boolean not null default true,
  effective_from date not null default current_date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (fee_type_id, version)
);

create index idx_allocation_rules_tenant on public.allocation_rules(tenant_id);
create index idx_allocation_rules_fee_type on public.allocation_rules(fee_type_id);
create index idx_allocation_rules_active on public.allocation_rules(fee_type_id) where is_active;

-- Meter readings, needed for the by_meter allocation method. A reading
-- is a point-in-time value for one of a unit's meters (see units.meters).
create table public.meter_readings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  meter_type text not null,
  meter_id text,
  reading_value numeric(12, 3) not null,
  reading_date date not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index idx_meter_readings_unit_type_date
  on public.meter_readings(unit_id, meter_type, reading_date desc);

-- One invoice per unit per billing period, with one line per fee type
-- charged. calculation_input snapshots exactly what went into the
-- amount (rule version, unit attributes, period total) so a disputed
-- bill can be reproduced and explained six months later.
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  billing_period_start date not null,
  billing_period_end date not null,
  status text not null default 'issued' check (status in ('issued', 'partially_paid', 'paid', 'cancelled')),
  total_amount numeric(12, 2) not null default 0,
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, billing_period_start, billing_period_end)
);

create index idx_invoices_tenant on public.invoices(tenant_id);
create index idx_invoices_unit on public.invoices(unit_id);

create trigger set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  fee_type_id uuid not null references public.fee_types(id) on delete restrict,
  allocation_rule_id uuid not null references public.allocation_rules(id) on delete restrict,
  amount numeric(12, 2) not null,
  calculation_input jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_invoice_lines_tenant on public.invoice_lines(tenant_id);
create index idx_invoice_lines_invoice on public.invoice_lines(invoice_id);

-- One row per unit: the starting debt (positive) or credit (negative)
-- carried over from a spreadsheet or a prior system, so payment history
-- stays continuous for associations migrating onto the platform.
create table public.opening_balances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  amount numeric(12, 2) not null,
  as_of_date date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id)
);

create index idx_opening_balances_tenant on public.opening_balances(tenant_id);

create trigger set_updated_at
  before update on public.opening_balances
  for each row execute function public.set_updated_at();

-- Manual or CSV-imported payments. matched_invoice_id is a manual
-- reconciliation choice (Phase 2 keeps this simple: one payment
-- matches at most one invoice, no split payments yet).
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  paid_at date not null,
  method text,
  reference text,
  matched_invoice_id uuid references public.invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index idx_payments_tenant on public.payments(tenant_id);
create index idx_payments_unit on public.payments(unit_id);
create index idx_payments_matched_invoice on public.payments(matched_invoice_id);

-- Helper mirroring unit_association_id(): resolves a fee_type's
-- association without every RLS policy having to re-join fee_types.
create function public.fee_type_association_id(p_fee_type_id uuid)
returns uuid
language sql stable
security definer set search_path = public
as $$
  select association_id from public.fee_types where id = p_fee_type_id;
$$;

revoke execute on function public.fee_type_association_id(uuid) from public;
grant execute on function public.fee_type_association_id(uuid) to authenticated;

create trigger audit_fee_types
  after insert or update or delete on public.fee_types
  for each row execute function public.fn_audit_entity_change();

create trigger audit_allocation_rules
  after insert or update or delete on public.allocation_rules
  for each row execute function public.fn_audit_entity_change();

create trigger audit_invoices
  after insert or update or delete on public.invoices
  for each row execute function public.fn_audit_entity_change();

create trigger audit_opening_balances
  after insert or update or delete on public.opening_balances
  for each row execute function public.fn_audit_entity_change();

create trigger audit_payments
  after insert or update or delete on public.payments
  for each row execute function public.fn_audit_entity_change();

create trigger audit_meter_readings
  after insert or update or delete on public.meter_readings
  for each row execute function public.fn_audit_entity_change();
