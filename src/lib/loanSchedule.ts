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
const MAX_PERIODS = 20_000;
export type LoanBalloon = { id: string; month: number; type: "amount" | "percent_balance"; value: number };
export type RepaymentConfig = { amortization_months?: number; after_balloon?: "keep_payment" | "recast"; balloons?: LoanBalloon[] };
export type ScheduledBalloon = LoanBalloon & { period: number; due_month: number; balance_before: number; amount: number; balance_after: number; basis: string; recast_payment: number | null; recast_payment_monthly: number | null; recast_effective_period: number | null };

export type ScheduleRow = { regular_payment?: number; regular_principal?: number; scheduled_balloon?: number; maturity_balloon?: number; cash_payment?: number; total_principal?: number; balance_after_cash?: number; period: number; month: number; phase: "interest_only" | "amortizing" | "simple_interest"; payment: number; interest: number; principal: number; balance: number; balloon?: number; cumulative_principal: number; cumulative_interest: number; cumulative_paid: number; exposure_pct: number; recovered_pct: number; /** Counting every dollar received, interest included: what is still out until the payments return the investment. */ cash_at_risk_pct: number };
export type LoanScheduleSummary = {
  repayment_config?: RepaymentConfig | null; amortization_months?: number | null; after_balloon?: "keep_payment" | "recast" | null; contractual_periods?: number;
  scheduled_balloons?: ScheduledBalloon[]; scheduled_balloons_total?: number; maturity_balloon?: number; maturity_exposure_pct?: number;
  cash_flows?: number[]; first_year_actual_debt_service?: number; peak_rolling_12_month_debt_service?: number; peak_rolling_12_month_end?: number | null;
  peak_cash_payment?: number; actual_payoff_month?: number | null; principal_repaid?: number; regular_coverage_payment_monthly?: number;
  coverage_basis?: string; cash_flow_convention?: string; balloon_period_mapping?: string;
  structure: LoanStructure; structure_label: string; amount: number; rate_pct: number; term_months: number | null; interest_only_months: number;
  periods: number; periods_per_year: number; payment_io: number | null; payment_after: number | null; payment_io_monthly: number | null; payment_after_monthly: number | null;
  coverage_payment_monthly: number; coverage_annual_debt_service: number; annual_debt_service: number; total_interest: number; total_paid: number; balloon: number; balloon_pct: number;
  /** Months until the average dollar of principal is back (the balloon counts at maturity). */
  weighted_average_life_months: number;
  /** The month by which 25/50/75/100% of the principal is back; null when the schedule never gets there. */
  recovery_milestones: Record<"25" | "50" | "75" | "100", number | null>;
  /** Months the balance stays at 100%: the interest-only months, or the whole term when principal is due at maturity. */
  full_exposure_months: number;
  /** The month by which the payments received, interest included, add up to the investment. */
  breakeven_month: number | null;
  rows: ScheduleRow[];
};
export type CoverageCash = { debt_service_monthly: number | null; cash_surplus_monthly: number | null; cash_shortfall_monthly: number | null };
export type CoverageRow = CoverageCash & { period: number; month: number; phase: ScheduleRow["phase"]; payment_monthly: number; coverage: number | null };
export type RiskProfile = {
  cash_coverage_by_period?: Array<CoverageCash & {period: number; month: number; payment_monthly: number; coverage: number | null}>; lowest_cash_coverage?: number | null;
  peak_cash_shortfall_monthly?: number | null; peak_cash_shortfall_period?: number | null; peak_cash_shortfall_month?: number | null;
  coverage_note?: string | null; coverage_unavailable_reason?: string | null;
  coverage_basis?: string; peak_rolling_12_month_debt_service?: number; maturity_balloon?: number; scheduled_balloons_total?: number;
  weighted_average_life_months: number; recovery_milestones: LoanScheduleSummary["recovery_milestones"]; full_exposure_months: number; breakeven_month: number | null; balloon: number; balloon_pct: number;
  income_monthly: number | null; existing_service_monthly: number | null; coverage_by_period: CoverageRow[];
  coverage_during_interest_only: number | null; coverage_after_interest_only: number | null; lowest_coverage: number | null; lowest_coverage_month: number | null; words: string;
};

