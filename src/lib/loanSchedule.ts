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

export type ScheduleRow = { period: number; month: number; phase: "interest_only" | "amortizing" | "simple_interest"; payment: number; interest: number; principal: number; balance: number; balloon?: number; cumulative_principal: number; cumulative_interest: number; exposure_pct: number; recovered_pct: number };
export type LoanScheduleSummary = {
  structure: LoanStructure; structure_label: string; amount: number; rate_pct: number; term_months: number | null; interest_only_months: number;
  periods: number; periods_per_year: number; payment_io: number | null; payment_after: number | null; payment_io_monthly: number | null; payment_after_monthly: number | null;
  coverage_payment_monthly: number; coverage_annual_debt_service: number; annual_debt_service: number; total_interest: number; total_paid: number; balloon: number; balloon_pct: number;
  /** Months until the average dollar of principal is back (the balloon counts at maturity). */
  weighted_average_life_months: number;
  /** The month by which 25/50/75/100% of the principal is back; null when the schedule never gets there. */
  recovery_milestones: Record<"25" | "50" | "75" | "100", number | null>;
  /** Months the balance stays at 100%: the interest-only months, or the whole term when principal is due at maturity. */
  full_exposure_months: number;
  rows: ScheduleRow[];
};
export type CoverageRow = { period: number; month: number; phase: ScheduleRow["phase"]; payment_monthly: number; coverage: number | null };
export type RiskProfile = {
  weighted_average_life_months: number; recovery_milestones: LoanScheduleSummary["recovery_milestones"]; full_exposure_months: number; balloon: number; balloon_pct: number;
  income_monthly: number | null; existing_service_monthly: number; coverage_by_period: CoverageRow[];
  coverage_during_interest_only: number | null; coverage_after_interest_only: number | null; lowest_coverage: number | null; lowest_coverage_month: number | null; words: string;
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
    rows.push({ period: index, month: Math.round((index * 12 / ppy) * 100) / 100, phase, payment, interest, principal: r2(principalPaid), balance, cumulative_principal: 0, cumulative_interest: 0, exposure_pct: 0, recovered_pct: 0 });
  }
  const balloon = balance > 0.005 ? r2(balance) : 0;
  if (balloon && rows.length) rows[rows.length - 1].balloon = balloon;
  // Principal at risk, period by period: the balance still out as a share of the loan, and how much is back.
  let cumPrincipal = 0; let cumInterest = 0;
  for (const r of rows) {
    cumPrincipal = r2(cumPrincipal + r.principal); cumInterest = r2(cumInterest + r.interest);
    r.cumulative_principal = cumPrincipal; r.cumulative_interest = cumInterest;
    r.exposure_pct = Math.round((r.balance / principal) * 1000) / 10;
    r.recovered_pct = Math.round((cumPrincipal / principal) * 1000) / 10;
  }
  const termMonth = rows.length ? rows[rows.length - 1].month : 0;
  const weightedLife = (rows.reduce((s, r) => s + r.principal * r.month, 0) + balloon * termMonth) / principal;
  const milestones = { "25": null, "50": null, "75": null, "100": null } as LoanScheduleSummary["recovery_milestones"];
  for (const threshold of [25, 50, 75, 100] as const) {
    const hit = rows.find((r) => r.recovered_pct >= threshold - 1e-9);
    milestones[String(threshold) as "25"] = hit ? Math.ceil(hit.month - 1e-9) : balloon && rows.length ? Math.ceil(termMonth - 1e-9) : null;
  }
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
    total_interest: r2(rows.reduce((s, r) => s + r.interest, 0)), total_paid: r2(rows.reduce((s, r) => s + r.payment, 0) + balloon), balloon,
    balloon_pct: balloon ? Math.round((balloon / principal) * 1000) / 10 : 0,
    weighted_average_life_months: Math.round(weightedLife * 10) / 10, recovery_milestones: milestones, full_exposure_months: halfUp((ioPeriods * 12) / ppy),
    rows,
  };
}

