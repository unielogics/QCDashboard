import { describe, expect, it } from "vitest";
import { requestedAmountEffect, summarizeProgramEffects, unconditionalRequestedMaximum } from "../fundingProgramSummaryModel";

describe("funding program amount and preference effect summaries", () => {
  const maximum = { field: "requested_amount", op: "lte", value: 500000 };
  it("identifies the tightest unconditional configured maximum", () => {
    expect(unconditionalRequestedMaximum(maximum)).toEqual({ amount: 500000, inclusive: true });
    expect(unconditionalRequestedMaximum({ all: [maximum, { all: [{ ...maximum, value: 350000, op: "lt" }] }] })).toEqual({ amount: 350000, inclusive: false });
    expect(unconditionalRequestedMaximum({ all: [maximum, { ...maximum, op: "lt" }] })).toEqual({ amount: 500000, inclusive: false });
  });

  it("never invents a universal cap from OR, NOT, lower bounds or marketing metadata", () => {
    expect(unconditionalRequestedMaximum({ any: [maximum, { field: "annual_revenue", op: "gte", value: 1000000 }] })).toBeNull();
    expect(unconditionalRequestedMaximum({ not: maximum })).toBeNull();
    expect(unconditionalRequestedMaximum({ ...maximum, op: "gte" })).toBeNull();
    expect(summarizeProgramEffects([], JSON.stringify({ advertised_maximum: 350000, fit: { field: "vertical", op: "eq", value: "dealer" } }), "[]").requestedAmountMaximum).toBeNull();
  });

  it("explains a cap as this program's check, not approval or a guarantee of another program", () => {
    expect(requestedAmountEffect({ amount: 350000, inclusive: true })).toContain("Requests above $350,000");
    expect(requestedAmountEffect({ amount: 500000, inclusive: false })).toContain("Requests of $500,000 or more");
    expect(requestedAmountEffect({ amount: 350000, inclusive: true })).toContain("only if its own published criteria pass");
    expect(requestedAmountEffect({ amount: 350000, inclusive: true })).toContain("never automatic loan approval");
  });

  it("summarizes actual preference conditions and scores without turning them into eligibility", () => {
    const effects = summarizeProgramEffects([], JSON.stringify({ fit: maximum, recommendation_preferences: [{ key: "majority", label: "QC real estate preference", score: 20, when: { field: "real_estate_equipment_pct", op: "gte", value: 51 } }] }), "[]");
    expect(effects.checkCount).toBe(1);
    expect(effects.preferences).toEqual([{ label: "QC real estate preference", score: 20, condition: { text: "Real estate and equipment share must be at least 51%" } }]);
    expect(effects.requestedAmountMaximum).toEqual({ amount: 500000, inclusive: true });
  });
});