function pyRound(value: number, digits = 2): number {
  if (!Number.isFinite(value) || !value) return value;
  const buffer = new DataView(new ArrayBuffer(8)); buffer.setFloat64(0, Math.abs(value));
  const bits = buffer.getBigUint64(0), rawExponent = Number((bits >> 52n) & 2047n);
  const mantissa = (bits & ((1n << 52n) - 1n)) + (rawExponent ? 1n << 52n : 0n);
  const exponent = (rawExponent || 1) - 1023 - 52;
  const numerator = mantissa * (10n ** BigInt(digits)) * (exponent > 0 ? 1n << BigInt(exponent) : 1n);
  const denominator = exponent < 0 ? 1n << BigInt(-exponent) : 1n;
  const quotient = numerator / denominator, remainder = numerator % denominator;
  const rounded = quotient + (remainder * 2n > denominator || remainder * 2n === denominator && quotient % 2n === 1n ? 1n : 0n);
  return Math.sign(value) * Number(rounded) / 10 ** digits;
}
const r2 = (v: number) => pyRound(v);
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

function buildLegacySchedule(amount: number | null | undefined, ratePct: number | null | undefined, termMonths: number | null | undefined, options: { structure?: string | null; interestOnlyMonths?: number | null; periodsPerYear?: number } = {}): LoanScheduleSummary | null {
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
  if (periods > MAX_PERIODS) throw new Error(`The payment cadence exceeds the ${MAX_PERIODS} payment-period limit`);
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
    rows.push({ period: index, month: r2(index * 12 / ppy), phase, payment, interest, principal: r2(principalPaid), balance, cumulative_principal: 0, cumulative_interest: 0, cumulative_paid: 0, exposure_pct: 0, recovered_pct: 0, cash_at_risk_pct: 0 });
  }
  const balloon = balance > 0.005 ? r2(balance) : 0;
  if (balloon && rows.length) rows[rows.length - 1].balloon = balloon;
  // Principal at risk, period by period: the balance still out as a share of the loan, and how much is back.
  let cumPrincipal = 0; let cumInterest = 0; let cumPaid = 0; let breakeven: number | null = null;
  for (const r of rows) {
    cumPrincipal = r2(cumPrincipal + r.principal); cumInterest = r2(cumInterest + r.interest); cumPaid = r2(cumPaid + r.payment);
    r.cumulative_principal = cumPrincipal; r.cumulative_interest = cumInterest; r.cumulative_paid = cumPaid;
    r.exposure_pct = pyRound(r.balance / principal * 100, 1);
    r.recovered_pct = pyRound(cumPrincipal / principal * 100, 1);
    r.cash_at_risk_pct = pyRound(Math.max(0, principal - cumPaid) / principal * 100, 1);
    if (breakeven == null && cumPaid >= principal - 0.005) breakeven = Math.ceil(r.month - 1e-9);
  }
  const termMonth = rows.length ? rows[rows.length - 1].month : 0;
  if (breakeven == null && balloon && rows.length && cumPaid + balloon >= principal - 0.005) breakeven = Math.ceil(termMonth - 1e-9);
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
    balloon_pct: balloon ? pyRound(balloon / principal * 100, 1) : 0,
    weighted_average_life_months: pyRound(weightedLife, 1), recovery_milestones: milestones, full_exposure_months: halfUp((ioPeriods * 12) / ppy), breakeven_month: breakeven,
    rows,
  };
}

export type LoanScheduleOptions = { structure?: string | null; interestOnlyMonths?: number | null; periodsPerYear?: number; repaymentConfig?: RepaymentConfig | null };

