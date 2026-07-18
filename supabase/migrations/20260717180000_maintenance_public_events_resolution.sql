-- Maintenance requests, second wave:
--   * public vs private + common-area scope: an apartment request
--     (unit_id) stays private (reporter + staff); a common-area
--     request (building_id) is public to every resident of that
--     building, so the broken elevator is reported once and neighbours
--     mark "affects me too" instead of filing 50 duplicates.
--   * activity log: a per-request event timeline (created / preluat /
--     planificat / rezolvat / respins / redeschis), visible to whoever
--     can see the request.
--   * resolution photos: staff attach a photo of the fixed issue.

-- === Scope + visibility + resolution photos =========================

alter table public.maintenance_requests
  alter column unit_id drop not null,
  add column building_id uuid references public.buildings(id) on delete cascade,
  add column visibility text not null default 'private' check (visibility in ('private', 'public')),
  add column resolution_photo_paths text[] not null default '{}',
  add constraint maintenance_requests_scope_chk
    check ((unit_id is not null)::int + (building_id is not null)::int = 1);

create index idx_maintenance_requests_building on public.maintenance_requests(building_id);

-- Buildings the current user has a unit in -- the scope of what
-- common-area (public) requests they may see and file.
create function public.user_building_ids()
returns setof uuid
language sql stable
security definer set search_path = public
as $$
  select distinct u.building_id
  from public.units u
  where u.id in (select public.user_unit_ids())
$$;

revoke execute on function public.user_building_ids() from public, anon;
grant execute on function public.user_building_ids() to authenticated;

-- Association a request belongs to, whether it's an apartment request
-- (via its unit) or a common-area request (via its building).
create function public.maintenance_request_association_id(p_unit_id uuid, p_building_id uuid)
returns uuid
language sql stable
security definer set search_path = public
as $$
  select coalesce(
    case when p_unit_id is not null then public.unit_association_id(p_unit_id) end,
    case when p_building_id is not null then (select association_id from public.buildings where id = p_building_id) end
  )
$$;

revoke execute on function public.maintenance_request_association_id(uuid, uuid) from public, anon;
grant execute on function public.maintenance_request_association_id(uuid, uuid) to authenticated;

-- Single source of truth for "can this user see this request",
-- reused by the followers and events policies. SECURITY DEFINER, so
-- it reads maintenance_requests without recursing through its own RLS.
create function public.can_view_maintenance_request(p_request_id uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.maintenance_requests r
    where r.id = p_request_id
      and public.is_tenant_member(r.tenant_id)
      and (
        r.created_by = auth.uid()
        or public.has_capability(r.tenant_id, 'maintenance.request.manage', public.maintenance_request_association_id(r.unit_id, r.building_id))
        or (
          r.visibility = 'public'
          and (
            (r.building_id is not null and r.building_id in (select public.user_building_ids()))
            or (r.unit_id is not null and (select building_id from public.units where id = r.unit_id) in (select public.user_building_ids()))
          )
        )
      )
  )
$$;

revoke execute on function public.can_view_maintenance_request(uuid) from public, anon;
grant execute on function public.can_view_maintenance_request(uuid) to authenticated;

-- Rebuild the request policies around the new scope/visibility model.
drop policy maintenance_requests_select on public.maintenance_requests;
create policy maintenance_requests_select on public.maintenance_requests for select
  using (public.can_view_maintenance_request(id));

drop policy maintenance_requests_insert on public.maintenance_requests;
create policy maintenance_requests_insert on public.maintenance_requests for insert
  with check (
    public.is_tenant_member(tenant_id)
    and created_by = auth.uid()
    and (
      public.has_capability(tenant_id, 'maintenance.request.manage', public.maintenance_request_association_id(unit_id, building_id))
      or (unit_id is not null and unit_id in (select public.user_unit_ids()))
      or (building_id is not null and building_id in (select public.user_building_ids()))
    )
  );

drop policy maintenance_requests_update on public.maintenance_requests;
create policy maintenance_requests_update on public.maintenance_requests for update
  using (public.has_capability(tenant_id, 'maintenance.request.manage', public.maintenance_request_association_id(unit_id, building_id)))
  with check (public.has_capability(tenant_id, 'maintenance.request.manage', public.maintenance_request_association_id(unit_id, building_id)));

-- Photo-attach RPC now resolves the association through the helper so
-- it works for common-area requests (unit_id null) too.
create or replace function public.attach_request_photos(p_request_id uuid, p_paths text[])
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_request public.maintenance_requests%rowtype;
  v_path text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_request from public.maintenance_requests where id = p_request_id;
  if not found then
    raise exception 'Request not found';
  end if;

  if v_request.created_by is distinct from auth.uid()
     and not public.has_capability(v_request.tenant_id, 'maintenance.request.manage', public.maintenance_request_association_id(v_request.unit_id, v_request.building_id)) then
    raise exception 'Not allowed to attach photos to this request';
  end if;

  if array_length(p_paths, 1) is null or array_length(p_paths, 1) > 10 then
    raise exception 'Between 1 and 10 photos per call';
  end if;

  foreach v_path in array p_paths loop
    if position(p_request_id::text || '/' in v_path) <> 1 then
      raise exception 'Photo path outside the request folder';
    end if;
  end loop;

  update public.maintenance_requests
  set photo_paths = (
    select array_agg(distinct p) from unnest(photo_paths || p_paths) as p
  )
  where id = p_request_id;
