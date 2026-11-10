import type { SyncedLoan } from "./loanTermsSync";
import { copyRepaymentConfig, termsCadenceForPeriods } from "./repaymentConfig";

/** Overlay the primary offer with the shared proposal, retaining its selected product identity. */
export function sharedFinancingOfferFields(loan: SyncedLoan) {
  const text = (value: number | null | undefined) => value == null ? "" : String(value);
  const cadence = termsCadenceForPeriods(loan.paymentsPerYear ?? 12);
  return {
    amount: text(loan.amount), rate_pct: text(loan.ratePct), term_months: text(loan.termMonths),
    interest_only: loan.structure === "interest_only", structure: loan.structure,
    interest_only_months: text(loan.interestOnlyMonths), repayment_config: copyRepaymentConfig(loan.repaymentConfig),
    payment_frequency: cadence.repayment_frequency, payments_per_year: cadence.custom_payments_per_year,
    factor_rate: null,
  };
}
