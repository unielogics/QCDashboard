import { afterEach, describe, expect, it, vi } from "vitest";
import { addLoanBusinessDays, addLoanMonths, loanDateProblem, resolveLoanDates, savedLoanDates } from "../loanDates";
import { adoptRecordedLoan, applyWorkingLoan, clientDraftLoanFields, loanFromClientDraft, mergeAcknowledgedLoan, releaseRecordedLoan, sameWorkingLoan, workingLoanFromPlan } from "../loanTermsSync";
import type { FinancialPlanRecord, FinancialPlanWrite, RecordedTerms } from "../financialCockpit";
import { draftFromTerms, payloadFromDraft } from "@/components/application/ApplicationClientTermsPanel";
import type { ApplicationClientTerms } from "../applicationProfile";

const plan = { retire: ["synthetic-payoff"], exclude: [], add_backs: [], new_loan_amount: 100000, new_loan_rate_pct: 10,
  new_loan_term_months: 12, new_loan_structure: "amortizing", new_loan_interest_only: false,
  new_payment_monthly: null, new_payment_source: "manual_terms", new_loan_interest_only_months: 0, note: null,
  new_loan_expected_funding_date: "2026-01-31", new_loan_maturity_date: "2027-01-31", new_loan_maturity_mode: "automatic",
  overrides: { income_annual: 200000, income_note: "Reviewed income", debt_service_monthly: null, debt_service_note: null } } as FinancialPlanWrite;
const saved = { version: 4, amount: 100000, apr_pct: 10, term_months: 12, loan_type: "term", funder_type: "other", loan_type_options: [],
  loan_structure: "amortizing", interest_only_months: 0, repayment_frequency: "monthly", conditions: [], co_brand_enabled: false,
  closing_estimate_days: 5, expiration_days: 7 } as unknown as ApplicationClientTerms;
afterEach(() => vi.useRealTimers());

