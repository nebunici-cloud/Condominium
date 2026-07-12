-- Core entity graph: Association -> Building -> Unit -> Ownership/Occupancy.
-- Every table carries tenant_id, even though Phase 1 only ever has one tenant.

create table public.associations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  legal_id text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_associations_tenant on public.associations(tenant_id);

create trigger set_updated_at
  before update on public.associations
  for each row execute function public.set_updated_at();

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  association_id uuid not null references public.associations(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_buildings_tenant on public.buildings(tenant_id);
create index idx_buildings_association on public.buildings(association_id);

create trigger set_updated_at
  before update on public.buildings
  for each row execute function public.set_updated_at();

-- meters is a flexible field: e.g. [{"type": "cold_water", "meter_id": "CW-001"}]
-- so new meter types never require a schema migration.
create table public.units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  unit_number text not null check (char_length(trim(unit_number)) > 0),
  floor integer,
  area_sqm numeric(10, 2) check (area_sqm is null or area_sqm > 0),
  ownership_share_percent numeric(7, 4) check (ownership_share_percent is null or (ownership_share_percent > 0 and ownership_share_percent <= 100)),
  meters jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, unit_number)
);

create index idx_units_tenant on public.units(tenant_id);
create index idx_units_building on public.units(building_id);

create trigger set_updated_at
  before update on public.units
  for each row execute function public.set_updated_at();

-- Owners are a tenant-wide directory of people/entities who can own units.
-- user_id is nullable: most owners will not have a platform login at all.
create table public.owners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null check (char_length(trim(full_name)) > 0),
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_owners_tenant on public.owners(tenant_id);

create trigger set_updated_at
  before update on public.owners
  for each row execute function public.set_updated_at();

-- Ownership is effective-dated: ending an ownership never deletes or
-- overwrites a row, it sets effective_to on the old row. A new row is
-- inserted for any change (transfer, new co-owner, etc), so history is
-- always reconstructable.
create table public.ownerships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  owner_id uuid not null references public.owners(id) on delete cascade,
  share_percent numeric(6, 3) not null check (share_percent > 0 and share_percent <= 100),
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create index idx_ownerships_tenant on public.ownerships(tenant_id);
create index idx_ownerships_unit on public.ownerships(unit_id);
create index idx_ownerships_owner on public.ownerships(owner_id);
create index idx_ownerships_current on public.ownerships(unit_id) where effective_to is null;

-- Occupants (renters) are modeled separately from owners, on purpose:
-- someone can occupy a unit without owning it.
create table public.occupants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null check (char_length(trim(full_name)) > 0),
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_occupants_tenant on public.occupants(tenant_id);

create trigger set_updated_at
  before update on public.occupants
  for each row execute function public.set_updated_at();

create table public.occupancies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  occupant_id uuid not null references public.occupants(id) on delete cascade,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create index idx_occupancies_tenant on public.occupancies(tenant_id);
create index idx_occupancies_unit on public.occupancies(unit_id);
