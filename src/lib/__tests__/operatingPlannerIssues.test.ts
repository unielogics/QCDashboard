import { describe, expect, it } from "vitest";
import { operatingGroupConflictPairs, operatingPlannerIssueLabel, operatingPlannerIssues, operatingPrerequisiteIssues } from "../operatingPlannerIssues";
import type { OperatingEvaluation, OperatingPlanBody } from "../operatingPlan";
const body = (): OperatingPlanBody => ({ period_start: "2025-01-01", period_end: "2025-12-31", currency: "USD", expenses: [{ id: "rent", label: "Rent", category: "rent", current_amount: 0 }], adjustments: [], category_confirmations: Object.fromEntries(["rent", "salaries", "marketing", "utilities", "insurance", "cogs"].map(key => [key, key === "rent" ? "confirmed" : "not_applicable"])) });
const evaluation = (patch: Record<string, unknown> = {}) => ({ baseline: { noi: 0, noi_currency: "USD", currency: "CAD", noi_staff_reviewed: true, noi_governance: { status: "reviewed", currency: "USD" } }, draft_feedback: { actions: [], summary: { baseline_ready: true, complete: true, metric_issues: { noi: [], earnings: [], cash: [] } } }, ...patch }) as unknown as OperatingEvaluation;
describe("planner prerequisite and direct repair state", () => {
 it("accepts a governed manual source and explicit zero without requiring automatic tax groups", () => { expect(operatingPlannerIssues(body(), evaluation())).toEqual([]); });
 it("does not treat a populated NOI as a current source when the canonical gate says no", () => { const e = evaluation(); e.draft_feedback!.summary.baseline_ready = false; expect(operatingPrerequisiteIssues(operatingPlannerIssues(body(), e))).toEqual([expect.objectContaining({ step: 0, field: "baseline.noi" })]); });
 it("preserves explicit unknown NOI currency instead of borrowing earnings/plan currency", () => { const e = evaluation(); e.baseline.noi_governance!.currency = null; e.baseline.noi_currency = null; expect(operatingPlannerIssues(body(), e).some(row => row.field === "baseline.noi")).toBe(true); });
 it("exposes missing current amount and category confirmation before planning without changing either", () => { const b = body(); b.expenses![0].current_amount = null; delete b.category_confirmations!.rent; const before = JSON.stringify(b), rows = operatingPlannerIssues(b, evaluation()); expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({ field: "category_confirmations.rent", step: 1 }), expect.objectContaining({ field: "expenses.rent.current_amount", step: 1 })])); expect(JSON.stringify(b)).toBe(before); });
 it("keeps deliberate help visible and does not replace it with fake costs", () => { const b = body(); b.category_confirmations!.salaries = "needs_help"; expect(operatingPlannerIssues(b, evaluation())).toEqual([expect.objectContaining({ category: "salaries", step: 1 })]); expect(b.expenses).toHaveLength(1); });
 it("requires every per-unit component but accepts explicit fixed zero", () => { const b = body(); Object.assign(b.expenses![0], { cost_basis: "per_unit", current_amount: 50, current_units_per_period: 5, current_unit_cost: 10, current_fixed_amount: 0 }); expect(operatingPlannerIssues(b, evaluation())).toEqual([]); b.expenses![0].current_unit_cost = null; expect(operatingPlannerIssues(b, evaluation())).toEqual([expect.objectContaining({ field: "expenses.rent.current_unit_cost" })]); });
 it("ignores removed/history records but retains a source ledger with no active children", () => { const b = body(); b.expenses![0].excluded = true; const e = evaluation({ itemization: [{ parent_expense_row_id: "rent", source_group_key: "source", status: "unallocated", child_expense_row_ids: [] }] }); expect(operatingPlannerIssues(b, e)).toEqual([expect.objectContaining({ field: "expenses.rent.itemization.unallocated" })]); });
 it("keeps documented handoff differences separate from normal planning prerequisites", () => { const b = body(); b.historical_corrections = [{ source_group_key: "source", reason: "Prepare review", evidence_note: "Named source", source_file_ids: [] }]; const e = evaluation({ itemization: [{ parent_expense_row_id: "rent", source_group_key: "source", status: "unknown", child_expense_row_ids: [] }] }); expect(operatingPlannerIssues(b, e)).toEqual([expect.objectContaining({ step: 1, field: "expenses.rent.itemization.unknown" })]); });
 it("requires Why and setup without inventing dates or mandatory evidence", () => { const b = body(); b.adjustments = [{ id: "a", label: "Rent change", command: { target: "total_cost", mode: "percent", direction: "decrease", value: 0 } }]; const rows = operatingPlannerIssues(b, evaluation()); expect(rows.every(row => row.step === 2)).toBe(true); expect(rows.map(row => row.field)).toEqual(expect.arrayContaining(["adjustments.a.implementation_cost", "adjustments.a.explanation"])); expect(rows.some(row => /effective_date|source_note|owner_name/.test(row.field))).toBe(false); expect(rows.some(row => row.field.endsWith("command.value"))).toBe(false); expect(b.adjustments[0].implementation_cost).toBeUndefined(); });
 it("does not convert optional debt-denominator gaps into a hard save prerequisite", () => { const e = evaluation(); e.draft_feedback!.summary.missing = ["annual_debt_service"]; expect(operatingPlannerIssues(body(), e)).toEqual([]); });
 it("routes affected cost source issues to Step2 independently of the valid NOI source", () => { const b = body(); b.adjustments = [{ id: "a", label: "Cost change", driver_key: "a", expense_row_id: "rent", effective_date: "2026-01-01", implementation_cost: 0, explanation: "Entered plan", source_note: "Baseline reference" }]; const e = evaluation(); e.draft_feedback!.actions = [{ action_id: "a", math_missing: [], qualification_missing: [], source_issues: ["Current source differs"] } as never]; const rows = operatingPlannerIssues(b, e); expect(rows).toEqual([expect.objectContaining({ step: 1, expenseId: "rent" })]); expect(rows.some(row => row.step === 0)).toBe(false); });
});

