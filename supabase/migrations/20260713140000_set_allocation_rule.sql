-- Atomically retires the current active allocation rule for a fee type
-- (if any) and inserts the next version as the new active rule, in one
-- transaction, so a fee type is never left without an active rule
-- between the two writes. Deliberately SECURITY INVOKER (not DEFINER):
-- the point is to run as the calling user so the existing RLS policies
-- on allocation_rules (which require finance.allocation_rule.manage
-- for that fee type's association) are what actually authorizes this,
-- not a bypass.
create function public.set_allocation_rule(
  p_fee_type_id uuid,
  p_method text,
  p_config jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_tenant_id uuid;
  v_new_version integer;
  v_new_id uuid;
begin
  select tenant_id into v_tenant_id from public.fee_types where id = p_fee_type_id;

  update public.allocation_rules
  set is_active = false
  where fee_type_id = p_fee_type_id and is_active = true;

  select coalesce(max(version), 0) + 1 into v_new_version
  from public.allocation_rules where fee_type_id = p_fee_type_id;

  insert into public.allocation_rules (tenant_id, fee_type_id, method, config, version, is_active, created_by)
  values (v_tenant_id, p_fee_type_id, p_method, p_config, v_new_version, true, auth.uid())
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke execute on function public.set_allocation_rule(uuid, text, jsonb) from public;
grant execute on function public.set_allocation_rule(uuid, text, jsonb) to authenticated;