function integer(value: unknown, label: string, low: number, high: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < low || value > high) throw new Error(`${label} must be a whole number from ${low} to ${high}`);
  return value;
}

export function normalizeRepaymentConfig(config: unknown, termMonths: number | null | undefined, options: Omit<LoanScheduleOptions, "repaymentConfig"> = {}): RepaymentConfig | null {
  if (config == null) return null;
  if (typeof config !== "object" || Array.isArray(config) || Object.keys(config).some((key) => !["amortization_months", "after_balloon", "balloons"].includes(key))) throw new Error("Repayment configuration contains unsupported fields");
  const input = config as RepaymentConfig;
  const months = integer(termMonths, "Maturity months", 1, 600);
  const io = integer(options.interestOnlyMonths ?? 0, "Interest-only months", 0, months);
  const ppy = options.periodsPerYear ?? 12;
  if (!Number.isFinite(ppy) || ppy < 1 || ppy > 366) throw new Error("Payment periods per year must be finite and between 1 and 366");
  if (months * ppy / 12 < 1 - 1e-9) throw new Error("Maturity must include at least one payment period at the selected cadence");
  const kind = normalizeStructure(options.structure, months);
  const amort = input.amortization_months == null ? undefined : integer(input.amortization_months, "Amortization months after interest-only", 1, 1200);
  if (amort !== undefined && (kind === "interest_only" || io === months)) throw new Error("An all-interest-only loan cannot specify an amortization period");
  const after = input.after_balloon === undefined ? "keep_payment" : input.after_balloon;
  if (after !== "keep_payment" && after !== "recast") throw new Error("After balloon must be keep_payment or recast");
  const raw = input.balloons === undefined ? [] : input.balloons;
  if (!Array.isArray(raw) || raw.length > 60) throw new Error("A repayment configuration supports at most 60 scheduled balloons");
  const ids = new Set<string>();
  const balloons = raw.map((event) => {
    if (!event || typeof event !== "object" || Array.isArray(event) || Object.keys(event).sort().join() !== "id,month,type,value") throw new Error("Each balloon requires only id, month, type and value");
    if (typeof event.id !== "string" || !event.id.trim() || event.id.length > 80 || ids.has(event.id)) throw new Error("Scheduled balloon IDs must be nonblank, unique and at most 80 characters");
    const month = integer(event.month, "Balloon month", 1, months);
    if (typeof event.value !== "number" || !Number.isFinite(event.value) || event.value <= 0 || event.value > 1e15) throw new Error(`Balloon ${event.id} requires a positive finite value`);
    if (event.type !== "amount" && event.type !== "percent_balance") throw new Error("Balloon type must be amount or percent_balance");
    if (event.type === "percent_balance" && event.value > 100) throw new Error("A remaining-balance balloon percentage cannot exceed 100");
    if (event.type === "amount" && r2(event.value) <= 0) throw new Error("A fixed balloon amount must be at least one cent");
    ids.add(event.id);
    return { id: event.id, month, type: event.type, value: event.value };
  });
  return { ...(amort === undefined ? {} : { amortization_months: amort }), after_balloon: after, balloons };
}

/** Every real receipt, with the final residual counted exactly once. */
export function scheduleCashFlows(summary: LoanScheduleSummary | null | undefined): number[] {
  if (!summary) return [];
  if (summary.cash_flows?.every((value) => typeof value === "number" && Number.isFinite(value))) return summary.cash_flows.slice();
  return summary.rows.map((row, index) => row.cash_payment ?? r2(row.payment + (index === summary.rows.length - 1 ? summary.balloon : 0)));
}

