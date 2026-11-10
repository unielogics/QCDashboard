import type { LocalPlanEvaluation } from "./cockpitSimulation";
import type { PlanEvaluation } from "./financialCockpit";
import { repaymentPreview } from "./repaymentConfig";

/** Keep the current statement scope, but use the server's cost-aware scenario. */
export function withBudgetEvaluation(local: LocalPlanEvaluation, server: PlanEvaluation | null | undefined, pending = false): LocalPlanEvaluation {
  if (pending) return { ...local, ebitda: local.ebitda ? { ...local.ebitda, after: null, annual_after: null, adjusted_annual: { ...local.ebitda.adjusted_annual, after: null } } : undefined, headlineAfter: null, incomeAfter: null, serviceAfter: null, serviceAfterAnnual: null, newPayment: null, newRegularPayment: null, newInterestOnlyPayment: null, netAfterAverage: null, endingAfterLast: null, monthsDippingNegativeAfter: null, noDebtLeft: false, rows: [], coverageUnavailableReason: "Calculating the current loan and financing costs." };
  if (!server) return local;
  const loan = server.loan_terms;
  const schedule = loan ? repaymentPreview(loan.amount, loan.rate_pct, loan.term_months, { structure: loan.structure, interestOnlyMonths: loan.interest_only_months, periodsPerYear: loan.payments_per_year ?? 12, repaymentConfig: loan.repayment_config }).schedule : local.schedule;
  return { ...local, schedule, loanTerms: loan ?? local.loanTerms, ebitda: server.ebitda ?? local.ebitda,
    headlineAfter: server.headline_after, incomeBefore: server.income_before_annual ?? local.incomeBefore, incomeAfter: server.income_after_annual ?? null,
    serviceAfter: server.debt_service_after_monthly, serviceAfterAnnual: server.debt_service_after_annual,
    newPayment: server.new_payment_monthly, newRegularPayment: server.new_regular_payment_monthly ?? null, newInterestOnlyPayment: server.new_interest_only_payment_monthly ?? null,
    serviceAfterRegular: server.debt_service_after_regular_monthly ?? null, serviceAfterInterestOnly: server.debt_service_after_interest_only_monthly ?? null,
    netAfterAverage: server.net_after_avg, endingAfterLast: server.ending_after_last, monthsDippingNegativeAfter: server.months_dipping_negative_after, cashKept: server.cash_kept,
    noDebtLeft: server.no_debt_left, coverageUnavailableReason: server.coverage_unavailable_reason ?? null,
    replayProjectionAvailable: server.replay_projection_available ?? local.replayProjectionAvailable,
    rows: (server.replay ?? []).map(row => ({ month: row.month, label: row.label, deposits: row.deposits, withdrawals: row.withdrawals, withdrawalsAfter: row.withdrawals_after, net: row.net, netAfter: row.net_after, ending: row.ending, endingAfter: row.ending_after, lowest: row.lowest, lowestAfter: row.lowest_after, removed: row.removed, added: row.added, cumulative: row.cumulative })),
  };
}
