-- Invoice generation used to insert one invoice (then its lines) per
-- unit in a loop from the app -- a mid-batch failure (a dropped
-- connection, a constraint violation on one unit) left a confusing
-- half-generated period with no rollback. A single function call runs
-- as one implicit transaction, so wrapping the whole batch's inserts
-- in one call to this function makes the batch genuinely all-or-
-- nothing: any failure anywhere in it rolls back everything, and the
-- caller can safely retry the whole request.
--
-- Deliberately SECURITY INVOKER, same reasoning as set_allocation_rule:
-- it runs as the calling user so the existing RLS policies on
-- invoices/invoice_lines are what actually authorize each row, not a
-- bypass. p_invoices/p_lines are the exact rows computeInvoiceLines()
-- already calculated in TypeScript -- this function only inserts them,
-- it doesn't recompute anything.
create function public.commit_invoice_batch(p_invoices jsonb, p_lines jsonb)
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

revoke execute on function public.commit_invoice_batch(jsonb, jsonb) from public;
grant execute on function public.commit_invoice_batch(jsonb, jsonb) to authenticated;
