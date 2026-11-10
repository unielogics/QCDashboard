import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReleasedCashFlowAllocation } from "@/components/application/ReleasedCashFlowAllocation";
import { normalizeOperatingPlanBody, type OperatingPlanBody, type ReleasedCashFlowEvaluation } from "@/lib/operatingPlan";

const source: ReleasedCashFlowEvaluation = {
  required: true, available: true, status: "allocation_required", source_fingerprint: "saved-plan-2", currency: "USD",
  amount_monthly: 1200, allocated_monthly: 0, unallocated_monthly: 1200, complete: false, missing: ["Allocate the released cash flow"],
  source: { updated_at: "2026-11-10T12:00:00Z", before_monthly: 5000, after_monthly: 3800 },
};
const body = (fingerprint = source.source_fingerprint, amount: number | string = 500): OperatingPlanBody => ({
  currency: "USD", expenses: [], adjustments: [], released_cash_flow: { source_fingerprint: fingerprint, allocations: [{ id: "allocation", label: "Cash reserve", amount_monthly: amount, notes: "Preserve this explanation" }] },
});
const render = (value: OperatingPlanBody, extra = {}) => renderToStaticMarkup(createElement(ReleasedCashFlowAllocation, { value, onChange: vi.fn(), source, ...extra }));

describe("released monthly cash flow allocation", () => {
  it("uses the saved monthly release independently of earnings and the loan budget", () => {
    const html = render({ expenses: [], adjustments: [] });
    expect(html).toContain("$1,200.00 / month");
    expect(html).toContain("$5,000.00 before");
    expect(html).toContain("$3,800.00 with the plan");
    expect(html).toContain("Use saved coverage plan");
    expect(html).toContain("do not add revenue, reduce expenses");
    expect(html).toContain("one-time use of proceeds");
  });

  it("preserves rows when the saved source changes and requires deliberate acknowledgement", () => {
    const value = body("old-plan");
    const before = structuredClone(value);
    const html = render(value);
    expect(html).toContain("The saved coverage plan has changed");
    expect(html).toContain("Cash reserve");
    expect(html).toContain("Preserve this explanation");
    expect(html).toContain("$700.00 / month");
    expect(value).toEqual(before);
  });

  it("does not call an invalid or overallocated draft complete even with an older complete evaluation", () => {
    const html = render(body(source.source_fingerprint, 1300), { source: { ...source, complete: true } });
    expect(html).toContain("Over allocated");
    expect(html).toContain("$100.00 / month");
    expect(html).not.toContain("is fully allocated");
    expect(render(body(), { evaluating: true })).toContain("Checking the allocation");
  });

  it("keeps saved rows readable without edit controls when the source is unavailable or the role is read-only", () => {
    const html = render(body(), { source: null, disabled: true });
    expect(html).toContain("Existing allocations are preserved");
    expect(html).toContain("Cash reserve");
    expect(html).not.toContain("Add cash flow allocation");
    expect(html).not.toContain("Use saved coverage plan</button>");
    expect(html).toMatch(/aria-label="Allocation monthly amount 1"[^>]*disabled=""/);
  });

  it("requires an explicit clear for an old allocation when a saved plan no longer releases cash flow", () => {
    const value = body("old-plan");
    const html = render(value, { source: { ...source, available: false, amount_monthly: null } });
    expect(html).toContain("Clear previous allocation");
    expect(value.released_cash_flow?.allocations).toHaveLength(1);
    expect(render({}, { source: { ...source, required: false, complete: true, amount_monthly: 0 } })).toBe("");
  });

  it("normalizes only allocation amounts and preserves source references and invalid drafts", () => {
    const raw = body("saved-plan-2", "$1,200.00");
    expect(normalizeOperatingPlanBody(raw).released_cash_flow).toEqual({ source_fingerprint: "saved-plan-2", allocations: [{ id: "allocation", label: "Cash reserve", amount_monthly: 1200, notes: "Preserve this explanation" }] });
    expect(raw.released_cash_flow?.allocations[0].amount_monthly).toBe("$1,200.00");
    expect(normalizeOperatingPlanBody(body("saved-plan-2", "not known")).released_cash_flow?.allocations[0].amount_monthly).toBe("not known");
    expect(normalizeOperatingPlanBody(body("saved-plan-2", "")).released_cash_flow?.allocations[0].amount_monthly).toBeNull();
  });
});
