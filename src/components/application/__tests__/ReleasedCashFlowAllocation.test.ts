import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReleasedCashFlowAllocation } from "../ReleasedCashFlowAllocation";
import { normalizeOperatingPlanBody, type OperatingPlanBody, type ReleasedCashFlowEvaluation } from "@/lib/operatingPlan";
import type { OperatingCashBridge } from "@/lib/operatingGoal";
import type { OperatingWorkingProjection } from "@/lib/operatingPlanFeedback";

const source: ReleasedCashFlowEvaluation = {
  required: true, available: true, status: "allocation_required", source_fingerprint: "saved-plan-2", currency: "USD",
  amount_monthly: 1200, allocated_monthly: 500, unallocated_monthly: 700, complete: false, missing: [],
  source: { updated_at: "2026-11-10T12:00:00Z", before_monthly: 5000, after_monthly: 3800 },
};
const body = (fingerprint: string | null = source.source_fingerprint, amount: number | string = 500): OperatingPlanBody => ({
  currency: "USD", expenses: [], adjustments: [], released_cash_flow: { source_fingerprint: fingerprint, allocations: [{ id: "allocation", label: "Cash reserve", purpose: "reserve", amount_monthly: amount, notes: "Preserve this explanation" }] },
});
const bridge: OperatingCashBridge = {
  status: "incomplete", available: true, stale: false, source_fingerprint: "saved-plan-2", currency: "USD", required: true, complete: false,
  before_debt_service_monthly: 5000, after_debt_service_monthly: 3800, before_debt_service_annual: 60000, after_debt_service_annual: 45600,
  new_operating_charges_monthly: 0, new_financing_fees_monthly: 0, gross_loan_relief_monthly: 1200,
  net_loan_cash_change_monthly: 1200, net_loan_cash_change_annual: 14400, recurring_cash_released_monthly: 1200, recurring_cash_released_annual: 14400,
  allocated_monthly: 500, allocated_annual: 6000, unallocated_monthly: 700, unallocated_annual: 8400,
  modeled_operations_monthly: 0, modeled_operations_annual: 0, combined_incremental_monthly: 1200, combined_incremental_annual: 14400,
  loan_status: "calculated", loan_missing: [], loan_fix_fields: [], operations_status: "no_changes", operations_missing: [],
  allocations: [{ id: "allocation", purpose: "reserve", expense_row_id: null, action_id: null, amount_monthly: 500, capacity_monthly: null, status: "assigned", issues: [] }], missing: [], notes: [],
};
type Props = Parameters<typeof ReleasedCashFlowAllocation>[0];
const render = (value: OperatingPlanBody = body(), extra: Partial<Props> = {}) => renderToStaticMarkup(createElement(ReleasedCashFlowAllocation, { value, onChange: vi.fn(), source, bridge, ...extra }));
const working = (patch: Partial<OperatingWorkingProjection> = {}) => ({ basis: "after_setup_before_timing", cash_delta_monthly: 250, cash_delta_annual: 3000, combined_cash_change_monthly: 1450, combined_cash_change_annual: 17400, ...patch }) as OperatingWorkingProjection;
const active = () => ({ ...body(), adjustments: [{ id: "growth", kind: "marketing_investment" as const, label: "Growth activity" }] });

