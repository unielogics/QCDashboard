import { describe, expect, it } from "vitest";
import { evaluatePlanLocally } from "../cockpitSimulation";
import { withBudgetEvaluation, withSavedEarningsEvaluation } from "../budgetPlanEvaluation";
import type { FinancialCockpit, FinancialPlanWrite, PlanAddBack, PlanEvaluation } from "../financialCockpit";
import fixtures from "./fixtures/ebitdaRefinance.json";

const plan = { retire: [], exclude: [], add_backs: [], overrides: null, new_payment_monthly: null, new_payment_source: null, new_loan_amount: null, new_loan_rate_pct: null, new_loan_term_months: null, new_loan_interest_only: false, new_loan_structure: null, new_loan_interest_only_months: null, note: null } as FinancialPlanWrite;
function cockpit(monthly: number | null = 1000): FinancialCockpit {
  return {
    debt: { obligations: [], service: { monthly } }, bank: { recurring: { payees: [], months_read: [] } },
    dscr: { headline: { key: "profit_and_loss", numerator: 52000, value: monthly == null ? null : 4.33 }, candidates: ["tax_return", "profit_and_loss", "bank_cash_flow"].map((key) => ({ key, numerator: 52000, label: key, value: monthly == null ? null : 4.33 })) },
    plan: { evaluation: { ebitda: fixtures.baseline.projection } },
  } as unknown as FinancialCockpit;
}
const adjustment = (kind: PlanAddBack["kind"], amount = 1000): PlanAddBack => ({ id: kind, kind, label: kind, amount_monthly: amount, source: "desk", note: "Reviewed operating assumption" });

