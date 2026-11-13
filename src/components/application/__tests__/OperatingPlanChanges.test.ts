import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OperatingActivityDetails, OperatingPlanChanges } from "../OperatingPlanChanges";
import { OperatingPlanCommands } from "../OperatingPlanCommands";
import { addOperatingGrowthActivity } from "@/lib/operatingReinvestment";
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

describe("linked marketing configuration", () => {
  it("renders one marketing activity and retains its virtual zero disclosure without a duplicate ordinary Change row", () => {
    const group = { key: "marketing:source", category: "marketing", sourceGroupKey: "source", label: "Marketing", expenses: [], activities: [] };
    const value = addOperatingGrowthActivity({ currency: "USD", expenses: [], adjustments: [] }, group, "New campaign", "a", "e");
    const original = JSON.stringify(value);
    const html = renderToStaticMarkup(createElement(OperatingPlanCommands, { value, hasGoal: true, onChange: () => {}, onEditUnits: () => {}, onAddUnitPlan: () => {} }));
    expect(html).not.toContain('aria-label="Plan change New campaign"');
    expect(html.match(/>New campaign</g)).toHaveLength(1);
    expect(value.expenses).toHaveLength(1); expect(JSON.stringify(value)).toBe(original);
  });
  it("shows product-name choices and a direct incompatible-command repair without creating price or quantity fields", () => {
    const action = { id: "a", kind: "marketing_investment" as const, label: "Campaign", driver_key: "marketing-only", expense_row_id: "e", current_amount: 0, proposed_amount: 900, revenue_return_multiple: 2.5, contribution_margin_pct: 60, implementation_cost: 0, explanation: "Promote the existing service", command: { target: "total_cost" as const, mode: "amount" as const, direction: "increase" as const, value: 900 } };
    const value = { currency: "USD", expenses: [{ id: "e", label: "Campaign", category: "marketing", current_amount: 0 }], adjustments: [action, { id: "p", kind: "price_change" as const, driver_key: "product-only", product_name: "Consultation" }] };
    const html = renderToStaticMarkup(createElement(OperatingActivityDetails, { action, value, onChange: () => {}, onEditUnits: () => {} }));
    expect(html).toContain('aria-label="Marketing product choice a"'); expect(html).toContain("Consultation"); expect(html).toContain('aria-label="Clear incompatible cost command a"'); expect(html).not.toContain('aria-label="Activity units per period a"');
    expect(action.driver_key).toBe("marketing-only");
  });
});
