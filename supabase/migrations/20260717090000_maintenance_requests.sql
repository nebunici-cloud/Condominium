-- Maintenance requests: residents report issues for their own units
-- from the portal; staff triage them in the back office. First module
-- built natively on the admin/portal split.
--
-- v1 is text-only; photo attachments arrive with a dedicated Supabase
-- Storage design (bucket + per-tenant object policies) as a follow-up.

create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null check (char_length(trim(title)) > 0),
  description text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'rejected')),
  resolution_note text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_maintenance_requests_tenant_status on public.maintenance_requests(tenant_id, status);
create index idx_maintenance_requests_unit on public.maintenance_requests(unit_id);
create index idx_maintenance_requests_created_by on public.maintenance_requests(created_by);

create trigger set_updated_at
  before update on public.maintenance_requests
  for each row execute function public.set_updated_at();

create trigger audit_maintenance_requests
  after insert or update or delete on public.maintenance_requests
  for each row execute function public.fn_audit_entity_change();

insert into public.capabilities (code, module, description, is_association_scoped)
values ('maintenance.request.manage', 'maintenance', 'Triage and resolve maintenance requests', true);

-- Backfill: administrator and board president in every existing
-- association.
insert into public.role_capabilities (role_id, capability_code, tenant_id, association_id)
select r.id, 'maintenance.request.manage', r.tenant_id, a.id
from public.roles r
join public.associations a on a.tenant_id = r.tenant_id
where r.code in ('administrator', 'board_president')
on conflict (role_id, capability_code, association_id) do nothing;

-- Future associations: administrator picks the new capability up via
-- its wildcard insert; board president's explicit list needs it added.
-- (Function body otherwise identical to the previous version.)
create or replace function public.seed_association_role_capabilities(p_tenant_id uuid, p_association_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_role_id uuid;
begin
  select id into v_role_id from public.roles where tenant_id = p_tenant_id and code = 'owner';
  if v_role_id is not null then
    insert into public.role_capabilities (role_id, capability_code, tenant_id, association_id)
    select v_role_id, code, p_tenant_id, p_association_id from public.capabilities
    where is_association_scoped and code in (
      'core.association.view', 'core.building.view', 'core.unit.view', 'core.ownership.view'
    )
    on conflict (role_id, capability_code, association_id) do nothing;
  end if;

  select id into v_role_id from public.roles where tenant_id = p_tenant_id and code = 'occupant_tenant';
  if v_role_id is not null then
    insert into public.role_capabilities (role_id, capability_code, tenant_id, association_id)
    select v_role_id, code, p_tenant_id, p_association_id from public.capabilities
    where is_association_scoped and code in (
      'core.association.view', 'core.building.view', 'core.unit.view'
    )
    on conflict (role_id, capability_code, association_id) do nothing;
  end if;

  select id into v_role_id from public.roles where tenant_id = p_tenant_id and code = 'board_president';
  if v_role_id is not null then
    insert into public.role_capabilities (role_id, capability_code, tenant_id, association_id)
    select v_role_id, code, p_tenant_id, p_association_id from public.capabilities
    where is_association_scoped and code in (
      'core.association.view', 'core.building.view', 'core.unit.view', 'core.ownership.view',
      'core.occupancy.view', 'core.config.manage', 'finance.invoice.view', 'finance.payment.view',
      'comms.announcement.manage', 'maintenance.request.manage'
    )
    on conflict (role_id, capability_code, association_id) do nothing;
  end if;

  select id into v_role_id from public.roles where tenant_id = p_tenant_id and code = 'council_member';
  if v_role_id is not null then
    insert into public.role_capabilities (role_id, capability_code, tenant_id, association_id)
    select v_role_id, code, p_tenant_id, p_association_id from public.capabilities
    where is_association_scoped and code in (
      'core.association.view', 'core.building.view', 'core.unit.view', 'core.ownership.view',
      'core.occupancy.view', 'finance.invoice.view'
    )
    on conflict (role_id, capability_code, association_id) do nothing;
  end if;

  select id into v_role_id from public.roles where tenant_id = p_tenant_id and code = 'administrator';
  if v_role_id is not null then
    insert into public.role_capabilities (role_id, capability_code, tenant_id, association_id)
    select v_role_id, code, p_tenant_id, p_association_id from public.capabilities
    where is_association_scoped
    on conflict (role_id, capability_code, association_id) do nothing;
  end if;

  select id into v_role_id from public.roles where tenant_id = p_tenant_id and code = 'accountant';
  if v_role_id is not null then
    insert into public.role_capabilities (role_id, capability_code, tenant_id, association_id)
    select v_role_id, code, p_tenant_id, p_association_id from public.capabilities
    where is_association_scoped and code in (
      'core.association.view', 'core.building.view', 'core.unit.view', 'core.ownership.view',
      'core.occupancy.view', 'finance.fee_type.view', 'finance.invoice.generate', 'finance.invoice.view',
      'finance.payment.record', 'finance.payment.view', 'finance.opening_balance.import',
      'finance.meter_reading.record', 'finance.meter_reading.view', 'finance.invoice.cancel'
    )
    on conflict (role_id, capability_code, association_id) do nothing;
  end if;
end;
$$;

alter table public.maintenance_requests enable row level security;

-- Residents see their own submissions; staff with the manage
-- capability see everything in their association.
create policy maintenance_requests_select on public.maintenance_requests for select
  using (
    public.is_tenant_member(tenant_id)
    and (
      created_by = auth.uid()
      or public.has_capability(tenant_id, 'maintenance.request.manage', public.unit_association_id(unit_id))
    )
  );

-- Residents file requests for units they own/occupy; staff may also
-- file on a resident's behalf (a phoned-in complaint).
create policy maintenance_requests_insert on public.maintenance_requests for insert
  with check (
    public.is_tenant_member(tenant_id)
    and created_by = auth.uid()
    and (
      unit_id in (select public.user_unit_ids())
      or public.has_capability(tenant_id, 'maintenance.request.manage', public.unit_association_id(unit_id))
    )
  );

-- Triage (status, resolution note) is staff-only.
create policy maintenance_requests_update on public.maintenance_requests for update
  using (public.has_capability(tenant_id, 'maintenance.request.manage', public.unit_association_id(unit_id)))
  with check (public.has_capability(tenant_id, 'maintenance.request.manage', public.unit_association_id(unit_id)));

-- No delete policy: the trail stays; "rejected" is the terminal state
-- for requests that shouldn't have been filed.