function cashMetadata(summary: LoanScheduleSummary, advanced: boolean): LoanScheduleSummary {
  const rows = summary.rows, principal = summary.amount, ppy = summary.periods_per_year;
  rows.forEach((row, index) => {
    const residual = index === rows.length - 1 ? summary.balloon : 0;
    row.regular_payment ??= row.payment; row.regular_principal ??= row.principal; row.scheduled_balloon ??= 0;
    row.maturity_balloon = residual; row.cash_payment = r2(row.payment + residual); row.total_principal = r2(row.principal + residual); row.balance_after_cash = r2(Math.max(0, row.balance - residual));
  });
  const flows = rows.map((row) => row.cash_payment!);
  const firstYear = r2(rows.filter((row) => row.period <= ppy + 1e-9).reduce((sum, row) => sum + row.cash_payment!, 0));
  let peak = 0, running = 0, left = 0, peakEnd: number | null = null;
  rows.forEach((row) => {
    running += row.cash_payment!;
    while (row.period - rows[left].period >= ppy - 1e-9) { running -= rows[left].cash_payment!; left += 1; }
    if (running > peak) { peak = running; peakEnd = row.month; }
  });
  peak = r2(peak);
  Object.assign(summary, { cash_flows: flows, maturity_balloon: summary.balloon, scheduled_balloons_total: r2(rows.reduce((sum, row) => sum + row.scheduled_balloon!, 0)), first_year_actual_debt_service: firstYear,
    peak_rolling_12_month_debt_service: peak, peak_rolling_12_month_end: peakEnd, peak_cash_payment: Math.max(...flows), actual_payoff_month: rows.at(-1)?.month ?? null,
    principal_repaid: r2(rows.reduce((sum, row) => sum + row.total_principal!, 0)), maturity_exposure_pct: pyRound(summary.balloon / principal * 100, 1),
    regular_coverage_payment_monthly: r2(Math.max(...rows.map((row) => row.regular_payment!)) * ppy / 12),
    coverage_basis: advanced ? "peak_rolling_12_month_actual_cash_due" : "legacy_regular_payment",
    cash_flow_convention: "payment includes scheduled balloons; maturity residual is separate; cash_payment includes both",
    balloon_period_mapping: "nearest scheduled cadence period, half up; list order within a period" });
  if (advanced) {
    summary.annual_debt_service = firstYear; summary.coverage_annual_debt_service = peak; summary.coverage_payment_monthly = r2(peak / 12);
    let cumPrincipal = 0, cumPaid = 0, cumInterest = 0, breakeven: number | null = null;
    rows.forEach((row) => {
      cumPrincipal = r2(cumPrincipal + row.total_principal!); cumPaid = r2(cumPaid + row.cash_payment!); cumInterest = r2(cumInterest + row.interest);
      Object.assign(row, { cumulative_principal: cumPrincipal, cumulative_paid: cumPaid, cumulative_interest: cumInterest,
        recovered_pct: pyRound(cumPrincipal / principal * 100, 1), exposure_pct: pyRound(row.balance_after_cash! / principal * 100, 1), cash_at_risk_pct: pyRound(Math.max(0, principal - cumPaid) / principal * 100, 1) });
      if (breakeven === null && cumPaid >= principal - .005) breakeven = Math.ceil(row.month - 1e-9);
    });
    summary.breakeven_month = breakeven;
    summary.weighted_average_life_months = pyRound(rows.reduce((sum, row) => sum + row.total_principal! * row.month, 0) / principal, 1);
    for (const threshold of [25, 50, 75, 100] as const) { const hit = rows.find((row) => row.cumulative_principal >= principal * threshold / 100 - .005); summary.recovery_milestones[String(threshold) as "25"] = hit ? Math.ceil(hit.month - 1e-9) : null; }
    const firstPrincipal = rows.find((row) => row.total_principal! > 0);
    summary.full_exposure_months = firstPrincipal ? Math.max(0, Math.ceil(firstPrincipal.month - 1e-9) - 1) : summary.term_months ?? 0;
  }
  return summary;
}