describe("cash assignment repair prerequisites", () => {
 it("routes a requested but blocked loan source to its source owner without invalidating the NOI source", () => { const e = evaluation({ cash_bridge: { required: true, available: false, loan_status: "source_blocked", allocations: [], missing: [] } }); expect(operatingPlannerIssues(body(), e)).toEqual([expect.objectContaining({ step: 0, field: "loan_source" })]); });
 it("requires explicit acknowledgement of changed funding without inventing an allocation", () => { const b = body(); b.released_cash_flow = { source_fingerprint: "old", allocations: [] }; const e = evaluation({ cash_bridge: { required: true, available: true, stale: true, loan_status: "calculated", source_fingerprint: "new", unallocated_monthly: 0, allocations: [], missing: [] } }); expect(operatingPlannerIssues(b, e)).toEqual([expect.objectContaining({ step: 2, field: "released_cash_flow.source_fingerprint" })]); expect(b.released_cash_flow.allocations).toEqual([]); });
 it("routes unknown linked capacity to its actual missing activity field instead of an unrelated amount", () => { const b = body(); b.adjustments = [{ id: "a", label: "Growth", effective_date: "2026-01-01", implementation_cost: 0, explanation: "Entered", source_note: "Reference" }]; b.released_cash_flow = { source_fingerprint: "saved", allocations: [{ id: "fund", label: "Growth funding", purpose: "planned_increment", action_id: "a", expense_row_id: "rent", amount_monthly: 100, notes: "" }] }; const e = evaluation({ cash_bridge: { required: true, available: true, stale: false, loan_status: "calculated", source_fingerprint: "saved", unallocated_monthly: 0, allocations: [{ id: "fund", issues: ["linked_capacity_unknown"] }], missing: [] } }); e.draft_feedback!.actions = [{ action_id: "a", math_missing: ["adjustments.a.revenue_return_multiple"], qualification_missing: [], source_issues: [] } as never]; const rows = operatingPlannerIssues(b, e); expect(rows).toContainEqual(expect.objectContaining({ actionId: "a", field: "adjustments.a.revenue_return_multiple", step: 2 })); expect(rows.some(row => row.field === "released_cash_flow.allocations.fund.amount_monthly")).toBe(false); });
});

