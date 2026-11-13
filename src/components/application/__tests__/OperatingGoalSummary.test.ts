import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OperatingGoalSummary, StaffOperatingGoal } from "../OperatingGoalSummary";
import { OperatingPlanCommands } from "../OperatingPlanCommands";
import type { OperatingPlanBody, OperatingEvaluation } from "@/lib/operatingPlan";
import { ReleasedCashFlowAllocation } from "../ReleasedCashFlowAllocation";
import type { OperatingGoalRead, OperatingGoalProgress, OperatingCashBridge } from "@/lib/operatingGoal";
const goal: OperatingGoalRead = { status: "set", metric: "annual_noi", amount: 18000, currency: "USD", revision: 1, updated_at: null };
const progress: OperatingGoalProgress = { metric: "annual_noi", status: "calculated", goal_revision: 1, currency: "USD", current_noi: -15000, zero: 0, proposed_noi: 10000, reviewed_noi: null, target: 18000, current_gap: 33000, proposed_gap: 8000, reviewed_gap: null, current_year: 2025, notes: [] };
describe("compact annual NOI goal display", () => {
  it("starts staff setup with no target amount and no example default", () => { const html = renderToStaticMarkup(createElement(StaffOperatingGoal, { goal: { ...goal, status: "awaiting_staff", amount: null }, onSave: async () => undefined })); expect(html).toContain('aria-label="Annual NOI goal"'); expect(html).not.toContain("250000"); expect(html).not.toContain("18000"); });
  it("shows signed current, zero, goal and exact canonical gap", () => { const html = renderToStaticMarkup(createElement(OperatingGoalSummary, { goal, progress })); expect(html).toContain("-$15,000.00"); expect(html).toContain("$10,000.00"); expect(html).toContain("$8,000.00"); expect(html).toContain("$18,000.00"); expect(html).toContain("<svg"); expect(html).toContain("zero"); });
  it("keeps current source figures while hiding earlier projected money during refresh", () => { const html = renderToStaticMarkup(createElement(OperatingGoalSummary, { goal, progress, baseline: progress, pending: true })); expect(html).toContain("-$15,000.00"); expect(html).not.toContain("$10,000.00"); expect(html).not.toContain("$8,000.00"); expect(html).toContain("Updating"); });
  it("does not mix another goal revision or currency into the line", () => { const changed = renderToStaticMarkup(createElement(OperatingGoalSummary, { goal, progress: { ...progress, goal_revision: 2 } })); expect(changed).toContain("Changed"); expect(changed).not.toContain("<svg"); expect(changed).not.toContain("$10,000.00"); const mismatch = renderToStaticMarkup(createElement(OperatingGoalSummary, { goal, progress: { ...progress, status: "currency_mismatch", currency: "EUR" } })); expect(mismatch).not.toContain("<svg"); expect(mismatch).toContain("no conversion"); });
  it("labels a canonical gross-only draft separately from full planned NOI", () => { const html = renderToStaticMarkup(createElement(OperatingGoalSummary, { goal, progress: { ...progress, proposed_noi: null, proposed_gap: null, draft_noi_before_implementation: -12360, draft_gap: 30360, draft_basis: "before_implementation_costs_and_timing" } })); expect(html).toContain("Before setup"); expect(html).toContain("-$12,360.00"); expect(html).toContain("$30,360.00"); });
});
describe("canonical loan cash bridge", () => {
  const bridge = { status: "complete", available: true, stale: false, currency: "USD", net_loan_cash_change_monthly: 500, recurring_cash_released_monthly: 100, allocated_monthly: 77, unallocated_monthly: 23, allocations: [], missing: [], notes: [] } as unknown as OperatingCashBridge;
  it("uses canonical allocation totals instead of recomputing from working rows", () => { const html = renderToStaticMarkup(createElement(ReleasedCashFlowAllocation, { value: { released_cash_flow: { source_fingerprint: null, allocations: [{ id: "one", label: "Reserve", amount_monthly: 100, purpose: "reserve", notes: "" }, { id: "two", label: "Other", amount_monthly: 200, purpose: "other", notes: "" }] } }, bridge, onChange: () => undefined })); expect(html).toContain("$77.00"); expect(html).toContain("$23.00"); expect(html).not.toContain("$300.00"); expect(html).not.toContain("Capacity Unknown"); });
  it("keeps explicit acknowledgment reachable when a current available loan source makes allocations stale", () => {
    const html = renderToStaticMarkup(createElement(ReleasedCashFlowAllocation, { value: { released_cash_flow: { source_fingerprint: "old", allocations: [] } }, bridge: { ...bridge, required: true, stale: true, source_fingerprint: "new" }, onChange: () => undefined }));
    expect(html).toContain("Use saved coverage plan"); expect(html).not.toContain("Your team can confirm");
  });
  it("shows the canonical saved-charge repair reason when strict bridge inputs are unavailable", () => {
    const html = renderToStaticMarkup(createElement(ReleasedCashFlowAllocation, { value: { released_cash_flow: { source_fingerprint: "old", allocations: [] } }, bridge: { ...bridge, required: true, available: false, missing: ["Confirm recurring charges, including explicit zero charges."] }, onChange: () => undefined }));
    expect(html).toContain("Confirm recurring charges"); expect(html).not.toContain("Use saved coverage plan");
  });
  it("masks stale and refreshing loan/remaining figures", () => { const html = renderToStaticMarkup(createElement(ReleasedCashFlowAllocation, { value: { released_cash_flow: { source_fingerprint: "old", allocations: [] } }, bridge: { ...bridge, stale: true }, onChange: () => undefined })); expect(html).not.toContain("$500.00"); expect(html).not.toContain("$23.00"); expect(html).toContain("Unknown"); });
});

describe("saved explicit expense proposals", () => {
  const value: OperatingPlanBody = { currency: "USD", expenses: [{ id: "rent", label: "Rent", category: "rent", cadence: "monthly", current_amount: 1000 }], adjustments: [{ id: "rent-change", expense_row_id: "rent", kind: "expense_reduction", label: "Rent", cadence: "monthly", current_amount: 1000, proposed_amount: 920 }] };
  const evaluation = (after: number | null, effect: number | null) => ({ baseline: { noi: -15000, currency: "USD" }, projection: { proposed: { noi: null }, approved: { noi: null } }, actions: [], expense_changes: { rows: [{ expense_row_id: "rent", action_ids: ["rent-change"], completion_missing: [], issues: [], included_in_proposed_projection: false, proposed_period_cost: after, proposed_cadence: "monthly", gross_annual_effect: effect }], categories: [], source_groups: [] } }) as unknown as OperatingEvaluation;
  it("shows the canonical period total and annual effect for a legacy direct proposal", () => { const html = renderToStaticMarkup(createElement(OperatingPlanCommands, { value, evaluation: evaluation(920, 960), onChange: vi.fn(), onEditUnits: vi.fn(), onAddUnitPlan: vi.fn() })); expect(html).toContain("$920.00"); expect(html).toContain("$960.00"); expect(html).toContain('aria-label="Proposed total rent"'); });
  it("preserves canonical unknown instead of deriving profit from retained input values", () => { const html = renderToStaticMarkup(createElement(OperatingPlanCommands, { value, evaluation: evaluation(null, null), onChange: vi.fn(), onEditUnits: vi.fn(), onAddUnitPlan: vi.fn() })); expect(html).not.toContain("$920.00"); expect(html).not.toContain("$960.00"); expect(html).toContain("Unknown"); });
});
