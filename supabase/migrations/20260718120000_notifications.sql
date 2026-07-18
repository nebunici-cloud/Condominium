-- In-app notification center.
--
-- One row per (recipient user, event). Rows are written only by the
-- SECURITY DEFINER triggers below -- never by clients -- so the fan-out
-- is authoritative regardless of which code path produced the event.
-- The row stores a stable `type` + structured `data` (jsonb) rather
-- than a rendered string, so each recipient sees it in their own
-- locale at display time. Recipients read and mark their own rows.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_user on public.notifications(user_id, created_at desc);
create index idx_notifications_user_unread on public.notifications(user_id) where read_at is null;

alter table public.notifications enable row level security;

-- A user sees and maintains only their own notifications. Inserts are
-- trigger-only (definer), so the write grant is revoked below.
create policy notifications_select on public.notifications for select
  using (user_id = auth.uid());

create policy notifications_update on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notifications_delete on public.notifications for delete
  using (user_id = auth.uid());

revoke insert on public.notifications from authenticated, anon;

-- === Fan-out: invoice published ====================================
-- A draft invoice becoming 'issued' (via publish_invoices) notifies the
-- unit's current owners and occupants who have a linked account.
create function public.fn_notify_invoice_published()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'issued' and old.status = 'draft' then
    insert into public.notifications (tenant_id, user_id, type, data, link)
    select new.tenant_id, recipients.uid, 'invoice_published',
      jsonb_build_object('invoice_number', new.invoice_number),
      '/my/invoices/' || new.id
    from (
      select o.user_id as uid
      from public.ownerships own
      join public.owners o on o.id = own.owner_id
      where own.unit_id = new.unit_id and own.effective_to is null and o.user_id is not null
      union
      select oc.user_id
      from public.occupancies occ
      join public.occupants oc on oc.id = occ.occupant_id
      where occ.unit_id = new.unit_id and occ.effective_to is null and oc.user_id is not null
    ) recipients;
  end if;
  return new;
end;
$$;

create trigger notify_invoice_published
  after update on public.invoices
  for each row execute function public.fn_notify_invoice_published();

-- === Fan-out: announcement posted ==================================
-- Every resident (linked owner/occupant of a unit in the association)
-- is notified, except the author.
create function public.fn_notify_announcement()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.notifications (tenant_id, user_id, type, data, link)
  select new.tenant_id, recipients.uid, 'announcement',
    jsonb_build_object('title', new.title),
    '/my'
  from (
    select o.user_id as uid
    from public.units u
    join public.buildings b on b.id = u.building_id
    join public.ownerships own on own.unit_id = u.id and own.effective_to is null
    join public.owners o on o.id = own.owner_id
    where b.association_id = new.association_id and o.user_id is not null
    union
    select oc.user_id
    from public.units u
    join public.buildings b on b.id = u.building_id
    join public.occupancies occ on occ.unit_id = u.id and occ.effective_to is null
    join public.occupants oc on oc.id = occ.occupant_id
    where b.association_id = new.association_id and oc.user_id is not null
  ) recipients
  where recipients.uid is distinct from new.created_by;
  return new;
end;
$$;

create trigger notify_announcement
  after insert on public.announcements
  for each row execute function public.fn_notify_announcement();

-- === Fan-out: maintenance status change ============================
-- When a request's status changes, the reporter and everyone who
-- pressed "affects me too" are notified -- except whoever made the
-- change (usually staff). Rides the trigger-written event log so it
-- can't miss a transition.
create function public.fn_notify_maintenance_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_created_by uuid;
begin
  if new.event_type <> 'status_changed' then
    return new;
  end if;

  select created_by into v_created_by
  from public.maintenance_requests where id = new.request_id;

  insert into public.notifications (tenant_id, user_id, type, data, link)
  select new.tenant_id, recipients.uid, 'maintenance_status',
    jsonb_build_object('to_status', new.to_status),
    '/my/requests'
  from (
    select v_created_by as uid where v_created_by is not null
    union
    select f.user_id
    from public.maintenance_request_followers f
    where f.request_id = new.request_id
  ) recipients
  where recipients.uid is distinct from new.actor_user_id;
  return new;
end;
$$;

create trigger notify_maintenance_event
  after insert on public.maintenance_request_events
  for each row execute function public.fn_notify_maintenance_event();