it("requires explicit repair when a retained recorded total disagrees with known current unit components", () => { const b = body(); Object.assign(b.expenses![0], { cost_basis: "per_unit", current_amount: 20, current_units_per_period: 10, current_unit_cost: 2, current_fixed_amount: 5 }); const before = JSON.stringify(b); expect(operatingPlannerIssues(b, evaluation())).toEqual([expect.objectContaining({ step: 1, expenseId: "rent", field: "expenses.rent.reconcile_current_amount" })]); expect(JSON.stringify(b)).toBe(before); });

it("uses the complete enhanced funding pool instead of stale legacy loan fields", () => { const b = body(); b.released_cash_flow = { source_fingerprint: "composite", allocations: [{ id: "r", label: "Retain cash", purpose: "reserve", amount_monthly: 3600, notes: "" }] }; const e = evaluation({ cash_bridge: { available: true, required: true, complete: false, stale: true, source_fingerprint: "old-loan-only", unallocated_monthly: -100, loan_status: "calculated", funding_available: true, funding_required: true, funding_complete: true, funding_stale: false, funding_source_fingerprint: "composite", funding_unallocated_monthly: 0, funding_missing: [], allocations: [{ id: "r", issues: [] }], missing: ["released_cash_flow.source_fingerprint.stale"] } }); expect(operatingPlannerIssues(b, e)).toEqual([]); });
it("does not replace explicit unavailable/null enhanced funding with known legacy loan amounts", () => { const b = body(); const e = evaluation({ cash_bridge: { available: true, required: true, stale: true, source_fingerprint: "old", unallocated_monthly: -100, loan_status: "calculated", funding_available: false, funding_required: false, funding_complete: true, funding_stale: false, funding_source_fingerprint: null, funding_unallocated_monthly: null, funding_missing: [], allocations: [], missing: [] } }); expect(operatingPlannerIssues(b, e)).toEqual([]); });
it("keeps allocation input requirements live during a pending canonical request", () => { const b = body(); b.released_cash_flow = { source_fingerprint: "fp", allocations: [{ id: "r", label: "", purpose: null, amount_monthly: null, notes: "" }] }; const paths = operatingPlannerIssues(b, evaluation(), null, { serverCurrent: false }).map(row => row.field); expect(paths).toEqual(["released_cash_flow.allocations.r.label", "released_cash_flow.allocations.r.purpose", "released_cash_flow.allocations.r.amount_monthly"]); });

it("keeps positive enhanced funding as cash without forcing rows or acknowledgement", () => { const b = body(); const e = evaluation({ cash_bridge: { available: true, required: true, stale: true, source_fingerprint: "legacy", unallocated_monthly: 3500, loan_status: "calculated", funding_available: true, funding_required: false, funding_complete: true, funding_stale: false, funding_source_fingerprint: "pool", funding_unallocated_monthly: 3600, funding_missing: [], allocations: [], missing: [] } }); expect(operatingPlannerIssues(b, e)).toEqual([]); expect(b.released_cash_flow).toBeUndefined(); });
it("retains a negative enhanced overassignment as a real repair requirement", () => { const b = body(); const e = evaluation({ cash_bridge: { funding_available: true, funding_required: true, funding_complete: false, funding_source_fingerprint: "pool", funding_unallocated_monthly: -100, funding_missing: ["released_cash_flow.allocations.full_release"], allocations: [], missing: [] } }); const rows = operatingPlannerIssues(b, e); expect(rows).toHaveLength(1); expect(rows[0].field).toBe("released_cash_flow.allocations.overallocated"); });

