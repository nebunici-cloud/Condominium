-- Self-service tenant bootstrap: called once, right after a brand new
-- user's first sign-in, from the app. Bypasses RLS (SECURITY DEFINER)
-- because a user with no tenant yet has no capability to grant
-- themselves one -- this is the one deliberate chicken-and-egg escape
-- hatch in the permission model.
create function public.bootstrap_tenant(p_tenant_name text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_admin_role_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.tenant_users where user_id = auth.uid()) then
    raise exception 'User already belongs to a tenant';
  end if;

  insert into public.tenants (name) values (p_tenant_name)
  returning id into v_tenant_id;
  -- on_tenant_created trigger has already seeded the six default roles here.

  insert into public.tenant_users (tenant_id, user_id) values (v_tenant_id, auth.uid());

  select id into v_admin_role_id
  from public.roles
  where tenant_id = v_tenant_id and code = 'administrator';

  insert into public.user_roles (tenant_id, user_id, role_id)
  values (v_tenant_id, auth.uid(), v_admin_role_id);

  return v_tenant_id;
end;
$$;

revoke execute on function public.bootstrap_tenant(text) from public;
grant execute on function public.bootstrap_tenant(text) to authenticated;
