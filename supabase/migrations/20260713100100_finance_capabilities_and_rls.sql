-- Finance capability catalog additions.
insert into public.capabilities (code, module, description) values
  ('finance.fee_type.create', 'finance', 'Create fee types'),
  ('finance.fee_type.view', 'finance', 'View fee types'),
  ('finance.fee_type.update', 'finance', 'Update fee types'),
  ('finance.allocation_rule.manage', 'finance', 'Create new allocation rule versions'),
  ('finance.invoice.generate', 'finance', 'Generate invoices'),
  ('finance.invoice.view', 'finance', 'View invoices'),
  ('finance.payment.record', 'finance', 'Record payments'),
  ('finance.payment.view', 'finance', 'View payments'),
  ('finance.opening_balance.import', 'finance', 'Import opening balances'),
  ('finance.meter_reading.record', 'finance', 'Record meter readings'),
  ('finance.meter_reading.view', 'finance', 'View meter readings');

-- Update the role-seeding function so every *future* tenant's roles
-- get sensible finance grants too. administrator already receives
-- every capability via its wildcard select, so it needs no change.
-- Note: owner/tenant deliberately get no finance capabilities yet --
-- our RLS is tenant-wide-member-can-view, not scoped to "only your own
-- unit", so granting finance visibility to those roles today would
-- show every owner every other owner's invoices and payments. Proper
-- per-unit visibility is flagged as a fast-follow once real resident
-- logins are in use; until then this stays administrator/accountant/
-- board-oversight only.
create or replace function public.seed_default_roles(p_tenant_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_role_id uuid;
begin
  insert into public.roles (tenant_id, code, name, is_system_default)
  values (p_tenant_id, 'owner', 'Owner', true)
  returning id into v_role_id;
  insert into public.role_capabilities (role_id, capability_code, tenant_id)
  select v_role_id, code, p_tenant_id from public.capabilities
  where code in ('core.association.view', 'core.building.view', 'core.unit.view', 'core.ownership.view');

  insert into public.roles (tenant_id, code, name, is_system_default)
  values (p_tenant_id, 'occupant_tenant', 'Tenant', true)
  returning id into v_role_id;
  insert into public.role_capabilities (role_id, capability_code, tenant_id)
  select v_role_id, code, p_tenant_id from public.capabilities
  where code in ('core.association.view', 'core.building.view', 'core.unit.view');

  insert into public.roles (tenant_id, code, name, is_system_default)
  values (p_tenant_id, 'board_president', 'Board President', true)
  returning id into v_role_id;
  insert into public.role_capabilities (role_id, capability_code, tenant_id)
  select v_role_id, code, p_tenant_id from public.capabilities
  where code in (
    'core.association.view', 'core.building.view', 'core.unit.view',
    'core.owner.view', 'core.ownership.view', 'core.occupant.view', 'core.occupancy.view',
    'core.audit.view', 'core.config.manage', 'core.role.manage',
    'finance.invoice.view', 'finance.payment.view'
  );

  insert into public.roles (tenant_id, code, name, is_system_default)
  values (p_tenant_id, 'council_member', 'Council Member', true)
  returning id into v_role_id;
  insert into public.role_capabilities (role_id, capability_code, tenant_id)
  select v_role_id, code, p_tenant_id from public.capabilities
  where code in (
    'core.association.view', 'core.building.view', 'core.unit.view',
    'core.owner.view', 'core.ownership.view', 'core.occupant.view', 'core.occupancy.view',
    'core.audit.view', 'finance.invoice.view'
  );

  insert into public.roles (tenant_id, code, name, is_system_default)
  values (p_tenant_id, 'administrator', 'Administrator', true)
  returning id into v_role_id;
  insert into public.role_capabilities (role_id, capability_code, tenant_id)
  select v_role_id, code, p_tenant_id from public.capabilities;

  insert into public.roles (tenant_id, code, name, is_system_default)
  values (p_tenant_id, 'accountant', 'Accountant', true)
  returning id into v_role_id;
  insert into public.role_capabilities (role_id, capability_code, tenant_id)
  select v_role_id, code, p_tenant_id from public.capabilities
  where code in (
    'core.association.view', 'core.building.view', 'core.unit.view',
    'core.owner.view', 'core.ownership.view', 'core.occupant.view', 'core.occupancy.view',
    'core.audit.view',
    'finance.fee_type.view', 'finance.invoice.generate', 'finance.invoice.view',
    'finance.payment.record', 'finance.payment.view', 'finance.opening_balance.import',
    'finance.meter_reading.record', 'finance.meter_reading.view'
  );
end;
$$;

-- Backfill the same finance grants onto every tenant that already
-- exists (roles were seeded before these capabilities existed, so
-- they wouldn't otherwise pick them up).
insert into public.role_capabilities (role_id, capability_code, tenant_id)
select r.id, c.code, r.tenant_id
from public.roles r
join public.capabilities c on true
where r.code = 'administrator'
on conflict do nothing;

insert into public.role_capabilities (role_id, capability_code, tenant_id)
select r.id, c.code, r.tenant_id
from public.roles r
join public.capabilities c on c.code in (
  'finance.fee_type.view', 'finance.invoice.generate', 'finance.invoice.view',
  'finance.payment.record', 'finance.payment.view', 'finance.opening_balance.import',
  'finance.meter_reading.record', 'finance.meter_reading.view'
)
where r.code = 'accountant'
on conflict do nothing;

insert into public.role_capabilities (role_id, capability_code, tenant_id)
select r.id, c.code, r.tenant_id
from public.roles r
join public.capabilities c on c.code in ('finance.invoice.view', 'finance.payment.view')
where r.code = 'board_president'
on conflict do nothing;

insert into public.role_capabilities (role_id, capability_code, tenant_id)
select r.id, c.code, r.tenant_id
from public.roles r
join public.capabilities c on c.code = 'finance.invoice.view'
where r.code = 'council_member'
on conflict do nothing;

-- === RLS ===

alter table public.fee_types enable row level security;

create policy fee_types_select on public.fee_types for select
  using (public.is_tenant_member(tenant_id));

create policy fee_types_insert on public.fee_types for insert
  with check (public.has_capability(tenant_id, 'finance.fee_type.create', association_id));

create policy fee_types_update on public.fee_types for update
  using (public.has_capability(tenant_id, 'finance.fee_type.update', association_id))
  with check (public.has_capability(tenant_id, 'finance.fee_type.update', association_id));

alter table public.allocation_rules enable row level security;

create policy allocation_rules_select on public.allocation_rules for select
  using (public.is_tenant_member(tenant_id));

create policy allocation_rules_insert on public.allocation_rules for insert
  with check (public.has_capability(
    tenant_id, 'finance.allocation_rule.manage',
    public.fee_type_association_id(fee_type_id)
  ));

create policy allocation_rules_update on public.allocation_rules for update
  using (public.has_capability(
    tenant_id, 'finance.allocation_rule.manage',
    public.fee_type_association_id(fee_type_id)
  ))
  with check (public.has_capability(
    tenant_id, 'finance.allocation_rule.manage',
    public.fee_type_association_id(fee_type_id)
  ));

alter table public.meter_readings enable row level security;

create policy meter_readings_select on public.meter_readings for select
  using (public.is_tenant_member(tenant_id));

create policy meter_readings_insert on public.meter_readings for insert
  with check (public.has_capability(
    tenant_id, 'finance.meter_reading.record', public.unit_association_id(unit_id)
  ));

alter table public.invoices enable row level security;

create policy invoices_select on public.invoices for select
  using (
    public.is_tenant_member(tenant_id)
    and public.has_capability(tenant_id, 'finance.invoice.view', public.unit_association_id(unit_id))
  );

create policy invoices_insert on public.invoices for insert
  with check (public.has_capability(
    tenant_id, 'finance.invoice.generate', public.unit_association_id(unit_id)
  ));

create policy invoices_update on public.invoices for update
  using (public.has_capability(tenant_id, 'finance.payment.record', public.unit_association_id(unit_id)))
  with check (public.has_capability(tenant_id, 'finance.payment.record', public.unit_association_id(unit_id)));

alter table public.invoice_lines enable row level security;

create policy invoice_lines_select on public.invoice_lines for select
  using (
    public.is_tenant_member(tenant_id)
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_lines.invoice_id
        and public.has_capability(invoice_lines.tenant_id, 'finance.invoice.view', public.unit_association_id(i.unit_id))
    )
  );

create policy invoice_lines_insert on public.invoice_lines for insert
  with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_lines.invoice_id
        and public.has_capability(invoice_lines.tenant_id, 'finance.invoice.generate', public.unit_association_id(i.unit_id))
    )
  );

