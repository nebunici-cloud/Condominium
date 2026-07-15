-- Invites used to stay redeemable forever: whoever controlled the
-- invited mailbox could sign in months later and silently pick up the
-- pre-assigned role. Give every invite a 14-day shelf life instead.
-- Existing pending invites get 14 days from this migration's run, via
-- the column default.
alter table public.tenant_invites
  add column expires_at timestamptz not null default (now() + interval '14 days');

-- Same body as before, plus the expiry check: an expired invite is
-- simply skipped, so the invitee falls through to the normal "name
-- your organization" onboarding instead of erroring.
create or replace function public.accept_pending_invite()
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
  where lower(email) = lower(v_email)
    and accepted_at is null
    and expires_at > now()
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
