import { describe, expect, it } from "vitest";
import { adoptRecordedLoan, clientDraftLoanFields, releaseRecordedLoan } from "../loanTermsSync";
import type { FinancialPlanWrite, RecordedTerms } from "../financialCockpit";

const plan = { retire: ["existing-payoff"], exclude: [], add_backs: [], expected_updated_at: "2026-11-06T14:00:00Z", overrides: { income_annual: 200000, income_note: "Reviewed scenario", debt_service_monthly: null, debt_service_note: null } } as unknown as FinancialPlanWrite;
const recorded = { kind: "client_terms", id: "terms", version: 4, label: "Client terms v4", amount: 100000, rate_pct: 0, term_months: 24, structure: "simple_interest", interest_only: false, interest_only_months: 6, repayment_config: { amortization_months: 60, after_balloon: "recast", balloons: [{ id: "partial", month: 12, type: "percent_balance", value: 20 }] }, payments_per_year: 51.5, payment_monthly: 6000, treatment: "refinance", retained_annual_debt_service: 1000 } as RecordedTerms;

describe("shared loan adoption", () => {
  it("adopts every configured term and retains payoff IDs, scenario inputs and concurrency token", () => {
    const result = adoptRecordedLoan(plan, recorded);
    expect(result).toMatchObject({ expected_updated_at: plan.expected_updated_at, retire: plan.retire, new_loan_rate_pct: 0, new_loan_structure: "simple_interest", new_loan_interest_only_months: 6, new_loan_payments_per_year: 51.5, new_loan_repayment_config: recorded.repayment_config, terms_ref: { version: 4, treatment: "refinance", retained_annual_debt_service: 1000 } });
    expect(result.overrides).toMatchObject({ income_annual: 200000, debt_service_monthly: 83.33 });
    result.new_loan_repayment_config!.balloons![0].value = 30;
    expect(recorded.repayment_config!.balloons![0].value).toBe(20);
  });

  it("uses the same configured loan fields for client terms and preserves fractional cadence", () => {
    expect(clientDraftLoanFields({ amount: recorded.amount, ratePct: recorded.rate_pct, termMonths: recorded.term_months, structure: "simple_interest", interestOnlyMonths: 6, repaymentConfig: recorded.repayment_config, paymentsPerYear: 51.5 })).toMatchObject({ amount: "100000", apr_pct: "0", loan_structure: "simple_interest", interest_only_months: "6", repayment_config: recorded.repayment_config, repayment_frequency: "custom", custom_payments_per_year: "51.5" });
  });

  it("removes only the automated refinance override when released or changed to additive", () => {
    const adopted = adoptRecordedLoan(plan, recorded);
    const released = releaseRecordedLoan(adopted);
    expect(released.new_loan_repayment_config).toBeNull();
    expect(released.new_loan_payments_per_year).toBeNull();
    expect(released.retire).toEqual(plan.retire);
    expect(released.overrides?.income_annual).toBe(200000);
    expect(released.overrides?.debt_service_monthly).toBeNull();
    expect(adoptRecordedLoan(adopted, { ...recorded, treatment: "additive" }).overrides?.debt_service_monthly).toBeNull();
    const staff = releaseRecordedLoan({ ...adopted, overrides: { ...adopted.overrides!, debt_service_monthly: 700, debt_service_note: "Staff scenario override" } });
    expect(staff.overrides?.debt_service_monthly).toBe(700);
  });
});
