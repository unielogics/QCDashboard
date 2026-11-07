import type { FinancialPlanRecord, FinancialPlanWrite, RecordedTerms } from "./financialCockpit";
import { defaultStructure, type LoanStructure, type RepaymentConfig } from "./loanSchedule";
import { copyRepaymentConfig, termsCadenceForPeriods } from "./repaymentConfig";
import { roundEbitdaMoney } from "./ebitdaRefinance";

export type SyncedLoan = { amount: number | null; ratePct: number | null; termMonths: number | null; structure: LoanStructure; structureExplicit?: boolean; interestOnlyMonths: number | null; repaymentConfig?: RepaymentConfig | null; paymentsPerYear?: number | null };
export type LoanRefinanceContext = { treatment: "refinance"; retainedAnnualService: number | null };
export type LoanScenarioPreviewer = (loan: SyncedLoan, context: { treatment: "additive" | "refinance"; retainedAnnualService: number | null }) => {
  before: number | null; after: number | null; basis: string; noDebtLeft?: boolean; unavailableReason?: string | null;
};

/** The same loan-field mapping is used by the strip and full terms editor. */
export function clientDraftLoanFields(loan: SyncedLoan) {
  return {
    amount: loan.amount == null ? "" : String(loan.amount), apr_pct: loan.ratePct == null ? "" : String(loan.ratePct), term_months: loan.termMonths == null ? "" : String(loan.termMonths),
    loan_structure: loan.structureExplicit === false ? "" as const : loan.structure,
    interest_only_months: loan.structure === "interest_only" || loan.interestOnlyMonths == null ? "" : String(loan.interestOnlyMonths),
    repayment_config: copyRepaymentConfig(loan.repaymentConfig), ...termsCadenceForPeriods(loan.paymentsPerYear ?? 12),
  };
}

export function releaseAutomaticRefinance(plan: FinancialPlanWrite) {
  if (!plan.overrides?.debt_service_note?.startsWith("Refinance per ")) return plan.overrides;
  const next = { ...plan.overrides, debt_service_monthly: null, debt_service_note: null };
  return next.income_annual != null || next.income_note ? next : null;
}

export function workingLoanFromPlan(plan: FinancialPlanWrite, includeEmpty = false): SyncedLoan | null {
  if (![plan.new_loan_amount, plan.new_loan_rate_pct, plan.new_loan_term_months, plan.new_loan_structure,
    plan.new_loan_repayment_config].some((value) => value != null) && !plan.new_loan_interest_only && !includeEmpty) return null;
  return { amount: plan.new_loan_amount, ratePct: plan.new_loan_rate_pct, termMonths: plan.new_loan_term_months,
    structure: plan.new_loan_interest_only ? "interest_only" : plan.new_loan_structure ?? defaultStructure(plan.new_loan_term_months),
    structureExplicit: !!plan.new_loan_interest_only || plan.new_loan_structure != null,
    interestOnlyMonths: plan.new_loan_interest_only_months ?? null,
    repaymentConfig: copyRepaymentConfig(plan.new_loan_repayment_config), paymentsPerYear: plan.new_loan_payments_per_year ?? 12 };
}

type ClientLoanFields = { amount: string; apr_pct: string; term_months: string; loan_structure: LoanStructure | "";
  interest_only_months: string; repayment_config: RepaymentConfig | null; repayment_frequency: string; custom_payments_per_year: string };
const draftNumber = (value: string): number | null => {
  const text = value.trim().replace(/[$,%\s]/g, "");
  const parsed = text ? Number(text) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

export function loanFromClientDraft(draft: ClientLoanFields): SyncedLoan {
  const term = draftNumber(draft.term_months);
  return { amount: draftNumber(draft.amount), ratePct: draftNumber(draft.apr_pct), termMonths: term,
    structure: draft.loan_structure || defaultStructure(term), structureExplicit: draft.loan_structure !== "",
    interestOnlyMonths: draftNumber(draft.interest_only_months), repaymentConfig: copyRepaymentConfig(draft.repayment_config),
    paymentsPerYear: draft.repayment_frequency === "custom" ? draftNumber(draft.custom_payments_per_year)
      : ({ daily: 252, weekly: 51.96, biweekly: 25.98, monthly: 12 } as Record<string, number>)[draft.repayment_frequency] ?? null };
}

/** Applies a working loan locally; scenario selections and staff corrections stay intact. */
export function applyWorkingLoan(plan: FinancialPlanWrite, loan: SyncedLoan): FinancialPlanWrite {
  return { ...plan, new_loan_amount: loan.amount, new_loan_rate_pct: loan.ratePct, new_loan_term_months: loan.termMonths,
    new_loan_structure: loan.structureExplicit === false ? null : loan.structure, new_loan_interest_only: loan.structure === "interest_only",
    new_loan_interest_only_months: loan.structure === "interest_only" ? null : loan.interestOnlyMonths,
    new_loan_repayment_config: copyRepaymentConfig(loan.repaymentConfig), new_loan_payments_per_year: loan.paymentsPerYear ?? 12,
    new_payment_monthly: null, new_payment_source: loan.amount != null ? "manual_terms" : null,
    terms_ref: null, overrides: releaseAutomaticRefinance(plan) };
}

/** A terms save acknowledges only the shared loan/adoption fields, never unrelated working edits. */
export function mergeAcknowledgedLoan(plan: FinancialPlanWrite, record: FinancialPlanRecord): FinancialPlanWrite {
  const overrides = { ...EMPTY_LOAN_OVERRIDES, ...plan.overrides,
    debt_service_monthly: record.overrides?.debt_service_monthly ?? null,
    debt_service_note: record.overrides?.debt_service_note ?? null };
  return { ...plan, expected_updated_at: record.updated_at ?? null,
    new_loan_amount: record.new_loan_amount, new_loan_rate_pct: record.new_loan_rate_pct, new_loan_term_months: record.new_loan_term_months,
    new_loan_structure: record.new_loan_structure ?? null, new_loan_interest_only: !!record.new_loan_interest_only,
    new_loan_interest_only_months: record.new_loan_interest_only_months ?? null,
    new_loan_repayment_config: copyRepaymentConfig(record.new_loan_repayment_config), new_loan_payments_per_year: record.new_loan_payments_per_year ?? null,
    new_payment_monthly: record.new_payment_monthly, new_payment_source: record.new_payment_source as FinancialPlanWrite["new_payment_source"],
    terms_ref: record.terms_ref ?? null,
    overrides: Object.values(overrides).some((value) => value != null) ? overrides : null };
}

const EMPTY_LOAN_OVERRIDES = { income_annual: null, income_note: null, debt_service_monthly: null, debt_service_note: null };

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
