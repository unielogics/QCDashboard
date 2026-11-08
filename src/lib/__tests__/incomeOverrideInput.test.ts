import { describe, expect, it } from "vitest";
import { parseIncomeOverride } from "../incomeOverrideInput";

describe("annual earnings correction input", () => {
  it("retains a staff-entered loss instead of removing its sign", () => {
    expect(parseIncomeOverride("-12000.50")).toBe(-12000.5);
    expect(parseIncomeOverride("-1")).toBe(-1);
    expect(parseIncomeOverride("+12000.50")).toBe(12000.5);
  });

  it("distinguishes an explicit zero from an empty or incomplete correction", () => {
    expect(parseIncomeOverride("0")).toBe(0);
    expect(parseIncomeOverride("")).toBeNull();
    expect(parseIncomeOverride("  ")).toBeNull();
    expect(parseIncomeOverride("-")).toBeNull();
  });

  it.each(["Infinity", "-Infinity", "NaN", "not a number", "1e999"])("does not publish non-finite input %s", (value) => {
    expect(parseIncomeOverride(value)).toBeNull();
  });
});
