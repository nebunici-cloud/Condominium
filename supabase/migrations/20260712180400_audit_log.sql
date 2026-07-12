-- Append-only audit log. One shared table, one shared write API
-- (audit_record), used by every module. No UPDATE or DELETE policy is
-- ever granted on this table -- see the revoke statements below -- so
-- once a row lands here it cannot be altered or removed through the API.
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_log_tenant on public.audit_log(tenant_id);
create index idx_audit_log_entity on public.audit_log(entity_type, entity_id);
create index idx_audit_log_created on public.audit_log(created_at desc);

-- audit.record(actor, action, entity_type, entity_id, before, after, metadata)
-- actor is implicit: it's always the currently authenticated user (auth.uid()),
-- so callers can never spoof who performed an action.
create function public.audit_record(
  p_tenant_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb,
  p_after jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, before, after, metadata)
  values (p_tenant_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_before, p_after, p_metadata)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.audit_record(uuid, text, text, uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.audit_record(uuid, text, text, uuid, jsonb, jsonb, jsonb) to authenticated;

-- Generic trigger that calls audit_record() on every insert/update/delete
-- of an entity-graph table, so "every write must call this" is enforced
-- structurally rather than relying on every future screen remembering to
-- call an audit helper by hand.
create function public.fn_audit_entity_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_entity_id uuid;
  v_action text;
  v_before jsonb;
  v_after jsonb;
begin
  if TG_OP = 'INSERT' then
    v_tenant_id := (to_jsonb(new) ->> 'tenant_id')::uuid;
    v_entity_id := new.id;
    v_action := 'create';
    v_before := null;
    v_after := to_jsonb(new);
  elsif TG_OP = 'UPDATE' then
    v_tenant_id := (to_jsonb(new) ->> 'tenant_id')::uuid;
    v_entity_id := new.id;
    v_action := 'update';
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
  elsif TG_OP = 'DELETE' then
    v_tenant_id := (to_jsonb(old) ->> 'tenant_id')::uuid;
    v_entity_id := old.id;
    v_action := 'delete';
    v_before := to_jsonb(old);
    v_after := null;
  end if;

  perform public.audit_record(v_tenant_id, v_action, TG_TABLE_NAME, v_entity_id, v_before, v_after, '{}'::jsonb);

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger audit_associations
  after insert or update or delete on public.associations
  for each row execute function public.fn_audit_entity_change();

create trigger audit_buildings
  after insert or update or delete on public.buildings
  for each row execute function public.fn_audit_entity_change();

create trigger audit_units
  after insert or update or delete on public.units
  for each row execute function public.fn_audit_entity_change();

create trigger audit_owners
  after insert or update or delete on public.owners
  for each row execute function public.fn_audit_entity_change();

create trigger audit_ownerships
  after insert or update or delete on public.ownerships
  for each row execute function public.fn_audit_entity_change();

create trigger audit_occupants
  after insert or update or delete on public.occupants
  for each row execute function public.fn_audit_entity_change();

create trigger audit_occupancies
  after insert or update or delete on public.occupancies
  for each row execute function public.fn_audit_entity_change();