end;
$$;

-- === Followers ("this affects me too") =============================

create table public.maintenance_request_followers (
  request_id uuid not null references public.maintenance_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

create index idx_maintenance_followers_request on public.maintenance_request_followers(request_id);

alter table public.maintenance_request_followers enable row level security;

create policy maintenance_followers_select on public.maintenance_request_followers for select
  using (public.is_tenant_member(tenant_id) and public.can_view_maintenance_request(request_id));

create policy maintenance_followers_insert on public.maintenance_request_followers for insert
  with check (
    user_id = auth.uid()
    and public.is_tenant_member(tenant_id)
    and public.can_view_maintenance_request(request_id)
  );

create policy maintenance_followers_delete on public.maintenance_request_followers for delete
  using (user_id = auth.uid());

-- === Activity log ==================================================

create table public.maintenance_request_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_id uuid not null references public.maintenance_requests(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default now()
);

create index idx_maintenance_events_request on public.maintenance_request_events(request_id, created_at);

alter table public.maintenance_request_events enable row level security;

create policy maintenance_events_select on public.maintenance_request_events for select
  using (public.is_tenant_member(tenant_id) and public.can_view_maintenance_request(request_id));

-- Events are written only by the trigger below (SECURITY DEFINER);
-- no direct write path for the authenticated role.
revoke insert, update, delete on public.maintenance_request_events from authenticated, anon;

create function public.fn_log_maintenance_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.maintenance_request_events (tenant_id, request_id, actor_user_id, event_type, to_status)
    values (new.tenant_id, new.id, new.created_by, 'created', new.status);
    return new;
  end if;

  -- UPDATE: log a status transition and/or a (re)planning.
  if new.status is distinct from old.status then
    insert into public.maintenance_request_events (tenant_id, request_id, actor_user_id, event_type, from_status, to_status, note)
    values (new.tenant_id, new.id, auth.uid(), 'status_changed', old.status, new.status,
            case when new.status in ('resolved', 'rejected') then new.resolution_note else null end);
  end if;
  if (new.priority is distinct from old.priority) or (new.due_date is distinct from old.due_date) then
    insert into public.maintenance_request_events (tenant_id, request_id, actor_user_id, event_type)
    values (new.tenant_id, new.id, auth.uid(), 'planned');
  end if;
  return new;
end;
$$;

create trigger log_maintenance_event
  after insert or update on public.maintenance_requests
  for each row execute function public.fn_log_maintenance_event();

-- Backfill a "created" event for requests that predate this log so
-- their timeline isn't empty.
insert into public.maintenance_request_events (tenant_id, request_id, actor_user_id, event_type, to_status, created_at)
select tenant_id, id, created_by, 'created', 'open', created_at
from public.maintenance_requests r
where not exists (
  select 1 from public.maintenance_request_events e where e.request_id = r.id
);

-- === Storage: refresh the maintenance-photos policies ==============
-- so they resolve the association via the new helper (common-area
-- requests have unit_id null). Guarded for local stacks without the
-- storage schema.
do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  drop policy if exists maintenance_photos_select on storage.objects;
  drop policy if exists maintenance_photos_insert on storage.objects;
  drop policy if exists maintenance_photos_delete on storage.objects;

  execute $pol$
    create policy maintenance_photos_select on storage.objects for select to authenticated
    using (
      bucket_id = 'maintenance-photos'
      and exists (
        select 1 from public.maintenance_requests r
        where r.id::text = (storage.foldername(name))[1]
          and (
            r.created_by = auth.uid()
            or public.has_capability(r.tenant_id, 'maintenance.request.manage', public.maintenance_request_association_id(r.unit_id, r.building_id))
            or (r.visibility = 'public' and public.can_view_maintenance_request(r.id))
          )
      )
    )
  $pol$;

  execute $pol$
    create policy maintenance_photos_insert on storage.objects for insert to authenticated
    with check (
      bucket_id = 'maintenance-photos'
      and exists (
        select 1 from public.maintenance_requests r
        where r.id::text = (storage.foldername(name))[1]
          and (
            r.created_by = auth.uid()
            or public.has_capability(r.tenant_id, 'maintenance.request.manage', public.maintenance_request_association_id(r.unit_id, r.building_id))
          )
      )
    )
  $pol$;

  execute $pol$
    create policy maintenance_photos_delete on storage.objects for delete to authenticated
    using (
      bucket_id = 'maintenance-photos'
      and (
        owner_id = auth.uid()::text
        or exists (
          select 1 from public.maintenance_requests r
          where r.id::text = (storage.foldername(name))[1]
            and public.has_capability(r.tenant_id, 'maintenance.request.manage', public.maintenance_request_association_id(r.unit_id, r.building_id))
        )
      )
    )
  $pol$;
end;
$$;
