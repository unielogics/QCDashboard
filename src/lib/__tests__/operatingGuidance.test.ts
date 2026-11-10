import { describe, expect, it } from "vitest";
import { addOperatingCandidate, addOperatingGroup, operatingChangeExplanation, operatingRatioChangeExplanation, operatingRecurringSubtotal, unansweredOperatingCategories, updateOperatingExpense, type OperatingExpenseGroup, type OperatingGuidance } from "../operatingGuidance";
import { illustrativeActionImpact, linkOperatingActionExpense, normalizeOperatingPlanBody, type OperatingPlanBody } from "../operatingPlan";

const group: OperatingExpenseGroup = { key: "tax:officer_compensation:2025", category: "salaries", label: "Officer compensation", baseline_annual_amount: 120000, currency: "USD", year: 2025, basis: "cash", source_file_ids: ["tax"], source_label: "2025 business return", source_fact_keys: ["officer_compensation"], notes: ["Confirm the current amount"] };

describe("guided operating plan draft transitions", () => {
  it("shows unknown recurring subtotals until a recurring amount is quantified, including an explicit zero", () => {
    expect(operatingRecurringSubtotal([{ id: "unknown", current_amount: null, cadence: "monthly" }])).toMatchObject({ annual: null, incomplete: true });
    expect(operatingRecurringSubtotal([{ id: "zero", current_amount: 0, cadence: "monthly" }])).toEqual({ annual: 0, missing: 0, incomplete: false });
    expect(operatingRecurringSubtotal([{ id: "one-time", current_amount: 500, cadence: "one_time" }]).annual).toBeNull();
  });
  it("labels a partial recurring subtotal incomplete without dropping its known rows", () => {
    const rows = [{ id: "known", current_amount: 100, cadence: "monthly" as const }, { id: "unknown", current_amount: null, cadence: "monthly" as const }];
    const before = structuredClone(rows);
    expect(operatingRecurringSubtotal(rows)).toEqual({ annual: 1200, missing: 1, incomplete: true });
    expect(rows).toEqual(before);
  });
  it("explicitly adopts distinct same-category source groups once without changing source facts", () => {
    const source = structuredClone(group);
    const empty: OperatingPlanBody = { expenses: [], adjustments: [], notes: "Keep this plan note" };
    const one = addOperatingGroup(empty, group, "officers");
    const repeated = addOperatingGroup(one, group, "duplicate");
    expect(repeated).toBe(one);
    const two = addOperatingGroup(one, { ...group, key: "tax:wages:2025", label: "Employee wages", baseline_annual_amount: null }, "wages");
    expect(two.expenses).toHaveLength(2);
    expect(two.expenses![0]).toMatchObject({ id: "officers", category: "salaries", current_amount: 120000, cadence: "annual", source_group_key: group.key, source_candidate_key: group.key });
    expect(two.expenses![1].current_amount).toBeNull();
    expect(two.notes).toBe("Keep this plan note");
    expect(empty.expenses).toEqual([]);
    expect(group).toEqual(source);
  });
  it("does not adopt the same aggregate again through the source-candidate list", () => {
    const body = addOperatingGroup({}, group, "group-row");
    const candidate = { source_group_key: group.key, source_candidate_key: group.key, label: group.label, current_amount: 120000, cadence: "annual" };
    expect(addOperatingCandidate(body, candidate, "candidate-row")).toBe(body);
    expect(body.expenses).toHaveLength(1);
  });
  it("preserves granular group details instead of appending their source aggregate", () => {
    const body: OperatingPlanBody = { expenses: [{ id: "director", category: "salaries", source_group_key: group.key, label: "Director pay", current_amount: 70000, cadence: "annual" }, { id: "manager", category: "salaries", source_group_key: group.key, label: "Manager pay", current_amount: 50000, cadence: "annual" }] };
    const before = structuredClone(body);
    const next = addOperatingCandidate(body, { source_group_key: group.key, source_candidate_key: group.key, current_amount: 120000 }, "aggregate");
    expect(next).toBe(body);
    expect(next.expenses).toHaveLength(2);
    expect(next).toEqual(before);
  });
  it("retains changed client amounts on repeated suggestion adoption and restores the same removed row", () => {
    const candidate = { source_candidate_key: "statement:rent", bank_vendor_key: "rent-vendor", label: "Office rent", category: "rent", current_amount: 2000, cadence: "monthly", source_file_ids: ["bank"] };
    const one = addOperatingCandidate({}, candidate, "expense");
    const edited = updateOperatingExpense(one, "expense", { current_amount: "2400.05" });
    expect(addOperatingCandidate(edited, candidate, "another")).toBe(edited);
    const removed = updateOperatingExpense(edited, "expense", { excluded: true });
    const restored = addOperatingCandidate(removed, candidate, "third");
    expect(restored.expenses).toHaveLength(1);
    expect(restored.expenses![0]).toMatchObject({ id: "expense", current_amount: "2400.05", excluded: false });
  });
  it("reconciles linked proposed actions while clearing stale approval and category confirmation only", () => {
    const body: OperatingPlanBody = { category_confirmations: { marketing: "confirmed", rent: "not_applicable" }, expenses: [{ id: "ad-spend", category: "marketing", label: "Advertising", current_amount: 1000, cadence: "monthly", source_file_ids: ["old"] }], adjustments: [{ id: "growth", kind: "marketing_investment", expense_row_id: "ad-spend", current_amount: 1000, proposed_amount: 1500, product_name: "Service visits", revenue_return_multiple: "2.5", contribution_margin_pct: 60, status: "approved", source_file_ids: ["old", "quote"], review_reason: "Prior review" }] };
    const next = updateOperatingExpense(body, "ad-spend", { current_amount: 1100, source_file_ids: ["new"] });
    expect(next.category_confirmations).toEqual({ rent: "not_applicable" });
    expect(next.adjustments![0]).toMatchObject({ current_amount: 1100, proposed_amount: 1500, product_name: "Service visits", revenue_return_multiple: "2.5", status: "proposed", review_reason: "", source_file_ids: ["quote", "new"] });
    expect(body.adjustments![0].status).toBe("approved");
  });
  it("links granular marketing costs as total spend while retaining proposed return and product inputs", () => {
    const body: OperatingPlanBody = { expenses: [{ id: "campaigns", category: "marketing", cost_basis: "per_unit", current_units_per_period: 8, current_unit_cost: 100, current_fixed_amount: 50, cadence: "monthly" }], adjustments: [{ id: "growth", kind: "marketing_investment", driver_key: "service-visits", product_name: "Service visits", proposed_amount: 1200, revenue_return_multiple: 2.5, contribution_margin_pct: 60, source_note: "Retain this assumption" }] };
    const linked = linkOperatingActionExpense(body, "growth", "campaigns");
    expect(linked.adjustments![0]).toMatchObject({ cost_basis: "total", current_amount: 850, cadence: "monthly", proposed_amount: 1200, revenue_return_multiple: 2.5, product_name: "Service visits", driver_key: "service-visits", source_note: "Retain this assumption" });
    expect(updateOperatingExpense(linked, "campaigns", { current_units_per_period: 9 }).adjustments![0]).toMatchObject({ cost_basis: "total", current_amount: 950, proposed_amount: 1200, revenue_return_multiple: 2.5 });
  });
  it("does not turn missing granular marketing quantities into zero current spend", () => {
    const body: OperatingPlanBody = { expenses: [{ id: "campaigns", category: "marketing", cost_basis: "per_unit", current_units_per_period: null, current_unit_cost: 100, current_fixed_amount: 0, cadence: "monthly" }], adjustments: [{ id: "growth", kind: "marketing_investment", proposed_amount: 1200, revenue_return_multiple: 2.5 }] };
    const linked = linkOperatingActionExpense(body, "growth", "campaigns");
    expect(linked.adjustments![0]).toMatchObject({ cost_basis: "total", current_amount: null, proposed_amount: 1200, revenue_return_multiple: 2.5 });
    expect(updateOperatingExpense(linked, "campaigns", { current_fixed_amount: null }).adjustments![0].current_amount).toBeNull();
  });
  it("keeps unknown and zero marketing assumptions distinct and leaves ROI math to the evaluator", () => {
    const next = normalizeOperatingPlanBody({ adjustments: [{ id: "unknown", revenue_return_multiple: "", contribution_margin_pct: "0" }, { id: "entered", revenue_return_multiple: "2.5" }] });
    expect(next.adjustments[0]).toMatchObject({ revenue_return_multiple: null, contribution_margin_pct: 0 });
    expect(next.adjustments[1].revenue_return_multiple).toBe(2.5);
    expect(illustrativeActionImpact({ id: "growth", kind: "marketing_investment", current_amount: 1000, proposed_amount: 1500, revenue_return_multiple: 2.5, contribution_margin_pct: 60, implementation_cost: 0 })).toBeNull();
  });
  it("requires every guided basic answer without changing legacy bodies or treating help as silence", () => {
    const guidance = { essentials: [{ category: "rent", label: "Rent", prompt: "Confirm rent" }, { category: "salaries", label: "Payroll", prompt: "Confirm payroll" }] } as OperatingGuidance;
    const body: OperatingPlanBody = { category_confirmations: { rent: "needs_help" } };
    expect(unansweredOperatingCategories(body, guidance).map(row => row.label)).toEqual(["Payroll"]);
    expect(unansweredOperatingCategories({ category_confirmations: { rent: "not_applicable", salaries: "confirmed" } }, guidance)).toEqual([]);
    expect(body).toEqual({ category_confirmations: { rent: "needs_help" } });
  });
});

describe("signed scenario explanations", () => {
  it("distinguishes a reduced loss from crossing zero without a misleading percentage gain", () => {
    expect(operatingChangeExplanation(-40000, -10000)).toMatchObject({ tone: "improved", text: expect.stringContaining("remains below zero") });
    expect(operatingChangeExplanation(-40000, 10000).text).toContain("crosses from a loss");
    expect(operatingChangeExplanation(-1000, null).tone).toBe("unknown");
    expect(operatingChangeExplanation(1000, 0).tone).toBe("worse");
  });
  it("shows positive ratio change while retaining the undercoverage warning", () => {
    expect(operatingRatioChangeExplanation(-0.25, 0.06)).toEqual({ tone: "improved", text: "Improves by 0.31x; coverage remains below 1.00x." });
    expect(operatingRatioChangeExplanation(1.25, 0.9).tone).toBe("worse");
    expect(operatingRatioChangeExplanation(null, 0.9).tone).toBe("unknown");
  });
});
