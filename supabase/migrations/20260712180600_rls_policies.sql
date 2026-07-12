-- Helper: does the current user belong to this tenant at all?
create function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.tenant_users
    where tenant_id = p_tenant_id and user_id = auth.uid()
  );
$$;

revoke execute on function public.is_tenant_member(uuid) from public;
grant execute on function public.is_tenant_member(uuid) to authenticated;

-- Helper: does the current user hold a role granting this capability,
-- either tenant-wide or for this specific association?
create function public.has_capability(p_tenant_id uuid, p_capability text, p_association_id uuid default null)
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
  );
$$;

revoke execute on function public.has_capability(uuid, text, uuid) from public;
grant execute on function public.has_capability(uuid, text, uuid) to authenticated;

-- Helper: association_id for a unit, via its building. Used by RLS
-- policies on units/ownerships/occupancies, which don't carry
-- association_id directly.
create function public.unit_association_id(p_unit_id uuid)
returns uuid
language sql stable
security definer set search_path = public
as $$
  select b.association_id
  from public.units u
  join public.buildings b on b.id = u.building_id
  where u.id = p_unit_id;
$$;

revoke execute on function public.unit_association_id(uuid) from public;
grant execute on function public.unit_association_id(uuid) to authenticated;

-- === tenants ===
alter table public.tenants enable row level security;

create policy tenants_select on public.tenants for select
  using (public.is_tenant_member(id));

-- No insert/update/delete policy for authenticated users: tenant
-- creation happens exclusively through the bootstrap_tenant() function.

-- === tenant_users ===
alter table public.tenant_users enable row level security;

create policy tenant_users_select on public.tenant_users for select
  using (public.is_tenant_member(tenant_id));

-- === profiles ===
alter table public.profiles enable row level security;

create policy profiles_select_self on public.profiles for select
  using (id = auth.uid());

create policy profiles_select_tenant_peers on public.profiles for select
  using (exists (
    select 1 from public.tenant_users tu1
    join public.tenant_users tu2 on tu1.tenant_id = tu2.tenant_id
    where tu1.user_id = auth.uid() and tu2.user_id = profiles.id
  ));

create policy profiles_update_self on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- === capabilities (global reference table) ===
alter table public.capabilities enable row level security;

create policy capabilities_select on public.capabilities for select
  using (auth.role() = 'authenticated');

-- === roles / role_capabilities / user_roles ===
alter table public.roles enable row level security;

create policy roles_select on public.roles for select
  using (public.is_tenant_member(tenant_id));

create policy roles_insert on public.roles for insert
  with check (public.has_capability(tenant_id, 'core.role.manage'));

create policy roles_update on public.roles for update
  using (public.has_capability(tenant_id, 'core.role.manage'))
  with check (public.has_capability(tenant_id, 'core.role.manage'));

alter table public.role_capabilities enable row level security;

create policy role_capabilities_select on public.role_capabilities for select
  using (public.is_tenant_member(tenant_id));

create policy role_capabilities_insert on public.role_capabilities for insert
  with check (public.has_capability(tenant_id, 'core.role.manage'));

create policy role_capabilities_delete on public.role_capabilities for delete
  using (public.has_capability(tenant_id, 'core.role.manage'));

alter table public.user_roles enable row level security;

create policy user_roles_select on public.user_roles for select
  using (public.is_tenant_member(tenant_id));

create policy user_roles_insert on public.user_roles for insert
  with check (public.has_capability(tenant_id, 'core.role.manage'));

create policy user_roles_delete on public.user_roles for delete
  using (public.has_capability(tenant_id, 'core.role.manage'));

-- === associations ===
alter table public.associations enable row level security;

create policy associations_select on public.associations for select
  using (public.is_tenant_member(tenant_id));

create policy associations_insert on public.associations for insert
  with check (public.has_capability(tenant_id, 'core.association.create'));

create policy associations_update on public.associations for update
  using (public.has_capability(tenant_id, 'core.association.update', id))
  with check (public.has_capability(tenant_id, 'core.association.update', id));

create policy associations_delete on public.associations for delete
  using (public.has_capability(tenant_id, 'core.association.delete', id));

-- === buildings ===
alter table public.buildings enable row level security;

create policy buildings_select on public.buildings for select
  using (public.is_tenant_member(tenant_id));

create policy buildings_insert on public.buildings for insert
  with check (public.has_capability(tenant_id, 'core.building.create', association_id));

create policy buildings_update on public.buildings for update
  using (public.has_capability(tenant_id, 'core.building.update', association_id))
  with check (public.has_capability(tenant_id, 'core.building.update', association_id));

