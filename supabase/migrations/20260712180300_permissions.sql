-- Capability catalog: the fixed list of fine-grained actions the platform
-- knows how to check. This is a platform-wide reference table (no
-- tenant_id) since a capability code like "core.unit.create" describes
-- something the software can do, not data that belongs to a tenant --
-- the same way an enum wouldn't carry a tenant_id either. Everything
-- built on top of it (roles, role_capabilities, user_roles) IS
-- tenant-scoped data.
create table public.capabilities (
  code text primary key,
  module text not null,
  description text not null
);

-- Roles are per-tenant, editable records (not an enum) -- "starter
-- bundles" today, clonable/customizable in a later phase.
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  is_system_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index idx_roles_tenant on public.roles(tenant_id);

create table public.role_capabilities (
  role_id uuid not null references public.roles(id) on delete cascade,
  capability_code text not null references public.capabilities(code) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  primary key (role_id, capability_code)
);

create index idx_role_capabilities_tenant on public.role_capabilities(tenant_id);

-- Assigning a role to a user. association_id is nullable: null means the
-- grant applies tenant-wide (all associations under this tenant); a
-- specific association_id scopes it to just that association -- useful
-- once one tenant manages several associations (e.g. a management company).
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  association_id uuid references public.associations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, role_id, association_id)
);

create index idx_user_roles_tenant on public.user_roles(tenant_id);
create index idx_user_roles_user on public.user_roles(user_id);

-- Seed the platform-wide capability catalog. Phase 1 only has core
-- entity-graph capabilities plus a handful of cross-cutting ones
-- (audit, config, roles) -- Finance/Voting/Maintenance/Documents
-- capabilities get added here as those modules are built, with zero
-- changes to the roles/role_capabilities mechanism itself.
insert into public.capabilities (code, module, description) values
  ('core.association.create', 'core', 'Create associations'),
  ('core.association.view', 'core', 'View associations'),
  ('core.association.update', 'core', 'Update associations'),
  ('core.association.delete', 'core', 'Delete associations'),
  ('core.building.create', 'core', 'Create buildings'),
  ('core.building.view', 'core', 'View buildings'),
  ('core.building.update', 'core', 'Update buildings'),
  ('core.building.delete', 'core', 'Delete buildings'),
  ('core.unit.create', 'core', 'Create units'),
  ('core.unit.view', 'core', 'View units'),
  ('core.unit.update', 'core', 'Update units'),
  ('core.unit.delete', 'core', 'Delete units'),
  ('core.owner.create', 'core', 'Create owners'),
  ('core.owner.view', 'core', 'View owners'),
  ('core.owner.update', 'core', 'Update owners'),
  ('core.owner.delete', 'core', 'Delete owners'),
  ('core.ownership.create', 'core', 'Create ownership records'),
  ('core.ownership.view', 'core', 'View ownership records'),
  ('core.ownership.update', 'core', 'Update or end ownership records'),
  ('core.occupant.create', 'core', 'Create occupants'),
  ('core.occupant.view', 'core', 'View occupants'),
  ('core.occupant.update', 'core', 'Update occupants'),
  ('core.occupancy.create', 'core', 'Create occupancy records'),
  ('core.occupancy.view', 'core', 'View occupancy records'),
  ('core.occupancy.update', 'core', 'Update or end occupancy records'),
  ('core.audit.view', 'core', 'View the audit log'),
  ('core.config.manage', 'core', 'Manage configuration registry entries'),
  ('core.role.manage', 'core', 'Assign roles and capabilities to users'),
  ('core.user.invite', 'core', 'Invite users to the tenant');

-- Seed the six default role bundles for a given tenant, as data.
-- Called automatically whenever a new tenant is created (see trigger
-- below). Capability sets for Finance/Voting/etc. roles will simply
-- get more inserts here once those modules exist -- no code changes
-- to the permission mechanism itself.
create function public.seed_default_roles(p_tenant_id uuid)
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
    'core.audit.view', 'core.config.manage', 'core.role.manage'
  );

  insert into public.roles (tenant_id, code, name, is_system_default)
  values (p_tenant_id, 'council_member', 'Council Member', true)
  returning id into v_role_id;
  insert into public.role_capabilities (role_id, capability_code, tenant_id)
  select v_role_id, code, p_tenant_id from public.capabilities
  where code in (
    'core.association.view', 'core.building.view', 'core.unit.view',
    'core.owner.view', 'core.ownership.view', 'core.occupant.view', 'core.occupancy.view',
    'core.audit.view'
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
    'core.audit.view'
  );
end;
$$;

create function public.handle_new_tenant()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.seed_default_roles(new.id);
  return new;
end;
$$;

create trigger on_tenant_created
  after insert on public.tenants
  for each row execute function public.handle_new_tenant();
