import { describe, expect, it } from "vitest";
import { evaluatePlanLocally } from "../cockpitSimulation";
import type { FinancialCockpit, FinancialPlanWrite } from "../financialCockpit";
import fixtures from "./fixtures/ebitdaRefinance.json";

const plan = { retire: [], exclude: [], add_backs: [], overrides: null, new_payment_monthly: null,
  new_payment_source: null, new_loan_amount: null, new_loan_rate_pct: null, new_loan_term_months: null,
  new_loan_interest_only: false, new_loan_structure: null, new_loan_interest_only_months: null, note: null } as FinancialPlanWrite;
function cockpit(): FinancialCockpit {
  return { debt: { obligations: [], service: { monthly: 1000 } }, bank: { recurring: { payees: [], months_read: [] } },
    dscr: { headline: { key: "profit_and_loss", numerator: 120000, value: 10 }, candidates: [{ key: "profit_and_loss", numerator: 120000, label: "P&L", value: 10 }] },
    plan: { evaluation: { ebitda: fixtures.baseline.projection } } } as unknown as FinancialCockpit;
}

describe("missing new-loan rate", () => {
  it.each([{}, { new_loan_structure: "interest_only", new_loan_interest_only: true },
    { new_loan_repayment_config: { amortization_months: 120, after_balloon: "keep_payment", balloons: [] } }])("never prices missing APR as zero, including custom schedules", (extra) => {
    const input = { ...plan, new_loan_amount: 100000, new_loan_term_months: 120, ...extra } as FinancialPlanWrite;
    const before = structuredClone(input);
    const result = evaluatePlanLocally(cockpit(), input, []);
    expect(result.schedule).toBeNull();
    expect(result.loanTerms).toBeNull();
    expect(result.newPayment).toBeNull();
    expect(result.serviceBeforeNewPayment).toBe(1000);
    expect(result.serviceAfter).toBeNull();
    expect(result.serviceAfterAnnual).toBeNull();
    expect(result.headlineAfter).toBeNull();
    expect(result.noDebtLeft).toBe(false);
    expect(result.coverageUnavailableReason).toMatch(/new loan payment is unknown/);
    expect(input).toEqual(before);
  });

  it("prices explicit zero APR and preserves a true zero-interest payment", () => {
    const result = evaluatePlanLocally(cockpit(), { ...plan, new_loan_amount: 120000, new_loan_term_months: 120, new_loan_rate_pct: 0 }, []);
    expect(result.schedule?.rate_pct).toBe(0);
    expect(result.newPayment).toBe(1000);
    expect(result.serviceAfterAnnual).toBe(24000);
    expect(result.headlineAfter).toBe(5);
  });

  it.each([0, 500])("preserves reviewed manual payment %s without inventing an APR", (payment) => {
    const result = evaluatePlanLocally(cockpit(), { ...plan, new_loan_amount: 100000, new_loan_term_months: 120, new_payment_monthly: payment, new_payment_source: "manual" }, []);
    expect(result.schedule).toBeNull();
    expect(result.newPayment).toBe(payment);
    expect(result.serviceAfterAnnual).toBe((1000 + payment) * 12);
    expect(result.coverageUnavailableReason).toBeNull();
  });

  it("does not reuse a recorded payment for a newly entered unpriced amount", () => {
    const input = cockpit();
    input.dscr.proposed = { amount: 20000, monthly_payment: 444, rate_pct: 12, term_months: 60 } as NonNullable<FinancialCockpit["dscr"]["proposed"]>;
    const result = evaluatePlanLocally(input, { ...plan, new_loan_amount: 100000, new_loan_term_months: 120, new_payment_source: "term_sheet" }, []);
    expect(result.newPayment).toBeNull();
    expect(result.headlineAfter).toBeNull();
  });

  it("keeps current coverage when no new loan was entered", () => {
    expect(evaluatePlanLocally(cockpit(), plan, []).headlineAfter).toBe(10);
  });

  it("keeps a reviewed payment usable when an orphaned config has no loan amount", () => {
    const result = evaluatePlanLocally(cockpit(), { ...plan, new_payment_monthly: 500,
      new_payment_source: "recorded_terms", new_loan_term_months: 12, new_loan_repayment_config: { balloons: [] } }, []);
    expect(result.schedule).toBeNull();
    expect(result.serviceAfterAnnual).toBe(18000);
    expect(result.coverageUnavailableReason).toBeNull();
  });

  it("does not price an adopted balloon schedule without its APR", () => {
    const input = cockpit();
    const terms = { source: "term_sheet" as const, label: "Terms", amount: 100000, rate_pct: null,
      term_months: 120, monthly_payment: 500, annual_payment: 6000, interest_only: false,
      interest_only_months: 0, repayment_config: { balloons: [{ id: "balloon", month: 12, type: "amount" as const, value: 50000 }] } };
    input.dscr.proposed = terms;
    input.proposed_terms = terms;
    const result = evaluatePlanLocally(input, { ...plan, new_payment_source: "term_sheet" }, []);
    expect(result.newPayment).toBe(500);
    expect(result.schedule).toBeNull();
    expect(result.serviceAfterAnnual).toBeNull();
    expect(result.headlineAfter).toBeNull();
  });

  it("does not let a regular manual payment erase unpriced contractual balloon cash", () => {
    const result = evaluatePlanLocally(cockpit(), { ...plan, new_loan_amount: 100000,
      new_loan_term_months: 120, new_payment_monthly: 500, new_payment_source: "manual",
      new_loan_repayment_config: { amortization_months: 120, after_balloon: "keep_payment",
        balloons: [{ id: "balloon", month: 12, type: "amount", value: 50000 }] } }, []);
    expect(result.newPayment).toBe(500);
    expect(result.schedule).toBeNull();
    expect(result.serviceAfterAnnual).toBeNull();
    expect(result.headlineAfter).toBeNull();
  });
});
