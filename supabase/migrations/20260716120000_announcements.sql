-- Announcements: the association's channel to its residents. Managed
-- by board/administrator (new comms.announcement.manage capability),
-- readable by every tenant member -- residents see them on My home.

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  association_id uuid not null references public.associations(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  body text not null check (char_length(trim(body)) > 0),
  published_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_announcements_tenant on public.announcements(tenant_id);
create index idx_announcements_association on public.announcements(association_id, published_at desc);

create trigger set_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

create trigger audit_announcements
  after insert or update or delete on public.announcements
  for each row execute function public.fn_audit_entity_change();

insert into public.capabilities (code, module, description, is_association_scoped)
values ('comms.announcement.manage', 'comms', 'Create and manage announcements', true);

-- Backfill for existing associations: administrator (who receives all
-- association-scoped capabilities) and board president.
insert into public.role_capabilities (role_id, capability_code, tenant_id, association_id)
select r.id, 'comms.announcement.manage', r.tenant_id, a.id
from public.roles r
join public.associations a on a.tenant_id = r.tenant_id
where r.code in ('administrator', 'board_president')
on conflict (role_id, capability_code, association_id) do nothing;

-- Future associations: administrator's wildcard insert in
-- seed_association_role_capabilities picks the new capability up
-- automatically; board president's explicit list needs the addition.
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
      'comms.announcement.manage'
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

alter table public.announcements enable row level security;

create policy announcements_select on public.announcements for select
  using (public.is_tenant_member(tenant_id));

create policy announcements_insert on public.announcements for insert
  with check (public.has_capability(tenant_id, 'comms.announcement.manage', association_id));

create policy announcements_update on public.announcements for update
  using (public.has_capability(tenant_id, 'comms.announcement.manage', association_id))
  with check (public.has_capability(tenant_id, 'comms.announcement.manage', association_id));

create policy announcements_delete on public.announcements for delete
  using (public.has_capability(tenant_id, 'comms.announcement.manage', association_id));
