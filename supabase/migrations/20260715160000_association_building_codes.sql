-- Cod Personal moves from a flat per-tenant sequential number to a
-- hierarchical one: {association code}-{building code}-{apartment
-- number}, e.g. "003-01-59" -- readable at a glance, and no separate
-- uniqueness mechanism needed for the unit level since the pieces are
-- already each unique within their own scope (unit_number within a
-- building, building code within an association, association code
-- within a tenant). Same idea extends to invoice numbers, which stay
-- a strict per-tenant sequence (unchanged) but display with the
-- issuing association's code as a prefix.
alter table public.associations add column code text;
alter table public.buildings add column code text;

create unique index associations_tenant_code_unique
  on public.associations (tenant_id, code)
  where code is not null;

create unique index buildings_association_code_unique
  on public.buildings (association_id, code)
  where code is not null;

create table public.association_code_counters (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  next_number integer not null default 1
);

create table public.building_code_counters (
  association_id uuid primary key references public.associations(id) on delete cascade,
  next_number integer not null default 1
);

alter table public.association_code_counters enable row level security;
alter table public.building_code_counters enable row level security;

create function public.generate_association_code(p_tenant_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_next integer;
begin
  if not public.is_tenant_member(p_tenant_id) then
    raise exception 'Not authorized';
  end if;

  insert into public.association_code_counters (tenant_id, next_number)
  values (p_tenant_id, 2)
  on conflict (tenant_id) do update set next_number = association_code_counters.next_number + 1
  returning next_number - 1 into v_next;

  return lpad(v_next::text, 3, '0');
end;
$$;

create function public.generate_building_code(p_association_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_next integer;
begin
  select tenant_id into v_tenant_id from public.associations where id = p_association_id;

  if v_tenant_id is null or not public.is_tenant_member(v_tenant_id) then
    raise exception 'Not authorized';
  end if;

  insert into public.building_code_counters (association_id, next_number)
  values (p_association_id, 2)
  on conflict (association_id) do update set next_number = building_code_counters.next_number + 1
  returning next_number - 1 into v_next;

  return lpad(v_next::text, 2, '0');
end;
$$;

revoke execute on function public.generate_association_code(uuid) from public, anon;
grant execute on function public.generate_association_code(uuid) to authenticated;
revoke execute on function public.generate_building_code(uuid) from public, anon;
grant execute on function public.generate_building_code(uuid) to authenticated;

-- Backfill existing associations and buildings (ordered by
-- created_at, same convention as every other backfill in this
-- schema) and seed their counters so future generation continues
-- from the right number.
with numbered as (
  select id, tenant_id, row_number() over (partition by tenant_id order by created_at) as rn
  from public.associations
)
update public.associations a
set code = lpad(n.rn::text, 3, '0')
from numbered n
where a.id = n.id;

insert into public.association_code_counters (tenant_id, next_number)
select tenant_id, count(*) + 1 from public.associations group by tenant_id
on conflict (tenant_id) do update set next_number = greatest(association_code_counters.next_number, excluded.next_number);

with numbered as (
  select id, association_id, row_number() over (partition by association_id order by created_at) as rn
  from public.buildings
)
update public.buildings b
set code = lpad(n.rn::text, 2, '0')
from numbered n
where b.id = n.id;

insert into public.building_code_counters (association_id, next_number)
select association_id, count(*) + 1 from public.buildings group by association_id
on conflict (association_id) do update set next_number = greatest(building_code_counters.next_number, excluded.next_number);

-- Recompose every existing unit's payment_account_code onto the new
-- hierarchical format, now that every association/building has a
-- code to build it from. Safe to overwrite: verified live that no
-- unit had a manually-set code before the flat-sequential generator
-- shipped, so nothing here is a real external reference yet.
update public.units u
set payment_account_code = a.code || '-' || b.code || '-' || u.unit_number
from public.buildings b
join public.associations a on a.id = b.association_id
where u.building_id = b.id;

-- The flat per-tenant unit counter is no longer needed -- uniqueness
-- for the new format comes from the hierarchy itself, not a counter.
drop function public.generate_unit_account_codes(uuid, integer);
drop function public.generate_unit_account_code(uuid);
drop table public.unit_account_code_counters;
