"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  calculateFeeAllocation,
  calculateTariffAllocation,
  type AllocationMethod,
  type TariffUnitOfMeasure,
  type UnitAttributes,
} from "@/lib/allocation-engine";
import { normalizeMeterType } from "@/lib/meter-types";
import { addDays, startOfMonth, endOfMonth } from "@/lib/period";

const feeTypeInputSchema = z.object({
  feeTypeId: z.string().uuid(),
  // Only required for methods that divide an admin-typed total.
  // tariff_rate has no total to type -- its amount is rate x each
  // unit's own quantity, computed from the active rule's config, so
  // the total is an output, never an input.
  totalAmount: z.number().positive().optional(),
});

const requestSchema = z.object({
  buildingId: z.string().uuid(),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  feeTypeInputs: z.array(feeTypeInputSchema).min(1),
  // Editing an existing draft batch re-submits the same period it
  // already occupies -- without this, that period's own draft
  // invoices would count as "already invoiced" and block themselves.
  // Never lets a batch skip past an issued/paid invoice: only draft
  // status is treated as non-blocking, and commit_invoice_batch's own
  // DELETE is separately hard-scoped to status = 'draft' regardless
  // of what this flag says.
  isEdit: z.boolean().optional().default(false),
});

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function sumInvoiceLinesForPeriod(
  supabase: SupabaseClient,
  unitIds: string[],
  periodStart: string,
  periodEnd: string
): Promise<Record<string, number>> {
  const amounts: Record<string, number> = {};
  if (unitIds.length === 0) return amounts;

  const { data: periodInvoices } = await supabase
    .from("invoices")
    .select("id")
    .in("unit_id", unitIds)
    .eq("billing_period_start", periodStart)
    .eq("billing_period_end", periodEnd)
    .neq("status", "cancelled");

  const invoiceIds = (periodInvoices ?? []).map((i) => i.id);
  if (invoiceIds.length === 0) return amounts;

  const { data: lines } = await supabase
    .from("invoice_lines")
    .select("fee_type_id, amount")
    .in("invoice_id", invoiceIds);

  for (const line of lines ?? []) {
    amounts[line.fee_type_id] = round2((amounts[line.fee_type_id] ?? 0) + line.amount);
  }

  return amounts;
}

