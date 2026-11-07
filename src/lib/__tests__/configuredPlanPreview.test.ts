import { describe, expect, it } from "vitest";
import { evaluatePlanLocally } from "../cockpitSimulation";
import type { FinancialCockpit, FinancialPlanWrite } from "../financialCockpit";

const cockpit = {
  debt: { obligations: [], service: { monthly: 1000 } },
  bank: { recurring: { payees: [], months_read: [] } },
  dscr: { headline: { key: "pl", numerator: 112000 }, candidates: [{ key: "pl", numerator: 112000, label: "P&L", value: 9.33 }] },
  plan: { evaluation: {} },
} as unknown as FinancialCockpit;
const plan = { retire: [], exclude: [], add_backs: [], overrides: null, new_loan_amount: 100000, new_loan_rate_pct: 0, new_loan_term_months: 36, new_loan_structure: "interest_only", new_loan_interest_only: true, new_loan_interest_only_months: 0, new_payment_monthly: null, new_loan_repayment_config: { after_balloon: "keep_payment", balloons: [] } } as unknown as FinancialPlanWrite;

describe("configured plan annual coverage", () => {
  it("uses exact peak annual cash due rather than first-year service or rounded monthly times twelve", () => {
    const result = evaluatePlanLocally(cockpit, plan, []);
    expect(result.schedule!.annual_debt_service).toBe(0);
    expect(result.schedule!.coverage_annual_debt_service).toBe(100000);
    expect(result.newPayment).toBe(8333.33);
    expect(result.loanTerms!.annual_debt_service).toBe(100000);
    expect(result.serviceAfterAnnual).toBe(112000);
    expect(result.headlineAfter).toBe(1);
  });

  it("does not let a lower manual payment understate a configured schedule", () => {
    const result = evaluatePlanLocally(cockpit, { ...plan, new_payment_monthly: 500 }, []);
    expect(result.newPayment).toBe(8333.33);
    expect(result.serviceAfterAnnual).toBe(112000);
    const higher = evaluatePlanLocally(cockpit, { ...plan, new_payment_monthly: 10000 }, []);
    expect(higher.serviceAfterAnnual).toBe(132000);
  });

  it("does not inflate an exact annual denominator when monthly coverage rounds upward", () => {
    const result = evaluatePlanLocally(cockpit, { ...plan, new_loan_amount: 100000.05, new_payment_monthly: 8333.34 }, []);
    expect(result.newPayment).toBe(8333.34);
    expect(result.schedule!.coverage_annual_debt_service).toBe(100000.05);
    expect(result.serviceAfterAnnual).toBe(112000.05);
  });

  it("retains exact adopted annual service until a staff override deliberately differs", () => {
    const adopted = { ...plan, new_payment_source: "recorded_terms", terms_ref: { kind: "client_terms", id: "terms", version: 2, label: "Terms", treatment: "refinance", retained_annual_debt_service: 1000 }, overrides: { income_annual: null, income_note: null, debt_service_monthly: 83.33, debt_service_note: "Refinance per client terms v2" } } as FinancialPlanWrite;
    expect(evaluatePlanLocally(cockpit, adopted, []).serviceAfterAnnual).toBe(101000);
    expect(evaluatePlanLocally(cockpit, { ...adopted, overrides: { ...adopted.overrides!, debt_service_monthly: 90 } }, []).serviceAfterAnnual).toBe(101080);
    const withPayoff = { ...cockpit, debt: { ...cockpit.debt, obligations: [{ id: "old-loan", monthly: 500, payoff: 2000, in_debt_service: true }] } } as FinancialCockpit;
    const result = evaluatePlanLocally(withPayoff, { ...adopted, retire: ["old-loan"] }, []);
    expect(result.retiredMonthly).toBe(500);
    expect(result.payoffTotal).toBe(2000);
    expect(result.serviceBeforeNewPayment).toBe(83.33);
    expect(result.serviceAfterAnnual).toBe(101000);
  });

  it("does not retire selected payments twice for recorded legacy refinance terms", () => {
    const withPayoff = { ...cockpit, debt: { ...cockpit.debt, service: { monthly: 2000 }, obligations: [{ id: "old-loan", monthly: 1000, payoff: 2000, in_debt_service: true }] } } as FinancialCockpit;
    const adopted = { ...plan, retire: ["old-loan"], new_loan_amount: 12000, new_loan_rate_pct: 0, new_loan_term_months: 24,
      new_loan_structure: "amortizing", new_loan_interest_only: false, new_loan_repayment_config: null,
      new_payment_source: "recorded_terms", terms_ref: { kind: "client_terms", id: "terms", version: 3, label: "Terms", treatment: "refinance", retained_annual_debt_service: 12000 },
      overrides: { income_annual: null, income_note: null, debt_service_monthly: 1000, debt_service_note: "Refinance per client terms v3" },
    } as FinancialPlanWrite;
    const result = evaluatePlanLocally(withPayoff, adopted, []);
    expect(result.retiredMonthly).toBe(1000);
    expect(result.newPayment).toBe(500);
    expect(result.serviceBeforeNewPayment).toBe(1000);
    expect(result.serviceAfter).toBe(1500);
    expect(result.serviceAfterAnnual).toBe(18000);
    const changedByStaff = evaluatePlanLocally(withPayoff, { ...adopted, overrides: { ...adopted.overrides!, debt_service_monthly: 1050, debt_service_note: "Staff coverage basis" } }, []);
    expect(changedByStaff.serviceBeforeNewPayment).toBe(50);
    expect(changedByStaff.serviceAfter).toBe(550);
  });
});
