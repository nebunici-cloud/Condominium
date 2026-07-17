-- Supabase Storage foundation + two features built on it:
--
--   1. Maintenance request photos: residents attach photos to their
--      own requests. Paths are {request_id}/{file}; storage policies
--      mirror the request's own RLS (creator or staff triage
--      capability). A photo_paths column + SECURITY DEFINER RPC lets
--      the creator register uploads without holding the staff-only
--      UPDATE right on the request row.
--
--   2. Documents library: per-association files with metadata in
--      public.documents. Visibility is 'members' (every tenant
--      member, i.e. residents too) or 'staff' (manage capability
--      only). Storage SELECT is driven by the metadata row, so a
--      file is downloadable exactly when its document is visible.
--
-- Both buckets are PRIVATE: every download is a short-lived signed
-- URL minted under the caller's own RLS-checked session.

-- === Documents metadata =============================================

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  association_id uuid not null references public.associations(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint,
  visibility text not null default 'members' check (visibility in ('members', 'staff')),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_documents_tenant on public.documents(tenant_id);
create index idx_documents_association on public.documents(association_id, created_at desc);

create trigger audit_documents
  after insert or update or delete on public.documents
  for each row execute function public.fn_audit_entity_change();

insert into public.capabilities (code, module, description, is_association_scoped)
values ('docs.document.manage', 'docs', 'Upload and manage association documents', true);

insert into public.role_capabilities (role_id, capability_code, tenant_id, association_id)
select r.id, 'docs.document.manage', r.tenant_id, a.id
from public.roles r
join public.associations a on a.tenant_id = r.tenant_id
where r.code in ('administrator', 'board_president')
on conflict (role_id, capability_code, association_id) do nothing;

-- Future associations: administrator picks the capability up via its
-- wildcard; board president's explicit list needs the addition.
-- (Function body otherwise identical to the previous version.)
create or replace function public.seed_association_role_capabilities(p_tenant_id uuid, p_association_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_role_id uuid;
begin
  select id into v_role_id from public.roles where tenant_id = p_tenant_id and code = 'owner';
  if v_role_id is not null then
    insert into public.role_capabilities (role_id, capability_code, tenant_id, association_id)
    select v_role_id, code, p_tenant_id, p_association_id from public.capabilities
    where is_association_scoped and code in (
      'core.association.view', 'core.building.view', 'core.unit.view', 'core.ownership.view'
    )
    on conflict (role_id, capability_code, association_id) do nothing;
  end if;

  select id into v_role_id from public.roles where tenant_id = p_tenant_id and code = 'occupant_tenant';
  if v_role_id is not null then
    insert into public.role_capabilities (role_id, capability_code, tenant_id, association_id)
    select v_role_id, code, p_tenant_id, p_association_id from public.capabilities
    where is_association_scoped and code in (
      'core.association.view', 'core.building.view', 'core.unit.view'
    )
    on conflict (role_id, capability_code, association_id) do nothing;
  end if;

  select id into v_role_id from public.roles where tenant_id = p_tenant_id and code = 'board_president';
  if v_role_id is not null then
    insert into public.role_capabilities (role_id, capability_code, tenant_id, association_id)
    select v_role_id, code, p_tenant_id, p_association_id from public.capabilities
    where is_association_scoped and code in (
      'core.association.view', 'core.building.view', 'core.unit.view', 'core.ownership.view',
      'core.occupancy.view', 'core.config.manage', 'finance.invoice.view', 'finance.payment.view',
      'comms.announcement.manage', 'maintenance.request.manage', 'docs.document.manage'
    )
    on conflict (role_id, capability_code, association_id) do nothing;
  end if;

  select id into v_role_id from public.roles where tenant_id = p_tenant_id and code = 'council_member';
  if v_role_id is not null then
    insert into public.role_capabilities (role_id, capability_code, tenant_id, association_id)
    select v_role_id, code, p_tenant_id, p_association_id from public.capabilities
    where is_association_scoped and code in (
      'core.association.view', 'core.building.view', 'core.unit.view', 'core.ownership.view',
      'core.occupancy.view', 'finance.invoice.view'
    )
    on conflict (role_id, capability_code, association_id) do nothing;
  end if;

  select id into v_role_id from public.roles where tenant_id = p_tenant_id and code = 'administrator';
  if v_role_id is not null then
    insert into public.role_capabilities (role_id, capability_code, tenant_id, association_id)
    select v_role_id, code, p_tenant_id, p_association_id from public.capabilities
    where is_association_scoped
    on conflict (role_id, capability_code, association_id) do nothing;
  end if;

  select id into v_role_id from public.roles where tenant_id = p_tenant_id and code = 'accountant';
  if v_role_id is not null then
    insert into public.role_capabilities (role_id, capability_code, tenant_id, association_id)
    select v_role_id, code, p_tenant_id, p_association_id from public.capabilities
    where is_association_scoped and code in (
      'core.association.view', 'core.building.view', 'core.unit.view', 'core.ownership.view',
      'core.occupancy.view', 'finance.fee_type.view', 'finance.invoice.generate', 'finance.invoice.view',
      'finance.payment.record', 'finance.payment.view', 'finance.opening_balance.import',
      'finance.meter_reading.record', 'finance.meter_reading.view', 'finance.invoice.cancel'
    )
    on conflict (role_id, capability_code, association_id) do nothing;
  end if;
end;
$$;

alter table public.documents enable row level security;

create policy documents_select on public.documents for select
  using (
    public.has_capability(tenant_id, 'docs.document.manage', association_id)
    or (visibility = 'members' and public.is_tenant_member(tenant_id))
  );

create policy documents_insert on public.documents for insert
  with check (public.has_capability(tenant_id, 'docs.document.manage', association_id));

create policy documents_update on public.documents for update
  using (public.has_capability(tenant_id, 'docs.document.manage', association_id))
  with check (public.has_capability(tenant_id, 'docs.document.manage', association_id));

create policy documents_delete on public.documents for delete
  using (public.has_capability(tenant_id, 'docs.document.manage', association_id));

-- === Maintenance request photos =====================================

alter table public.maintenance_requests
  add column photo_paths text[] not null default '{}';

-- The request's UPDATE policy is staff-only (triage), so the creator
-- registers their uploads through this definer function instead. It
-- re-checks authorship and pins every path inside the request's own
-- storage folder.
create function public.attach_request_photos(p_request_id uuid, p_paths text[])
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
     and not public.has_capability(v_request.tenant_id, 'maintenance.request.manage', public.unit_association_id(v_request.unit_id)) then
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

revoke execute on function public.attach_request_photos(uuid, text[]) from public, anon;
grant execute on function public.attach_request_photos(uuid, text[]) to authenticated;

-- === Buckets + storage.objects policies =============================
-- Guarded so the migration also applies on stripped-down local test
-- stacks without the storage schema (the RLS suite covers the public
-- schema; storage policies are exercised on the real project).

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema absent; skipping bucket + storage policy setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'maintenance-photos', 'maintenance-photos', false, 5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']
  )
  on conflict (id) do nothing;

  insert into storage.buckets (id, name, public, file_size_limit)
  values ('documents', 'documents', false, 20971520)
  on conflict (id) do nothing;

  -- Photos: visible/uploadable by the request creator or triage staff,
  -- always inside the {request_id}/ folder. Deletion is staff or the
  -- original uploader.
  execute $pol$
    create policy maintenance_photos_select on storage.objects for select to authenticated
    using (
      bucket_id = 'maintenance-photos'
      and exists (
        select 1 from public.maintenance_requests r
        where r.id::text = (storage.foldername(name))[1]
          and (
            r.created_by = auth.uid()
            or public.has_capability(r.tenant_id, 'maintenance.request.manage', public.unit_association_id(r.unit_id))
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
            or public.has_capability(r.tenant_id, 'maintenance.request.manage', public.unit_association_id(r.unit_id))
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
            and public.has_capability(r.tenant_id, 'maintenance.request.manage', public.unit_association_id(r.unit_id))
        )
      )
    )
  $pol$;

  -- Documents: uploads land under {association_id}/ and require the
  -- manage capability for that association; downloads follow the
  -- metadata row's visibility; deletion is manage-only (works for
  -- orphaned uploads too, via the folder).
  execute $pol$
    create policy documents_storage_insert on storage.objects for insert to authenticated
    with check (
      bucket_id = 'documents'
      and exists (
        select 1 from public.associations a
        where a.id::text = (storage.foldername(name))[1]
          and public.has_capability(a.tenant_id, 'docs.document.manage', a.id)
      )
    )
  $pol$;

  execute $pol$
    create policy documents_storage_select on storage.objects for select to authenticated
    using (
      bucket_id = 'documents'
      and exists (
        select 1 from public.documents d
        where d.storage_path = objects.name
          and (
            public.has_capability(d.tenant_id, 'docs.document.manage', d.association_id)
            or (d.visibility = 'members' and public.is_tenant_member(d.tenant_id))
          )
      )
    )
  $pol$;

  execute $pol$
    create policy documents_storage_delete on storage.objects for delete to authenticated
    using (
      bucket_id = 'documents'
      and exists (
        select 1 from public.associations a
        where a.id::text = (storage.foldername(name))[1]
          and public.has_capability(a.tenant_id, 'docs.document.manage', a.id)
      )
    )
  $pol$;
end;
$$;