export function buildSchedule(amount: number | null | undefined, ratePct: number | null | undefined, termMonths: number | null | undefined, options: LoanScheduleOptions = {}): LoanScheduleSummary | null {
  let principal = Number(amount ?? 0);
  if (!Number.isFinite(principal) || principal <= 0) return null;
  const ppy = options.periodsPerYear ?? 12, rate = Number(ratePct ?? 0);
  if (!Number.isFinite(ppy) || ppy < 1 || ppy > 366) throw new Error("Payment periods per year must be finite and between 1 and 366");
  if (!Number.isFinite(rate) || rate < 0) throw new Error("The annual rate must be finite and nonnegative");
  if (termMonths != null) integer(termMonths, "Maturity months", 0, 600);
  const config = normalizeRepaymentConfig(options.repaymentConfig, termMonths, options);
  if (config === null) {
    const legacy = buildLegacySchedule(amount, ratePct, termMonths, options);
    if (!legacy) return null;
    Object.assign(legacy, { repayment_config: null, scheduled_balloons: [], after_balloon: null, amortization_months: null, contractual_periods: legacy.periods });
    return cashMetadata(legacy, false);
  }
  principal = r2(principal);
  if (principal <= 0) throw new Error("The loan amount must be at least one cent");
  const months = termMonths!, periods = Math.max(1, halfUp(months * ppy / 12));
  if (periods > MAX_PERIODS) throw new Error(`The payment cadence exceeds the ${MAX_PERIODS} payment-period limit`);
  let kind = normalizeStructure(options.structure, months);
  const ioPeriods = kind === "interest_only" ? periods : Math.min(periods, halfUp((options.interestOnlyMonths ?? 0) * ppy / 12));
  if (ioPeriods === periods) kind = "interest_only";
  const amortPeriods = Math.max(1, halfUp((config.amortization_months ?? (periods - ioPeriods) * 12 / ppy) * ppy / 12));
  const periodicRate = rate / 100 / ppy, flatInterest = r2(principal * periodicRate);
  let paymentAfter = kind === "amortizing" ? levelPayment(principal, periodicRate, amortPeriods) : kind === "simple_interest" ? principal / amortPeriods + flatInterest : 0;
  let principalInstallment = principal / amortPeriods;
  const eventPeriods = new Map<number, LoanBalloon[]>();
  for (const event of config.balloons ?? []) { const due = Math.min(periods, Math.max(1, halfUp(event.month * ppy / 12))); eventPeriods.set(due, [...(eventPeriods.get(due) ?? []), event]); }
  const rows: ScheduleRow[] = [], applied: ScheduledBalloon[] = [];
  let balance = principal;
  for (let index = 1; index <= periods; index += 1) {
    if (balance <= 0) { if ([...eventPeriods.keys()].some((due) => due >= index)) throw new Error("A scheduled balloon occurs after the loan has already been repaid"); break; }
    const io = index <= ioPeriods, interest = r2(kind === "simple_interest" ? flatInterest : balance * periodicRate);
    let regularPrincipal = io ? 0 : kind === "amortizing" ? Math.min(balance, Math.max(0, r2(paymentAfter - interest))) : Math.min(balance, r2(principalInstallment));
    if (!io && index - ioPeriods >= amortPeriods) regularPrincipal = balance;
    const regularPayment = r2(interest + regularPrincipal);
    balance = r2(balance - regularPrincipal);
    let scheduled = 0;
    for (const event of eventPeriods.get(index) ?? []) {
      if (balance <= 0) throw new Error(`Balloon ${event.id} has no remaining principal after the regular payment or an earlier balloon`);
      const before = balance;
      let paid = event.type === "percent_balance" ? r2(balance * event.value / 100) : r2(event.value);
      if (paid > balance + .005) throw new Error(`Balloon ${event.id} exceeds remaining principal after the regular payment (${balance.toFixed(2)})`);
      paid = Math.min(paid, balance); balance = r2(balance - paid); scheduled = r2(scheduled + paid);
      let recast: number | null = null;
      if (config.after_balloon === "recast") { const remaining = Math.max(1, amortPeriods - Math.max(0, index - ioPeriods)); principalInstallment = balance / remaining; paymentAfter = kind === "amortizing" ? levelPayment(balance, periodicRate, remaining) : kind === "simple_interest" ? principalInstallment + flatInterest : balance * periodicRate; recast = r2(paymentAfter); }
      applied.push({ ...event, period: index, due_month: r2(index * 12 / ppy), balance_before: before, amount: paid, balance_after: balance,
        basis: "remaining_principal_after_regular_payment_and_prior_events", recast_payment: recast, recast_payment_monthly: recast === null ? null : r2(recast * ppy / 12), recast_effective_period: recast === null || balance <= 0 || (kind !== "interest_only" ? Math.max(index + 1, ioPeriods + 1) : index + 1) > periods ? null : kind !== "interest_only" ? Math.max(index + 1, ioPeriods + 1) : index + 1 });
    }
    rows.push({ period: index, month: r2(index * 12 / ppy), phase: io ? "interest_only" : kind, regular_payment: regularPayment, regular_principal: r2(regularPrincipal), scheduled_balloon: scheduled,
      payment: r2(regularPayment + scheduled), interest, principal: r2(regularPrincipal + scheduled), balance, cumulative_principal: 0, cumulative_interest: 0, cumulative_paid: 0, exposure_pct: 0, recovered_pct: 0, cash_at_risk_pct: 0 });
  }
  const balloon = r2(balance);
  if (balloon && rows.length) rows[rows.length - 1].balloon = balloon;
  const paymentIo = ioPeriods ? rows[0].regular_payment! : null, afterRow = rows.find((row) => row.phase !== "interest_only"), after = afterRow?.regular_payment ?? null;
  const summary: LoanScheduleSummary = { structure: kind, structure_label: STRUCTURE_LABELS[kind], amount: principal, rate_pct: rate, term_months: months,
    interest_only_months: halfUp(ioPeriods * 12 / ppy), periods: rows.length, contractual_periods: periods, periods_per_year: ppy,
    payment_io: paymentIo, payment_after: after, payment_io_monthly: paymentIo === null ? null : r2(paymentIo * ppy / 12), payment_after_monthly: after === null ? null : r2(after * ppy / 12),
    total_interest: r2(rows.reduce((sum, row) => sum + row.interest, 0)), total_paid: r2(rows.reduce((sum, row) => sum + row.payment, 0) + balloon), balloon,
    balloon_pct: pyRound(balloon / principal * 100, 1), rows, repayment_config: config, scheduled_balloons: applied, after_balloon: config.after_balloon,
    amortization_months: kind === "interest_only" ? null : config.amortization_months ?? halfUp(amortPeriods * 12 / ppy), coverage_payment_monthly: 0, coverage_annual_debt_service: 0, annual_debt_service: 0,
    weighted_average_life_months: 0, recovery_milestones: { "25": null, "50": null, "75": null, "100": null }, full_exposure_months: 0, breakeven_month: null };
  return cashMetadata(summary, true);
}

