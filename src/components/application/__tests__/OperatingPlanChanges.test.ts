import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OperatingActivityDetails, OperatingPlanChanges } from "../OperatingPlanChanges";
import type { OperatingEvaluation } from "@/lib/operatingPlan";

describe("Step 3 source currency and pending baseline", () => {
  const baseline: OperatingEvaluation["baseline"] = { period: "2025", currency: "CAD", noi_currency: "USD", basis: "cash", revenue: 100000, earnings: 50000, earnings_kind: "tax_estimate", noi: 50000, dscr: 1.25, annual_debt_service: 40000, provisional: true };
  it("keeps historical USD NOI visible during a pending EUR plan preview, without relabeling it as EUR", () => {
    const html = renderToStaticMarkup(createElement(OperatingPlanChanges, { value: { currency: "EUR", expenses: [], adjustments: [] }, baseline, evaluating: true, onChange: () => {}, onEditUnits: () => {}, onReviewCurrent: () => {} }));
    expect(html).toContain("$50,000.00");
    expect(html).not.toContain("€50,000.00");
    expect(html).not.toContain("CA$50,000.00");
    expect(html).toContain("1.25×");
    expect(html).toContain("Updating");
  });
});

describe("Why attention marker follows the entered explanation", () => {
  it.each(["", "The supplier confirmed the lower recurring rate"])("shows a red Required marker only for a missing explanation: %s", explanation => {
    const action = { id: "change", label: "Rent change", driver_key: "rent", kind: "expense_reduction" as const, expense_row_id: "rent", current_amount: 12000, proposed_amount: 11000, implementation_cost: 0, explanation };
    const value = { currency: "USD", expenses: [{ id: "rent", label: "Rent", current_amount: 12000 }], adjustments: [action] };
    const html = renderToStaticMarkup(createElement(OperatingActivityDetails, { action, value, paired: true, configuration: true, onChange: () => {}, onEditUnits: () => {} }));
    expect(html.includes(">Required</span>")).toBe(!explanation);
    expect(html).toContain('aria-required="true"');
    expect(html).not.toContain("Responsible person");
    expect(html).not.toContain("Effective date");
  });
});
