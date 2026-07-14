-- Two problems found while building the meter-reading UI:
--
-- 1. meter_readings_select only checked tenant membership, unlike every
--    other finance table -- the finance.meter_reading.view capability
--    was defined and granted to roles but never actually enforced.
--
-- 2. meter_type is matched with an exact, case-sensitive string
--    between a fee type's allocation_rules.config.meter_type (typed
--    free-text in finance-setup) and a unit's meters[].type (picked
--    from a dropdown sourced from that same free text). Nothing
--    normalized either side, so "cold_water" vs "Cold_water" silently
--    fail to match and a unit's readings never count toward that fee
--    type's allocation. Real data already shows this happened. Going
--    forward the app trims+lowercases both sides before writing; this
--    backfills the existing rows so historical data lines up too.
--    (Values with no relation at all, e.g. a meter tagged with a
--    display label instead of a type code, can't be auto-corrected --
--    those still need a manual re-tag.)

drop policy meter_readings_select on public.meter_readings;

create policy meter_readings_select on public.meter_readings for select
  using (public.has_capability(tenant_id, 'finance.meter_reading.view', public.unit_association_id(unit_id)));

update public.allocation_rules
set config = jsonb_set(config, '{meter_type}', to_jsonb(lower(trim(config->>'meter_type'))))
where method = 'by_meter'
  and config ? 'meter_type'
  and config->>'meter_type' <> lower(trim(config->>'meter_type'));

update public.units
set meters = (
  select coalesce(jsonb_agg(
    case
      when elem ? 'type' then jsonb_set(elem, '{type}', to_jsonb(lower(trim(elem->>'type'))))
      else elem
    end
  ), '[]'::jsonb)
  from jsonb_array_elements(meters) as elem
)
where exists (
  select 1 from jsonb_array_elements(meters) as elem
  where elem ? 'type' and elem->>'type' <> lower(trim(elem->>'type'))
);