it("names overlapping category and marketing changes while retaining each canonical repair path", () => {
  const groupId = "c6e0c430-415e-434a-a854-6c4800f3d818", marketingId = "42e24f04-3561-4b92-96bd-c08bd0cf6824";
  const b = body();
  b.expenses = [{ id: "campaign", label: "Google Ads", category: "marketing", current_amount: 1000, cadence: "monthly" }];
  b.category_confirmations = { ...b.category_confirmations, rent: "not_applicable", marketing: "confirmed" };
  b.adjustments = [
    { id: groupId, kind: "expense_group_change", label: "Marketing budget reduction", expense_category: "marketing", implementation_cost: 0, explanation: "Reduce the category budget", command: { target: "total_cost", mode: "percent", direction: "decrease", value: 10, allocation: "proportional" } },
    { id: marketingId, kind: "marketing_investment", label: "Google Ads growth", product_name: "Detail package", expense_row_id: "campaign", current_amount: 1000, proposed_amount: 1200, revenue_return_multiple: 3, contribution_margin_pct: 50, implementation_cost: 0, explanation: "Run an additional campaign" },
  ];
  const pair = `Group command ${groupId} overlaps action ${marketingId}; keep one group or item treatment before modeling the same costs.`;
  const aggregate = `Group command overlaps item/group actions: ${marketingId}`;
  const e = evaluation();
  e.draft_feedback!.actions = [
    { action_id: groupId, math_missing: [pair, aggregate], qualification_missing: [], source_issues: [] } as never,
    { action_id: marketingId, math_missing: [pair], qualification_missing: [], source_issues: [] } as never,
  ];
  const before = JSON.stringify(b);
  const conflicts = operatingPlannerIssues(b, e).filter(row => row.label.includes("overlaps"));
  expect(conflicts).toHaveLength(3);
  expect(conflicts[0]).toMatchObject({
    actionId: groupId, step: 2, field: `adjustments.${groupId}.${pair}`,
    label: "Marketing budget reduction overlaps Google Ads growth. Keep either the category change or the individual change.",
    diagnostic: `Marketing budget reduction: ${pair}`,
  });
  expect(conflicts.every(row => row.label.includes("Marketing budget reduction") && row.label.includes("Google Ads growth"))).toBe(true);
  expect(conflicts.every(row => !row.label.includes(groupId) && !row.label.includes(marketingId))).toBe(true);
  expect(conflicts[2].actionId).toBe(marketingId);
  expect(operatingGroupConflictPairs(b, e, groupId)).toEqual([{
    groupId, individualId: marketingId, groupLabel: "Marketing budget reduction", individualLabel: "Google Ads growth",
  }]);
  expect(operatingGroupConflictPairs(b, e, marketingId)).toEqual(operatingGroupConflictPairs(b, e, groupId));
  expect(operatingGroupConflictPairs(b, evaluation(), groupId)).toEqual([]);
  const removed = { ...b, adjustments: b.adjustments.map(row => row.id === marketingId ? { ...row, excluded: true } : row) };
  expect(operatingGroupConflictPairs(removed, e, groupId)).toEqual([]);
  expect(JSON.stringify(b)).toBe(before);
});

it("uses linked cost names and readable fallbacks when conflict references lack an action label", () => {
  const b = body();
  b.adjustments = [{ id: "group", kind: "expense_group_change", expense_category: "marketing" }, { id: "item", expense_row_id: "rent" }];
  expect(operatingPlannerIssueLabel("Group command group overlaps action item; keep one treatment", b)).toBe("Marketing category change overlaps Rent. Keep either the category change or the individual change.");
  const missing = "39f3c1ea-faf6-4873-84f9-8d3f9a154dd0";
  expect(operatingPlannerIssueLabel(`Action ${missing} also models this cost.`, b)).toBe("Action another planned change also models this cost.");
});
