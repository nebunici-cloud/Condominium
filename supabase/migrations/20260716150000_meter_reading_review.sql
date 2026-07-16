-- Resident self-submitted meter readings land as real rows flagged
-- self_submitted=true, but there was nowhere for staff to review them
-- and no way for a resident to even see their unit's readings back.
-- This migration adds:
--   1. A review trail (reviewed_at/reviewed_by) so a self-submitted
--      reading can be acknowledged and drop off the pending list.
--   2. The own-unit SELECT leg the per-unit RLS work missed here, so
--      residents actually see their unit's reading history (the "last
--      reading" hint on My home depends on it).
--   3. UPDATE/DELETE policies (finance.meter_reading.record) so staff
--      can mark a reading reviewed or remove a bad self-submission.

alter table public.meter_readings
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users(id) on delete set null;

drop policy meter_readings_select on public.meter_readings;
create policy meter_readings_select on public.meter_readings for select
  using (
    public.has_capability(tenant_id, 'finance.meter_reading.view', public.unit_association_id(unit_id))
    or unit_id in (select public.user_unit_ids())
  );

create policy meter_readings_update on public.meter_readings for update
  using (public.has_capability(tenant_id, 'finance.meter_reading.record', public.unit_association_id(unit_id)))
  with check (public.has_capability(tenant_id, 'finance.meter_reading.record', public.unit_association_id(unit_id)));

create policy meter_readings_delete on public.meter_readings for delete
  using (public.has_capability(tenant_id, 'finance.meter_reading.record', public.unit_association_id(unit_id)));
