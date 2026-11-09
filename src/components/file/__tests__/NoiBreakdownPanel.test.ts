import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoiBreakdownPanel } from "../cockpit/NoiBreakdownPanel";
import type { FinancialNoi } from "@/lib/financialMetrics";

const source = { file_id: "operating", file_name: "Operating.pdf", currency: "USD", pages: [2] };
const fundamentals = [{ key: "gross_revenue", label: "Operating revenue", value: 100000, signed_value: 100000, source_refs: [source] }, { key: "cost_of_goods_sold", label: "Cost of goods sold", value: 20000, signed_value: -20000, source_refs: [source] }, { key: "total_operating_expenses", label: "Operating expenses", value: 60000, signed_value: -60000, source_refs: [source] }];
const noi = { definition: { key: "business_operating_income", label: "Business NOI", formula: "Revenue − COGS − operating expenses", includes_depreciation_and_amortization: true }, headline: { key: "noi:current", value: 20000, annualized_value: 20000, period: "2025", currency: "USD", fundamentals, source_refs: [source] }, years: [{ key: "noi:prior", year: 2024, value: -10000, currency: "USD", fundamentals, source_refs: [source] }, { key: "noi:current", year: 2025, value: 20000, currency: "USD", fundamentals, source_refs: [source] }], trend: { comparable: true, direction: "up", prior_year: 2024, current_year: 2025, change_amount: 30000, change_pct: 300, revenue_direction: "up", revenue_change_pct: 20 }, scenario: { current: 20000, plan: 20000, operating_adjustments: 0, after_debt_service_current: -10000, after_debt_service_plan: 5000, notes: [] }, candidates: [], reason: null } as unknown as FinancialNoi;

describe("Business NOI detail", () => {
  it("shows evidence-backed fundamentals, historical losses and cash relief separately from core operating income", () => {
    const html = renderToStaticMarkup(createElement(NoiBreakdownPanel, { value: noi, onPreviewSource: () => {} }));
    expect(html).toContain("-$20,000");
    expect(html).toContain("-$60,000");
    expect(html).toContain("Depreciation and amortization remain operating expenses");
    expect(html).toContain("Earlier years provide comparison only");
    expect(html).toContain("2024 → 2025");
    expect(html).toContain("Cash after debt service");
    expect(html).toContain("$5,000");
    expect(html).toContain("View source");
  });
  it("does not substitute tax net income for absent operating fundamentals", () => {
    const html = renderToStaticMarkup(createElement(NoiBreakdownPanel, { value: undefined }));
    expect(html).toContain("Tax net income and bank cash flow do not establish NOI");
    expect(html).not.toContain("$0");
  });
  it("does not label the saved refinance cash effect as the unsaved working plan", () => {
    const html = renderToStaticMarkup(createElement(NoiBreakdownPanel, { value: noi, planIsCurrent: false }));
    expect(html).toContain("Save working plan");
    expect(html).not.toContain("$5,000");
  });
});
