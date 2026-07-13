-- The previous migration granted core.tenant.manage to administrator
-- only implicitly, by relying on seed_default_roles() (which grants
-- every capability that exists AT THE MOMENT a tenant is created) --
-- that only helps tenants created after this capability existed.
-- Every tenant created earlier has an administrator role whose
-- role_capabilities were already populated and never revisited, so it
-- never picked up core.tenant.manage. Backfill it explicitly, the same
-- way the previous migration did for board_president.
insert into public.role_capabilities (role_id, capability_code, tenant_id)
select r.id, 'core.tenant.manage', r.tenant_id
from public.roles r
where r.code = 'administrator'
  and not exists (
    select 1 from public.role_capabilities rc
    where rc.role_id = r.id and rc.capability_code = 'core.tenant.manage'
  );
