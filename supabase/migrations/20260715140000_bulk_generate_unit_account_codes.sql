-- The Excel bulk-import path creates many units in one insert --
-- generate_unit_account_code only hands out one code per call, which
-- would mean a round trip per row. This reserves a contiguous block
-- from the same per-tenant counter in a single atomic increment.
create function public.generate_unit_account_codes(p_tenant_id uuid, p_count integer)
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

  insert into public.unit_account_code_counters (tenant_id, next_number)
  values (p_tenant_id, p_count + 1)
  on conflict (tenant_id) do update set next_number = unit_account_code_counters.next_number + p_count
  returning next_number - p_count into v_start;

  for i in 0..p_count - 1 loop
    v_codes := array_append(v_codes, lpad((v_start + i)::text, 6, '0'));
  end loop;

  return v_codes;
end;
$$;

revoke execute on function public.generate_unit_account_codes(uuid, integer) from public, anon;
grant execute on function public.generate_unit_account_codes(uuid, integer) to authenticated;