describe("financial plan earnings and missing debt service", () => {
  it("retains losses while debt relief reduces the earnings shortfall and leaves source EBITDA unchanged", () => {
    const source = cockpit(5000);
    source.dscr.candidates = source.dscr.candidates.map((row) => ({ ...row, numerator: -12000, value: -0.2, annual_debt_service: 60000 }));
    source.dscr.headline = source.dscr.candidates[1];
    source.debt.obligations = [{ id: "loan", monthly: 4000, payoff: 10000, in_debt_service: true }] as FinancialCockpit["debt"]["obligations"];
    source.plan.evaluation.ebitda = { ...structuredClone(source.plan.evaluation.ebitda!), before: -6000, after: -6000, annual_before: -12000, annual_after: -12000,
      adjusted_annual: { ...source.plan.evaluation.ebitda!.adjusted_annual, before: -12000, after: -12000 } };
    const result = evaluatePlanLocally(source, { ...plan, retire: ["loan"], new_payment_monthly: 1000, new_payment_source: "manual" }, []);
    expect(result.incomeBefore).toBe(-12000);
    expect(result.incomeAfter).toBe(-12000);
    expect(result.serviceAfterAnnual).toBe(24000);
    expect(result.headlineAfter).toBe(-0.5);
    expect(result.noDebtLeft).toBe(false);
    expect(result.ebitda?.annual_before).toBe(-12000);
    expect(result.ebitda?.annual_after).toBe(-12000);
    expect(result.ebitda?.debt_service_savings_monthly).toBe(3000);
    expect(result.candidates.every((row) => row.status_after === "concerning")).toBe(true);
  });

  it("rounds a signed DSCR tie like Python instead of toward positive infinity", () => {
    const result = evaluatePlanLocally(cockpit(), { ...plan, overrides: { income_annual: -16500, income_note: "Reviewed loss", debt_service_monthly: null, debt_service_note: null } }, []);
    expect(result.headlineAfter).toBe(-1.38);
  });

  it.each(["interest_refinanced", "depreciation"] as const)("does not add %s twice on any earnings basis and preserves the record", (kind) => {
    const row = adjustment(kind);
    const input = { ...plan, add_backs: [row] };
    const result = evaluatePlanLocally(cockpit(), input, []);
    expect(result.candidates.map((candidate) => candidate.numerator_after)).toEqual([52000, 52000, 52000]);
    expect(result.candidates.map((candidate) => candidate.value_after)).toEqual([4.33, 4.33, 4.33]);
    expect(result.addBacksMonthly).toBe(0);
    expect(result.excludedAddBacks).toEqual([{ ...row, reason: expect.stringMatching(/double count/) }]);
    expect(input.add_backs).toEqual([row]);
    expect(row).not.toHaveProperty("reason");
  });

  it("preserves identified operating adjustments while excluding previously saved interest and D&A", () => {
    const add_backs = [adjustment("owner_salary", 500), adjustment("one_time_expense", 200), adjustment("rent_to_owner", 100), adjustment("other", 50), adjustment("interest_refinanced"), adjustment("depreciation")];
    const result = evaluatePlanLocally(cockpit(), { ...plan, add_backs }, []);
    expect(result.addBacksMonthly).toBe(850);
    expect(result.candidates.map((candidate) => candidate.numerator_after)).toEqual([62200, 62200, 62200]);
    expect(result.excludedAddBacks).toHaveLength(2);
  });

  it.each([null, 1000])("keeps unknown existing service unknown with proposed monthly payment %s", (new_payment_monthly) => {
    const result = evaluatePlanLocally(cockpit(null), { ...plan, new_payment_monthly, new_payment_source: "manual" }, []);
    expect(result.serviceBefore).toBeNull();
    expect(result.serviceBeforeNewPayment).toBeNull();
    expect(result.serviceAfter).toBeNull();
    expect(result.serviceAfterAnnual).toBeNull();
    expect(result.headlineAfter).toBeNull();
    expect(result.noDebtLeft).toBe(false);
    expect(result.candidates.every((candidate) => candidate.value_after == null && !candidate.no_debt_left && candidate.status_after === "unavailable")).toBe(true);
    expect(result.coverageUnavailableReason).toMatch(/debt service is unknown/);
    expect(result.newPayment).toBe(new_payment_monthly);
    expect(result.ebitda?.debt_service_savings_monthly).toBeNull();
  });

  it("does not infer known debt service from an income override or retiring a known row", () => {
    const source = cockpit(null);
    source.debt.obligations = [{ id: "loan", monthly: 300, payoff: 10000, in_debt_service: true }] as FinancialCockpit["debt"]["obligations"];
    const result = evaluatePlanLocally(source, { ...plan, retire: ["loan"], overrides: { income_annual: 90000, income_note: "Reviewed income", debt_service_monthly: null, debt_service_note: null } }, []);
    expect(result.retiredMonthly).toBe(300);
    expect(result.incomeAfter).toBe(90000);
    expect(result.headlineAfter).toBeNull();
    expect(result.noDebtLeft).toBe(false);
  });

  it("allows an explicitly established zero burden and an explicit zero override", () => {
    const proposed = { ...plan, new_payment_monthly: 1000, new_payment_source: "manual" as const };
    for (const [source, input] of [
      [cockpit(0), proposed],
      [cockpit(null), { ...proposed, overrides: { income_annual: null, income_note: null, debt_service_monthly: 0, debt_service_note: "Full payoff reviewed" } }],
    ] as const) {
      const result = evaluatePlanLocally(source, input, []);
      expect(result.serviceBefore).toBe(0);
      expect(result.serviceAfterAnnual).toBe(12000);
      expect(result.headlineAfter).toBe(4.33);
      expect(result.coverageUnavailableReason).toBeNull();
    }
    expect(evaluatePlanLocally(cockpit(0), plan, []).noDebtLeft).toBe(true);
  });

  it("keeps a finite reviewed override and the twelve-month debt convention", () => {
    const result = evaluatePlanLocally(cockpit(null), { ...plan, new_payment_monthly: 500, overrides: { income_annual: null, income_note: null, debt_service_monthly: 2000, debt_service_note: "Reviewed current debt" } }, []);
    expect(result.serviceBefore).toBe(2000);
    expect(result.serviceAfter).toBe(2500);
    expect(result.serviceAfterAnnual).toBe(30000);
    expect(result.headlineAfter).toBe(1.73);
  });

  it.each([0, 1500])("does not subtract an unknown payoff payment from a reviewed %s monthly base", (base) => {
    const source = cockpit(2000);
    source.debt.obligations = [
      { id: "unknown", monthly: null, payoff: 10000, in_debt_service: true },
      { id: "known", monthly: 300, payoff: 2000, in_debt_service: true },
    ] as FinancialCockpit["debt"]["obligations"];
    const result = evaluatePlanLocally(source, { ...plan, retire: ["unknown", "known"], new_payment_monthly: 500,
      overrides: { income_annual: null, income_note: null, debt_service_monthly: base, debt_service_note: "Reviewed base" } }, []);
    expect(result.retiredMonthly).toBe(300);
    expect(result.serviceBefore).toBe(base);
    expect(result.serviceBeforeNewPayment).toBeNull();
    expect(result.serviceAfter).toBeNull();
    expect(result.headlineAfter).toBeNull();
    expect(result.coverageUnavailableReason).toMatch(/selected payoff.*unknown/i);
  });

  it.each([null, { balloons: [] }])("keeps an authoritative recorded retained basis with unknown selected payments (config %j)", (config) => {
    const source = cockpit(null);
    source.debt.obligations = [{ id: "unknown", monthly: null, payoff: 10000, in_debt_service: true }] as FinancialCockpit["debt"]["obligations"];
    const result = evaluatePlanLocally(source, { ...plan, retire: ["unknown"], new_payment_source: "recorded_terms", new_payment_monthly: 500,
      new_loan_repayment_config: config, terms_ref: { kind: "client_terms", id: "terms", version: 2, label: "Terms v2", treatment: "refinance", retained_annual_debt_service: 12000 },
      overrides: { income_annual: null, income_note: null, debt_service_monthly: 1000, debt_service_note: "Refinance per terms v2" } }, []);
    expect(result.serviceBeforeNewPayment).toBe(1000);
    expect(result.serviceAfterAnnual).toBe(18000);
    expect(result.headlineAfter).toBe(2.89);
    expect(result.coverageUnavailableReason).toBeNull();
  });

  it("ignores unknown payments outside debt service when selected", () => {
    const source = cockpit(1000);
    source.debt.obligations = [{ id: "outside", monthly: null, payoff: 10000, in_debt_service: false }] as FinancialCockpit["debt"]["obligations"];
    expect(evaluatePlanLocally(source, { ...plan, retire: ["outside"] }, []).serviceBeforeNewPayment).toBe(1000);
  });
});


