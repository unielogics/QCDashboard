import { scheduleCashFlows, type LoanScheduleSummary, type RiskProfile } from "./loanSchedule";

export const LOAN_SCHEDULE_PAGE_SIZE = 24;
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** The displayed schedule follows actual cash, including the maturity principal exactly once. */
export function loanScheduleRows(schedule: LoanScheduleSummary, risk?: RiskProfile | null) {
  const cash = scheduleCashFlows(schedule);
  let principalPaid = 0, interestPaid = 0, receipts = 0;
  return schedule.rows.map((row, index) => {
    const payment = cash[index];
    const principal = row.total_principal ?? cents(payment - row.interest);
    principalPaid = cents(principalPaid + principal);
    interestPaid = cents(interestPaid + row.interest);
    receipts = cents(receipts + payment);
    const balance = row.balance_after_cash ?? cents(Math.max(0, schedule.amount - principalPaid));
    return { ...row, cash: payment, principal, balance, principalPaid, interestPaid, receipts,
      paidDownPct: Math.min(100, Math.max(0, (schedule.amount - balance) / schedule.amount * 100)),
      principalExposurePct: Math.max(0, balance / schedule.amount * 100),
      cashAtRiskPct: Math.max(0, (schedule.amount - receipts) / schedule.amount * 100),
      coverage: risk?.cash_coverage_by_period != null ? risk.cash_coverage_by_period[index]?.coverage ?? null : risk?.coverage_by_period[index]?.coverage ?? null };
  });
}

export type LoanScheduleDisplayRow = ReturnType<typeof loanScheduleRows>[number];
