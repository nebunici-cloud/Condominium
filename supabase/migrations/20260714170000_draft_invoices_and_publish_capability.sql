-- Invoice generation went straight from "click Generate" to a final,
-- payable invoice with no review step -- one wrong number in the
-- dialog and it's already real. Adds a draft state: generated
-- invoices land here by default and stay invisible to anyone without
-- generate-or-publish rights until someone explicitly publishes them.
--
-- finance.invoice.publish is a separate capability from
-- finance.invoice.generate on purpose -- granting it to board_president
-- (not just administrator/accountant) makes a genuine two-person
-- workflow possible (accountant generates, board president reviews
-- and publishes) without it being a hardcoded requirement; nothing
-- stops one person holding both and publishing their own drafts
-- immediately, same as today's single-operator flow.

alter table public.invoices drop constraint invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status in ('draft', 'issued', 'partially_paid', 'paid', 'cancelled'));

-- Every future insert starts as a draft unless the caller says
-- otherwise -- commit_invoice_batch() doesn't set status explicitly,
-- so this alone is what makes generation land in review instead of
-- going live immediately.
alter table public.invoices alter column status set default 'draft';

insert into public.capabilities (code, module, description, is_association_scoped) values
  ('finance.invoice.publish', 'finance', 'Publish draft invoices', true);

-- Backfill onto every existing association's administrator/accountant/
-- board_president roles -- new tenants/associations pick this up
-- automatically via the seed function update below. Keyed off
-- whichever finance capability each role is already guaranteed to
-- hold per-association (administrator/accountant via
-- finance.invoice.generate, board_president -- which never had
-- generate -- via finance.invoice.view instead), so both inserts
-- land on the same set of associations that capability already
-- covers.
insert into public.role_capabilities (role_id, capability_code, tenant_id, association_id)
select rc.role_id, 'finance.invoice.publish', rc.tenant_id, rc.association_id
from public.role_capabilities rc
join public.roles r on r.id = rc.role_id
where r.code in ('administrator', 'accountant')
  and rc.capability_code = 'finance.invoice.generate'
on conflict (role_id, capability_code, association_id) do nothing;

insert into public.role_capabilities (role_id, capability_code, tenant_id, association_id)
select rc.role_id, 'finance.invoice.publish', rc.tenant_id, rc.association_id
from public.role_capabilities rc
join public.roles r on r.id = rc.role_id
where r.code = 'board_president'
  and rc.capability_code = 'finance.invoice.view'
on conflict (role_id, capability_code, association_id) do nothing;

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
      'core.occupancy.view', 'core.config.manage', 'finance.invoice.view', 'finance.invoice.publish',
      'finance.payment.view'
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
      'finance.invoice.publish', 'finance.payment.record', 'finance.payment.view',
      'finance.opening_balance.import', 'finance.meter_reading.record', 'finance.meter_reading.view'
    )
    on conflict (role_id, capability_code, association_id) do nothing;
  end if;
end;
$$;

-- === RLS: gate draft visibility behind generate-or-publish rights ===

drop policy invoices_select on public.invoices;
create policy invoices_select on public.invoices for select
  using (
    public.is_tenant_member(tenant_id)
    and public.has_capability(tenant_id, 'finance.invoice.view', public.unit_association_id(unit_id))
    and (
      status <> 'draft'
      or public.has_capability(tenant_id, 'finance.invoice.generate', public.unit_association_id(unit_id))
      or public.has_capability(tenant_id, 'finance.invoice.publish', public.unit_association_id(unit_id))
    )
  );

drop policy invoice_lines_select on public.invoice_lines;
create policy invoice_lines_select on public.invoice_lines for select
  using (
    public.is_tenant_member(invoice_lines.tenant_id)
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_lines.invoice_id
        and public.has_capability(invoice_lines.tenant_id, 'finance.invoice.view', public.unit_association_id(i.unit_id))
        and (
          i.status <> 'draft'
          or public.has_capability(invoice_lines.tenant_id, 'finance.invoice.generate', public.unit_association_id(i.unit_id))
          or public.has_capability(invoice_lines.tenant_id, 'finance.invoice.publish', public.unit_association_id(i.unit_id))
        )
    )
  );

-- Publish (draft -> issued) and discard (-> cancelled) both need to
-- reach invoices_update; finance.payment.record already covers the
-- existing payment-status-recompute and cancel paths, this just adds
-- finance.invoice.publish as an alternative for someone who can
-- review a draft but doesn't otherwise record payments.
drop policy invoices_update on public.invoices;
create policy invoices_update on public.invoices for update
  using (
    public.has_capability(tenant_id, 'finance.payment.record', public.unit_association_id(unit_id))
    or public.has_capability(tenant_id, 'finance.invoice.publish', public.unit_association_id(unit_id))
  )
  with check (
    public.has_capability(tenant_id, 'finance.payment.record', public.unit_association_id(unit_id))
    or public.has_capability(tenant_id, 'finance.invoice.publish', public.unit_association_id(unit_id))
  );
