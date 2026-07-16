-- Cancelling an invoice used to piggyback on finance.payment.record /
-- finance.invoice.publish via the invoices_update RLS policy -- anyone
-- who could record a payment could also void a bill. Voiding is a
-- distinct, more sensitive act, so it gets its own capability and its
-- own SECURITY DEFINER entry point, and the blanket update policy on
-- invoices is removed (every legitimate invoice write now goes through
-- a dedicated function: commit_invoice_batch, publish_invoices,
-- cancel_invoices, or the payment-status trigger).

insert into public.capabilities (code, module, description, is_association_scoped)
values ('finance.invoice.cancel', 'finance', 'Cancel invoices', true);

-- Backfill: administrator and accountant in every existing
-- association keep the ability they effectively had.
insert into public.role_capabilities (role_id, capability_code, tenant_id, association_id)
select r.id, 'finance.invoice.cancel', r.tenant_id, a.id
from public.roles r
join public.associations a on a.tenant_id = r.tenant_id
where r.code in ('administrator', 'accountant')
on conflict (role_id, capability_code, association_id) do nothing;

-- Keep future associations consistent: administrator already receives
-- every association-scoped capability via its wildcard insert in
-- seed_association_role_capabilities; extend the accountant bundle.
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
      'core.occupancy.view', 'core.config.manage', 'finance.invoice.view', 'finance.payment.view'
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

-- The one entry point for voiding invoices. Draft/issued/partially_paid
-- only; paid or already-cancelled rows in a mixed selection are skipped
-- (same forgiving semantics the bulk UI already promises). Clearing
-- matched payments keeps them counting toward the unit's balance while
-- freeing them to be re-matched to whatever replaces the voided bill.
create function public.cancel_invoices(p_invoice_ids uuid[])
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  for r in
    select id, tenant_id, unit_id from public.invoices
    where id = any(p_invoice_ids)
      and status in ('draft', 'issued', 'partially_paid')
  loop
    if not public.has_capability(r.tenant_id, 'finance.invoice.cancel', public.unit_association_id(r.unit_id)) then
      raise exception 'Not allowed to cancel invoices in this association';
    end if;

    update public.payments set matched_invoice_id = null where matched_invoice_id = r.id;
    update public.invoices set status = 'cancelled' where id = r.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.cancel_invoices(uuid[]) from public, anon;
grant execute on function public.cancel_invoices(uuid[]) to authenticated;

-- All invoice writes now flow through SECURITY DEFINER functions;
-- nothing legitimate is left for a blanket row update policy to allow.
drop policy if exists invoices_update on public.invoices;
