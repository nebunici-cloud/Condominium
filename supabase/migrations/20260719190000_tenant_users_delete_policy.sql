-- Removing a member's access: delete their tenant_users row. Until now
-- there was no delete policy at all, so membership could only be
-- granted, never revoked. Gated on core.role.manage, and a caller can
-- never remove themselves (belt-and-suspenders with the app-level
-- guard, so a tenant can't lose its last role manager by accident).
create policy tenant_users_delete on public.tenant_users for delete
  using (public.has_capability(tenant_id, 'core.role.manage') and user_id <> auth.uid());
