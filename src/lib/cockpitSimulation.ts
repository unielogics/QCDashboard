// What if these regular payments stopped? A pure month-by-month replay of
// the statements with chosen recurring debits removed (the advance
// remittances, say) and an optional new monthly payment added, carrying the
// cash kept forward into every later ending balance. Lowest balances are
// estimated: the prior months' carried cash plus half of the current month's
// change, since a month's low usually falls mid-month.

import type { CockpitMonth, RecurringPayee } from "@/lib/financialCockpit";

export type SimulationRow = {
  month: string;
  label: string;
  deposits: number | null;
  withdrawals: number | null;
  withdrawalsAfter: number | null;
  net: number | null;
  netAfter: number | null;
  ending: number | null;
  endingAfter: number | null;
  lowest: number | null;
  lowestAfter: number | null;
  removed: number;
  added: number;
  cumulative: number;
};

export type SimulationResult = {
  rows: SimulationRow[];
  removedMonthlyAverage: number;
  addedMonthly: number;
  netBeforeAverage: number | null;
  netAfterAverage: number | null;
  endingBeforeLast: number | null;
  endingAfterLast: number | null;
  monthsEndingNegativeBefore: number;
  monthsEndingNegativeAfter: number;
  monthsDippingNegativeBefore: number;
  monthsDippingNegativeAfter: number;
  lowestBefore: number | null;
  lowestAfter: number | null;
  cashKept: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const mean = (values: Array<number | null>): number | null => {
  const numbers = values.filter((v): v is number => v != null && Number.isFinite(v));
  return numbers.length ? round2(numbers.reduce((a, b) => a + b, 0) / numbers.length) : null;
};

/** The amount a payee took in a month: the amount read for that month, zero when the month was read and the payee was absent, the payee's average when the month was never read for payees. */
export function payeeAmountInMonth(payee: RecurringPayee, month: string, monthsRead: string[]): number {
  const seen = payee.monthly?.[month];
  if (seen != null && Number.isFinite(seen)) return seen;
  if (monthsRead.includes(month)) return 0;
  return payee.monthly_average ?? 0;
}

export function simulateRemovals(months: CockpitMonth[], payees: RecurringPayee[], removedKeys: Iterable<string>, addedMonthly: number, monthsRead: string[]): SimulationResult {
  const removedSet = new Set(removedKeys);
  const removed = payees.filter((p) => removedSet.has(p.key));
  const added = Number.isFinite(addedMonthly) && addedMonthly > 0 ? round2(addedMonthly) : 0;
  let cumulative = 0;
  const rows: SimulationRow[] = months.map((m) => {
    const removedHere = round2(removed.reduce((sum, p) => sum + payeeAmountInMonth(p, m.month, monthsRead), 0));
    const change = removedHere - added;
    const before = cumulative;
    cumulative = round2(cumulative + change);
    const withdrawalsAfter = m.withdrawals == null ? null : round2(m.withdrawals - removedHere + added);
    const netAfter = m.deposits == null || withdrawalsAfter == null ? null : round2(m.deposits - withdrawalsAfter);
    return {
      month: m.month,
      label: m.label,
      deposits: m.deposits,
      withdrawals: m.withdrawals,
      withdrawalsAfter,
      net: m.net,
      netAfter,
      ending: m.ending_balance,
      endingAfter: m.ending_balance == null ? null : round2(m.ending_balance + cumulative),
      lowest: m.low_balance,
      lowestAfter: m.low_balance == null ? null : round2(m.low_balance + before + change / 2),
      removed: removedHere,
      added,
      cumulative,
    };
  });
  const last = rows[rows.length - 1];
  const lowestOf = (values: Array<number | null>) => {
    const numbers = values.filter((v): v is number => v != null);
    return numbers.length ? Math.min(...numbers) : null;
  };
  return {
    rows,
    removedMonthlyAverage: rows.length ? round2(rows.reduce((s, r) => s + r.removed, 0) / rows.length) : 0,
    addedMonthly: added,
    netBeforeAverage: mean(rows.map((r) => r.net)),
    netAfterAverage: mean(rows.map((r) => r.netAfter)),
    endingBeforeLast: last?.ending ?? null,
    endingAfterLast: last?.endingAfter ?? null,
    monthsEndingNegativeBefore: rows.filter((r) => r.ending != null && r.ending < 0).length,
    monthsEndingNegativeAfter: rows.filter((r) => r.endingAfter != null && r.endingAfter < 0).length,
    monthsDippingNegativeBefore: rows.filter((r) => r.lowest != null && r.lowest < 0).length,
    monthsDippingNegativeAfter: rows.filter((r) => r.lowestAfter != null && r.lowestAfter < 0).length,
    lowestBefore: lowestOf(rows.map((r) => r.lowest)),
    lowestAfter: lowestOf(rows.map((r) => r.lowestAfter)),
    cashKept: cumulative,
  };
}

// ---------------------------------------------------------------------------
// The plan, evaluated locally for instant feedback (the same arithmetic as
// app/services/financial_plan.py; the saved plan's figures come back from
// the server and replace these).
// ---------------------------------------------------------------------------

import type { FinancialCockpit, FinancialPlanWrite, Obligation, PlanCandidate } from "@/lib/financialCockpit";
import { amortizedPayment, dscrStatusOf } from "@/lib/financialCockpit";

export type LocalPlanEvaluation = {
  retiredMonthly: number;
  payoffTotal: number | null;
  payoffUnknown: number;
  excludedMonthly: number;
  newPayment: number | null;
  newPaymentSource: string | null;
  loanAmountNeeded: number | null;
  serviceBefore: number;
  serviceBeforeNewPayment: number;
  serviceAfter: number;
  candidates: PlanCandidate[];
  headlineAfter: number | null;
  noDebtLeft: boolean;
  rows: SimulationRow[];
  netAfterAverage: number | null;
  endingAfterLast: number | null;
  monthsDippingNegativeAfter: number;
  cashKept: number;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

function obligationAmountInMonth(obligation: Obligation, month: string, payees: RecurringPayee[], monthsRead: string[]): number {
  const payee = obligation.linked_payee_key ? payees.find((p) => p.key === obligation.linked_payee_key) : undefined;
  if (!payee) return obligation.monthly ?? 0;
  return payeeAmountInMonth(payee, month, monthsRead);
}

export function evaluatePlanLocally(cockpit: FinancialCockpit, plan: FinancialPlanWrite, months: CockpitMonth[]): LocalPlanEvaluation {
  const obligations = cockpit.debt.obligations ?? [];
  const payees = cockpit.bank.recurring.payees;
  const monthsRead = cockpit.bank.recurring.months_read;
  const retire = new Set(plan.retire);
  const exclude = new Set(plan.exclude);
  const retired = obligations.filter((o) => retire.has(o.id));
  const retiredMonthly = r2(retired.filter((o) => o.in_debt_service).reduce((s, o) => s + (o.monthly ?? 0), 0));
  const payoffs = retired.map((o) => o.payoff).filter((v): v is number => v != null);
  const payoffTotal = payoffs.length ? r2(payoffs.reduce((a, b) => a + b, 0)) : null;
  const excludedMonthly = r2(payees.filter((p) => exclude.has(`payee:${p.key}`)).reduce((s, p) => s + (p.monthly_average ?? 0), 0));
  let newPayment = plan.new_payment_monthly;
  let source: string | null = plan.new_payment_source;
  if (newPayment == null && plan.new_loan_amount && plan.new_loan_term_months) {
    newPayment = amortizedPayment(plan.new_loan_amount, plan.new_loan_rate_pct ?? 0, plan.new_loan_term_months);
    source = source ?? "manual_terms";
  }
  if (newPayment == null && cockpit.dscr.proposed) {
    newPayment = cockpit.dscr.proposed.monthly_payment;
    source = "term_sheet";
  }
  const serviceBefore = cockpit.debt.service.monthly ?? 0;
  const serviceBeforeNewPayment = r2(Math.max(0, serviceBefore - retiredMonthly));
  const serviceAfter = r2(Math.max(0, serviceBeforeNewPayment + (newPayment ?? 0)));
  const candidates: PlanCandidate[] = cockpit.dscr.candidates
    .filter((c) => c.numerator != null)
    .map((c) => {
      const numeratorAfter = r2((c.numerator as number) + (c.key === "bank_cash_flow" ? excludedMonthly * 12 : 0));
      const valueAfter = serviceAfter > 0 ? r2(numeratorAfter / (serviceAfter * 12)) : null;
      return { key: c.key, label: c.label, numerator_before: c.numerator as number, numerator_after: numeratorAfter, value_before: c.value, value_after: valueAfter, status_after: dscrStatusOf(valueAfter), no_debt_left: serviceAfter <= 0 && numeratorAfter > 0 };
    });
  const headlineKey = cockpit.dscr.headline?.key ?? candidates[0]?.key ?? null;
  const headline = candidates.find((c) => c.key === headlineKey) ?? candidates[0] ?? null;
  // Replay with the retired obligations taken out, month by month.
  const added = newPayment ?? 0;
  let cumulative = 0;
  const rows: SimulationRow[] = months.map((m) => {
    const removedHere = r2(retired.reduce((s, o) => s + obligationAmountInMonth(o, m.month, payees, monthsRead), 0));
    const change = removedHere - added;
    const before = cumulative;
    cumulative = r2(cumulative + change);
    const withdrawalsAfter = m.withdrawals == null ? null : r2(m.withdrawals - removedHere + added);
    return {
      month: m.month,
      label: m.label,
      deposits: m.deposits,
      withdrawals: m.withdrawals,
      withdrawalsAfter,
      net: m.net,
      netAfter: m.deposits == null || withdrawalsAfter == null ? null : r2(m.deposits - withdrawalsAfter),
      ending: m.ending_balance,
      endingAfter: m.ending_balance == null ? null : r2(m.ending_balance + cumulative),
      lowest: m.low_balance,
      lowestAfter: m.low_balance == null ? null : r2(m.low_balance + before + change / 2),
      removed: removedHere,
      added,
      cumulative,
    };
  });
  const netAfter = rows.map((r) => r.netAfter).filter((v): v is number => v != null);
  return {
    retiredMonthly,
    payoffTotal,
    payoffUnknown: retired.filter((o) => o.payoff == null).length,
    excludedMonthly,
    newPayment: newPayment == null ? null : r2(newPayment),
    newPaymentSource: newPayment == null ? null : source,
    loanAmountNeeded: Math.max(payoffTotal ?? 0, cockpit.requested_amount ?? 0) || null,
    serviceBefore,
    serviceBeforeNewPayment,
    serviceAfter,
    candidates,
    headlineAfter: headline?.value_after ?? null,
    noDebtLeft: !!headline?.no_debt_left,
    rows,
    netAfterAverage: netAfter.length ? r2(netAfter.reduce((a, b) => a + b, 0) / netAfter.length) : null,
    endingAfterLast: rows.length ? rows[rows.length - 1].endingAfter : null,
    monthsDippingNegativeAfter: rows.filter((r) => r.lowestAfter != null && r.lowestAfter < 0).length,
    cashKept: cumulative,
  };
}