/** Principal at risk and the coverage on every payment: the same reading as app/services/loan_schedule.risk_profile. */
export function riskProfile(summary: LoanScheduleSummary | null | undefined, incomeMonthly?: number | null, existingServiceMonthly?: number | null): RiskProfile | null {
  if (!summary || !summary.rows.length) return null;
  const toMonthly = summary.periods_per_year / 12;
  const income = incomeMonthly && incomeMonthly > 0 ? incomeMonthly : null;
  const existing = Math.max(0, existingServiceMonthly ?? 0);
  const coverage: CoverageRow[] = income == null ? [] : summary.rows.map((r) => {
    const paymentMonthly = r2(r.payment * toMonthly);
    const denominator = existing + paymentMonthly;
    return { period: r.period, month: r.month, phase: r.phase, payment_monthly: paymentMonthly, coverage: denominator > 0 ? Math.round((income / denominator) * 100) / 100 : null };
  });
  const withCov = coverage.filter((c) => c.coverage != null) as Array<CoverageRow & { coverage: number }>;
  const lowest = withCov.length ? withCov.reduce((a, b) => (b.coverage < a.coverage ? b : a)) : null;
  const ioCov = withCov.find((c) => c.phase === "interest_only")?.coverage ?? null;
  const afterCov = withCov.find((c) => c.phase !== "interest_only")?.coverage ?? null;
  return {
    weighted_average_life_months: summary.weighted_average_life_months, recovery_milestones: summary.recovery_milestones, full_exposure_months: summary.full_exposure_months,
    balloon: summary.balloon, balloon_pct: summary.balloon_pct, income_monthly: income == null ? null : r2(income), existing_service_monthly: r2(existing), coverage_by_period: coverage,
    coverage_during_interest_only: ioCov, coverage_after_interest_only: afterCov, lowest_coverage: lowest?.coverage ?? null, lowest_coverage_month: lowest?.month ?? null,
    words: riskWords(summary, lowest, ioCov, afterCov),
  };
}

export function riskWords(summary: LoanScheduleSummary, lowest?: { coverage: number } | null, ioCov?: number | null, afterCov?: number | null): string {
  const io = summary.full_exposure_months;
  const m = summary.recovery_milestones;
  const month = (key: "25" | "50" | "75" | "100") => (m[key] ? `month ${m[key]}` : "never");
  const parts: string[] = [];
  if (summary.structure === "interest_only") {
    parts.push(summary.term_months ? `The whole principal stays out for the full ${summary.term_months} months and comes back at maturity: the exposure never falls before then.` : "The whole principal stays out until maturity: the exposure never falls before then.");
  } else {
    const how = summary.structure === "simple_interest" ? (io ? "evenly" : " evenly") : (io ? "with each level payment, slowly at first" : ", slowly at first (level payments pay mostly interest early)");
    parts.push(io ? `Principal is fully exposed for the first ${io} month${io === 1 ? "" : "s"}, then comes back ${how}: a quarter by ${month("25")}, half by ${month("50")}, all of it by ${month("100")}.` : `Principal comes back from the first payment${how}: a quarter by ${month("25")}, half by ${month("50")}, all of it by ${month("100")}.`);
    if (summary.balloon) parts.push(`${Math.round(summary.balloon).toLocaleString()} (${summary.balloon_pct}% of the loan) is due at maturity.`);
  }
  parts.push(`Weighted average life ${summary.weighted_average_life_months} months.`);
  if (lowest && lowest.coverage != null) {
    if (ioCov != null && afterCov != null && ioCov !== afterCov) parts.push(`Coverage on each payment: ${ioCov.toFixed(2)}x during the interest-only months, ${afterCov.toFixed(2)}x once principal starts; the lowest, ${lowest.coverage.toFixed(2)}x, is what underwriting stands on.`);
    else parts.push(`Coverage on each payment ${lowest.coverage.toFixed(2)}x.`);
  }
  return parts.join(" ");
}

/** The nominal annual rate (periodic IRR × periods a year, the stated-APR convention) at which the payments repay the proceeds. */
export function effectiveRatePct(proceeds: number, payments: number[], balloon = 0, periodsPerYear = 12): number | null {
  if (!(proceeds > 0) || !payments.length) return null;
  const flows = payments.slice();
  if (balloon) flows[flows.length - 1] += balloon;
  if (flows.reduce((s, p) => s + p, 0) <= proceeds) return 0;
  const present = (rate: number) => flows.reduce((s, p, i) => s + p / Math.pow(1 + rate, i + 1), 0) - proceeds;
  let lo = 0; let hi = 1;
  if (present(hi) > 0) return null;
  for (let i = 0; i < 200 && hi - lo > 1e-10; i += 1) { const mid = (lo + hi) / 2; if (present(mid) > 0) lo = mid; else hi = mid; }
  return Math.round(((lo + hi) / 2) * periodsPerYear * 10000) / 100;
}

export function describeSchedule(summary: LoanScheduleSummary | null | undefined): string {
  if (!summary) return "";
  const io = summary.interest_only_months;
  if (summary.structure === "interest_only") return `interest-only${summary.term_months ? ` over ${summary.term_months} months` : ""}, principal due at maturity`;
  const label = STRUCTURE_LABELS[summary.structure].toLowerCase();
  return io ? `over ${summary.term_months} months, ${io} interest-only then ${label}` : `over ${summary.term_months} months, ${label}`;
}
