-- A real invoice showed most recurring fees aren't "divide a shared
-- pot by weight" at all -- they're a standing rate multiplied by the
-- unit's own quantity ("2.20 lei/m2 x 61.50 m2 = 135.30"), with the
-- period's total being an output, never an admin-typed input. The
-- existing methods (cota_parte/by_area/per_unit/per_resident/by_meter)
-- all divide a total; tariff_rate multiplies instead, reusing the
-- exact same per-unit quantity lookups via config.unit_of_measure
-- (one of the five existing method names, reused as a sub-selector --
-- see calculateTariffAllocation in allocation-engine.ts).
--
-- approval_reference is generalized onto every allocation_rules row,
-- not just tariff ones -- any rate/method change plausibly wants a
-- "which AGA decision or board minute authorized this" reference for
-- the same legal-traceability reason (Law 187/2022), not only tariffs.
alter table public.allocation_rules
  drop constraint allocation_rules_method_check;
alter table public.allocation_rules
  add constraint allocation_rules_method_check
  check (method in ('cota_parte', 'by_area', 'per_unit', 'per_resident', 'by_meter', 'tariff_rate'));

alter table public.allocation_rules
  add column approval_reference text;

-- CREATE OR REPLACE can't extend this function's argument list -- a
-- different parameter type list is a different signature to Postgres,
-- which would leave the old 3-arg version callable *and* create a new
-- 4-arg overload that's world-executable by default (fresh functions
-- grant EXECUTE to PUBLIC unless revoked). Drop and recreate
-- explicitly instead, so there's exactly one signature with the same
-- revoke-then-grant-to-authenticated posture the original migration
-- set up.
drop function public.set_allocation_rule(uuid, text, jsonb);

create function public.set_allocation_rule(
  p_fee_type_id uuid,
  p_method text,
  p_config jsonb default '{}'::jsonb,
  p_approval_reference text default null
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

  insert into public.allocation_rules (
    tenant_id, fee_type_id, method, config, version, is_active, created_by, approval_reference
  )
  values (
    v_tenant_id, p_fee_type_id, p_method, p_config, v_new_version, true, auth.uid(), p_approval_reference
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke execute on function public.set_allocation_rule(uuid, text, jsonb, text) from public;
grant execute on function public.set_allocation_rule(uuid, text, jsonb, text) to authenticated;
