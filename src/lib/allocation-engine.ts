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
 * distributes `totalAmount` across them. A unit missing the attribute
 * a method needs (share %, area, resident count, or -- for by_meter --
 * a meter delta) is excluded from that fee type's allocation for this
 * run rather than silently getting zero, so the caller can flag it.
 * A unit whose attribute is present but legitimately zero (e.g. a
 * declared resident count of 0 for a vacant unit) is not excluded --
 * it's correctly charged nothing and doesn't inflate everyone else's
 * share.
 */
export function calculateFeeAllocation(
  method: AllocationMethod,
  units: UnitAttributes[],
  totalAmount: number,
  meterDeltas?: Map<string, number>
): AllocationOutcome {
  const excludedUnitIds: string[] = [];
  const weighted: { unit: UnitAttributes; weight: number }[] = [];

  for (const unit of units) {
    const weight = getUnitWeight(method, unit, meterDeltas);
    if (weight === null) {
      excludedUnitIds.push(unit.unitId);
      continue;
    }
    weighted.push({ unit, weight });
  }

  const weights = weighted.map(({ weight }) => weight);
  if (weights.every((w) => w <= 0)) {
    return { results: [], excludedUnitIds, error: "no_weight_data" };
  }

  const amounts = distributeProportionally(weights, totalAmount);

  return {
    results: weighted.map(({ unit }, i) => ({
      unitId: unit.unitId,
      amount: amounts[i],
      weight: weights[i],
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
      return unit.ownershipSharePercent;
    case "by_area":
      return unit.areaSqm;
    case "per_unit":
      return 1;
    case "per_resident":
      return unit.residentCount;
    case "by_meter": {
      const delta = meterDeltas?.get(unit.unitId);
      return delta === undefined ? null : delta;
    }
  }
}
