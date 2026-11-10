import { applyWorkingLoan } from "./loanTermsSync";
import type { FinancialPlanRead, FinancialPlanWrite } from "./financialCockpit";
import type { DealBudgetLoan } from "./dealBudget";

/** Preserve payoff selections and earnings review while pricing the edited loan. */
export function dealBudgetPlan(base: FinancialPlanWrite | FinancialPlanRead | null | undefined, loan?: DealBudgetLoan | null): FinancialPlanWrite | null {
  const record = base && "record" in base ? base.record : base;
  if (!record) return null;
  const plan: FinancialPlanWrite = { ...record, expected_updated_at: "updated_at" in record ? record.updated_at ?? null : (record as FinancialPlanWrite).expected_updated_at ?? null,
    retire: record.retire ?? [], exclude: record.exclude ?? [], new_payment_source: record.new_payment_source as FinancialPlanWrite["new_payment_source"], new_loan_interest_only: record.new_loan_interest_only ?? false,
    new_loan_structure: record.new_loan_structure ?? null, new_loan_interest_only_months: record.new_loan_interest_only_months ?? null,
    add_backs: record.add_backs ?? [], overrides: record.overrides ?? null };
  return loan ? applyWorkingLoan(plan, { amount: loan.amount, ratePct: loan.rate_pct, termMonths: loan.term_months, structure: loan.structure as "amortizing" | "simple_interest" | "interest_only", interestOnlyMonths: loan.interest_only_months ?? 0, repaymentConfig: loan.repayment_config ?? null, paymentsPerYear: loan.payments_per_year ?? null }) : plan;
}
