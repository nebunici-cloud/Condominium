-- Resident portal foundation: a signed-in owner/occupant can see the
-- finance data of *their own* units -- and only theirs -- without
-- holding any staff capability. Two pieces:
--
--   1. user_unit_ids(): the units the current user currently owns or
--      occupies, resolved through owners.user_id / occupants.user_id
--      (columns that existed from day one but were never wired up).
--   2. Finance SELECT policies gain an "or it's your own unit" leg
--      (drafts stay staff-only -- an unpublished invoice isn't real).
--
-- Plus the linking that makes (1) work at all: accepting an invite now
-- attaches the new auth user to any owner/occupant records carrying
-- the same email, and existing signed-up users are backfilled.

create index if not exists idx_owners_user on public.owners(user_id);
create index if not exists idx_occupants_user on public.occupants(user_id);

create function public.user_unit_ids()
returns setof uuid
language sql stable
security definer set search_path = public
as $$
  select o.unit_id
  from public.ownerships o
  join public.owners ow on ow.id = o.owner_id
  where ow.user_id = auth.uid()
    and o.effective_to is null
  union
  select oc.unit_id
  from public.occupancies oc
  join public.occupants op on op.id = oc.occupant_id
  where op.user_id = auth.uid()
    and oc.effective_to is null
$$;

revoke execute on function public.user_unit_ids() from public, anon;
grant execute on function public.user_unit_ids() to authenticated;

-- === Finance visibility: capability OR own unit ====================

-- Staff semantics preserved verbatim from the draft-invoices
-- migration (view capability, drafts only for generate/publish
-- holders); the own-unit leg is a new alternative, never widening
-- what staff roles could already see.
drop policy invoices_select on public.invoices;
create policy invoices_select on public.invoices for select
  using (
    public.is_tenant_member(tenant_id)
    and (
      (
        public.has_capability(tenant_id, 'finance.invoice.view', public.unit_association_id(unit_id))
        and (
          status <> 'draft'
          or public.has_capability(tenant_id, 'finance.invoice.generate', public.unit_association_id(unit_id))
          or public.has_capability(tenant_id, 'finance.invoice.publish', public.unit_association_id(unit_id))
        )
      )
      or (status <> 'draft' and unit_id in (select public.user_unit_ids()))
    )
  );

drop policy invoice_lines_select on public.invoice_lines;
create policy invoice_lines_select on public.invoice_lines for select
  using (
    public.is_tenant_member(tenant_id)
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_lines.invoice_id
        and (
          (
            public.has_capability(invoice_lines.tenant_id, 'finance.invoice.view', public.unit_association_id(i.unit_id))
            and (
              i.status <> 'draft'
              or public.has_capability(invoice_lines.tenant_id, 'finance.invoice.generate', public.unit_association_id(i.unit_id))
              or public.has_capability(invoice_lines.tenant_id, 'finance.invoice.publish', public.unit_association_id(i.unit_id))
            )
          )
          or (i.status <> 'draft' and i.unit_id in (select public.user_unit_ids()))
        )
    )
  );

drop policy payments_select on public.payments;
create policy payments_select on public.payments for select
  using (
    public.is_tenant_member(tenant_id)
    and (
      public.has_capability(tenant_id, 'finance.payment.view', public.unit_association_id(unit_id))
      or unit_id in (select public.user_unit_ids())
    )
  );

drop policy opening_balances_select on public.opening_balances;
create policy opening_balances_select on public.opening_balances for select
  using (
    public.is_tenant_member(tenant_id)
    and (
      public.has_capability(tenant_id, 'finance.invoice.view', public.unit_association_id(unit_id))
      or unit_id in (select public.user_unit_ids())
    )
  );

-- === Self-submitted meter readings ==================================

-- Residents may record readings for their own units. self_submitted
-- distinguishes these from staff entries so admins can review them.
alter table public.meter_readings
  add column self_submitted boolean not null default false;

create policy meter_readings_insert_self on public.meter_readings for insert
  with check (
    public.is_tenant_member(tenant_id)
    and unit_id in (select public.user_unit_ids())
  );

-- === Directory PII: staff capability, yourself, or a shared unit ====

drop policy owners_select on public.owners;
create policy owners_select on public.owners for select
  using (
    public.is_tenant_member(tenant_id)
    and (
      public.has_capability(tenant_id, 'core.owner.view')
      or user_id = auth.uid()
      or id in (
        select o.owner_id from public.ownerships o
        where o.unit_id in (select public.user_unit_ids())
      )
    )
  );

drop policy occupants_select on public.occupants;
create policy occupants_select on public.occupants for select
  using (
    public.is_tenant_member(tenant_id)
    and (
      public.has_capability(tenant_id, 'core.occupant.view')
      or user_id = auth.uid()
      or id in (
        select oc.occupant_id from public.occupancies oc
        where oc.unit_id in (select public.user_unit_ids())
      )
    )
  );

-- === Account linking ================================================

-- Accepting an invite now also claims any owner/occupant directory
-- records that carry the invited email, so per-unit visibility works
-- the moment the resident first signs in.
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

  update public.owners
    set user_id = auth.uid()
    where tenant_id = v_invite.tenant_id
      and user_id is null
      and email is not null
      and lower(email) = lower(v_email);

  update public.occupants
    set user_id = auth.uid()
    where tenant_id = v_invite.tenant_id
      and user_id is null
      and email is not null
      and lower(email) = lower(v_email);

  return v_invite.tenant_id;
end;
$$;

-- Backfill for users who signed up before this migration: link any
-- unclaimed owner/occupant records to the tenant member whose profile
-- email matches.
update public.owners ow
set user_id = p.id
from public.profiles p
join public.tenant_users tu on tu.user_id = p.id
where ow.user_id is null
  and ow.email is not null
  and p.email is not null
  and lower(ow.email) = lower(p.email)
  and tu.tenant_id = ow.tenant_id;

update public.occupants oc
set user_id = p.id
from public.profiles p
join public.tenant_users tu on tu.user_id = p.id
where oc.user_id is null
  and oc.email is not null
  and p.email is not null
  and lower(oc.email) = lower(p.email)
  and tu.tenant_id = oc.tenant_id;
