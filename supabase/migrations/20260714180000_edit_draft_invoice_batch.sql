-- A draft that can only be published or thrown away entirely isn't
-- much of a review step -- correcting one wrong fee-type amount meant
-- discarding the whole batch and re-running generation from scratch.
-- This adds a real edit-in-place path: commit_invoice_batch now
-- clears out any existing DRAFT for the exact unit+period combination
-- it's about to write before inserting, so calling it again for the
-- same building+period with corrected inputs replaces the draft
-- rather than colliding with it. A first-time generation is
-- unaffected -- there's nothing to delete yet.
--
-- invoices_delete only ever allows removing a draft, never anything
-- that ever went live (issued/partially_paid/paid/cancelled invoices
-- stay permanent, same as everywhere else in this schema -- history
-- is ended via status, not deleted).
create policy invoices_delete on public.invoices for delete
  using (
    status = 'draft'
    and public.has_capability(tenant_id, 'finance.invoice.generate', public.unit_association_id(unit_id))
  );

drop function public.commit_invoice_batch(jsonb, jsonb);

create function public.commit_invoice_batch(
  p_building_id uuid,
  p_period_start date,
  p_period_end date,
  p_invoices jsonb,
  p_lines jsonb
)
returns integer
language plpgsql
as $$
declare
  v_invoice jsonb;
  v_line jsonb;
  v_invoice_id uuid;
  v_count integer := 0;
  v_map jsonb := '{}'::jsonb;
begin
  delete from public.invoices
  where unit_id in (select id from public.units where building_id = p_building_id)
    and billing_period_start = p_period_start
    and billing_period_end = p_period_end
    and status = 'draft';

  for v_invoice in select * from jsonb_array_elements(p_invoices)
  loop
    insert into public.invoices (
      tenant_id, unit_id, billing_period_start, billing_period_end, total_amount, generated_by
    )
    values (
      (v_invoice->>'tenant_id')::uuid,
      (v_invoice->>'unit_id')::uuid,
      (v_invoice->>'billing_period_start')::date,
      (v_invoice->>'billing_period_end')::date,
      (v_invoice->>'total_amount')::numeric,
      nullif(v_invoice->>'generated_by', '')::uuid
    )
    returning id into v_invoice_id;

    v_map := v_map || jsonb_build_object(v_invoice->>'unit_id', v_invoice_id);
    v_count := v_count + 1;
  end loop;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into public.invoice_lines (
      tenant_id, invoice_id, fee_type_id, allocation_rule_id, amount, calculation_input
    )
    values (
      (v_line->>'tenant_id')::uuid,
      (v_map->>(v_line->>'unit_id'))::uuid,
      (v_line->>'fee_type_id')::uuid,
      (v_line->>'allocation_rule_id')::uuid,
      (v_line->>'amount')::numeric,
      coalesce(v_line->'calculation_input', '{}'::jsonb)
    );
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.commit_invoice_batch(uuid, date, date, jsonb, jsonb) from public;
grant execute on function public.commit_invoice_batch(uuid, date, date, jsonb, jsonb) to authenticated;
