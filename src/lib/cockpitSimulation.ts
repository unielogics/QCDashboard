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
