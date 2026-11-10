import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OperatingCoverageSummary } from "@/components/file/cockpit/OperatingCoverageSummary";
import { withBudgetEvaluation, withSavedEarningsEvaluation } from "../budgetPlanEvaluation";
import { evaluatePlanLocally } from "../cockpitSimulation";
import type { FinancialCockpit, FinancialPlanWrite, OperatingPlanCoverage, PlanEvaluation } from "../financialCockpit";

const plan: FinancialPlanWrite = { retire: [], exclude: [], add_backs: [], overrides: null, new_payment_monthly: null, new_payment_source: null, new_loan_amount: null, new_loan_rate_pct: null, new_loan_term_months: null, new_loan_interest_only: false, new_loan_structure: null, new_loan_interest_only_months: null, note: null };
const reviewed: OperatingPlanCoverage = { status: "applied", applied: true, annual_impact: 24000, first_year_impact: 18000, applied_annual_impact: 18000, candidate_impacts: { tax_return: 18000 }, baseline_annual: -12000, version_number: 2, applied_count: 1, projected_dscr: .25, reason: "One reviewed action is included after timing and implementation costs." };
function cockpit(coverage: OperatingPlanCoverage = reviewed): FinancialCockpit {
  return { debt: { obligations: [], service: { monthly: 2000 } }, bank: { recurring: { payees: [], months_read: [] } },
    dscr: { headline: { key: "tax_return", numerator: -12000, value: -.5 }, candidates: ["tax_return", "bank_cash_flow"].map(key => ({ key, numerator: -12000, label: key, value: -.5 })) },
    plan: { evaluation: { operating_plan: coverage } } } as unknown as FinancialCockpit;
}

describe("published operating improvements in the working coverage preview", () => {
  it("adds the backend-approved first-year change once to the matching basis and retains the source loss", () => {
    const source = cockpit(); const before = structuredClone(source);
    const result = evaluatePlanLocally(source, plan, []);
    expect(result.incomeBefore).toBe(-12000);
    expect(result.incomeAfter).toBe(6000);
    expect(result.headlineAfter).toBe(.25);
    expect(result.candidates.find(row => row.key === "bank_cash_flow")?.numerator_after).toBe(-12000);
    expect(evaluatePlanLocally(source, plan, []).incomeAfter).toBe(6000);
    expect(source).toEqual(before);
  });

  it("keeps client proposals conditional until reviewed and published", () => {
    const result = evaluatePlanLocally(cockpit({ ...reviewed, status: "awaiting_review", applied: false, proposed_dscr: .25 }), plan, []);
    expect(result.incomeAfter).toBe(-12000);
    expect(result.headlineAfter).toBe(-.5);
    expect(result.operatingPlan?.status).toBe("awaiting_review");
  });

  it("preserves negative operating changes without clamping earnings", () => {
    const result = evaluatePlanLocally(cockpit({ ...reviewed, annual_impact: -8000, applied_annual_impact: -6000, candidate_impacts: { tax_return: -6000 } }), plan, []);
    expect(result.incomeAfter).toBe(-18000);
    expect(result.headlineAfter).toBe(-.75);
  });

  it("does not double count an operating plan with a manual numerator override or add-back", () => {
    const override = evaluatePlanLocally(cockpit(), { ...plan, overrides: { income_annual: 12000, income_note: "Reviewed total", debt_service_monthly: null, debt_service_note: null } }, []);
    expect(override.incomeAfter).toBe(12000);
    expect(override.headlineAfter).toBe(.5);
    expect(override.operatingPlan).toMatchObject({ applied: false, status: "blocked" });
    const addback = evaluatePlanLocally(cockpit(), { ...plan, add_backs: [{ kind: "owner_salary", amount_monthly: 1000 }] }, []);
    expect(addback.incomeAfter).toBe(0);
    expect(addback.operatingPlan).toMatchObject({ applied: false, status: "blocked" });
  });

  it("keeps reviewed business improvements when unrelated transfers or duplicate interest add-backs are excluded", () => {
    const result = evaluatePlanLocally(cockpit(), { ...plan, exclude: ["payee:transfer"], add_backs: [{ kind: "interest_refinanced", amount_monthly: 1000 }, { kind: "depreciation", amount_monthly: 500 }] }, []);
    expect(result.operatingPlan?.applied).toBe(true);
    expect(result.incomeAfter).toBe(6000);
    expect(result.headlineAfter).toBe(.25);
  });

  it("uses the server result directly rather than adding the same improvement after fee evaluation", () => {
    const local = evaluatePlanLocally(cockpit(), plan, []);
    const result = withBudgetEvaluation(local, { operating_plan: reviewed, headline_after: .2, income_before_annual: -12000, income_after_annual: 5000, debt_service_after_monthly: 2000, debt_service_after_annual: 24000, no_debt_left: false, replay: [] } as unknown as PlanEvaluation);
    expect(result.incomeAfter).toBe(5000);
    expect(result.headlineAfter).toBe(.2);
    expect(result.operatingPlan).toBe(reviewed);
    expect(withBudgetEvaluation(local, null, true).incomeAfter).toBeNull();
  });

  it("adopts saved coverage without replacing a filtered account's bank replay", () => {
    const local = { ...evaluatePlanLocally(cockpit(), plan, []), rows: [{ month: "2026-10", label: "Selected account", netAfter: 99 }], netAfterAverage: 99, endingAfterLast: 500, monthsDippingNegativeAfter: 0, cashKept: 100 } as ReturnType<typeof evaluatePlanLocally>;
    const server = { operating_plan: reviewed, income_before_annual: -12000, income_after_annual: 5000, headline_after: .19, debt_service_after_annual: 27000, debt_service_after_monthly: 2250, replay: [{ month: "2026-10", label: "All accounts", net_after: 999 }], net_after_avg: 999, ending_after_last: 9000, months_dipping_negative_after: 8, cash_kept: 9999 } as unknown as PlanEvaluation;
    const result = withSavedEarningsEvaluation(local, server);
    expect(result.incomeAfter).toBe(5000);
    expect(result.headlineAfter).toBe(.19);
    expect(result.serviceAfterAnnual).toBe(27000);
    expect(result.rows).toBe(local.rows);
    expect(result.netAfterAverage).toBe(99);
    expect(result.endingAfterLast).toBe(500);
    expect(result.monthsDippingNegativeAfter).toBe(0);
    expect(result.cashKept).toBe(100);
  });
});

