-- resident_count (used to split per_resident fees) was a separate
-- plain field from occupancies (who actually lives in a unit) on
-- purpose -- an owner living in their own unit might have no
-- occupancy row at all, so the original design wanted a number set by
-- hand rather than one silently derived from records that might not
-- exist. In practice this just meant: add residents the obvious way
-- (occupancies), the billing count stays empty, per_resident
-- generation fails with no explanation.
--
-- resident_count_is_manual makes the two stay in sync by default
-- (recomputed from current occupancies every time one changes) while
-- still letting a manually-typed number win and stick -- the app only
-- sets this true when someone actually types a value into the field;
-- leaving it blank switches a unit back to auto.
alter table public.units
  add column resident_count_is_manual boolean not null default false;

-- Existing non-null values could be real manual entries or leftover
-- seed data -- there's no way to tell them apart, so the safer
-- assumption is to preserve them as-is (manual) rather than silently
-- overwrite a number that's already there.
update public.units set resident_count_is_manual = true where resident_count is not null;

-- Everything else (declared count was never set) gets backfilled from
-- current occupancies right now, instead of sitting broken until the
-- next occupancy change happens to trigger a resync.
update public.units u
set resident_count = (
  select count(*) from public.occupancies o
  where o.unit_id = u.id and o.effective_to is null
)
where resident_count_is_manual = false;

-- Keeps resident_count following current occupancies automatically
-- for every unit not in manual mode. SECURITY DEFINER with no
-- capability check is deliberate here: this only ever runs as a
-- trigger on occupancies writes that RLS on occupancies already
-- authorized, not as something a user calls directly with an
-- arbitrary unit id.
create function public.fn_sync_unit_resident_count()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_unit_id uuid;
begin
  v_unit_id := coalesce(new.unit_id, old.unit_id);

  update public.units
  set resident_count = (
    select count(*) from public.occupancies
    where unit_id = v_unit_id and effective_to is null
  )
  where id = v_unit_id and resident_count_is_manual = false;

  return coalesce(new, old);
end;
$$;

create trigger sync_unit_resident_count
  after insert or update or delete on public.occupancies
  for each row execute function public.fn_sync_unit_resident_count();

-- Callable directly from the app for "switch this unit back to auto
-- and refresh the number right now" (clearing the field in Edit
-- Apartment), rather than leaving it stale until the next occupancy
-- change. Unlike the trigger above, this IS reachable with an
-- arbitrary unit id from any authenticated user, so it re-checks the
-- same capability the direct unit-update RLS policy already requires.
create function public.recompute_unit_resident_count(p_unit_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.units where id = p_unit_id;

  if v_tenant_id is null
    or not public.has_capability(v_tenant_id, 'core.unit.update', public.unit_association_id(p_unit_id))
  then
    raise exception 'Not authorized';
  end if;

  update public.units
  set resident_count = (
    select count(*) from public.occupancies
    where unit_id = p_unit_id and effective_to is null
  )
  where id = p_unit_id and resident_count_is_manual = false;
end;
$$;

revoke execute on function public.recompute_unit_resident_count(uuid) from public;
grant execute on function public.recompute_unit_resident_count(uuid) to authenticated;
