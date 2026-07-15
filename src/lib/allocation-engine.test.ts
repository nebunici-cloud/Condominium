import { describe, expect, it } from "vitest";

import {
  calculateFeeAllocation,
  calculateTariffAllocation,
  distributeProportionally,
  type UnitAttributes,
} from "./allocation-engine";

function unit(overrides: Partial<UnitAttributes> & { unitId: string }): UnitAttributes {
  return {
    ownershipSharePercent: null,
    areaSqm: null,
    residentCount: null,
    ...overrides,
  };
}

describe("distributeProportionally", () => {
  it("splits a total proportionally to weights", () => {
    expect(distributeProportionally([1, 3], 100)).toEqual([25, 75]);
  });

  it("nudges the largest share so rounded parts sum to the exact total", () => {
    const parts = distributeProportionally([1, 1, 1], 100);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    // Two units keep the plain rounded share; one absorbs the cent.
    expect(parts.filter((p) => p === 33.33)).toHaveLength(2);
    expect(parts).toContain(33.34);
  });

  it("returns all zeros when total weight is zero", () => {
    expect(distributeProportionally([0, 0], 100)).toEqual([0, 0]);
  });

  it("keeps every amount at two decimals", () => {
    const parts = distributeProportionally([1, 2, 4], 10);
    for (const p of parts) {
      expect(p).toBe(Math.round(p * 100) / 100);
    }
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(10, 10);
  });
});

describe("calculateFeeAllocation", () => {
  it("allocates by area", () => {
    const outcome = calculateFeeAllocation(
      "by_area",
      [unit({ unitId: "a", areaSqm: 50 }), unit({ unitId: "b", areaSqm: 150 })],
      200
    );
    expect(outcome.error).toBeNull();
    expect(outcome.results).toEqual([
      { unitId: "a", amount: 50, weight: 50 },
      { unitId: "b", amount: 150, weight: 150 },
    ]);
  });

  it("allocates by ownership share (cota_parte)", () => {
    const outcome = calculateFeeAllocation(
      "cota_parte",
      [
        unit({ unitId: "a", ownershipSharePercent: 25 }),
        unit({ unitId: "b", ownershipSharePercent: 75 }),
      ],
      1000
    );
    expect(outcome.results.map((r) => r.amount)).toEqual([250, 750]);
  });

  it("splits equally per unit", () => {
    const outcome = calculateFeeAllocation(
      "per_unit",
      [unit({ unitId: "a" }), unit({ unitId: "b" }), unit({ unitId: "c" })],
      99
    );
    expect(outcome.results.map((r) => r.amount).reduce((a, b) => a + b, 0)).toBe(99);
    expect(outcome.excludedUnitIds).toEqual([]);
  });

  it("excludes units missing the needed attribute and flags them", () => {
    const outcome = calculateFeeAllocation(
      "by_area",
      [unit({ unitId: "a", areaSqm: 100 }), unit({ unitId: "b", areaSqm: null })],
      100
    );
    expect(outcome.excludedUnitIds).toEqual(["b"]);
    expect(outcome.results).toEqual([{ unitId: "a", amount: 100, weight: 100 }]);
  });

  it("charges zero (without excluding) a unit whose attribute is legitimately zero", () => {
    const outcome = calculateFeeAllocation(
      "per_resident",
      [unit({ unitId: "a", residentCount: 0 }), unit({ unitId: "b", residentCount: 4 })],
      80
    );
    expect(outcome.excludedUnitIds).toEqual([]);
    expect(outcome.results).toEqual([
      { unitId: "a", amount: 0, weight: 0 },
      { unitId: "b", amount: 80, weight: 4 },
    ]);
  });

  it("allocates by meter deltas and excludes units without a delta", () => {
    const outcome = calculateFeeAllocation(
      "by_meter",
      [unit({ unitId: "a" }), unit({ unitId: "b" }), unit({ unitId: "c" })],
      30,
      new Map([
        ["a", 2],
        ["b", 4],
      ])
    );
    expect(outcome.excludedUnitIds).toEqual(["c"]);
    expect(outcome.results).toEqual([
      { unitId: "a", amount: 10, weight: 2 },
      { unitId: "b", amount: 20, weight: 4 },
    ]);
  });

  it("reports no_weight_data when no unit has usable data", () => {
    const outcome = calculateFeeAllocation(
      "by_area",
      [unit({ unitId: "a" }), unit({ unitId: "b" })],
      100
    );
    expect(outcome.error).toBe("no_weight_data");
    expect(outcome.results).toEqual([]);
    expect(outcome.excludedUnitIds).toEqual(["a", "b"]);
  });

  it("reconciles rounding so line amounts always sum to the typed total", () => {
    const units = Array.from({ length: 7 }, (_, i) => unit({ unitId: `u${i}`, areaSqm: 33.33 }));
    const outcome = calculateFeeAllocation("by_area", units, 1234.56);
    const sum = outcome.results.reduce((acc, r) => acc + r.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(1234.56);
  });
});

describe("calculateTariffAllocation", () => {
  it("charges rate x own quantity, rounded to cents", () => {
    const outcome = calculateTariffAllocation("by_area", 2.2, [
      unit({ unitId: "a", areaSqm: 54.3 }),
      unit({ unitId: "b", areaSqm: 71.8 }),
    ]);
    expect(outcome.error).toBeNull();
    expect(outcome.results).toEqual([
      { unitId: "a", amount: 119.46, weight: 54.3 },
      { unitId: "b", amount: 157.96, weight: 71.8 },
    ]);
  });

  it("charges a flat rate per unit for the per_unit measure", () => {
    const outcome = calculateTariffAllocation("per_unit", 35, [
      unit({ unitId: "a" }),
      unit({ unitId: "b" }),
    ]);
    expect(outcome.results.map((r) => r.amount)).toEqual([35, 35]);
  });

  it("uses meter deltas for the by_meter measure and excludes units without one", () => {
    const outcome = calculateTariffAllocation(
      "by_meter",
      10.5,
      [unit({ unitId: "a" }), unit({ unitId: "b" })],
      new Map([["a", 3.2]])
    );
    expect(outcome.results).toEqual([{ unitId: "a", amount: 33.6, weight: 3.2 }]);
    expect(outcome.excludedUnitIds).toEqual(["b"]);
    expect(outcome.error).toBeNull();
  });

  it("reports no_weight_data when every unit lacks the measure", () => {
    const outcome = calculateTariffAllocation("per_resident", 12, [
      unit({ unitId: "a" }),
      unit({ unitId: "b" }),
    ]);
    expect(outcome.error).toBe("no_weight_data");
    expect(outcome.excludedUnitIds).toEqual(["a", "b"]);
  });
});