/** Principal at risk and the coverage on every payment: the same reading as app/services/loan_schedule.risk_profile. */
export function riskProfile(summary: LoanScheduleSummary | null | undefined, incomeMonthly?: number | null, existingServiceMonthly?: number | null, incomeCurrencyComparable = true): RiskProfile | null {
  if (!summary || !summary.rows.length) return null;
  const toMonthly = summary.periods_per_year / 12;
  const income = incomeMonthly != null && Number.isFinite(incomeMonthly) ? incomeMonthly : null;
  const existing = existingServiceMonthly != null && Number.isFinite(existingServiceMonthly) && existingServiceMonthly >= 0 ? existingServiceMonthly : null;
  const cashFlows = scheduleCashFlows(summary);
  const cash = (paymentMonthly: number): CoverageCash => {
    const service = existing == null ? null : r2(existing + paymentMonthly);
    const surplus = incomeCurrencyComparable && income != null && service != null ? r2(income - service) : null;
    return { debt_service_monthly: service, cash_surplus_monthly: surplus, cash_shortfall_monthly: surplus == null ? null : Math.max(0, -surplus) };
  };
  const coverage: CoverageRow[] = income == null || existing == null ? [] : summary.rows.map((r, index) => {
    const paymentMonthly = r2((summary.repayment_config != null ? cashFlows[index] : r.payment) * toMonthly);
    const denominator = existing + paymentMonthly;
    return { period: r.period, month: r.month, phase: r.phase, payment_monthly: paymentMonthly, coverage: denominator > 0 ? r2(income / denominator) : null, ...cash(paymentMonthly) };
  });
  const withCov = coverage.filter((c) => c.coverage != null) as Array<CoverageRow & { coverage: number }>;
  const lowest = withCov.length ? withCov.reduce((a, b) => (b.coverage < a.coverage ? b : a)) : null;
  const ioCov = withCov.find((c) => c.phase === "interest_only")?.coverage ?? null;
  const afterCov = withCov.find((c) => c.phase !== "interest_only")?.coverage ?? null;
  const cashCoverage = income == null || existing == null ? [] : summary.rows.map((row, index) => ({ period: row.period, month: row.month, payment_monthly: r2(cashFlows[index] * toMonthly), coverage: existing + cashFlows[index] * toMonthly > 0 ? r2(income / (existing + cashFlows[index] * toMonthly)) : null, ...cash(cashFlows[index] * toMonthly) }));
  const cashValues = cashCoverage.map((row) => row.coverage).filter((value): value is number => value !== null);
  const withGap = cashCoverage.filter((row) => row.cash_shortfall_monthly != null);
  const peakGap = withGap.length ? withGap.reduce((peak, row) => row.cash_shortfall_monthly! > peak.cash_shortfall_monthly! ? row : peak) : null;
  const coverageUnavailableReason = income == null ? "Income available for debt service is unknown." : existing == null ? "Existing debt service is unknown; enter a reviewed amount, including an explicit zero when applicable." : !incomeCurrencyComparable ? "Coverage shortfalls require earnings comparable with USD debt service." : null;
  const coverageNote = [income != null && income <= 0 ? "Earnings are nonpositive. Signed DSCR does not rank cash stress; use the coverage shortfall to assess earnings available for payments." : null,
    !incomeCurrencyComparable ? "Confirm that earnings and debt service use the same currency before calculating coverage shortfalls. No currency conversion is assumed." : null].filter(Boolean).join(" ") || null;
  return {
    weighted_average_life_months: summary.weighted_average_life_months, recovery_milestones: summary.recovery_milestones, full_exposure_months: summary.full_exposure_months, breakeven_month: summary.breakeven_month,
    balloon: summary.balloon, balloon_pct: summary.balloon_pct, income_monthly: income == null ? null : r2(income), existing_service_monthly: existing == null ? null : r2(existing), coverage_by_period: coverage,
    coverage_basis: summary.repayment_config != null ? "actual_cash_due_per_period" : "legacy_regular_payment", peak_rolling_12_month_debt_service: summary.peak_rolling_12_month_debt_service,
    maturity_balloon: summary.maturity_balloon ?? summary.balloon, scheduled_balloons_total: summary.scheduled_balloons_total ?? 0,
    cash_coverage_by_period: cashCoverage, lowest_cash_coverage: cashValues.length ? Math.min(...cashValues) : null,
    peak_cash_shortfall_monthly: peakGap?.cash_shortfall_monthly ?? null, peak_cash_shortfall_period: peakGap?.period ?? null, peak_cash_shortfall_month: peakGap?.month ?? null,
    coverage_note: coverageNote, coverage_unavailable_reason: coverageUnavailableReason,
    coverage_during_interest_only: ioCov, coverage_after_interest_only: afterCov, lowest_coverage: lowest?.coverage ?? null, lowest_coverage_month: lowest?.month ?? null,
    words: [riskWords(summary, lowest, ioCov, afterCov, income != null && income <= 0), coverageUnavailableReason, coverageNote].filter(Boolean).join(" "),
  };
}

