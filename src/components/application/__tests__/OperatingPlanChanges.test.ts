import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OperatingPlanChanges } from "../OperatingPlanChanges";
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
