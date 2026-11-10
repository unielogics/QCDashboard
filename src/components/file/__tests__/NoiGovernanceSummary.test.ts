import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoiGovernanceSummary } from "../cockpit/NoiGovernanceSummary";
import { IntelligenceMetricContent } from "@/components/application/ApplicationIntelligencePanel";
import { OperatingPlanImpact } from "@/components/application/OperatingPlanForm";
import type { FinancialNoi } from "@/lib/financialMetrics";
import type { NoiBaselineGovernance } from "@/lib/noiGovernance";
import type { OperatingEvaluation } from "@/lib/operatingPlan";

const governance: NoiBaselineGovernance = { policy_version: "business-noi-v2", status: "provisional", review_needed: true, status_reason: "Latest supported business period is a tax estimate.", reason_codes: ["tax_estimate"], authority_stamp: "a".repeat(64), label: "Automatic business tax estimate", kind: "tax_derived_noi", year: 2025, period: "2025 tax year", currency: "EUR" };

describe("NOI governance across current financial views", () => {
  it("does not promote a retained stale review amount to current NOI", () => {
    const value = { ...governance, status: "stale", status_reason: "The selected source version changed.", headline: null, review: { current: { annual_value: 99999 } } } as unknown as FinancialNoi;
    const html = renderToStaticMarkup(createElement(NoiGovernanceSummary, { value, showAmount: true }));
    expect(html).toContain("NOI needs re-review");
    expect(html).toContain("Current annual NOI: Unknown");
    expect(html).toContain("selected source version changed");
    expect(html).not.toContain("99,999");
  });
  it("keeps provisional intelligence amounts, source, period, currency and review action visible", () => {
    const html = renderToStaticMarkup(createElement(IntelligenceMetricContent, { actionable: true, metric: { key: "noi", label: "Annual NOI", applicable: true, value: 0, unit: "EUR", status: "needs_evidence", confidence: null, period: "2025", source: "Business tax return", action: "review_noi", calculation_status: "provisional", review_needed: true, status_reason: governance.status_reason } }));
    for (const text of ["Provisional NOI", "Business tax return", "2025", "EUR", "€0", "Review NOI", governance.status_reason]) expect(html).toContain(text);
  });
  it("uses NOI's own currency and source period in operating projections", () => {
    const projection = { earnings: 200, noi: -100, dscr_current: null, dscr_with_refinance: null, target_gap_current: null, target_gap_refinance: null };
    const evaluation = { baseline: { currency: "USD", period: "2026 P&L", noi: -100, noi_governance: governance }, projection: { proposed: projection, approved: projection }, totals: { proposed: {}, approved: {} }, missing: [], risk_flags: [] } as unknown as OperatingEvaluation;
    const html = renderToStaticMarkup(createElement(OperatingPlanImpact, { evaluation, currency: "USD" }));
    expect(html).toContain("Provisional NOI");
    expect(html).toContain("2025 tax year");
    expect(html).toContain("-€100.00");
    expect(html).not.toContain("-$100.00");
  });
});
