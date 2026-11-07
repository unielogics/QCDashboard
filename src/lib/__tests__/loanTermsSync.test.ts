import { describe, expect, it } from "vitest";
import { adoptRecordedLoan, applyWorkingLoan, clientDraftLoanFields, loanFromClientDraft, mergeAcknowledgedLoan, recordedLoanCadence, recordedRetainedAnnual, releaseRecordedLoan, sameWorkingLoan, workingLoanFromPlan } from "../loanTermsSync";
import { evaluatePlanLocally } from "../cockpitSimulation";
import type { FinancialCockpit } from "../financialCockpit";
import type { FinancialPlanRecord, FinancialPlanWrite, RecordedTerms } from "../financialCockpit";

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

  it("distinguishes an untouched empty scenario from explicit blank, partial and zero edits", () => {
    const empty = { ...plan, new_loan_amount: null, new_loan_rate_pct: null, new_loan_term_months: null, new_loan_structure: null, new_loan_interest_only: false, new_loan_interest_only_months: 0 };
    expect(workingLoanFromPlan(empty)).toBeNull();
    expect(clientDraftLoanFields(workingLoanFromPlan(empty, true)!)).toMatchObject({ amount: "", apr_pct: "", term_months: "" });
    expect(clientDraftLoanFields(workingLoanFromPlan({ ...empty, new_loan_amount: 0, new_loan_rate_pct: 0 })!)).toMatchObject({ amount: "0", apr_pct: "0" });
    expect(workingLoanFromPlan({ ...empty, new_loan_rate_pct: 29.99 })).toMatchObject({ amount: null, ratePct: 29.99, termMonths: null });
    expect(clientDraftLoanFields(workingLoanFromPlan({ ...empty, new_loan_term_months: 0 })!)).toMatchObject({ term_months: "0" });
  });

  it("round-trips the explicit 24-month /60-month amortizing draft without metadata or scenario loss", () => {
    const adopted = adoptRecordedLoan({ ...plan, exclude: ["owner"], note: "Keep working context", add_backs: [{ kind: "owner_salary", amount_monthly: 100, source: "desk", note: "Reviewed", label: "Owner" }] }, recorded);
    const loan = { amount: 200000, ratePct: 29.99, termMonths: 24, structure: "amortizing" as const, structureExplicit: true, interestOnlyMonths: 0, repaymentConfig: { amortization_months: 60, balloons: [] }, paymentsPerYear: 12 };
    const fields = clientDraftLoanFields(loan);
    const next = applyWorkingLoan(adopted, loanFromClientDraft(fields));
    expect(next).toMatchObject({ expected_updated_at: plan.expected_updated_at, retire: plan.retire, exclude: ["owner"], note: "Keep working context", new_loan_amount: 200000, new_loan_rate_pct: 29.99, new_loan_term_months: 24, new_loan_structure: "amortizing", new_loan_interest_only_months: 0, new_loan_repayment_config: { amortization_months: 60 } });
    expect(next.add_backs).toEqual(adopted.add_backs);
    expect(next.terms_ref).toBeNull();
    expect(next.overrides?.debt_service_monthly).toBeNull();
    expect(next.overrides?.income_annual).toBe(200000);
    expect(sameWorkingLoan(loan, workingLoanFromPlan(next))).toBe(true);
  });

  it("preserves explicit simple interest, zero APR, fractional cadence and true staff overrides on Apply", () => {
    const base = { ...adoptRecordedLoan(plan, recorded), overrides: { income_annual: 200000, income_note: "Income", debt_service_monthly: 750, debt_service_note: "Reviewed staff basis" } };
    const loan = workingLoanFromPlan(base)!;
    const next = applyWorkingLoan(base, loan);
    expect(next.overrides).toEqual(base.overrides);
    expect(next.new_loan_structure).toBe("simple_interest");
    expect(next.new_loan_rate_pct).toBe(0);
    expect(next.new_loan_payments_per_year).toBe(51.5);
    next.new_loan_repayment_config!.balloons![0].value = 45;
    expect(base.new_loan_repayment_config!.balloons![0].value).toBe(20);
  });

  it("accepts canonical loan fields and revision while keeping other unsaved scenario edits", () => {
    const current = { ...plan, retire: ["new-payoff"], exclude: ["owner"], note: "Pending note" };
    const record = { ...adoptRecordedLoan(plan, recorded), updated_at: "2026-11-07T16:00:00Z", overrides: { income_annual: 90000, income_note: "Old income", debt_service_monthly: 83.33, debt_service_note: "Refinance per terms v4" } } as unknown as FinancialPlanRecord;
    const next = mergeAcknowledgedLoan(current, record);
    expect(next).toMatchObject({ expected_updated_at: record.updated_at, retire: ["new-payoff"], exclude: ["owner"], note: "Pending note", new_loan_amount: recorded.amount, terms_ref: { version: 4 } });
    expect(next.overrides).toMatchObject({ income_annual: 200000, income_note: "Reviewed scenario", debt_service_monthly: 83.33 });
  });

  it("compares configured defaults semantically while preserving legacy/configured distinction", () => {
    const loan = workingLoanFromPlan(adoptRecordedLoan(plan, recorded))!;
    expect(sameWorkingLoan({ ...loan, repaymentConfig: { balloons: [] }, interestOnlyMonths: null }, { ...loan, repaymentConfig: { after_balloon: "keep_payment", balloons: [] }, interestOnlyMonths: 0 })).toBe(true);
    expect(sameWorkingLoan({ ...loan, repaymentConfig: null }, { ...loan, repaymentConfig: { balloons: [] } })).toBe(false);
    expect(sameWorkingLoan(loan, { ...loan, structure: "amortizing" })).toBe(false);
    expect(sameWorkingLoan(loan, { ...loan, ratePct: 1 })).toBe(false);
  });

  it("never converts missing legacy retained debt into a known zero override", () => {
    const missing = { ...recorded, retained_annual_debt_service: null };
    const existingAutomatic = adoptRecordedLoan(plan, recorded);
    const result = adoptRecordedLoan(existingAutomatic, missing);
    expect(result.terms_ref?.retained_annual_debt_service).toBeNull();
    expect(result.overrides?.debt_service_monthly).toBeNull();
    expect(result.overrides?.income_annual).toBe(200000);
    const staff = adoptRecordedLoan({ ...plan, overrides: { ...plan.overrides!, debt_service_monthly: 800, debt_service_note: "Staff reviewed" } }, missing);
    expect(staff.overrides?.debt_service_monthly).toBe(800);
    expect(adoptRecordedLoan(plan, { ...recorded, retained_annual_debt_service: 0 }).overrides?.debt_service_monthly).toBe(0);
  });

  it.each([0, 1000, 12345.67])("keeps the exact reviewed retained annual basis %s while the monthly figure is rounded", (retained) => {
    const adopted = adoptRecordedLoan(plan, { ...recorded, retained_annual_debt_service: retained });
    expect(recordedRetainedAnnual(adopted)).toBe(retained);
    expect(recordedRetainedAnnual({ ...adopted, overrides: { ...adopted.overrides!, debt_service_note: "Reviewed staff override" } })).toBeNull();
    expect(recordedRetainedAnnual({ ...adopted, overrides: { ...adopted.overrides!, debt_service_monthly: 2000 } })).toBeNull();
  });

  it.each([51.96, 51.5, 18])("preserves %s payments per year without advanced configuration or changing recorded monthly coverage", (periods) => {
    const source = { ...recorded, repayment_config: null, payments_per_year: periods, structure: "amortizing", interest_only_months: 0, payment_monthly: 6000 };
    const adopted = adoptRecordedLoan(plan, source);
    expect(adopted.new_loan_payments_per_year).toBe(periods);
    expect(workingLoanFromPlan(adopted)?.paymentsPerYear).toBe(periods);
    expect(clientDraftLoanFields(workingLoanFromPlan(adopted)!)).toMatchObject(periods === 51.96 ? { repayment_frequency: "weekly" } : { repayment_frequency: "custom", custom_payments_per_year: String(periods) });
    const cockpit = { debt: { obligations: [], service: { monthly: 1000 } }, bank: { recurring: { payees: [], months_read: [] } }, dscr: { headline: { key: "pl", numerator: 112000 }, candidates: [{ key: "pl", numerator: 112000, label: "P&L", value: 9.33 }] }, plan: { evaluation: {} } } as unknown as FinancialCockpit;
    const result = evaluatePlanLocally(cockpit, adopted, []);
    expect(result.newPayment).toBe(6000);
    expect(result.serviceAfterAnnual).toBe(72999.96);
  });

  it("inherits legacy missing cadence only from the exact recorded source version", () => {
    const legacy = { ...adoptRecordedLoan(plan, { ...recorded, repayment_config: null }), new_loan_payments_per_year: null };
    expect(recordedLoanCadence(legacy, recorded)).toBe(51.5);
    expect(recordedLoanCadence({ ...legacy, new_loan_payments_per_year: 18 }, recorded)).toBe(18);
    expect(recordedLoanCadence({ ...legacy, new_payment_source: "manual_terms" }, recorded)).toBeNull();
    for (const other of [{ ...recorded, id: "other" }, { ...recorded, kind: "production_term_sheet" }, { ...recorded, version: 5 }, { ...recorded, payments_per_year: null }]) expect(recordedLoanCadence(legacy, other)).toBeNull();
    expect(recordedLoanCadence(legacy, null)).toBeNull();
    expect(recordedLoanCadence({ ...legacy, terms_ref: null }, recorded)).toBeNull();
  });
});
