"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { normalizeMeterType } from "@/lib/meter-types";

const methodSchema = z.enum(["cota_parte", "by_area", "per_unit", "per_resident", "by_meter"]);

function buildConfig(method: z.infer<typeof methodSchema>, meterType?: string) {
  if (method === "by_meter") {
    return { meter_type: meterType?.trim() ? normalizeMeterType(meterType) : "cold_water" };
  }
  return {};
}

const createFeeTypeSchema = z.object({
  tenantId: z.string().uuid(),
  associationId: z.string().uuid(),
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  method: methodSchema,
  meterType: z.string().trim().optional(),
});

export async function createFeeType(input: z.infer<typeof createFeeTypeSchema>) {
  const parsed = createFeeTypeSchema.parse(input);
  const supabase = await createClient();

  const { data: feeType, error: feeTypeError } = await supabase
    .from("fee_types")
    .insert({
      tenant_id: parsed.tenantId,
      association_id: parsed.associationId,
      key: parsed.key,
      label: parsed.label,
    })
    .select("id")
    .single();

  if (feeTypeError || !feeType) {
    return { error: feeTypeError?.message ?? "Failed to create fee type" };
  }

  const { error: ruleError } = await supabase.rpc("set_allocation_rule", {
    p_fee_type_id: feeType.id,
    p_method: parsed.method,
    p_config: buildConfig(parsed.method, parsed.meterType),
  });

  if (ruleError) {
    return { error: ruleError.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

const enableSuggestedSchema = z.object({
  tenantId: z.string().uuid(),
  associationId: z.string().uuid(),
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
});

export async function enableSuggestedFeeType(input: z.infer<typeof enableSuggestedSchema>) {
  const parsed = enableSuggestedSchema.parse(input);
  return createFeeType({ ...parsed, method: "cota_parte" });
}

const changeMethodSchema = z.object({
  feeTypeId: z.string().uuid(),
  method: methodSchema,
  meterType: z.string().trim().optional(),
});

export async function changeAllocationMethod(input: z.infer<typeof changeMethodSchema>) {
  const parsed = changeMethodSchema.parse(input);
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_allocation_rule", {
    p_fee_type_id: parsed.feeTypeId,
    p_method: parsed.method,
    p_config: buildConfig(parsed.method, parsed.meterType),
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
