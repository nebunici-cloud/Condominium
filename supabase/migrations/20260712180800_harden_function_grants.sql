-- Fixes from the Supabase security advisor after the initial schema
-- push:
--
-- 1. set_updated_at had a mutable search_path (it's not SECURITY
--    DEFINER, so risk was low since it touches no tables, but pinning
--    it is free and removes the warning).
-- 2. seed_default_roles() and seed_default_expense_categories() are
--    SECURITY DEFINER, return void (not trigger), and had no EXECUTE
--    revoked -- meaning any authenticated user could call them directly
--    via /rest/v1/rpc/... with an arbitrary tenant_id/association_id
--    pair, bypassing RLS to seed roles or config rows into a
--    tenant/association they don't belong to. They're meant to run
--    only from the on_tenant_created / on_association_created triggers.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.seed_default_roles(uuid) from public, anon, authenticated;
revoke execute on function public.seed_default_expense_categories(uuid, uuid) from public, anon, authenticated;
