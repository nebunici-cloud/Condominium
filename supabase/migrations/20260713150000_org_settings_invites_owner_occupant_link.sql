-- === Organization settings (item: edit tenant name) ===
-- New capability so tenant-level settings can be gated like everything
-- else. administrator gets it automatically (seed_default_roles grants
-- every capability to that bundle); board_president gets it explicitly
-- since "manage the org record" is squarely in that role's remit.
insert into public.capabilities (code, module, description) values
  ('core.tenant.manage', 'core', 'Manage organization (tenant) settings');

insert into public.role_capabilities (role_id, capability_code, tenant_id)
select r.id, 'core.tenant.manage', r.tenant_id
from public.roles r
where r.code = 'board_president';

create policy tenants_update on public.tenants for update
  using (public.has_capability(id, 'core.tenant.manage'))
  with check (public.has_capability(id, 'core.tenant.manage'));

-- === Invite users to a role (item: assign roles to other people) ===
-- Reuses the core.user.invite capability seeded in Phase 1 but never
-- wired up to anything. An invite is just "this email, once it signs
-- in, should land in this tenant with this role" -- accept_pending_invite()
-- below is what turns that into real tenant_users/user_roles rows, at
-- first-sign-in time, since magic-link auth has no separate "accept"
-- step for the invitee to click through.
create table public.tenant_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null check (char_length(trim(email)) > 0),
  role_id uuid not null references public.roles(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create index idx_tenant_invites_tenant on public.tenant_invites(tenant_id);

-- Only one pending (unaccepted) invite per email per tenant -- inviting
-- the same address again should update the existing pending row, not
-- create a duplicate. The app always stores email lowercased, so a
-- plain column index (rather than an expression on lower(email)) is
-- enough for both the uniqueness guarantee and upsert's ON CONFLICT
-- target.
create unique index idx_tenant_invites_pending_email
  on public.tenant_invites (tenant_id, email)
  where accepted_at is null;

alter table public.tenant_invites enable row level security;

create policy tenant_invites_select on public.tenant_invites for select
  using (public.has_capability(tenant_id, 'core.user.invite'));

create policy tenant_invites_insert on public.tenant_invites for insert
  with check (public.has_capability(tenant_id, 'core.user.invite'));

create policy tenant_invites_delete on public.tenant_invites for delete
  using (public.has_capability(tenant_id, 'core.user.invite'));

-- Runs right after a brand new user's first sign-in, before the
-- "name your organization" onboarding screen would otherwise show.
-- Bypasses RLS (SECURITY DEFINER) for the same reason bootstrap_tenant
-- does: a user with no tenant yet has no capability to grant themselves
-- one.
create function public.accept_pending_invite()
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_email text;
  v_invite public.tenant_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.tenant_users where user_id = auth.uid()) then
    return null;
  end if;

  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then
    return null;
  end if;

  select * into v_invite
  from public.tenant_invites
  where lower(email) = lower(v_email) and accepted_at is null
  order by created_at asc
  limit 1;

  if not found then
    return null;
  end if;

  insert into public.tenant_users (tenant_id, user_id) values (v_invite.tenant_id, auth.uid());
  insert into public.user_roles (tenant_id, user_id, role_id)
  values (v_invite.tenant_id, auth.uid(), v_invite.role_id);
  update public.tenant_invites set accepted_at = now() where id = v_invite.id;

  return v_invite.tenant_id;
end;
$$;

revoke execute on function public.accept_pending_invite() from public;
grant execute on function public.accept_pending_invite() to authenticated;

-- === Owner-as-occupant quick fix (item: owner who also lives there) ===
-- Nullable link back to the owner this occupant record represents, so
-- "this owner also lives here" can reuse the same occupant row instead
-- of creating an untracked duplicate every time it's clicked, and the
-- UI can show a "(owner)" badge instead of a second unrelated name.
alter table public.occupants add column owner_id uuid references public.owners(id) on delete set null;

create index idx_occupants_owner on public.occupants(owner_id);