export function riskWords(summary: LoanScheduleSummary, lowest?: { coverage: number } | null, ioCov?: number | null, afterCov?: number | null, incomeNonpositive = false): string {
  const io = summary.full_exposure_months;
  const m = summary.recovery_milestones;
  const month = (key: "25" | "50" | "75" | "100") => (m[key] ? `month ${m[key]}` : "never");
  const parts: string[] = [];
  if (summary.repayment_config != null) {
    parts.push(`Actual principal cash flows include ${summary.scheduled_balloons?.length ?? 0} scheduled balloon(s), totaling ${(summary.scheduled_balloons_total ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`);
    if (summary.balloon) parts.push(`A separate residual principal payment of ${summary.balloon.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} is due at maturity; it is counted once.`);
    parts.push("Coverage uses the peak rolling twelve months of actual cash due; payment-by-payment coverage also shows balloon stress.");
  } else if (summary.structure === "interest_only") {
    parts.push(summary.term_months ? `The whole principal stays out for the full ${summary.term_months} months and comes back at maturity: the exposure never falls before then.` : "The whole principal stays out until maturity: the exposure never falls before then.");
  } else {
    const how = summary.structure === "simple_interest" ? (io ? "evenly" : " evenly") : (io ? "with each level payment, slowly at first" : ", slowly at first (level payments pay mostly interest early)");
    parts.push(io ? `Principal is fully exposed for the first ${io} month${io === 1 ? "" : "s"}, then comes back ${how}: a quarter by ${month("25")}, half by ${month("50")}, all of it by ${month("100")}.` : `Principal comes back from the first payment${how}: a quarter by ${month("25")}, half by ${month("50")}, all of it by ${month("100")}.`);
    if (summary.balloon) parts.push(`${Math.round(summary.balloon).toLocaleString()} (${summary.balloon_pct}% of the loan) is due at maturity.`);
  }
  parts.push(`Weighted average life ${summary.weighted_average_life_months} months.`);
  if (summary.breakeven_month) parts.push(`Cumulative principal and interest receipts reach the original advance by month ${summary.breakeven_month}. Any unpaid principal remains credit exposure until it is repaid.`);
  if (lowest && lowest.coverage != null) {
    if (incomeNonpositive) parts.push(`The mathematical minimum signed payment coverage is ${lowest.coverage.toFixed(2)}x; this does not identify the largest payment or funding shortfall when earnings are nonpositive.`);
    else if (summary.repayment_config != null) parts.push(`Lowest payment-period liquidity coverage ${lowest.coverage.toFixed(2)}x; annual coverage uses peak rolling twelve-month cash due.`);
    else if (ioCov != null && afterCov != null && ioCov !== afterCov) parts.push(`Coverage on each payment: ${ioCov.toFixed(2)}x during the interest-only months, ${afterCov.toFixed(2)}x once principal starts; the numerically lowest ratio is ${lowest.coverage.toFixed(2)}x.`);
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
  return r2(((lo + hi) / 2) * periodsPerYear * 100);
}

export function describeSchedule(summary: LoanScheduleSummary | null | undefined): string {
  if (!summary) return "";
  if (summary.repayment_config != null) return `${summary.structure_label} over ${summary.term_months} months; ${summary.amortization_months != null ? `amortization ${summary.amortization_months} months after interest-only` : "no principal amortization"}; ${summary.scheduled_balloons?.length ?? 0} scheduled balloons; ${summary.balloon.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} residual at maturity; ${summary.after_balloon} after balloons`;
  const io = summary.interest_only_months;
  if (summary.structure === "interest_only") return `interest-only${summary.term_months ? ` over ${summary.term_months} months` : ""}, principal due at maturity`;
  const label = STRUCTURE_LABELS[summary.structure].toLowerCase();
  return io ? `over ${summary.term_months} months, ${io} interest-only then ${label}` : `over ${summary.term_months} months, ${label}`;
}
