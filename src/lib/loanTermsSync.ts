import type { FinancialPlanWrite, RecordedTerms } from "./financialCockpit";
import { defaultStructure, type LoanStructure, type RepaymentConfig } from "./loanSchedule";
import { copyRepaymentConfig, termsCadenceForPeriods } from "./repaymentConfig";
import { roundEbitdaMoney } from "./ebitdaRefinance";

export type SyncedLoan = { amount: number | null; ratePct: number | null; termMonths: number | null; structure: LoanStructure; interestOnlyMonths: number | null; repaymentConfig?: RepaymentConfig | null; paymentsPerYear?: number | null };

/** The same loan-field mapping is used by the strip and full terms editor. */
export function clientDraftLoanFields(loan: SyncedLoan) {
  return {
    amount: loan.amount == null ? "" : String(loan.amount), apr_pct: loan.ratePct == null ? "" : String(loan.ratePct), term_months: loan.termMonths == null ? "" : String(loan.termMonths),
    loan_structure: loan.repaymentConfig || loan.structure !== defaultStructure(loan.termMonths) ? loan.structure : "" as const,
    interest_only_months: loan.structure === "interest_only" || !loan.interestOnlyMonths ? "" : String(loan.interestOnlyMonths),
    repayment_config: copyRepaymentConfig(loan.repaymentConfig), ...termsCadenceForPeriods(loan.paymentsPerYear ?? 12),
  };
}

function releaseAutomaticRefinance(plan: FinancialPlanWrite) {
  if (!plan.overrides?.debt_service_note?.startsWith("Refinance per ")) return plan.overrides;
  const next = { ...plan.overrides, debt_service_monthly: null, debt_service_note: null };
  return next.income_annual != null || next.income_note ? next : null;
}

/** Mirrors the server's versioned recorded-terms adoption; payoff selections remain recoverable. */
export function adoptRecordedLoan(plan: FinancialPlanWrite, recorded: RecordedTerms): FinancialPlanWrite {
  const structure: LoanStructure = recorded.structure === "simple_interest" || recorded.structure === "amortizing" || recorded.structure === "interest_only" ? recorded.structure : recorded.interest_only ? "interest_only" : "amortizing";
  const retained = recorded.retained_annual_debt_service ?? 0;
  const overrides = recorded.treatment === "refinance" ? { income_annual: null, income_note: null, ...plan.overrides, debt_service_monthly: roundEbitdaMoney(retained / 12), debt_service_note: `Refinance per ${recorded.label}: existing debt retained per recorded terms.` } : releaseAutomaticRefinance(plan);
  return { ...plan, new_payment_monthly: recorded.payment_monthly, new_payment_source: "recorded_terms", new_loan_amount: recorded.amount, new_loan_rate_pct: recorded.rate_pct, new_loan_term_months: recorded.term_months, new_loan_interest_only: recorded.interest_only, new_loan_structure: structure, new_loan_interest_only_months: recorded.interest_only_months ?? 0, new_loan_repayment_config: copyRepaymentConfig(recorded.repayment_config), new_loan_payments_per_year: recorded.repayment_config ? recorded.payments_per_year ?? 12 : null, overrides, terms_ref: { kind: recorded.kind, id: recorded.id, version: recorded.version, label: recorded.label, treatment: recorded.treatment === "refinance" ? "refinance" : "additive", retained_annual_debt_service: recorded.retained_annual_debt_service } };
}

export function releaseRecordedLoan(plan: FinancialPlanWrite): FinancialPlanWrite {
  return { ...plan, new_payment_monthly: null, new_payment_source: null, new_loan_amount: null, new_loan_rate_pct: null, new_loan_term_months: null, new_loan_structure: null, new_loan_interest_only: false, new_loan_interest_only_months: null, new_loan_repayment_config: null, new_loan_payments_per_year: null, terms_ref: null, overrides: releaseAutomaticRefinance(plan) };
}
