import { describe, expect, it } from "vitest";
import { buildSchedule } from "../loanSchedule";
import { repaymentPreview } from "../repaymentConfig";
import { evaluatePlanLocally } from "../cockpitSimulation";
import { refinanceSelectionTotals } from "../refinanceSelectionTotals";
import type { FinancialCockpit, FinancialPlanWrite, CockpitMonth } from "../financialCockpit";

const options = { structure: "amortizing", interestOnlyMonths: 6, periodsPerYear: 12, repaymentConfig: { amortization_months: 60 } };
const plan: FinancialPlanWrite = { retire: ["payoff"], exclude: [], add_backs: [], overrides: null,
  new_payment_monthly: null, new_payment_source: null, new_loan_amount: 89934, new_loan_rate_pct: 29.99,
  new_loan_term_months: 24, new_loan_interest_only: false, new_loan_structure: "amortizing",
  new_loan_interest_only_months: 6, new_loan_payments_per_year: 12, new_loan_repayment_config: { amortization_months: 60 }, note: null };
function cockpit(monthly: number | null = 17578): FinancialCockpit {
  return { debt: { obligations: [{ id: "payoff", kind: "row", monthly: 14943, payoff: 89934, in_debt_service: true }], service: { monthly } },
    bank: { recurring: { payees: [], months_read: [] } },
    plan: { evaluation: {} },
    dscr: { headline: { key: "profit_and_loss" }, candidates: [{ key: "profit_and_loss", numerator: 180000, label: "P&L", value: 1 }] },
  } as unknown as FinancialCockpit;
}
const months = [{ month: "2026-01", label: "Jan", deposits: 30000, withdrawals: 25000, net: 5000, ending_balance: 2000, low_balance: -100 }] as CockpitMonth[];

