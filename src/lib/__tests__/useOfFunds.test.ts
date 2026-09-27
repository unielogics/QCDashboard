import { describe, expect, it } from "vitest";
import { budgetPreview, moneyCents, type UseOfFundsRow } from "../useOfFunds";

const row = (id: string, category: UseOfFundsRow["category"], amount: string): UseOfFundsRow => ({ id, category, amount, label: "" });

describe("use-of-funds budget", () => {
  it("uses cents without rounding invalid decimals or accepting non-finite values", () => {
    expect(moneyCents("0.10")).toBe(10);
    expect(moneyCents("12.1")).toBe(1210);
    for (const value of ["1.005", "NaN", "Infinity", "1e3", "-1", "", "1,000", null]) expect(moneyCents(value)).toBeNull();
  });
  it("does not infer a share from a partial or missing budget", () => {
    expect(budgetPreview([row("r", "real_estate", "510")], 1000)).toMatchObject({ complete: false, remaining: 49000, percent: null });
    expect(budgetPreview([row("r", "real_estate", "510")], null).percent).toBeNull();
    expect(budgetPreview([], 0).complete).toBe(false);
  });
  it("distinguishes 50.99 from 51 percent using a fully allocated request", () => {
    expect(budgetPreview([row("a", "equipment", "509.90"), row("b", "inventory", "490.10")], 1000).percent).toBe(50.99);
    expect(budgetPreview([row("a", "real_estate", "500"), row("b", "equipment", "10"), row("c", "working_capital", "490")], 1000)).toMatchObject({ complete: true, percent: 51 });
  });
  it("keeps refinance and closing costs out of the simple fixed-asset heuristic", () => {
    expect(budgetPreview([row("a", "debt_refinance", "600"), row("b", "closing_fees", "400")], 1000).percent).toBe(0);
  });
  it("blocks overallocated and invalid rows", () => {
    expect(budgetPreview([row("a", "equipment", "1001")], 1000).errors.total).toContain("exceeds");
    expect(budgetPreview([row("a", "equipment", "0")], 1000).errors.a).toContain("above $0");
    expect(budgetPreview([row("a", "equipment", "")], 1000).percent).toBeNull();
  });
});
