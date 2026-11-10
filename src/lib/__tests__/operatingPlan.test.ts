import { describe, expect, it } from "vitest";
import { clearOperatingReview, illustrativeActionImpact, operatingExpenseTotal, operatingNumber, operatingPlanRequest, operatingReviewedWorkspace, proposeExpense, type OperatingPlanBody } from "../operatingPlan";

describe("operating plan draft", () => {
  it("preserves disclosed expenses and edits one linked proposal without duplicating it", () => {
    const baseline: OperatingPlanBody = { expenses: [{ id: "rent", label: "Rent", current_amount: "3000", cadence: "monthly", source_file_ids: ["lease"] }] };
    const first = proposeExpense(baseline, "rent", "2500", () => "action");
    const second = proposeExpense(first, "rent", "3500", () => "unused");
    expect(second.expenses).toEqual(baseline.expenses);
    expect(second.adjustments).toHaveLength(1);
    expect(second.adjustments![0]).toMatchObject({ id: "action", expense_row_id: "rent", current_amount: "3000", proposed_amount: "3500", kind: "expense_increase", status: "proposed", source_file_ids: ["lease"] });
    expect(illustrativeActionImpact({ ...second.adjustments![0], implementation_cost: 0 })).toBe(-6000);
  });
  it("removes protected review stamps when a client or staff member changes a proposal", () => {
    const changed = clearOperatingReview({ id: "one", status: "approved", reviewed_by_user_id: "staff", reviewed_at: "2026-01-01", review_source_stamp: "old", baseline_treatment: "included_in_baseline" });
    expect(changed).toMatchObject({ status: "proposed", reviewed_at: null, reviewed_by_user_id: null, review_source_stamp: null, baseline_treatment: "unreconciled", review_reason: "", baseline_reconciliation_note: "" });
  });
  it("keeps unknown costs distinct from zero and excludes removed costs from totals", () => {
    expect(operatingNumber(0)).toBe(0); expect(operatingNumber(" ")).toBeNull();
    expect(operatingExpenseTotal([{ id: "rent", current_amount: 3000, cadence: "monthly" }, { id: "payroll", current_amount: 1000, cadence: "semi_monthly" }, { id: "unknown", current_amount: null }, { id: "old", current_amount: 9000, excluded: true }])).toEqual({ annual: 60000, oneTime: 0, missing: 1 });
  });
  it("does not treat unknown implementation cost as free or one-time benefits as recurring", () => {
    const row = { id: "cost", kind: "expense_reduction" as const, current_amount: 1000, proposed_amount: 500, cadence: "monthly" as const };
    expect(illustrativeActionImpact(row)).toBeNull();
    expect(illustrativeActionImpact({ ...row, implementation_cost: 200, implementation_cost_cadence: "monthly" })).toBe(3600);
    expect(illustrativeActionImpact({ id: "once", kind: "one_time_adjustment", current_amount: 0, proposed_amount: 5000, cadence: "one_time", implementation_cost: 0 })).toBe(0);
  });
  it("keeps price increases and product cost increases in opposite directions", () => {
    expect(illustrativeActionImpact({ id: "price", kind: "price_change", current_unit_price: 10, proposed_unit_price: 12, units_per_period: 100, cadence: "monthly", implementation_cost: 0 })).toBe(2400);
    expect(illustrativeActionImpact({ id: "cost", kind: "product_cost_change", current_unit_cost: 10, proposed_unit_cost: 12, units_per_period: 100, cadence: "monthly", implementation_cost: 0 })).toBe(-2400);
  });
  it("does not compare unlike processing bases or double count all-in fees", () => {
    const row = { id: "merchant", kind: "processing_cost_change" as const, processing_volume: 100000, current_processing_rate_pct: 3, proposed_processing_rate_pct: 2, cadence: "monthly" as const, implementation_cost: 0, current_processing_rate_basis: "all_in" as const, proposed_processing_rate_basis: "all_in" as const };
    expect(illustrativeActionImpact(row)).toBe(12000);
    expect(illustrativeActionImpact({ ...row, proposed_processing_rate_basis: "processor_markup" })).toBeNull();
    expect(illustrativeActionImpact({ ...row, current_processing_fixed_fee: 20 })).toBeNull();
  });
  it("creates an online form request without sending it", () => {
    expect(operatingPlanRequest("Studio LLC")).toMatchObject({ document_type: "operating_plan", quantity: 1, unit: "files", subject: "Studio LLC" });
  });
  it("accepts the review API's top-level workspace and rejects another family's response", () => {
    const workspace = { kind: "operating_plan", family_id: "plan", body: { expenses: [] }, draft: { revision: 4 } };
    expect(operatingReviewedWorkspace({ ...workspace, evaluation: {} }, "plan")).toMatchObject(workspace);
    expect(operatingReviewedWorkspace({ workspace, evaluation: {} }, "plan")).toEqual(workspace);
    expect(() => operatingReviewedWorkspace(workspace, "other-plan")).toThrow("draft could not be refreshed");
    expect(() => operatingReviewedWorkspace({ evaluation: {} }, "plan")).toThrow("draft could not be refreshed");
  });
});
