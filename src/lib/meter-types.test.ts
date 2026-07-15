import { describe, expect, it } from "vitest";

import { normalizeMeterType } from "./meter-types";

describe("normalizeMeterType", () => {
  it("trims and lowercases so config and unit meters always match", () => {
    expect(normalizeMeterType("  Cold_Water ")).toBe("cold_water");
    expect(normalizeMeterType("cold_water")).toBe("cold_water");
  });
});