describe("ordinary loan payments and balloon stress stay separate", () => {
  it("reproduces the complete screenshot schedule with independent maturity and amortization", () => {
    const schedule = buildSchedule(89934, 29.99, 24, options)!;
    expect(schedule).toMatchObject({ payment_io_monthly: 2247.60, payment_after_monthly: 2909.12,
      ordinary_payment_monthly: 2909.12, coverage_payment_monthly: 9169.63,
      coverage_annual_debt_service: 110035.55, first_year_actual_debt_service: 30940.32,
      first_year_regular_debt_service: 30940.32, balloon: 75126.11, amortization_months: 60, term_months: 24 });
    expect(schedule.payment_phases).toMatchObject([
      { phase: "interest_only", start_period: 1, end_period: 6, payment_count: 6, payment: 2247.60 },
      { phase: "repayment", start_period: 7, end_period: 24, payment_count: 18, payment: 2909.12, maturity_balloon: 75126.11 },
    ]);
    expect(schedule.rows.at(-1)!.cash_payment).toBe(78035.23);
  });

  it("uses ordinary IO and repayment cash for the summary while retaining exact stress for DSCR", () => {
    const source = cockpit(), result = evaluatePlanLocally(source, plan, months);
    const totals = refinanceSelectionTotals(source.debt.obligations, plan.retire, result, { unresolvedSelections: false, debtServiceKnown: true });
    expect(result).toMatchObject({ newRegularPayment: 2909.12, newInterestOnlyPayment: 2247.60,
      newPayment: 9169.63, serviceAfterRegular: 5544.12, serviceAfterInterestOnly: 4882.60,
      serviceAfterAnnual: 141655.55, netRegularMonthlyChange: -12033.88, netInterestOnlyMonthlyChange: -12695.40 });
    expect(totals).toMatchObject({ monthlyAdded: 2909.12, monthlyAfter: 5544.12, netMonthly: -12033.88,
      monthlyAddedIo: 2247.60, monthlyAfterIo: 4882.60, netMonthlyIo: -12695.40,
      stressMonthlyAdded: 9169.63, stressMonthlyAfter: 11804.63, stressNetMonthly: -5773.37 });
    expect(result.rows[0]).toMatchObject({ added: 2909.12, netAfter: 17033.88, withdrawalsAfter: 12966.12 });
    expect(result.headlineAfter).toBe(1.27);
  });

  it.each([[66, 66], [120, 66], [24, 18]])("maturity %s preserves amortization and stops payments after actual payoff %s", (maturity, payoff) => {
    const schedule = buildSchedule(89934, 29.99, maturity, { ...options, repaymentConfig: { amortization_months: maturity === 24 ? 12 : 60 } })!;
    expect(schedule.actual_payoff_month).toBe(payoff);
    expect(schedule.balloon).toBe(0);
    expect(schedule.rows.at(-1)!.balance_after_cash).toBe(0);
    expect(schedule.rows).toHaveLength(payoff);
    expect(schedule.cadence_adjustment_note).toBeNull();
  });

  it("keeps the first post-IO installment distinct from an earlier larger IO installment", () => {
    const schedule = buildSchedule(100000, 12, 24, { ...options, repaymentConfig: { amortization_months: 60, after_balloon: "recast", balloons: [{ id: "curtail", month: 3, type: "percent_balance", value: 80 }] } })!;
    expect(schedule.payment_io_monthly).toBe(1000);
    expect(schedule.ordinary_payment_monthly).toBe(444.89);
    expect(schedule.payment_phases![0]).toMatchObject({ payment_min: 200, payment_max: 1000 });
  });

  it("does not show imaginary savings when configured loan pricing is unknown", () => {
    const result = evaluatePlanLocally(cockpit(), { ...plan, new_loan_rate_pct: null, new_payment_monthly: 1000, new_payment_source: "manual" }, months);
    expect(result).toMatchObject({ newRegularPayment: null, serviceAfterRegular: null, cashKept: null, netAfterAverage: null, replayProjectionAvailable: false });
    expect(result.rows[0]).toMatchObject({ withdrawalsAfter: null, netAfter: null, endingAfter: null, added: null, cumulative: null, removed: 14943 });
  });

  it("preserves reviewed zero and treats no requested loan as no added operating payment", () => {
    const zero = evaluatePlanLocally(cockpit(), { ...plan, new_loan_amount: null, new_loan_repayment_config: null, new_payment_source: "manual", new_payment_monthly: 0 }, months);
    expect(zero).toMatchObject({ newRegularPayment: 0, serviceAfterRegular: 2635, netRegularMonthlyChange: -14943 });
    const none = evaluatePlanLocally(cockpit(), { ...plan, new_loan_amount: null, new_loan_repayment_config: null }, months);
    expect(none).toMatchObject({ newRegularPayment: 0, serviceAfterRegular: 2635, replayProjectionAvailable: true });
  });

  it("preserves unknown existing service while exposing priced phase amounts", () => {
    expect(evaluatePlanLocally(cockpit(null), plan, months)).toMatchObject({ newRegularPayment: 2909.12, newInterestOnlyPayment: 2247.60, serviceAfterRegular: null, serviceAfterInterestOnly: null });
  });

  it("does not price a missing APR as zero and makes cadence mapping visible", () => {
    expect(repaymentPreview(89934, null, 24, options).schedule).toBeNull();
    expect(repaymentPreview(89934, 0, 24, options).schedule!.payment_io_monthly).toBe(0);
    const quarterly = buildSchedule(89934, 29.99, 24, { ...options, interestOnlyMonths: 4, periodsPerYear: 4 })!;
    expect(quarterly.requested_interest_only_months).toBe(4);
    expect(quarterly.cadence_adjustment_note).toMatch(/nearest scheduled/);
    expect(() => buildSchedule(10000, 10, 1, { periodsPerYear: 4 })).toThrow(/one payment period/);
    expect(() => buildSchedule(10000, 10, 24, { interestOnlyMonths: 6.5 })).toThrow(/whole number/);
    expect(() => buildSchedule(10000, 10, 24, { interestOnlyMonths: 25 })).toThrow(/whole number/);
  });
});
