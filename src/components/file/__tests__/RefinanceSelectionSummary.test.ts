import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RefinanceSelectionSummary } from "../cockpit/RefinanceSelectionSummary";
import type { RefinanceSelectionTotals } from "@/lib/refinanceSelectionTotals";

const base: RefinanceSelectionTotals = {
  selectedCount: 2, payoffTotal: 27500, payoffUnknown: 0, monthlyRemoved: 3000, monthlyUnknown: 0,
  monthlyAdded: 750, netMonthly: -2250, monthlyAfter: 750, remainingMonthly: 0,
  basisAdjusted: false, needsReview: false,
};
const render = (values: Partial<RefinanceSelectionTotals> = {}, coverageEquivalent = false) => renderToStaticMarkup(createElement(RefinanceSelectionSummary, { totals: { ...base, ...values }, coverageEquivalent }));

describe("live refinance selection summary", () => {
  it("separates selected payoffs, removed payments, added payment, and net service change", () => {
    const html = render();
    expect(html).toContain("2 loans selected");
    expect(html).toContain("$27,500");
    expect(html).toContain("−$3,000");
    expect(html).toContain("+$750");
    expect(html).toContain("−$2,250");
    expect(html).toContain("Monthly debt service after plan");
  });
  it("does not imply a zero new payment when the loan payment has not been set", () => {
    const html = render({ monthlyAdded: null, netMonthly: null, monthlyAfter: null, remainingMonthly: 2000 });
    expect(html).toContain("Not set");
    expect(html).toContain("New payment not set");
    expect(html).toContain("Existing monthly payments remaining");
    expect(html).toContain("$2,000");
    expect(html).not.toContain("+$0");
  });
  it("keeps explicit zero payments usable", () => {
    const html = render({ monthlyAdded: 0, netMonthly: -3000, monthlyAfter: 0 });
    expect(html).toContain("$0");
    expect(html).not.toContain("Not set");
    expect(html).not.toContain("New payment not set");
  });
  it("identifies missing payoff and payment values instead of presenting complete totals", () => {
    const html = render({ payoffTotal: 9500, payoffUnknown: 1, monthlyUnknown: 1, monthlyRemoved: 1000, netMonthly: null, monthlyAfter: null });
    expect(html).toContain("known amounts");
    expect(html).toContain("1 payoff amount unknown");
    expect(html).toContain("Needs details");
    expect(html).toContain("1 selected monthly payment is not provided");
    expect(html).not.toContain("−$2,250");
  });
  it("retains the added payment but flags unresolved selections", () => {
    const html = render({ needsReview: true, payoffTotal: null, monthlyRemoved: null, netMonthly: null, monthlyAfter: null });
    expect(html).toContain("Needs review");
    expect(html).toContain("+$750");
    expect(html).not.toContain("$27,500");
    expect(html).not.toContain("−$3,000");
  });
  it("labels coverage-equivalent payments and keeps advanced-basis differences explicit", () => {
    const html = render({ basisAdjusted: true }, true);
    expect(html).toContain("+ New monthly equivalent");
    expect(html).toContain("Net change follows the current debt-service calculation inputs and overrides");
  });
});