describe("estimated funding and maturity dates", () => {
  it.each([["2026-01-31", 1, "2026-02-28"], ["2024-01-31", 1, "2024-02-29"], ["2024-02-29", 12, "2025-02-28"], ["2026-11-30", 3, "2027-02-28"]])("adds calendar months with month-end clamping", (date, months, expected) => {
    expect(addLoanMonths(String(date), Number(months))).toBe(expected);
  });
  it("leaves missing/invalid dates and terms unknown rather than inventing a maturity", () => {
    for (const date of ["", "0000-01-31", "2026-02-30", "invalid"]) expect(addLoanMonths(date, 12)).toBe("");
    for (const term of [null, 0, 1.5, 601]) expect(addLoanMonths("2026-01-01", term)).toBe("");
    expect(resolveLoanDates({ expected_funding_date: "", maturity_date: "2027-01-01", maturity_date_mode: "automatic" }, 12).maturity_date).toBe("");
  });
  it("counts weekdays only for a new closing estimate and preserves an explicit manual override", () => {
    expect(addLoanBusinessDays("2026-11-06", 1)).toBe("2026-11-09");
    expect(addLoanBusinessDays("2026-11-06", 5)).toBe("2026-11-13");
    const manual = { expected_funding_date: "2026-01-31", maturity_date: "2028-06-30", maturity_date_mode: "manual" as const };
    expect(resolveLoanDates(manual, 6)).toEqual(manual);
    expect(loanDateProblem({ ...manual, maturity_date: "" }, 6)).toMatch(/manual override/);
    expect(loanDateProblem({ ...manual, maturity_date: "2025-12-31" }, 6)).toMatch(/after/);
  });
  it("preserves historical manual maturity when no mode was stored", () => {
    expect(savedLoanDates({ expected_funding_date: "2026-01-31", maturity_date: "2028-06-30" }, 12).maturity_date_mode).toBe("manual");
    expect(savedLoanDates({ expected_funding_date: "2026-01-31", maturity_date: "2027-01-31" }, 12).maturity_date_mode).toBe("automatic");
  });
  it("carries dates through working loan, terms draft and a new term without altering payoff selections", () => {
    const loan = workingLoanFromPlan(plan)!;
    expect(clientDraftLoanFields(loan)).toMatchObject({ expected_funding_date: "2026-01-31", maturity_date: "2027-01-31", maturity_date_mode: "automatic" });
    const changed = applyWorkingLoan(plan, { ...loan, termMonths: 1 });
    expect(changed.new_loan_maturity_date).toBe("2026-02-28");
    expect(changed.retire).toEqual(plan.retire);
    expect(loanFromClientDraft({ ...draftFromTerms(saved), expected_funding_date: "2026-01-31", maturity_date: "2026-02-28", maturity_date_mode: "manual" }).maturityMode).toBe("manual");
    expect(sameWorkingLoan(loan, { ...loan, maturityMode: "manual" })).toBe(false);
  });
  it("distinguishes old callers omitting dates from an explicit clear", () => {
    const loan = workingLoanFromPlan(plan)!;
    const { expectedFundingDate: _funding, maturityDate: _maturity, maturityMode: _mode, ...oldLoan } = loan;
    expect(applyWorkingLoan(plan, { ...oldLoan, termMonths: 1 }).new_loan_maturity_date).toBe("2026-02-28");
    const cleared = applyWorkingLoan(plan, { ...oldLoan, expectedFundingDate: "", maturityDate: "", maturityMode: "automatic" });
    expect(cleared.new_loan_expected_funding_date).toBeNull();
    expect(cleared.new_loan_maturity_date).toBeNull();
  });
  it("adopts and acknowledges version dates and clears them when the loan is released", () => {
    const record = { kind: "client_terms", id: "synthetic-terms", version: 2, label: "Terms v2", amount: 100000, rate_pct: 10, term_months: 12,
      interest_only: false, treatment: "additive", payment_monthly: 10000, expected_funding_date: "2026-03-31", maturity_date: "2027-07-31", maturity_date_mode: "manual" } as RecordedTerms;
    const adopted = adoptRecordedLoan(plan, record);
    expect(adopted.new_loan_expected_funding_date).toBe("2026-03-31");
    expect(adopted.new_loan_maturity_date).toBe("2027-07-31");
    expect(adopted.new_loan_maturity_mode).toBe("manual");
    const acknowledged = mergeAcknowledgedLoan(plan, { ...adopted, updated_at: "2026-11-11T10:00:00Z" } as FinancialPlanRecord);
    expect(acknowledged.new_loan_maturity_date).toBe("2027-07-31");
    expect(acknowledged.overrides?.income_annual).toBe(200000);
    const cleared = releaseRecordedLoan(acknowledged);
    expect(cleared.new_loan_expected_funding_date).toBeNull();
    expect(cleared.new_loan_maturity_date).toBeNull();
  });
  it("round-trips an automatic calendar date and a saved manual date in client terms", () => {
    const draft = draftFromTerms({ ...saved, expected_funding_date: "2026-01-31", maturity_date_mode: "automatic", term_months: 1 });
    expect(payloadFromDraft(draft, 4)).toMatchObject({ expected_funding_date: "2026-01-31", maturity_date: "2026-02-28", maturity_date_mode: "automatic" });
    const manual = { ...draft, maturity_date_mode: "manual" as const, maturity_date: "2027-06-30" };
    expect(payloadFromDraft(manual, 4).maturity_date).toBe("2027-06-30");
    expect(() => payloadFromDraft({ ...manual, maturity_date: "" }, 4)).toThrow(/manual override/);
  });
  it("only seeds today's closing estimate for a genuinely new terms draft", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
    expect(draftFromTerms({ ...saved, version: 0 }).expected_funding_date).toBe("2026-11-13");
    expect(draftFromTerms(saved).expected_funding_date).toBe("");
  });
});