describe("canonical refinance cash and reinvestment", () => {
  it("shows the canonical monthly and annual release, assignments and remaining cash", () => {
    const html = render();
    for (const amount of ["$1,200.00", "$14,400.00", "$500.00", "$6,000.00", "$700.00", "$8,400.00"]) expect(html).toContain(amount);
    expect(html).toContain("Per year · run-rate"); expect(html).toContain("Retain remaining cash"); expect(html).toContain("Fund a planned activity"); expect(html).not.toContain("Unknown");
    expect(html).toContain("Financing fees are already included"); expect(html).toContain("does not subtract its cost a second time");
  });
  it("keeps known loan figures while operating inputs recalculate, but disables remaining-cash autofill", () => {
    const html = render(body(), { evaluating: true });
    expect(html).toContain("$14,400.00"); expect(html).toContain("$1,200.00");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Retain remaining cash<\/button>/);
  });
  it("never uses a previous allocation row set as current draft money", () => {
    const html = render(body(source.source_fingerprint, 600), { evaluating: true });
    expect(html).toContain("Checking assignments"); expect(html).not.toContain("$8,400.00"); expect(html).not.toContain("$6,000.00");
    expect(html).toContain("$14,400.00");
  });
  it("retains known current loan and recorded totals when source acknowledgement is stale", () => {
    const value = body("older-plan"), before = structuredClone(value);
    const html = render(value, { bridge: { ...bridge, stale: true, status: "stale" } });
    expect(html).toContain("Review these assignments"); expect(html).toContain("Use saved coverage plan");
    expect(html).toContain("$14,400.00"); expect(html).toContain("$8,400.00");
    expect(html).toContain("Preserve this explanation"); expect(value).toEqual(before);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Retain remaining cash<\/button>/);
  });
  it("selects current arithmetic after setup rather than a qualified but older operating result", () => {
    const old = { ...bridge, operations_status: "calculated" as const, modeled_operations_monthly: 111, modeled_operations_annual: 1332, combined_incremental_monthly: 1311, combined_incremental_annual: 15732 };
    const html = render(active(), { bridge: old, working: working() });
    expect(html).toContain("$250.00"); expect(html).toContain("$3,000.00"); expect(html).toContain("$1,450.00"); expect(html).toContain("$17,400.00");
    expect(html).not.toContain("$111.00"); expect(html).not.toContain("$15,732.00");
    const incomplete = render(active(), { bridge: old, working: working({ cash_delta_monthly: null, cash_delta_annual: null, combined_cash_change_monthly: null, combined_cash_change_annual: null }), onReviewTarget: vi.fn() });
    expect(incomplete).not.toContain("$1,332.00"); expect(incomplete).not.toContain("$15,732.00"); expect(incomplete).toContain("Finish activity inputs</button>");
  });
  it("shows an overall cash shortfall even when refinancing improves payment cash flow", () => {
    const html = render(active(), { bridge: { ...bridge, operations_status: "calculated" }, working: working({ cash_after_debt_after_annual: -5000 }) });
    expect(html).toContain("shortfall after debt payments"); expect(html).toContain("-$5,000.00 / year"); expect(html).toContain("$14,400.00");
  });
  it("shows the actual source repair instead of empty or green unknown figures", () => {
    const html = render(body(), { bridge: { ...bridge, available: false, loan_status: "source_blocked", currency: null, net_loan_cash_change_monthly: null, net_loan_cash_change_annual: null, recurring_cash_released_monthly: null, recurring_cash_released_annual: null, loan_missing: ["Confirm the debt-service currency."] } });
    expect(html).toContain("Confirm the debt-service currency"); expect(html).toContain("Ask your team"); expect(html).not.toContain("Unknown");
    expect(html).toContain("5,000.00 (confirm currency)");
  });
  it("keeps zero distinct from missing and flags canonical over-allocation without browser subtraction", () => {
    const html = render(body(), { bridge: { ...bridge, recurring_cash_released_monthly: 0, recurring_cash_released_annual: 0, unallocated_monthly: -500, unallocated_annual: -6000 } });
    expect(html).toContain("$0.00"); expect(html).toContain("-$500.00"); expect(html).toContain("-$6,000.00");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Retain remaining cash<\/button>/);
  });
  it("preserves readable rows and hides assignment actions in read-only mode", () => {
    const html = render(body(), { disabled: true, source: null, bridge: null });
    expect(html).toContain("Cash reserve"); expect(html).not.toContain("Retain remaining cash"); expect(html).not.toContain("Fund a planned activity");
    expect(html).toMatch(/aria-label="Allocation monthly amount 1"[^>]*disabled=""/);
  });
  it("normalizes allocation inputs without mutating references or discarding invalid text", () => {
    const raw = body("saved-plan-2", "$1,200.00");
    expect(normalizeOperatingPlanBody(raw).released_cash_flow?.allocations[0].amount_monthly).toBe(1200);
    expect(raw.released_cash_flow?.allocations[0].amount_monthly).toBe("$1,200.00");
    expect(normalizeOperatingPlanBody(body("saved-plan-2", "not known")).released_cash_flow?.allocations[0].amount_monthly).toBe("not known");
    expect(normalizeOperatingPlanBody(body("saved-plan-2", "")).released_cash_flow?.allocations[0].amount_monthly).toBeNull();
  });
});
