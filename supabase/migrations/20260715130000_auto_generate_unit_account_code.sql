-- payment_account_code was optional/manual (see
-- 20260715110000) -- in practice every apartment needs one from the
-- moment it exists, to track invoices/debts against it consistently
-- (this is the "Cod Personal" printed on the invoice, distinct from
-- an owner's own IDNP). Same atomic-counter pattern as invoice
-- numbering: a plain client-side generated value can't guarantee
-- uniqueness under concurrent unit creation.
create table public.unit_account_code_counters (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  next_number integer not null default 1
);

alter table public.unit_account_code_counters enable row level security;

create function public.generate_unit_account_code(p_tenant_id uuid)
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

  insert into public.unit_account_code_counters (tenant_id, next_number)
  values (p_tenant_id, 2)
  on conflict (tenant_id) do update set next_number = unit_account_code_counters.next_number + 1
  returning next_number - 1 into v_next;

  return lpad(v_next::text, 6, '0');
end;
$$;

revoke execute on function public.generate_unit_account_code(uuid) from public, anon;
grant execute on function public.generate_unit_account_code(uuid) to authenticated;

-- Backfill every unit that predates this feature (verified live: no
-- unit currently has a manually-set code, so a fresh per-tenant
-- sequential assignment can't collide with anything).
with numbered as (
  select id, tenant_id, row_number() over (partition by tenant_id order by created_at) as rn
  from public.units
  where payment_account_code is null
)
update public.units u
set payment_account_code = lpad(n.rn::text, 6, '0')
from numbered n
where u.id = n.id;

insert into public.unit_account_code_counters (tenant_id, next_number)
select tenant_id, count(*) + 1
from public.units
group by tenant_id
on conflict (tenant_id) do update set next_number = greatest(unit_account_code_counters.next_number, excluded.next_number);
