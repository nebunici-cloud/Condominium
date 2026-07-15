import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// meter_type is matched with an exact string between a fee type's
// allocation rule config and a unit's meters[].type -- trimming and
// lowercasing both sides wherever they're written or compared is what
// keeps "cold_water" and "Cold_water" from silently failing to match.
export function normalizeMeterType(value: string): string {
  return value.trim().toLowerCase();
}

// The set of meter types a unit's meters can be tagged with is driven
// by Finance setup: whichever fee types are configured with the
// by_meter allocation method there. This keeps a unit's meter.type
// values always matching what invoice generation actually looks up
// (allocation_rules.config.meter_type), instead of letting someone
// type a slightly different string by hand.
export async function getMeterTypeOptions(
  supabase: SupabaseServerClient,
  associationId: string
): Promise<string[]> {
  const { data: rows } = await supabase
    .from("allocation_rules")
    .select("method, config, fee_types!inner(association_id)")
    .in("method", ["by_meter", "tariff_rate"])
    .eq("is_active", true)
    .eq("fee_types.association_id", associationId);

  const types = (rows ?? [])
    // tariff_rate only reads a meter when its unit_of_measure is
    // by_meter -- the other four bases (cota_parte/by_area/per_unit/
    // per_resident) don't touch meter_type at all.
    .filter(
      (row) =>
        row.method === "by_meter" ||
        (row.config as { unit_of_measure?: string } | null)?.unit_of_measure === "by_meter"
    )
    .map((row) => (row.config as { meter_type?: string } | null)?.meter_type)
    .filter((type): type is string => Boolean(type))
    .map(normalizeMeterType);

  return Array.from(new Set(types));
}