alter table public.opening_balances enable row level security;

create policy opening_balances_select on public.opening_balances for select
  using (
    public.is_tenant_member(tenant_id)
    and public.has_capability(tenant_id, 'finance.invoice.view', public.unit_association_id(unit_id))
  );

create policy opening_balances_insert on public.opening_balances for insert
  with check (public.has_capability(
    tenant_id, 'finance.opening_balance.import', public.unit_association_id(unit_id)
  ));

create policy opening_balances_update on public.opening_balances for update
  using (public.has_capability(tenant_id, 'finance.opening_balance.import', public.unit_association_id(unit_id)))
  with check (public.has_capability(tenant_id, 'finance.opening_balance.import', public.unit_association_id(unit_id)));

alter table public.payments enable row level security;

create policy payments_select on public.payments for select
  using (
    public.is_tenant_member(tenant_id)
    and public.has_capability(tenant_id, 'finance.payment.view', public.unit_association_id(unit_id))
  );

create policy payments_insert on public.payments for insert
  with check (public.has_capability(
    tenant_id, 'finance.payment.record', public.unit_association_id(unit_id)
  ));

create policy payments_update on public.payments for update
  using (public.has_capability(tenant_id, 'finance.payment.record', public.unit_association_id(unit_id)))
  with check (public.has_capability(tenant_id, 'finance.payment.record', public.unit_association_id(unit_id)));
