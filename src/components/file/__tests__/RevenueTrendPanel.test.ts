import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RevenueTrendPanel } from "../cockpit/RevenueTrendPanel";
import type { RevenueTrend } from "@/lib/financialMetrics";

const trend: RevenueTrend = { status: "available", periods: [
  { year: "2024", months_covered: 12, revenue: 100000, average_monthly_revenue: 8333.33, ebitda: -10000, ebitda_kind: "tax_estimate", currency: "USD", file_id: "old", file_name: "2024.pdf", source_refs: [{ file_id: "old", file_name: "2024.pdf", currency: "USD" }] },
  { year: "2025", months_covered: 12, revenue: 120000, average_monthly_revenue: 10000, ebitda: -8000, ebitda_kind: "tax_estimate", currency: "USD", file_id: "new", file_name: "2025.pdf", source_refs: [{ file_id: "new", file_name: "2025.pdf", currency: "USD" }] },
], comparison: { prior_year: 2024, current_year: 2025, prior_revenue: 100000, current_revenue: 120000, change_amount: 20000, change_pct: 20, monthly_change: 1666.67, comparable: true, reason: null }, forecast: { status: "illustration", method: "reviewed_assumptions", target_year: 2026, projected_revenue: 108000, change_amount: -12000, change_pct: -10, projected_ebitda: -7560, ebitda_kind: "tax_estimate", margin: -0.07, assumptions: ["Reviewed revenue decrease of 10%; no automatic growth extrapolation."], source_refs: [], reason: null }, bank_context: { average_monthly_deposits: 20000, annualized_deposits: 240000, note: "Bank deposits are context, not operating revenue; transfers and financing may be included." }, notes: [] };

describe("Revenue trend and operating outlook", () => {
  it("shows revenue growth and the negative earnings illustration without treating refinancing as EBITDA growth", () => {
    const html = renderToStaticMarkup(createElement(RevenueTrendPanel, { value: trend, onPreviewSource: () => {} }));
    expect(html).toContain("+20%");
    expect(html).toContain("-$7,560");
    expect(html).toContain("-10%");
    expect(html).toContain("Tax earnings estimate");
    expect(html).toContain("Reviewed assumptions illustration");
    expect(html).toContain("separate from current earnings, program qualification");
    expect(html).toContain("Bank deposits are context, not operating revenue");
    expect(html).toContain("View 2024 source");
    expect(html).not.toContain(" open=\"\"");
  });
  it("does not display noncomparable changes or unavailable forecast values as established", () => {
    const html = renderToStaticMarkup(createElement(RevenueTrendPanel, { value: { ...trend, comparison: { ...trend.comparison!, comparable: false, reason: "Different reporting currencies" }, forecast: { ...trend.forecast!, status: "unavailable", reason: "A current P&L or reviewed assumptions are needed." } } }));
    expect(html).toContain("Different reporting currencies");
    expect(html).toContain("Comparable revenue needed");
    expect(html).toContain("A current P&amp;L or reviewed assumptions are needed.");
    expect(html).not.toContain("$108,000");
    expect(html).not.toContain("+20%");
  });
  it("uses the forecast evidence currency independently of older comparison evidence", () => {
    const html = renderToStaticMarkup(createElement(RevenueTrendPanel, { value: {
      ...trend,
      periods: [{ ...trend.periods[0], currency: "CAD", source_refs: [{ file_id: "old", file_name: "2024.pdf", currency: "CAD" }] }, trend.periods[1]],
      comparison: { ...trend.comparison!, comparable: false, reason: "Different reporting currencies" },
      forecast: { ...trend.forecast!, source_refs: [{ file_id: "new", file_name: "2025.pdf", currency: "USD" }] },
    } }));
    expect(html).toContain("$108,000");
    expect(html).toContain("-$7,560");
    expect(html).toContain("Different reporting currencies");
  });
});
