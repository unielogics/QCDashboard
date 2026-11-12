import { describe, expect, it, vi } from "vitest";
import { addOperatingCurrentItem, addOperatingPlannedActivity, confirmOperatingNewActivity, linkedExpenseChanges, linkOperatingPlannedActivity, operatingChangeCategories, operatingProposalDimensionMismatch, removeOperatingCurrentItem, restoreOperatingCurrentItem, setOperatingExpenseProposal } from "../operatingStep3";
import { updateOperatingExpense, type OperatingGuidance } from "../operatingGuidance";
import type { OperatingPlanBody } from "../operatingPlan";

const guidance: OperatingGuidance = { policy_version: "test", business: {}, reporting: {}, essentials: [{ category: "rent", label: "Rent", prompt: "" }, { category: "marketing", label: "Marketing", prompt: "" }], expense_groups: [{ key: "irs-rent", category: "rent", label: "IRS rent", baseline_annual_amount: 12000, currency: "USD", basis: "cash", year: 2025, source_file_ids: ["tax"], source_label: "Saved tax return", source_fact_keys: [], notes: [] }], action_templates: [], warnings: [] };
const body = (): OperatingPlanBody => ({ period_start: "2025-01-01", period_end: "2025-12-31", currency: "USD", projection_start: "2026-01-01", historical_noi: 50000, category_confirmations: { rent: "confirmed" }, expenses: [{ id: "a", label: "Location A", category: "rent", source_group_key: "irs-rent", current_amount: 1000, cadence: "monthly", source_file_ids: ["tax"], notes: "Keep provenance" }, { id: "b", label: "Location B", category: "rent", source_group_key: "irs-rent", current_amount: null, cadence: "monthly" }], adjustments: [] });

