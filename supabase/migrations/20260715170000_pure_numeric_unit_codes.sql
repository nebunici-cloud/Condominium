-- Reverts the hierarchical "assoc-building-apartment" Cod Personal
-- from the previous migration -- separators and zero-padded segments
-- both cause real problems downstream: a "-" breaks naive CSV/Excel
-- handling and doesn't survive round-tripping through systems that
-- expect a plain numeric reference, and a zero-padded string like
-- "003" silently stops being a real 3-digit number the moment
-- anything casts it to an actual integer (leading zero just vanishes,
-- "003" becomes 3). Also: the invoice document these codes appear on
-- is a "Cont/Notă spre plată", not a fiscal invoice, so there's no
-- legal requirement forcing any particular numbering scheme -- one
-- less constraint to design around.
--
-- Cod Personal is now a single flat per-tenant sequential number,
-- same idea as invoice_number, with no separators and no padding.
-- Starting the counter at 100000 keeps the "looks like a stable
-- 6-digit account code" property the very first version wanted,
-- without ever lying about its own digit count -- it's a real
-- 100000+ integer from the first one issued, not a padded string
-- pretending to be one.
create table public.unit_code_counters (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  next_number integer not null default 100000
);

alter table public.unit_code_counters enable row level security;

create function public.generate_unit_code(p_tenant_id uuid)
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

  insert into public.unit_code_counters (tenant_id, next_number)
  values (p_tenant_id, 100001)
  on conflict (tenant_id) do update set next_number = unit_code_counters.next_number + 1
  returning next_number - 1 into v_next;

  return v_next::text;
end;
$$;

create function public.generate_unit_codes(p_tenant_id uuid, p_count integer)
returns text[]
language plpgsql
security definer set search_path = public
as $$
declare
  v_start integer;
  v_codes text[] := '{}';
  i integer;
begin
  if not public.is_tenant_member(p_tenant_id) then
    raise exception 'Not authorized';
  end if;
  if p_count < 1 then
    return v_codes;
  end if;

  insert into public.unit_code_counters (tenant_id, next_number)
  values (p_tenant_id, 100000 + p_count)
  on conflict (tenant_id) do update set next_number = unit_code_counters.next_number + p_count
  returning next_number - p_count into v_start;

  for i in 0..p_count - 1 loop
    v_codes := array_append(v_codes, (v_start + i)::text);
  end loop;

  return v_codes;
end;
$$;

revoke execute on function public.generate_unit_code(uuid) from public, anon;
grant execute on function public.generate_unit_code(uuid) to authenticated;
revoke execute on function public.generate_unit_codes(uuid, integer) from public, anon;
grant execute on function public.generate_unit_codes(uuid, integer) to authenticated;

-- Recompose every unit's Cod Personal onto the new flat format. Old
-- values all contain "-" (e.g. "001-02-59"), so there's no risk of a
-- collision between a not-yet-migrated old code and a freshly
-- assigned new one while this runs.
with numbered as (
  select id, tenant_id, row_number() over (partition by tenant_id order by created_at) as rn
  from public.units
)
update public.units u
set payment_account_code = (99999 + n.rn)::text
from numbered n
where u.id = n.id;

insert into public.unit_code_counters (tenant_id, next_number)
select tenant_id, count(*) + 100000 from public.units group by tenant_id
on conflict (tenant_id) do update set next_number = greatest(unit_code_counters.next_number, excluded.next_number);

-- The hierarchical scheme's association/building codes are no longer
-- referenced by anything -- drop the whole apparatus rather than
-- leave an unused, still-fragile (zero-padded) code sitting around.
drop index public.associations_tenant_code_unique;
drop index public.buildings_association_code_unique;
alter table public.associations drop column code;
alter table public.buildings drop column code;
drop function public.generate_association_code(uuid);
drop function public.generate_building_code(uuid);
drop table public.association_code_counters;
drop table public.building_code_counters;
