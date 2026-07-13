"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  calculateFeeAllocation,
  type AllocationMethod,
  type UnitAttributes,
} from "@/lib/allocation-engine";

const feeTypeInputSchema = z.object({
  feeTypeId: z.string().uuid(),
  totalAmount: z.number().positive(),
});

const requestSchema = z.object({
  buildingId: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
  feeTypeInputs: z.array(feeTypeInputSchema).min(1),
});

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function computeInvoiceLines(
  supabase: SupabaseClient,
  buildingId: string,
  periodStart: string,
  periodEnd: string,
  feeTypeInputs: { feeTypeId: string; totalAmount: number }[]
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

  const { data: existingInvoices } = await supabase
    .from("invoices")
    .select("unit_id")
    .in("unit_id", unitAttrs.map((u) => u.unitId))
    .eq("billing_period_start", periodStart)
    .eq("billing_period_end", periodEnd);
  const alreadyInvoicedUnitIds = new Set((existingInvoices ?? []).map((i) => i.unit_id));

  const perFeeType: {
    feeTypeId: string;
    feeTypeLabel: string;
    method: AllocationMethod;
    allocationRuleId: string;
    totalAmount: number;
    lines: { unitId: string; unitNumber: string; amount: number }[];
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
        totalAmount: input.totalAmount,
        lines: [],
        excludedUnitIds: [],
        error: "no_active_rule",
      });
      continue;
    }

    const method = activeRule.method as AllocationMethod;
    let meterDeltas: Map<string, number> | undefined;

    if (method === "by_meter") {
      const meterType = (activeRule.config as { meter_type?: string })?.meter_type;
      meterDeltas = await computeMeterDeltas(
        supabase,
        unitAttrs.map((u) => u.unitId),
        meterType ?? "",
        periodStart,
        periodEnd
      );
    }

    const outcome = calculateFeeAllocation(method, unitAttrs, input.totalAmount, meterDeltas);
    const unitNumberById = new Map((units ?? []).map((u) => [u.id, u.unit_number]));

    perFeeType.push({
      feeTypeId: feeType.id,
      feeTypeLabel: feeType.label,
      method,
      allocationRuleId: activeRule.id,
      totalAmount: input.totalAmount,
      lines: outcome.results.map((r) => ({
        unitId: r.unitId,
        unitNumber: unitNumberById.get(r.unitId) ?? "?",
        amount: r.amount,
      })),
      excludedUnitIds: outcome.excludedUnitIds,
      error: outcome.error,
    });
  }

  return { unitAttrs, alreadyInvoicedUnitIds, perFeeType };
}

async function computeMeterDeltas(
  supabase: SupabaseClient,
  unitIds: string[],
  meterType: string,
  periodStart: string,
  periodEnd: string
): Promise<Map<string, number>> {
  const deltas = new Map<string, number>();
  if (!meterType || unitIds.length === 0) return deltas;

  const { data: readings } = await supabase
    .from("meter_readings")
    .select("unit_id, reading_value, reading_date")
    .in("unit_id", unitIds)
    .eq("meter_type", meterType)
    .lte("reading_date", periodEnd)
    .order("reading_date", { ascending: false });

  const byUnit = new Map<string, { value: number; date: string }[]>();
  for (const r of readings ?? []) {
    const list = byUnit.get(r.unit_id) ?? [];
    list.push({ value: r.reading_value, date: r.reading_date });
    byUnit.set(r.unit_id, list);
  }

  for (const [unitId, list] of byUnit) {
    const endReading = list.find((r) => r.date <= periodEnd);
    const startReading = list.find((r) => r.date <= periodStart);
    if (endReading && startReading && endReading.value >= startReading.value) {
      deltas.set(unitId, endReading.value - startReading.value);
    }
  }

  return deltas;
}

export async function previewInvoiceGeneration(input: z.infer<typeof requestSchema>) {
  const parsed = requestSchema.parse(input);
  const supabase = await createClient();

  const { unitAttrs, alreadyInvoicedUnitIds, perFeeType } = await computeInvoiceLines(
    supabase,
    parsed.buildingId,
    parsed.periodStart,
    parsed.periodEnd,
    parsed.feeTypeInputs
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
    parsed.feeTypeInputs
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

  let invoiced = 0;

  for (const unit of unitsToInvoice) {
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        tenant_id: building.tenant_id,
        unit_id: unit.unitId,
        billing_period_start: parsed.periodStart,
        billing_period_end: parsed.periodEnd,
        total_amount: totalsByUnit.get(unit.unitId) ?? 0,
        generated_by: user?.id ?? null,
      })
      .select("id")
      .single();

    if (invoiceError || !invoice) continue;

    const lineRows = perFeeType
      .filter((f) => !f.error)
      .map((f) => {
        const line = f.lines.find((l) => l.unitId === unit.unitId);
        if (!line) return null;
        return {
          tenant_id: building.tenant_id,
          invoice_id: invoice.id,
          fee_type_id: f.feeTypeId,
          allocation_rule_id: f.allocationRuleId,
          amount: line.amount,
          calculation_input: {
            method: f.method,
            total_amount_for_fee_type: f.totalAmount,
            unit_id: unit.unitId,
          },
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (lineRows.length > 0) {
      await supabase.from("invoice_lines").insert(lineRows);
    }

    invoiced += 1;
  }

  revalidatePath("/", "layout");
  return { error: null, invoiced };
}
