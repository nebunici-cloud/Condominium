-- Two integrity gaps found during a review of the permission model:
--
-- 1. tenant_invites let anyone with core.user.invite for their own
--    tenant assign a role_id belonging to a DIFFERENT tenant -- the
--    insert policy only checked the invite row's own tenant_id, never
--    that role_id actually belongs to it. accept_pending_invite() would
--    then create a user_roles row whose tenant_id and role_id disagree,
--    letting that user pick up whatever capabilities the foreign role
--    grants. Role ids are unguessable UUIDs, but nothing should rely on
--    that as the only defense in a multi-tenant system.
--
-- 2. Nothing below application code stopped a user from ending up in
--    two tenants at once: bootstrap_tenant() and accept_pending_invite()
--    both do a "not exists" check immediately before inserting into
--    tenant_users, which is a check-then-insert race -- two concurrent
--    calls (e.g. two browser tabs finishing sign-in at once) can both
--    pass the check before either insert lands. Every other part of the
--    app (getCurrentCapabilities, createAssociation, createOwner, ...)
--    assumes "the" tenant for a user is well-defined, so this needs to
--    be a real constraint, not just an application-level check.

-- Fix 2: one row per user, enforced by the database. Replaces the
-- existing plain index -- a unique index serves the same lookup
-- purpose, so nothing is lost.
drop index if exists public.idx_tenant_users_user;
alter table public.tenant_users add constraint tenant_users_user_id_key unique (user_id);

-- Fix 1: the assigned role must belong to the same tenant as the invite.
drop policy tenant_invites_insert on public.tenant_invites;

create policy tenant_invites_insert on public.tenant_invites for insert
  with check (
    public.has_capability(tenant_id, 'core.user.invite')
    and exists (
      select 1 from public.roles r
      where r.id = role_id and r.tenant_id = tenant_invites.tenant_id
    )
  );
