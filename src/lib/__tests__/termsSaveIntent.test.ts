import { describe, expect, it } from "vitest";
import { termsSaveIntent } from "../termsSaveIntent";
import type { DealBudgetWrite } from "../dealBudget";
import type { FinancialPlanWrite } from "../financialCockpit";

describe("combined financing save intent", () => {
  it("ignores only revisions and known numeric wire representations", () => {
    const fields = { note: "1000", funder: "Capital 12" };
    const plan = { new_loan_amount: 107000, retire: ["loan-a"], expected_updated_at: "old", updated_at: "old", updated_by: "old", new_payment_source: "manual_terms" } as unknown as FinancialPlanWrite;
    const budget = { expected_revision: 1, target_net_amount: 100000, rows: [{ label: "1000", value: 2 }] } as unknown as DealBudgetWrite;
    const refreshedPlan = { ...plan, expected_updated_at: "new", updated_at: "new", updated_by: "new", terms_ref: { version: 2 }, new_payment_source: "recorded_terms" } as unknown as FinancialPlanWrite;
    const refreshedBudget = { ...budget, expected_revision: 2, target_net_amount: "100000.00", rows: [{ label: "1000", value: "2.0000" }] } as unknown as DealBudgetWrite;
    expect(termsSaveIntent(fields, plan, budget)).toBe(termsSaveIntent(fields, refreshedPlan, refreshedBudget));
    expect(termsSaveIntent({ ...fields, note: "1000.00" }, plan, budget)).not.toBe(termsSaveIntent(fields, plan, budget));
    expect(termsSaveIntent(fields, { ...plan, retire: [] }, budget)).not.toBe(termsSaveIntent(fields, plan, budget));
  });
});
