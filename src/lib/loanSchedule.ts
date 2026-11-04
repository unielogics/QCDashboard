// One loan schedule for every screen that prices a loan: the same arithmetic
// as app/services/loan_schedule.py. Under three years the house default is
// simple interest (interest on the original principal every period, principal
// spread evenly after any interest-only months); at three years and over it is
// amortizing (a level payment on the declining balance after the interest-only
// months); a loan can also be interest-only to maturity. The summary carries
// the payment during the interest-only months, the payment after, the first
// year's debt service and the payment coverage stands on (the higher of the two).

export type LoanStructure = "amortizing" | "simple_interest" | "interest_only";
export const STRUCTURE_LABELS: Record<LoanStructure, string> = { amortizing: "Amortizing", simple_interest: "Simple interest", interest_only: "Interest-only" };
export const AMORTIZING_FROM_MONTHS = 36;
const MAX_PERIODS = 600;

export type ScheduleRow = { period: number; phase: "interest_only" | "amortizing" | "simple_interest"; payment: number; interest: number; principal: number; balance: number; balloon?: number };
export type LoanScheduleSummary = {
  structure: LoanStructure; structure_label: string; amount: number; rate_pct: number; term_months: number | null; interest_only_months: number;
  periods: number; periods_per_year: number; payment_io: number | null; payment_after: number | null; payment_io_monthly: number | null; payment_after_monthly: number | null;
  coverage_payment_monthly: number; coverage_annual_debt_service: number; annual_debt_service: number; total_interest: number; total_paid: number; balloon: number; rows: ScheduleRow[];
};

const r2 = (v: number) => Math.round(v * 100) / 100;
// Period counts round half up, as Python's floor(x + .5) does on the server.
const halfUp = (v: number) => Math.floor(v + 0.5);

export function defaultStructure(termMonths: number | null | undefined): LoanStructure {
  return termMonths != null && termMonths >= AMORTIZING_FROM_MONTHS ? "amortizing" : "simple_interest";
}
export function normalizeStructure(value: string | null | undefined, termMonths: number | null | undefined): LoanStructure {
  return value === "amortizing" || value === "simple_interest" || value === "interest_only" ? value : defaultStructure(termMonths);
}
export function levelPayment(principal: number, periodicRate: number, periods: number): number {
  if (periods <= 0) return 0;
  if (periodicRate <= 0) return principal / periods;
  return (principal * periodicRate) / (1 - Math.pow(1 + periodicRate, -periods));
}

export function buildSchedule(amount: number | null | undefined, ratePct: number | null | undefined, termMonths: number | null | undefined, options: { structure?: string | null; interestOnlyMonths?: number | null; periodsPerYear?: number } = {}): LoanScheduleSummary | null {
  const principal = Number(amount ?? 0);
  if (!(principal > 0)) return null;
  const months = Math.max(0, Math.round(Number(termMonths ?? 0)));
  let kind = normalizeStructure(options.structure, months || null);
  if (kind !== "interest_only" && months <= 0) return null;
  const ppy = options.periodsPerYear && options.periodsPerYear > 0 ? options.periodsPerYear : 12;
  const periodicRate = Number(ratePct ?? 0) / 100 / ppy;
  let periods: number;
  let ioPeriods: number;
  if (kind === "interest_only") {
    periods = months > 0 ? Math.max(1, halfUp((months * ppy) / 12)) : halfUp(ppy);
    ioPeriods = periods;
  } else {
    periods = Math.max(1, halfUp((months * ppy) / 12));
    const ioMonths = Math.min(Math.max(0, Math.round(Number(options.interestOnlyMonths ?? 0))), months);
    ioPeriods = Math.min(periods, halfUp((ioMonths * ppy) / 12));
    if (ioPeriods >= periods) { kind = "interest_only"; ioPeriods = periods; }
  }
  periods = Math.min(periods, MAX_PERIODS);
  const rows: ScheduleRow[] = [];
  let balance = principal;
  const remaining = periods - ioPeriods;
  const interestFlat = principal * periodicRate;
  const afterPayment = kind === "amortizing" ? (remaining ? levelPayment(principal, periodicRate, remaining) : 0) : kind === "simple_interest" ? (remaining ? principal / remaining + interestFlat : 0) : 0;
  // Every row is in cents and the balance is the running difference, so the
  // schedule adds up on paper; the last principal row takes the rounding
  // residue and the balance ends at exactly zero (or the balloon). Same rule
  // as the server, so the preview and the saved terms agree to the cent.
  for (let index = 1; index <= periods; index += 1) {
    const last = index === periods;
    let interest: number; let payment: number; let principalPaid: number; let phase: ScheduleRow["phase"];
    if (index <= ioPeriods) {
      interest = r2(kind === "amortizing" ? balance * periodicRate : interestFlat);
      payment = interest; principalPaid = 0; phase = "interest_only";
    } else if (kind === "amortizing") {
      interest = r2(balance * periodicRate); principalPaid = last ? balance : Math.min(balance, r2(afterPayment - interest)); payment = r2(principalPaid + interest); phase = "amortizing";
    } else {
      interest = r2(interestFlat); principalPaid = last ? balance : Math.min(balance, r2(principal / remaining)); payment = r2(principalPaid + interest); phase = "simple_interest";
    }
    balance = r2(Math.max(0, balance - principalPaid));
    rows.push({ period: index, phase, payment, interest, principal: r2(principalPaid), balance });
  }
  const balloon = balance > 0.005 ? r2(balance) : 0;
  if (balloon && rows.length) rows[rows.length - 1].balloon = balloon;
  const firstYear = rows.slice(0, halfUp(ppy));
  const annual = r2(firstYear.reduce((s, r) => s + r.payment, 0));
  const paymentIo = ioPeriods ? r2(rows[0].payment) : null;
  const paymentAfter = ioPeriods < periods ? r2(rows[ioPeriods].payment) : null;
  const toMonthly = ppy / 12;
  return {
    structure: kind, structure_label: STRUCTURE_LABELS[kind], amount: r2(principal), rate_pct: Number(ratePct ?? 0), term_months: months > 0 ? months : null,
    interest_only_months: halfUp((ioPeriods * 12) / ppy), periods, periods_per_year: ppy,
    payment_io: paymentIo, payment_after: paymentAfter, payment_io_monthly: paymentIo == null ? null : r2(paymentIo * toMonthly), payment_after_monthly: paymentAfter == null ? null : r2(paymentAfter * toMonthly),
    coverage_payment_monthly: r2(Math.max(paymentAfter ?? 0, paymentIo ?? 0) * toMonthly),
    // The annual service coverage stands on: the post-interest-only payment over the periods actually due in a year.
    coverage_annual_debt_service: r2(Math.max(paymentAfter ?? 0, paymentIo ?? 0) * Math.min(periods, halfUp(ppy))), annual_debt_service: annual,
    total_interest: r2(rows.reduce((s, r) => s + r.interest, 0)), total_paid: r2(rows.reduce((s, r) => s + r.payment, 0) + balloon), balloon, rows,
  };
}

export function describeSchedule(summary: LoanScheduleSummary | null | undefined): string {
  if (!summary) return "";
  const io = summary.interest_only_months;
  if (summary.structure === "interest_only") return `interest-only${summary.term_months ? ` over ${summary.term_months} months` : ""}, principal due at maturity`;
  const label = STRUCTURE_LABELS[summary.structure].toLowerCase();
  return io ? `over ${summary.term_months} months, ${io} interest-only then ${label}` : `over ${summary.term_months} months, ${label}`;
}
