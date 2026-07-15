-- Every custom function in this schema turned out to be directly
-- callable by the anonymous (unauthenticated) API role. Supabase's
-- platform-level default privileges grant EXECUTE on newly created
-- functions to anon and authenticated separately, not just PUBLIC --
-- every migration in this codebase (including several from this
-- session) revoked execute only from `public`, which does not undo
-- that separate anon-specific grant. The one migration that got this
-- right (harden_function_grants.sql) explicitly listed `anon`; that
-- pattern was never carried forward consistently after it.
--
-- Actual exploitability varies by function:
--   - SECURITY INVOKER functions (commit_invoice_batch,
--     set_allocation_rule) are still gated by RLS underneath, so an
--     anon caller's writes fail there regardless of this grant.
--   - Several SECURITY DEFINER functions already guard themselves
--     with an explicit auth.uid() is null check (bootstrap_tenant,
--     accept_pending_invite) or a capability check
--     (recompute_unit_resident_count).
--   - Two had no internal check at all and were genuinely
--     exploitable: audit_record (anon could insert fabricated rows
--     into any tenant's audit log) and
--     seed_association_role_capabilities (any authenticated user --
--     not just anon -- could reset another tenant's role
--     capabilities back to defaults by calling it with that tenant's
--     IDs). Both are only ever meant to run from a trigger, which
--     executes as the trigger function's own SECURITY DEFINER
--     context and needs no grant to authenticated/anon at all --
--     same reasoning already applied to seed_default_roles and
--     seed_default_expense_categories, so these two are revoked from
--     authenticated entirely, not just anon.

revoke execute on function public.audit_record(uuid, text, text, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.seed_association_role_capabilities(uuid, uuid) from public, anon, authenticated;

revoke execute on function public.accept_pending_invite() from anon;
revoke execute on function public.bootstrap_tenant(text) from anon;
revoke execute on function public.commit_invoice_batch(uuid, date, date, jsonb, jsonb) from anon;
revoke execute on function public.fee_type_association_id(uuid) from anon;
revoke execute on function public.has_capability(uuid, text, uuid) from anon;
revoke execute on function public.is_tenant_member(uuid) from anon;
revoke execute on function public.recompute_unit_resident_count(uuid) from anon;
revoke execute on function public.set_allocation_rule(uuid, text, jsonb, text) from anon;
revoke execute on function public.unit_association_id(uuid) from anon;

-- Trigger functions have no legitimate direct caller -- Postgres
-- rejects calling a trigger-returning function outside trigger
-- context, and the trigger mechanism itself doesn't check EXECUTE
-- privilege against the DML-issuing role. Locked down fully for
-- defense in depth, matching everything else in this migration.
revoke execute on function public.fn_audit_entity_change() from public, anon, authenticated;
revoke execute on function public.fn_sync_unit_resident_count() from public, anon, authenticated;
revoke execute on function public.handle_new_association() from public, anon, authenticated;
revoke execute on function public.handle_new_tenant() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