describe("earnings-plan coverage explanation", () => {
  const render = (coverage: OperatingPlanCoverage, pending = false) => renderToStaticMarkup(createElement(OperatingCoverageSummary, { coverage, currentDscr: -.5, projectedDscr: .25, currency: "USD", pending }));
  it("distinguishes the first-year applied amount from the stabilized run-rate", () => {
    const html = render(reviewed);
    expect(html).toContain("Reviewed earnings plan included · v2");
    expect(html).toContain("First-year earnings change applied");
    expect(html).toContain("18,000");
    expect(html).toContain("Full-year run-rate change");
    expect(html).toContain("24,000");
    expect(html).toContain("-0.50x");
    expect(html).toContain("0.25x");
    expect(html).toContain("historical earnings baseline stays unchanged");
  });
  it("identifies proposed ratios as conditional and never claims they are applied", () => {
    const html = render({ ...reviewed, status: "awaiting_review", applied: false, proposed_dscr: .25, first_year_impact: null, proposed_first_year_impact: 21000 });
    expect(html).toContain("Earnings proposal awaiting review");
    expect(html).toContain("Potential DSCR · if reviewed");
    expect(html).not.toContain("First-year earnings change applied");
    expect(html).toContain("21,000");
    expect(html).toContain("save a version");
  });
  it("masks current-result figures during recalculation", () => {
    const html = render(reviewed, true);
    expect(html).toContain("Calculating…");
    expect(html).not.toContain("0.25x");
    expect(html).not.toContain("18,000");
  });
  it("keeps an unavailable current projection unavailable instead of falling back to saved coverage", () => {
    const html = renderToStaticMarkup(createElement(OperatingCoverageSummary, { coverage: reviewed, projectedDscr: null, currency: "USD" }));
    expect(html).not.toContain("0.25x");
    expect(html).toContain("Needs evidence");
  });
});
