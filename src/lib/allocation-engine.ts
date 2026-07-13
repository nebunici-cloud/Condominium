// Pure calculation core for the Finance rule engine. No I/O here on
// purpose: callers fetch units/readings from the database, build
// weights, and this module only does the math -- keeps it directly
// testable and keeps the "what produced this number" logic in one
// auditable place, matching the spec's requirement that every
// calculation run be reproducible from its inputs.

export type AllocationMethod = "cota_parte" | "by_area" | "per_unit" | "per_resident" | "by_meter";

export type UnitAttributes = {
  unitId: string;
  ownershipSharePercent: number | null;
  areaSqm: number | null;
  residentCount: number | null;
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Splits `total` across `weights` proportionally, then nudges the
// largest share so the parts sum to exactly `total` (plain
// proportional rounding can leave the sum a cent or two off).
export function distributeProportionally(weights: number[], total: number): number[] {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) {
    return weights.map(() => 0);
  }

  const rounded = weights.map((w) => round2((w / totalWeight) * total));
  const sumRounded = round2(rounded.reduce((sum, r) => sum + r, 0));
  const diff = round2(total - sumRounded);

  if (diff !== 0 && weights.length > 0) {
    let maxIndex = 0;
    for (let i = 1; i < weights.length; i++) {
      if (weights[i] > weights[maxIndex]) maxIndex = i;
    }
    rounded[maxIndex] = round2(rounded[maxIndex] + diff);
  }

  return rounded;
}

export type AllocationLineResult = {
  unitId: string;
  amount: number;
  weight: number;
};

export type AllocationOutcome = {
  results: AllocationLineResult[];
  excludedUnitIds: string[];
  error: "no_weight_data" | null;
};

/**
 * Computes per-unit weights for a method, then proportionally
 * distributes `totalAmount` across them. `meterDeltas` is required
 * (and only used) for by_meter; units missing a delta are excluded
 * from that fee type's allocation for this run rather than silently
 * getting zero, so the caller can flag them.
 */
export function calculateFeeAllocation(
  method: AllocationMethod,
  units: UnitAttributes[],
  totalAmount: number,
  meterDeltas?: Map<string, number>
): AllocationOutcome {
  const excludedUnitIds: string[] = [];

  const weighted = units
    .map((unit) => {
      const weight = getUnitWeight(method, unit, meterDeltas);
      return { unit, weight };
    })
    .filter(({ unit, weight }) => {
      if (method === "by_meter" && weight === null) {
        excludedUnitIds.push(unit.unitId);
        return false;
      }
      return true;
    });

  const weights = weighted.map(({ weight }) => weight ?? 0);
  if (weights.every((w) => w <= 0)) {
    return { results: [], excludedUnitIds, error: "no_weight_data" };
  }

  const amounts = distributeProportionally(weights, totalAmount);

  return {
    results: weighted.map(({ unit, weight }, i) => ({
      unitId: unit.unitId,
      amount: amounts[i],
      weight: weight ?? 0,
    })),
    excludedUnitIds,
    error: null,
  };
}

function getUnitWeight(
  method: AllocationMethod,
  unit: UnitAttributes,
  meterDeltas?: Map<string, number>
): number | null {
  switch (method) {
    case "cota_parte":
      return unit.ownershipSharePercent ?? 0;
    case "by_area":
      return unit.areaSqm ?? 0;
    case "per_unit":
      return 1;
    case "per_resident":
      return unit.residentCount ?? 0;
    case "by_meter": {
      const delta = meterDeltas?.get(unit.unitId);
      return delta === undefined ? null : delta;
    }
  }
}