describe("annual coverage follows contractual payment periods", () => {
  const shortLoan = { ...plan, new_loan_amount: 12000, new_loan_rate_pct: 0, new_loan_term_months: 6,
    new_loan_structure: "amortizing", new_payment_source: "manual_terms" } as FinancialPlanWrite;

  it("counts six contractual payments once while preserving the regular monthly amount", () => {
    const result = evaluatePlanLocally(cockpit(), shortLoan, []);
    expect(result.newRegularPayment).toBe(2000);
    expect(result.newLoanAnnualDebtService).toBe(12000);
    expect(result.newLoanAnnualDebtServiceBasis).toBe("canonical_schedule");
    expect(result.serviceAfterRegular).toBe(3000);
    expect(result.serviceAfterAnnual).toBe(24000);
    expect(result.headlineAfter).toBe(2.17);
  });

  it("uses the actual shorter contract when an adopted recorded quote matches it", () => {
    const result = evaluatePlanLocally(cockpit(), { ...shortLoan, new_payment_source: "recorded_terms",
      new_payment_monthly: 2000 }, []);
    expect(result.newLoanAnnualDebtService).toBe(12000);
    expect(result.newLoanAnnualDebtServiceBasis).toBe("canonical_schedule");
    expect(result.serviceAfterAnnual).toBe(24000);
  });

  it("preserves a separately reviewed scalar that differs from the priced schedule", () => {
    const result = evaluatePlanLocally(cockpit(), { ...shortLoan, new_payment_source: "manual",
      new_payment_monthly: 2500 }, []);
    expect(result.newLoanAnnualDebtService).toBe(30000);
    expect(result.newLoanAnnualDebtServiceBasis).toBe("annualized_monthly_payment");
    expect(result.serviceAfterAnnual).toBe(42000);
  });

  it("preserves an accepted legacy recorded payment on contracts of at least twelve months", () => {
    const result = evaluatePlanLocally(cockpit(), { ...shortLoan, new_payment_source: "recorded_terms",
      new_payment_monthly: 550, new_loan_term_months: 24 }, []);
    expect(result.newRegularPayment).toBe(550);
    expect(result.newLoanAnnualDebtService).toBe(6600);
    expect(result.newLoanAnnualDebtServiceBasis).toBe("annualized_recorded_payment");
    expect(result.serviceAfterAnnual).toBe(18600);
  });

  it("preserves accepted retained monthly rounding for a legacy recorded schedule without a stored payment", () => {
    const result = evaluatePlanLocally(cockpit(), { ...shortLoan, new_payment_source: "recorded_terms",
      new_loan_term_months: 24, new_payment_monthly: null,
      terms_ref: { kind: "client_terms", id: "synthetic-terms", version: 1, label: "Synthetic terms",
        treatment: "refinance", retained_annual_debt_service: 12345.67 },
      overrides: { income_annual: null, income_note: null, debt_service_monthly: 1028.81,
        debt_service_note: "Refinance per synthetic accepted terms" } }, []);
    expect(result.serviceBeforeNewPayment).toBe(1028.81);
    expect(result.newLoanAnnualDebtService).toBe(6000);
    expect(result.newLoanAnnualDebtServiceBasis).toBe("canonical_schedule");
    expect(result.serviceAfterAnnual).toBe(18345.72);
  });

  it("keeps periodic payments and maturity principal distinct in a fictional configured quote", () => {
    // Independent cent-rounded ledger for 120000 at 12.5%, 48 periods/year,
    // 144 amortization periods and 72 contractual periods.
    const result = evaluatePlanLocally(cockpit(), { ...plan, new_loan_amount: 120000,
      new_loan_rate_pct: 12.5, new_loan_term_months: 18, new_loan_structure: "amortizing",
      new_loan_interest_only_months: 0, new_loan_payments_per_year: 48,
      new_loan_repayment_config: { amortization_months: 36, after_balloon: "keep_payment", balloons: [] },
      new_payment_source: "manual_terms" }, []);
    expect(result.schedule?.payment_after).toBe(1000.40);
    expect(result.newRegularPayment).toBe(4001.60);
    expect(result.schedule?.maturity_balloon).toBe(65601.14);
    expect(result.newLoanAnnualDebtService).toBe(113620.34);
    expect(result.newLoanAnnualDebtServiceBasis).toBe("canonical_schedule");
    expect(result.serviceAfterAnnual).toBe(125620.34);
  });

  it("adopts the cost-aware server annual calculation without annualizing its monthly payment again", () => {
    const local = evaluatePlanLocally(cockpit(), shortLoan, []);
    const server = { debt_service_after_annual: 25200, debt_service_after_monthly: 2100,
      new_payment_monthly: 2000, new_loan_annual_debt_service: 12000,
      new_loan_annual_debt_service_basis: "canonical_schedule", headline_after: 2.06,
      income_after_annual: 52000, no_debt_left: false, replay: [] } as unknown as PlanEvaluation;
    const saved = withSavedEarningsEvaluation(local, server);
    const budget = withBudgetEvaluation(local, server);
    for (const result of [saved, budget]) {
      expect(result.newLoanAnnualDebtService).toBe(12000);
      expect(result.newLoanAnnualDebtServiceBasis).toBe("canonical_schedule");
      expect(result.serviceAfterAnnual).toBe(25200);
      expect(result.headlineAfter).toBe(2.06);
    }
    const pending = withBudgetEvaluation(budget, null, true);
    expect(pending.newLoanAnnualDebtService).toBeNull();
    expect(pending.newLoanAnnualDebtServiceBasis).toBe("unavailable");
    expect(pending.serviceAfterAnnual).toBeNull();
  });
});
