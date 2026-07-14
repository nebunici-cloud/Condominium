-- Capability grants move from tenant-wide to per-association, but only
-- for capabilities whose underlying resource actually belongs to one
-- association -- buildings, units, ownerships, occupancies, config,
-- and everything under Finance already thread an association_id
-- through their RLS checks today (has_capability(..., association_id)),
-- so the grant itself can now vary by association too. Capabilities
-- tied to genuinely tenant-wide concerns (inviting users, managing
-- role definitions, the tenant record itself, the cross-association
-- owner/occupant directory, the whole-tenant audit log) stay exactly
-- as they were: one grant, applies everywhere.
alter table public.capabilities
  add column is_association_scoped boolean not null default false;

update public.capabilities set is_association_scoped = true
where code in (
  'core.association.view', 'core.association.update', 'core.association.delete',
  'core.building.create', 'core.building.view', 'core.building.update', 'core.building.delete',
  'core.unit.create', 'core.unit.view', 'core.unit.update', 'core.unit.delete',
  'core.ownership.create', 'core.ownership.view', 'core.ownership.update',
  'core.occupancy.create', 'core.occupancy.view', 'core.occupancy.update',
  'core.config.manage',
  'finance.fee_type.create', 'finance.fee_type.view', 'finance.fee_type.update',
  'finance.allocation_rule.manage',
  'finance.invoice.generate', 'finance.invoice.view',
  'finance.payment.record', 'finance.payment.view',
  'finance.opening_balance.import',
  'finance.meter_reading.record', 'finance.meter_reading.view'
);

-- role_capabilities gains an association_id: null means "applies to
-- every association" (only ever true for non-association-scoped
-- capabilities from here on), a specific id means "granted for just
-- this association." The old (role_id, capability_code) primary key
-- can't represent "one tenant-wide row and also N per-association
-- rows for the same role+capability", so it's replaced with a
-- surrogate id + a nulls-not-distinct unique constraint (Postgres 15+)
-- that still prevents duplicate grants at each scope.
alter table public.role_capabilities drop constraint role_capabilities_pkey;
alter table public.role_capabilities add column id uuid primary key default gen_random_uuid();
alter table public.role_capabilities
  add column association_id uuid references public.associations(id) on delete cascade;
alter table public.role_capabilities
  add constraint role_capabilities_role_capability_association_key
  unique nulls not distinct (role_id, capability_code, association_id);

create index idx_role_capabilities_association on public.role_capabilities(association_id);

-- Backfill: every association-scoped capability a role currently holds
-- (as a tenant-wide row) becomes one row per existing association,
-- copying that same grant -- so nothing anyone can already do today
-- changes as a result of this migration.
insert into public.role_capabilities (role_id, capability_code, tenant_id, association_id)
select rc.role_id, rc.capability_code, rc.tenant_id, a.id
from public.role_capabilities rc
join public.capabilities c on c.code = rc.capability_code
join public.associations a on a.tenant_id = rc.tenant_id
where rc.association_id is null
  and c.is_association_scoped
on conflict (role_id, capability_code, association_id) do nothing;

-- The now-superseded tenant-wide rows for association-scoped
-- capabilities are removed -- association-scoped capabilities only
-- ever exist as per-association rows from here on.
delete from public.role_capabilities rc
using public.capabilities c
where c.code = rc.capability_code
  and rc.association_id is null
  and c.is_association_scoped;

-- has_capability() now also checks the *grant's* association_id, not
-- just the user's role-assignment association_id: a tenant-wide grant
-- (rc.association_id is null) always matches, an association-scoped
-- grant only matches the exact association being checked.
create or replace function public.has_capability(p_tenant_id uuid, p_capability text, p_association_id uuid default null)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_capabilities rc on rc.role_id = ur.role_id
    where ur.tenant_id = p_tenant_id
      and ur.user_id = auth.uid()
      and rc.capability_code = p_capability
      and (ur.association_id is null or ur.association_id = p_association_id)
      and (rc.association_id is null or rc.association_id = p_association_id)
  );
$$;

-- seed_default_roles() is unchanged in what it inserts (kept exactly
-- as before, to avoid re-transcribing six role/capability lists and
-- risking a mismatch) -- it's simply followed by stripping out
-- association-scoped capabilities immediately after, since a
-- brand-new tenant has no associations yet to scope them to. Those
-- get seeded per-association instead, by the function below, called
-- from the association-creation trigger.
create or replace function public.handle_new_tenant()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.seed_default_roles(new.id);
  delete from public.role_capabilities rc
  using public.capabilities c
  where c.code = rc.capability_code
    and rc.tenant_id = new.id
    and rc.association_id is null
    and c.is_association_scoped;
  return new;
end;
$$;

-- Default association-scoped capability template per system role,
-- applied to one specific association. Mirrors the same six bundles
-- seed_default_roles() has always granted -- just the association-
-- scoped slice of each, now targeting a real association instead of
-- "everywhere."
create function public.seed_association_role_capabilities(p_tenant_id uuid, p_association_id uuid)
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
      'core.occupancy.view', 'core.config.manage', 'finance.invoice.view', 'finance.payment.view'
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
      'finance.meter_reading.record', 'finance.meter_reading.view'
    )
    on conflict (role_id, capability_code, association_id) do nothing;
  end if;
end;
$$;

revoke execute on function public.seed_association_role_capabilities(uuid, uuid) from public;
grant execute on function public.seed_association_role_capabilities(uuid, uuid) to authenticated;

create or replace function public.handle_new_association()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.seed_default_expense_categories(new.tenant_id, new.id);
  perform public.seed_association_role_capabilities(new.tenant_id, new.id);
  return new;
end;
$$;