create policy buildings_delete on public.buildings for delete
  using (public.has_capability(tenant_id, 'core.building.delete', association_id));

-- === units ===
alter table public.units enable row level security;

create policy units_select on public.units for select
  using (public.is_tenant_member(tenant_id));

create policy units_insert on public.units for insert
  with check (public.has_capability(
    tenant_id, 'core.unit.create',
    (select b.association_id from public.buildings b where b.id = building_id)
  ));

create policy units_update on public.units for update
  using (public.has_capability(
    tenant_id, 'core.unit.update',
    (select b.association_id from public.buildings b where b.id = building_id)
  ))
  with check (public.has_capability(
    tenant_id, 'core.unit.update',
    (select b.association_id from public.buildings b where b.id = building_id)
  ));

create policy units_delete on public.units for delete
  using (public.has_capability(
    tenant_id, 'core.unit.delete',
    (select b.association_id from public.buildings b where b.id = building_id)
  ));

-- === owners (tenant-wide directory, not association-scoped) ===
alter table public.owners enable row level security;

create policy owners_select on public.owners for select
  using (public.is_tenant_member(tenant_id));

create policy owners_insert on public.owners for insert
  with check (public.has_capability(tenant_id, 'core.owner.create'));

create policy owners_update on public.owners for update
  using (public.has_capability(tenant_id, 'core.owner.update'))
  with check (public.has_capability(tenant_id, 'core.owner.update'));

create policy owners_delete on public.owners for delete
  using (public.has_capability(tenant_id, 'core.owner.delete'));

-- === ownerships (no delete policy: history is ended via UPDATE, never removed) ===
alter table public.ownerships enable row level security;

create policy ownerships_select on public.ownerships for select
  using (public.is_tenant_member(tenant_id));

create policy ownerships_insert on public.ownerships for insert
  with check (public.has_capability(tenant_id, 'core.ownership.create', public.unit_association_id(unit_id)));

create policy ownerships_update on public.ownerships for update
  using (public.has_capability(tenant_id, 'core.ownership.update', public.unit_association_id(unit_id)))
  with check (public.has_capability(tenant_id, 'core.ownership.update', public.unit_association_id(unit_id)));

-- === occupants ===
alter table public.occupants enable row level security;

create policy occupants_select on public.occupants for select
  using (public.is_tenant_member(tenant_id));

create policy occupants_insert on public.occupants for insert
  with check (public.has_capability(tenant_id, 'core.occupant.create'));

create policy occupants_update on public.occupants for update
  using (public.has_capability(tenant_id, 'core.occupant.update'))
  with check (public.has_capability(tenant_id, 'core.occupant.update'));

create policy occupants_delete on public.occupants for delete
  using (public.has_capability(tenant_id, 'core.occupant.delete'));

-- === occupancies (no delete policy, same reasoning as ownerships) ===
alter table public.occupancies enable row level security;

create policy occupancies_select on public.occupancies for select
  using (public.is_tenant_member(tenant_id));

create policy occupancies_insert on public.occupancies for insert
  with check (public.has_capability(tenant_id, 'core.occupancy.create', public.unit_association_id(unit_id)));

create policy occupancies_update on public.occupancies for update
  using (public.has_capability(tenant_id, 'core.occupancy.update', public.unit_association_id(unit_id)))
  with check (public.has_capability(tenant_id, 'core.occupancy.update', public.unit_association_id(unit_id)));

-- === config_registry ===
alter table public.config_registry enable row level security;

create policy config_registry_select on public.config_registry for select
  using (public.is_tenant_member(tenant_id));

create policy config_registry_insert on public.config_registry for insert
  with check (public.has_capability(tenant_id, 'core.config.manage', association_id));

create policy config_registry_update on public.config_registry for update
  using (public.has_capability(tenant_id, 'core.config.manage', association_id))
  with check (public.has_capability(tenant_id, 'core.config.manage', association_id));

-- === audit_log ===
alter table public.audit_log enable row level security;

create policy audit_log_select on public.audit_log for select
  using (public.is_tenant_member(tenant_id) and public.has_capability(tenant_id, 'core.audit.view'));

-- No insert/update/delete policy for the authenticated role: all writes
-- happen through audit_record(), a SECURITY DEFINER function owned by
-- the migration role, which bypasses RLS as the table owner. Direct
-- table access is revoked below so the function is the only write path.
revoke insert, update, delete on public.audit_log from authenticated, anon;