describe("Step 3 grouping and explicit proposal intent", () => {
  it("carries every current row and empty category without creating or mutating actions", () => {
    const value = body(), before = structuredClone(value);
    const groups = operatingChangeCategories(value, guidance);
    expect(groups.map(row => row.key)).toEqual(["rent", "marketing"]);
    expect(groups[0].groups[0]).toMatchObject({ sourceGroupKey: "irs-rent", expenses: value.expenses });
    expect(groups[1].groups[0].expenses).toEqual([]);
    expect(value).toEqual(before);
  });

  it("uses the linked row owner even when its source group is deliberately empty", () => {
    const value = body(); value.expenses![0].source_group_key = "";
    value.adjustments = [{ id: "marketing", kind: "marketing_investment", expense_row_id: "a", expense_category: "marketing", source_group_key: "old-source" }];
    const group = operatingChangeCategories(value, guidance).flatMap(row => row.groups).find(row => row.activities.length);
    expect(group).toMatchObject({ category: "rent", sourceGroupKey: "" });
  });

  it("adds multiple unknown current items within the same source group without source-total deduplication", () => {
    const value = body(), group = operatingChangeCategories(value, guidance)[0].groups[0];
    const next = addOperatingCurrentItem(addOperatingCurrentItem(value, group, "new-a"), group, "new-b");
    expect(next.expenses).toHaveLength(4);
    expect(next.expenses?.slice(2)).toEqual(expect.arrayContaining([expect.objectContaining({ id: "new-a", current_amount: null, source_group_key: "irs-rent", source_file_ids: [] }), expect.objectContaining({ id: "new-b", current_amount: null })]));
    expect(next.category_confirmations?.rent).toBeUndefined();
    expect(value.expenses).toHaveLength(2);
    expect(next.historical_noi).toBe(50000);
  });

  it("creates a planned activity without inventing current zero, setup cost or evidence", () => {
    const value = body(), group = operatingChangeCategories(value, guidance)[0].groups[0];
    const next = addOperatingPlannedActivity(value, group, "planned");
    expect(next.expenses).toEqual(value.expenses);
    expect(next.adjustments?.[0]).toMatchObject({ expense_category: "rent", source_group_key: "irs-rent", current_amount: null, proposed_amount: null, implementation_cost: null, source_file_ids: [], effective_date: "2026-01-01" });
    expect(next.category_confirmations?.rent).toBe("confirmed");
  });

  it("only the explicit new-activity zero choice adds and links a zero disclosure, with a usable label", () => {
    const value = addOperatingPlannedActivity(body(), operatingChangeCategories(body(), guidance)[0].groups[0], "planned");
    const next = confirmOperatingNewActivity(value, "planned", () => "zero-row");
    expect(next.expenses?.at(-1)).toMatchObject({ id: "zero-row", current_amount: 0, label: "New planned activity", source_file_ids: [] });
    expect(next.adjustments?.[0]).toMatchObject({ expense_row_id: "zero-row", current_amount: 0, label: "New planned activity", implementation_cost: null });
    expect(next.category_confirmations?.rent).toBeUndefined();
    expect(next.historical_noi).toBe(50000);
    const create = vi.fn(); expect(confirmOperatingNewActivity(next, "planned", create)).toBe(next); expect(create).not.toHaveBeenCalled();
  });

  it("upserts a single proposal without changing the current disclosure or evidence", () => {
    const value = body(), before = structuredClone(value.expenses);
    const first = setOperatingExpenseProposal(value, "a", { amount: "800" }, () => "proposal");
    first.adjustments![0].source_note = "User quote";
    const next = setOperatingExpenseProposal(first, "a", { amount: "750" }, () => "wrong-new-id");
    expect(next.expenses).toEqual(before);
    expect(next.adjustments).toHaveLength(1);
    expect(next.adjustments?.[0]).toMatchObject({ id: "proposal", proposed_amount: "750", current_amount: 1000, source_note: "User quote", effective_date: "2026-01-01" });
    expect(next.adjustments?.[0].implementation_cost).toBeUndefined();
  });

  it("copies only known per-unit components on the first explicit proposal edit, keeping unknown and zero distinct", () => {
    const value = body(); Object.assign(value.expenses![0], { cost_basis: "per_unit", unit_label: "seat", current_units_per_period: 10, current_unit_cost: null, current_fixed_amount: 0 });
    const next = setOperatingExpenseProposal(value, "a", { quantity: "12" }, () => "unit-proposal");
    expect(next.adjustments?.[0]).toMatchObject({ proposed_units_per_period: "12", proposed_unit_cost: null, proposed_fixed_amount: 0 });
    expect(value.expenses?.[0].current_units_per_period).toBe(10);
  });

  it("shows all generic duplicates and refuses an arbitrary first-match proposal write", () => {
    const value = body(); value.adjustments = [{ id: "one", kind: "expense_reduction", expense_row_id: "a" }, { id: "two", kind: "expense_increase", expense_row_id: "a" }];
    expect(linkedExpenseChanges(value, "a")).toHaveLength(2);
    expect(operatingChangeCategories(value, guidance)[0].groups[0].activities.map(row => row.id)).toEqual(["one", "two"]);
    const create = vi.fn(); expect(setOperatingExpenseProposal(value, "a", { amount: "800" }, create)).toBe(value); expect(create).not.toHaveBeenCalled();
  });

  it("preserves a valid legacy annual proposal and requires explicit re-entry before monthly editing", () => {
    const value = body(); value.adjustments = [{ id: "annual", kind: "expense_reduction", expense_row_id: "a", current_amount: 12000, proposed_amount: 9600, cadence: "annual", explanation: "Keep rationale" }];
    expect(operatingProposalDimensionMismatch(value.expenses![0], value.adjustments[0])).toBe(true);
    expect(setOperatingExpenseProposal(value, "a", { amount: "800" }, () => "new")).toBe(value);
    expect(value.adjustments[0].proposed_amount).toBe(9600);
    const repaired = linkOperatingPlannedActivity(value, "annual", "a");
    expect(repaired.adjustments?.[0]).toMatchObject({ id: "annual", cadence: "monthly", current_amount: 1000, proposed_amount: null, explanation: "Keep rationale" });
  });

  it.each(["cadence", "cost_basis", "unit_label"] as const)("explicit current %s changes clear proposal dimensions, not historical NOI", key => {
    const value = setOperatingExpenseProposal(body(), "a", { amount: "800" }, () => "proposal");
    const next = updateOperatingExpense(value, "a", { [key]: key === "cadence" ? "annual" : key === "cost_basis" ? "per_unit" : "job" });
    expect(next.adjustments?.[0]).toMatchObject({ proposed_amount: null, proposed_units_per_period: null, proposed_unit_cost: null, proposed_fixed_amount: null, status: "proposed" });
    expect(next.category_confirmations?.rent).toBeUndefined(); expect(next.historical_noi).toBe(50000);
  });

  it("soft-removes current and linked planned changes, retaining group history and explicit restoration", () => {
    const value = setOperatingExpenseProposal(body(), "a", { amount: "800" }, () => "proposal");
    const removed = removeOperatingCurrentItem(value, "a");
    expect(removed.expenses?.[0]).toMatchObject({ id: "a", excluded: true, source_group_key: "irs-rent", source_file_ids: ["tax"] });
    expect(removed.adjustments?.[0]).toMatchObject({ id: "proposal", excluded: true, status: "proposed" });
    expect(operatingChangeCategories(removed, guidance)[0].groups[0].removedExpenses?.[0].id).toBe("a");
    const restored = restoreOperatingCurrentItem(removed, "a");
    expect(restored.expenses?.[0].excluded).toBe(false);
    expect(restored.adjustments?.[0].excluded).toBe(true);
    expect(restored.historical_noi).toBe(50000);
  });

  it("keeps deliberately cleared dates and blank evidence unknown on later proposal edits", () => {
    const value = setOperatingExpenseProposal(body(), "a", { amount: "800" }, () => "proposal");
    value.adjustments![0].effective_date = null;
    const next = setOperatingExpenseProposal(value, "a", { amount: "750" }, () => "wrong");
    expect(next.adjustments?.[0].effective_date).toBeNull();
    expect(next.adjustments?.[0].source_note).toBeUndefined();
    const activity = addOperatingPlannedActivity(body(), operatingChangeCategories(body(), guidance)[0].groups[0], "activity");
    expect(activity.adjustments?.[0].source_note).toBe("");
  });

  it("tolerates partial guidance without dropping body-owned group IDs", () => {
    const partial = { ...guidance, expense_groups: undefined } as unknown as OperatingGuidance;
    expect(operatingChangeCategories(body(), partial)[0].groups[0]).toMatchObject({ sourceGroupKey: "irs-rent", expenses: body().expenses });
  });

  it("upserts the active proposal without selecting or reactivating a rejected historical action", () => {
    const value = body();
    const rejected = { id: "rejected", kind: "expense_reduction" as const, expense_row_id: "a", current_amount: 1000, proposed_amount: 500, cadence: "monthly" as const, status: "rejected" as const, review_reason: "Not feasible" };
    value.adjustments = [rejected, { id: "active", kind: "expense_reduction", expense_row_id: "a", current_amount: 1000, proposed_amount: 800, cadence: "monthly" }];
    expect(linkedExpenseChanges(value, "a").map(row => row.id)).toEqual(["active"]);
    const next = setOperatingExpenseProposal(value, "a", { amount: "850" }, () => "wrong");
    expect(next.adjustments?.[0]).toEqual(rejected);
    expect(next.adjustments?.[1]).toMatchObject({ id: "active", proposed_amount: "850" });
    expect(operatingChangeCategories(next, guidance)[0].groups[0].rejectedActivities?.[0]).toEqual(rejected);
    expect(updateOperatingExpense(next, "a", { current_amount: 1100 }).adjustments?.[0]).toEqual(rejected);
  });

  it("ordinary current amount edits preserve proposed amounts, and specialized activity dimensions are not converted", () => {
    const value = setOperatingExpenseProposal(body(), "a", { amount: "800" }, () => "proposal");
    value.adjustments!.push({ id: "product", kind: "price_change", expense_row_id: "a", cadence: "weekly", units_per_period: 20, current_unit_price: 5, proposed_unit_price: 6, source_note: "Keep product assumptions" });
    const next = updateOperatingExpense(value, "a", { current_amount: "1100" });
    expect(next.adjustments?.[0].proposed_amount).toBe("800");
    expect(next.adjustments?.[1]).toMatchObject({ kind: "price_change", cadence: "weekly", units_per_period: 20, current_unit_price: 5, proposed_unit_price: 6, source_note: "Keep product assumptions" });
  });
});
