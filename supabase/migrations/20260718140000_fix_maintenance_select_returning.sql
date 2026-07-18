-- Fix: creating a maintenance request failed with "new row violates
-- row-level security policy".
--
-- The app inserts via PostgREST with a RETURNING clause
-- (`.insert().select()`), and Postgres re-checks the SELECT policy
-- against the returned row. That policy was just
-- `can_view_maintenance_request(id)` -- a STABLE, SECURITY DEFINER
-- function that self-queries `maintenance_requests`. Evaluated mid-INSERT,
-- the function's snapshot does not yet include the row being inserted, so
-- it returned false and the insert was rejected for every request
-- (apartment and common alike).
--
-- Add a direct `created_by = auth.uid()` disjunct, evaluated on the new
-- row's own columns (no self-query, no snapshot dependency), so the
-- creator can always read their row back. Semantically a no-op for normal
-- reads -- can_view_maintenance_request already treats the creator as a
-- viewer -- it only unblocks the RETURNING path.
drop policy maintenance_requests_select on public.maintenance_requests;
create policy maintenance_requests_select on public.maintenance_requests for select
  using (created_by = auth.uid() or public.can_view_maintenance_request(id));