// Removes two of the most common ways to fat-finger a billing run:
// picking dates that don't line up with the last period (we've seen a
// real one-day period in production data from this), and typing a
// fee-type amount from memory instead of what it actually was last
// time. Defaults are only ever a starting point -- every field stays
// editable, this just replaces "blank" with "what's most likely
// right."
export async function getBillingDefaults(
  supabase: SupabaseClient,
  buildingId: string
): Promise<{
  defaultPeriodStart: string;
  defaultPeriodEnd: string;
  suggestedAmounts: Record<string, number>;
}> {
  const today = new Date().toISOString().slice(0, 10);
  const fallback = {
    defaultPeriodStart: startOfMonth(today),
    defaultPeriodEnd: endOfMonth(today),
    suggestedAmounts: {} as Record<string, number>,
  };

  const { data: units } = await supabase.from("units").select("id").eq("building_id", buildingId);
  const unitIds = (units ?? []).map((u) => u.id);
  if (unitIds.length === 0) return fallback;

  const { data: lastInvoice } = await supabase
    .from("invoices")
    .select("billing_period_start, billing_period_end")
    .in("unit_id", unitIds)
    .neq("status", "cancelled")
    .order("billing_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastInvoice) return fallback;

  const defaultPeriodStart = addDays(lastInvoice.billing_period_end, 1);
  const defaultPeriodEnd = endOfMonth(defaultPeriodStart);

  const suggestedAmounts = await sumInvoiceLinesForPeriod(
    supabase,
    unitIds,
    lastInvoice.billing_period_start,
    lastInvoice.billing_period_end
  );

  return { defaultPeriodStart, defaultPeriodEnd, suggestedAmounts };
}

// Same idea as getBillingDefaults, but for a *known* existing period
// rather than "whatever's most recent" -- this is what pre-fills the
// edit dialog for a draft batch with the amounts it currently holds.
export async function getDraftBatchAmounts(
  supabase: SupabaseClient,
  buildingId: string,
  periodStart: string,
  periodEnd: string
): Promise<Record<string, number>> {
  const { data: units } = await supabase.from("units").select("id").eq("building_id", buildingId);
  const unitIds = (units ?? []).map((u) => u.id);
  return sumInvoiceLinesForPeriod(supabase, unitIds, periodStart, periodEnd);
}

async function computeInvoiceLines(
  supabase: SupabaseClient,
  buildingId: string,
  periodStart: string,
  periodEnd: string,
  feeTypeInputs: { feeTypeId: string; totalAmount?: number }[],
  isEdit = false
) {
  const { data: units } = await supabase
    .from("units")
    .select("id, unit_number, ownership_share_percent, area_sqm, resident_count")
    .eq("building_id", buildingId);

  const unitAttrs: UnitAttributes[] = (units ?? []).map((u) => ({
    unitId: u.id,
    ownershipSharePercent: u.ownership_share_percent,
    areaSqm: u.area_sqm,
    residentCount: u.resident_count,
  }));

  // "Already invoiced" means any non-cancelled invoice whose period
  // overlaps the requested range, not just an exact match -- the
  // database enforces this as a hard constraint (see
  // invoices_no_overlapping_periods), this is what lets the UI warn
  // about it up front instead of the whole batch failing on insert.
  // When editing an existing draft batch, its own draft rows for this
  // exact period shouldn't count as a block -- commit_invoice_batch is
  // about to replace them, and the exclude constraint guarantees no
  // *other* draft could exist for an overlapping range anyway.
  let existingInvoicesQuery = supabase
    .from("invoices")
    .select("unit_id")
    .in("unit_id", unitAttrs.map((u) => u.unitId))
    .neq("status", "cancelled")
    .lte("billing_period_start", periodEnd)
    .gte("billing_period_end", periodStart);
  if (isEdit) {
    existingInvoicesQuery = existingInvoicesQuery.neq("status", "draft");
  }
  const { data: existingInvoices } = await existingInvoicesQuery;
  const alreadyInvoicedUnitIds = new Set((existingInvoices ?? []).map((i) => i.unit_id));

  const perFeeType: {
    feeTypeId: string;
    feeTypeLabel: string;
    method: AllocationMethod;
    allocationRuleId: string;
    totalAmount: number;
    // Only meaningful for tariff_rate -- the standing rate every unit's
    // quantity is multiplied by. Proportional methods have no
    // configured rate (the amount is a share of an admin-typed total).
    rate?: number;
    // The quantity basis a line's weight was measured in -- for
    // tariff_rate this is the configured unit_of_measure, for every
    // other method it's just the method itself (by_area's weight *is*
    // the area basis). Threaded through to invoice_lines so the
    // detail page can show a real "Consum / U.M. / Tarif" breakdown.
    unitOfMeasure?: AllocationMethod;
    // Only set when unitOfMeasure/method is by_meter -- lets the
    // detail page show the actual meter indices behind a line, not
    // just the consumption delta.
    meterDetails?: Map<string, MeterReadingDetail>;
    lines: { unitId: string; unitNumber: string; amount: number; weight: number }[];
    excludedUnitIds: string[];
    error: string | null;
  }[] = [];

  for (const input of feeTypeInputs) {
    const { data: feeType } = await supabase
      .from("fee_types")
      .select("id, label, allocation_rules(id, method, config, is_active)")
      .eq("id", input.feeTypeId)
      .maybeSingle();

    const activeRule = feeType?.allocation_rules.find((r) => r.is_active);
    if (!feeType || !activeRule) {
      perFeeType.push({
        feeTypeId: input.feeTypeId,
        feeTypeLabel: feeType?.label ?? "?",
        method: "per_unit",
        allocationRuleId: "",
        totalAmount: input.totalAmount ?? 0,
        lines: [],
        excludedUnitIds: [],
        error: "no_active_rule",
      });
      continue;
    }

    const method = activeRule.method as AllocationMethod;
    const unitNumberById = new Map((units ?? []).map((u) => [u.id, u.unit_number]));

    if (method === "tariff_rate") {
      const config = activeRule.config as { rate?: number; unit_of_measure?: TariffUnitOfMeasure; meter_type?: string };
      const rate = config.rate;
      const unitOfMeasure = config.unit_of_measure;

      if (rate === undefined || !unitOfMeasure) {
        perFeeType.push({
          feeTypeId: feeType.id,
          feeTypeLabel: feeType.label,
          method,
          allocationRuleId: activeRule.id,
          totalAmount: 0,
          lines: [],
          excludedUnitIds: [],
          error: "no_active_rule",
        });
        continue;
      }

      let meterDeltas: Map<string, number> | undefined;
      let meterDetails: Map<string, MeterReadingDetail> | undefined;
      if (unitOfMeasure === "by_meter") {
        meterDetails = await computeMeterReadings(
          supabase,
          unitAttrs.map((u) => u.unitId),
          config.meter_type ? normalizeMeterType(config.meter_type) : "",
          periodStart,
          periodEnd
        );
        meterDeltas = new Map(
          [...meterDetails].map(([unitId, d]) => [unitId, d.endValue - d.startValue])
        );
      }

      const outcome = calculateTariffAllocation(unitOfMeasure, rate, unitAttrs, meterDeltas);
      // No admin-typed total to echo back -- this *is* the total,
      // summed from what each unit was actually charged.
      const computedTotal = outcome.results.reduce((sum, r) => sum + r.amount, 0);

      perFeeType.push({
        feeTypeId: feeType.id,
        feeTypeLabel: feeType.label,
        method,
        allocationRuleId: activeRule.id,
        totalAmount: computedTotal,
        rate,
        unitOfMeasure,
        meterDetails,
        lines: outcome.results.map((r) => ({
          unitId: r.unitId,
          unitNumber: unitNumberById.get(r.unitId) ?? "?",
          amount: r.amount,
          weight: r.weight,
        })),
        excludedUnitIds: outcome.excludedUnitIds,
        error: outcome.error,
      });
      continue;
    }

    let meterDeltas: Map<string, number> | undefined;
    let meterDetails: Map<string, MeterReadingDetail> | undefined;

    if (method === "by_meter") {
      const meterType = (activeRule.config as { meter_type?: string })?.meter_type;
      meterDetails = await computeMeterReadings(
        supabase,
        unitAttrs.map((u) => u.unitId),
        meterType ? normalizeMeterType(meterType) : "",
        periodStart,
        periodEnd
      );
      meterDeltas = new Map(
        [...meterDetails].map(([unitId, d]) => [unitId, d.endValue - d.startValue])
      );
    }

    const outcome = calculateFeeAllocation(method, unitAttrs, input.totalAmount ?? 0, meterDeltas);

    perFeeType.push({
      feeTypeId: feeType.id,
      feeTypeLabel: feeType.label,
      method,
      allocationRuleId: activeRule.id,
      totalAmount: input.totalAmount ?? 0,
      unitOfMeasure: method,
      meterDetails,
      lines: outcome.results.map((r) => ({
        unitId: r.unitId,
        unitNumber: unitNumberById.get(r.unitId) ?? "?",
        amount: r.amount,
        weight: r.weight,
      })),
      excludedUnitIds: outcome.excludedUnitIds,
      error: outcome.error,
    });
  }

  return { unitAttrs, alreadyInvoicedUnitIds, perFeeType };
}

export type MeterReadingDetail = {
  meterId: string | null;
  startValue: number;
  startDate: string;
  endValue: number;
  endDate: string;
};

// Same lookup as before (nearest reading at/before period end,
// nearest at/before period start), but keeps the two raw readings
// instead of collapsing straight to a delta -- invoice generation
// only ever needed the difference, but the detail page wants to show
// the actual indices (matching a real invoice's "Ind. precedent /
// Ind. curent" columns), so both are threaded through now.
async function computeMeterReadings(
  supabase: SupabaseClient,
  unitIds: string[],
  meterType: string,
  periodStart: string,
  periodEnd: string
): Promise<Map<string, MeterReadingDetail>> {
  const details = new Map<string, MeterReadingDetail>();
  if (!meterType || unitIds.length === 0) return details;

  const { data: readings } = await supabase
    .from("meter_readings")
    .select("unit_id, meter_id, reading_value, reading_date")
    .in("unit_id", unitIds)
    .eq("meter_type", meterType)
    .lte("reading_date", periodEnd)
    .order("reading_date", { ascending: false });

  const byUnit = new Map<string, { meterId: string | null; value: number; date: string }[]>();
  for (const r of readings ?? []) {
    const list = byUnit.get(r.unit_id) ?? [];
    list.push({ meterId: r.meter_id, value: r.reading_value, date: r.reading_date });
    byUnit.set(r.unit_id, list);
  }

  for (const [unitId, list] of byUnit) {
    const endReading = list.find((r) => r.date <= periodEnd);
    const startReading = list.find((r) => r.date <= periodStart);
    if (endReading && startReading && endReading.value >= startReading.value) {
      details.set(unitId, {
        meterId: endReading.meterId,
        startValue: startReading.value,
        startDate: startReading.date,
        endValue: endReading.value,
        endDate: endReading.date,
      });
    }
  }

  return details;
}

export async function previewInvoiceGeneration(input: z.infer<typeof requestSchema>) {
  const parsed = requestSchema.parse(input);
  const supabase = await createClient();

  const { unitAttrs, alreadyInvoicedUnitIds, perFeeType } = await computeInvoiceLines(
    supabase,
    parsed.buildingId,
    parsed.periodStart,
    parsed.periodEnd,
    parsed.feeTypeInputs,
    parsed.isEdit
  );

  const totalsByUnit = new Map<string, number>();
  for (const feeType of perFeeType) {
    for (const line of feeType.lines) {
      totalsByUnit.set(line.unitId, (totalsByUnit.get(line.unitId) ?? 0) + line.amount);
    }
  }

  const unitCount = unitAttrs.length;
  const willSkipCount = unitAttrs.filter((u) => alreadyInvoicedUnitIds.has(u.unitId)).length;
  const willInvoiceCount = unitCount - willSkipCount;

  return {
    perFeeType: perFeeType.map((f) => ({
      feeTypeId: f.feeTypeId,
      feeTypeLabel: f.feeTypeLabel,
      method: f.method,
      totalAmount: f.totalAmount,
      excludedUnitIds: f.excludedUnitIds,
      error: f.error,
    })),
    unitCount,
    willInvoiceCount,
    willSkipCount,
    totalAcrossUnits: Array.from(totalsByUnit.values()).reduce((a, b) => a + b, 0),
  };
}

export async function commitInvoiceGeneration(input: z.infer<typeof requestSchema>) {
  const parsed = requestSchema.parse(input);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", invoiced: 0 };

  const { data: building } = await supabase
    .from("buildings")
    .select("tenant_id")
    .eq("id", parsed.buildingId)
    .maybeSingle();
  if (!building) return { error: "Building not found", invoiced: 0 };

  const { unitAttrs, alreadyInvoicedUnitIds, perFeeType } = await computeInvoiceLines(
    supabase,
    parsed.buildingId,
    parsed.periodStart,
    parsed.periodEnd,
    parsed.feeTypeInputs,
    parsed.isEdit
  );

  const totalsByUnit = new Map<string, number>();
  for (const feeType of perFeeType) {
    if (feeType.error) continue;
    for (const line of feeType.lines) {
      totalsByUnit.set(line.unitId, (totalsByUnit.get(line.unitId) ?? 0) + line.amount);
    }
  }

  const unitsToInvoice = unitAttrs.filter(
    (u) => !alreadyInvoicedUnitIds.has(u.unitId) && (totalsByUnit.get(u.unitId) ?? 0) > 0
  );

  if (unitsToInvoice.length === 0) {
    // Editing a batch down to nothing (every fee type unchecked)
    // should still clear out the stale draft it's replacing, not
    // leave it sitting there untouched.
    if (parsed.isEdit) {
      const { error } = await supabase.rpc("commit_invoice_batch", {
        p_building_id: parsed.buildingId,
        p_period_start: parsed.periodStart,
        p_period_end: parsed.periodEnd,
        p_invoices: [],
        p_lines: [],
      });
      if (error) return { error: error.message, invoiced: 0 };
      revalidatePath("/", "layout");
    }
    return { error: null, invoiced: 0 };
  }

  const invoiceRows = unitsToInvoice.map((unit) => ({
    tenant_id: building.tenant_id,
    unit_id: unit.unitId,
    billing_period_start: parsed.periodStart,
    billing_period_end: parsed.periodEnd,
    total_amount: totalsByUnit.get(unit.unitId) ?? 0,
    generated_by: user.id,
  }));

  const lineRows = unitsToInvoice.flatMap((unit) =>
    perFeeType
      .filter((f) => !f.error)
      .map((f) => {
        const line = f.lines.find((l) => l.unitId === unit.unitId);
        if (!line) return null;
        const meter = f.meterDetails?.get(unit.unitId);
        return {
          tenant_id: building.tenant_id,
          unit_id: unit.unitId,
          fee_type_id: f.feeTypeId,
          allocation_rule_id: f.allocationRuleId,
          amount: line.amount,
          calculation_input: {
            method: f.method,
            total_amount_for_fee_type: f.totalAmount,
            unit_id: unit.unitId,
            quantity: line.weight,
            unit_of_measure: f.unitOfMeasure,
            ...(f.rate !== undefined ? { rate: f.rate } : {}),
            ...(meter
              ? {
                  meter: {
                    meter_id: meter.meterId,
                    start_value: meter.startValue,
                    start_date: meter.startDate,
                    end_value: meter.endValue,
                    end_date: meter.endDate,
                  },
                }
              : {}),
          },
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  );

  // One RPC call = one transaction: either every invoice and line in
  // this run is created, or (a constraint violation, a dropped
  // connection mid-batch) none of it is -- no more half-generated
  // periods to clean up by hand. It also clears out any existing
  // draft for this exact building+period first, which is what makes
  // editing a draft batch (isEdit) work: same period, corrected
  // inputs, replaces rather than collides.
  const { data: invoiced, error } = await supabase.rpc("commit_invoice_batch", {
    p_building_id: parsed.buildingId,
    p_period_start: parsed.periodStart,
    p_period_end: parsed.periodEnd,
    p_invoices: invoiceRows,
    p_lines: lineRows,
  });

  if (error) {
    return { error: error.message, invoiced: 0 };
  }

  revalidatePath("/", "layout");
  return { error: null, invoiced: invoiced ?? 0 };
}

// Cancelling clears any payment matched to this invoice rather than
// leaving it pointing at a dead invoice -- the payment itself still
// counts toward the unit's outstanding balance either way (matching
// is reconciliation bookkeeping, not what makes a payment count), but
// leaving it "matched" to a cancelled invoice would be confusing and
// would block re-matching it to whatever invoice replaces this one.
export async function cancelInvoice(invoiceId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("invoices")
    .update({ status: "cancelled" })
    .eq("id", invoiceId);

  if (error) {
    return { error: error.message };
  }

  await supabase.from("payments").update({ matched_invoice_id: null }).eq("matched_invoice_id", invoiceId);

  revalidatePath("/", "layout");
  return { error: null };
}

// Bulk counterpart for the invoices list's mass-selection actions.
// Scoped to draft/issued/partially_paid same as the per-row cancel
// button already is -- a paid or already-cancelled row slipping into
// a mixed selection is silently skipped rather than erroring the
// whole batch.
export async function cancelInvoices(invoiceIds: string[]) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "cancelled" })
    .in("id", invoiceIds)
    .in("status", ["draft", "issued", "partially_paid"])
    .select("id");

  if (error) {
    return { error: error.message, cancelled: 0 };
  }

  const cancelledIds = (data ?? []).map((i) => i.id);
  if (cancelledIds.length > 0) {
    await supabase
      .from("payments")
      .update({ matched_invoice_id: null })
      .in("matched_invoice_id", cancelledIds);
  }

  revalidatePath("/", "layout");
  return { error: null, cancelled: cancelledIds.length };
}

// Generated invoices land in draft (see the invoices.status default)
// and stay invisible to anyone without generate-or-publish rights
// until this runs -- the actual review step. .eq("status", "draft")
// means calling this twice, or on something already published, is a
// harmless no-op rather than an error.
export async function publishInvoice(invoiceId: string) {
  const supabase = await createClient();

  // publish_invoices assigns invoice_number/issued_at/due_date
  // atomically (a per-tenant counter increment can't be done safely
  // from a plain client-side update), so publishing now always goes
  // through the RPC rather than a direct status update.
  const { error } = await supabase.rpc("publish_invoices", { p_invoice_ids: [invoiceId] });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function publishDraftInvoices(invoiceIds: string[]) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("publish_invoices", { p_invoice_ids: invoiceIds });

  if (error) {
    return { error: error.message, published: 0 };
  }

  revalidatePath("/", "layout");
  return { error: null, published: data ?? 0 };
}

const adjustmentSchema = z.object({
  invoiceLineId: z.string().uuid(),
  adjustmentAmount: z.number(),
  adjustmentReason: z.string().trim().optional(),
});

// invoice_lines_update RLS already scopes this to draft-status
// invoices and the finance.invoice.generate capability -- the reason
// requirement below just mirrors the DB check constraint so the form
// fails with a clear message instead of a raw constraint-violation error.
export async function setLineAdjustment(input: z.infer<typeof adjustmentSchema>) {
  const parsed = adjustmentSchema.parse(input);

  if (parsed.adjustmentAmount !== 0 && !parsed.adjustmentReason) {
    return { error: "Reason required" };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("invoice_lines")
    .update({
      adjustment_amount: parsed.adjustmentAmount,
      adjustment_reason: parsed.adjustmentAmount === 0 ? null : parsed.adjustmentReason,
    })
    .eq("id", parsed.invoiceLineId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
