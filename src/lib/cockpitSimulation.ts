import { repaymentPreview } from "./repaymentConfig";
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
  removed: number | null;
  added: number | null;
  cumulative: number | null;
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
    removedMonthlyAverage: rows.length ? round2(rows.reduce((s, r) => s + (r.removed ?? 0), 0) / rows.length) : 0,
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

import type { FinancialCockpit, FinancialPlanWrite, Obligation, PlanAddBack, PlanCandidate, PlanLoanTerms } from "@/lib/financialCockpit";
import { dscrStatusOf } from "@/lib/financialCockpit";
import { describeSchedule, type LoanScheduleSummary } from "@/lib/loanSchedule";
import { evaluateRefinanceEbitda, roundEbitdaMoney, type RefinanceEbitda } from "@/lib/ebitdaRefinance";

export type LocalPlanEvaluation = {
  ebitda?: RefinanceEbitda;
  retiredMonthly: number;
  payoffTotal: number | null;
  payoffUnknown: number;
  excludedMonthly: number;
  addBacksMonthly: number;
  excludedAddBacks: Array<PlanAddBack & { reason: string }>;
  coverageUnavailableReason: string | null;
  incomeBefore: number | null;
  incomeAfter: number | null;
  loanTerms: PlanLoanTerms | null;
  schedule: LoanScheduleSummary | null;
  newPayment: number | null;
  newRegularPayment: number | null;
  newInterestOnlyPayment: number | null;
  serviceAfterRegular: number | null;
  serviceAfterInterestOnly: number | null;
  netRegularMonthlyChange: number | null;
  netInterestOnlyMonthlyChange: number | null;
  newPaymentSource: string | null;
  loanAmountNeeded: number | null;
  serviceBefore: number | null;
  serviceBeforeNewPayment: number | null;
  serviceAfter: number | null;
  serviceAfterAnnual: number | null;
  candidates: PlanCandidate[];
  headlineAfter: number | null;
  noDebtLeft: boolean;
  rows: SimulationRow[];
  netAfterAverage: number | null;
  endingAfterLast: number | null;
  monthsDippingNegativeAfter: number | null;
  cashKept: number | null;
  replayProjectionAvailable: boolean;
  replayUnavailableReason?: string | null;
  retirementReplayUnknown?: boolean;
  replayReviewRequiredIds?: string[];
};

const r2 = (v: number) => roundEbitdaMoney(v);

export const DSCR_ADD_BACK_EXCLUSION = "Interest and depreciation/amortization are already accounted for in the earnings or bank cash-flow basis; adding them again would double count.";
export const DSCR_SERVICE_MISSING = "Existing debt service is unknown. Complete the debt schedule or enter a reviewed debt-service override before calculating coverage.";
export const DSCR_NEW_PAYMENT_MISSING = "The new loan payment is unknown. Enter its rate and terms or a reviewed monthly payment before calculating coverage.";
export const PAYOFF_REPLAY_REVIEW_REQUIRED = "Statement payments cannot be allocated uniquely to these loans. Review loan-level statement evidence before projecting payoff cash-flow or bank-balance changes.";
export function isExcludedDscrAddBack(kind: PlanAddBack["kind"]): boolean {
  return kind === "interest_refinanced" || kind === "depreciation";
}

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
  const sharedPayeeKeys = new Set(obligations.map((o) => o.linked_payee_key).filter((key): key is string => Boolean(key)).filter((key, index, keys) => keys.indexOf(key) !== index));
  const replayReviewRequiredIds = retired.filter((o) => o.replay_requires_review || Boolean(o.linked_payee_key && sharedPayeeKeys.has(o.linked_payee_key))).map((o) => o.id);
  const retirementReplayUnknown = replayReviewRequiredIds.length > 0;
  const retiredPaymentUnknown = retired.some((o) => o.in_debt_service && (o.monthly == null || !Number.isFinite(o.monthly)));
  const retiredMonthly = r2(retired.filter((o) => o.in_debt_service).reduce((s, o) => s + (o.monthly ?? 0), 0));
  const payoffs = retired.map((o) => o.payoff).filter((v): v is number => v != null);
  const payoffTotal = payoffs.length ? r2(payoffs.reduce((a, b) => a + b, 0)) : null;
  const excludedMonthly = r2(payees.filter((p) => exclude.has(`payee:${p.key}`)).reduce((s, p) => s + (p.monthly_average ?? 0), 0));
  const excludedAddBacks = (plan.add_backs ?? []).filter((a) => isExcludedDscrAddBack(a.kind)).map((a) => ({ ...a, reason: DSCR_ADD_BACK_EXCLUSION }));
  const addBacksMonthly = r2((plan.add_backs ?? []).filter((a) => !isExcludedDscrAddBack(a.kind)).reduce((s, a) => s + (Number.isFinite(a.amount_monthly) ? a.amount_monthly : 0), 0));
  const addBacksAnnual = r2(addBacksMonthly * 12);
  const incomeOverride = plan.overrides?.income_annual ?? null;
  const serviceOverride = plan.overrides?.debt_service_monthly ?? null;
  const interestOnly = !!plan.new_loan_interest_only || plan.new_loan_structure === "interest_only";
  const proposed = cockpit.dscr.proposed;
  const adoptedTerms = !plan.new_loan_amount && plan.new_payment_source === "term_sheet" && plan.new_payment_monthly == null ? cockpit.proposed_terms : null;
  const schedule: LoanScheduleSummary | null =
    plan.new_loan_amount && plan.new_loan_rate_pct != null && (plan.new_loan_term_months || interestOnly)
      ? repaymentPreview(plan.new_loan_amount, plan.new_loan_rate_pct, plan.new_loan_term_months ?? 0, { structure: interestOnly ? "interest_only" : plan.new_loan_structure, interestOnlyMonths: plan.new_loan_interest_only_months ?? 0, periodsPerYear: plan.new_loan_payments_per_year ?? 12, repaymentConfig: plan.new_loan_repayment_config }).schedule
      : adoptedTerms?.repayment_config && adoptedTerms.amount && adoptedTerms.rate_pct != null ? repaymentPreview(adoptedTerms.amount, adoptedTerms.rate_pct, adoptedTerms.term_months, { structure: adoptedTerms.structure, interestOnlyMonths: adoptedTerms.interest_only_months, periodsPerYear: adoptedTerms.payments_per_year ?? 12, repaymentConfig: adoptedTerms.repayment_config }).schedule : null;
  const loanTerms: PlanLoanTerms | null = schedule
    ? { amount: schedule.amount, rate_pct: schedule.rate_pct, term_months: schedule.term_months, interest_only: schedule.structure === "interest_only", structure: schedule.structure, interest_only_months: schedule.interest_only_months, repayment_config: schedule.repayment_config, payments_per_year: schedule.periods_per_year, payment_io: schedule.payment_io_monthly, payment_after: schedule.payment_after_monthly, payment_phases: schedule.payment_phases, actual_regular_payment_monthly: schedule.ordinary_payment_monthly, annual_debt_service: schedule.repayment_config ? schedule.coverage_annual_debt_service : schedule.annual_debt_service, total_interest: schedule.total_interest, total_paid: schedule.total_paid, balloon: schedule.balloon, describe: describeSchedule(schedule) }
    : !plan.new_loan_amount && plan.new_payment_source === "term_sheet" && plan.new_payment_monthly == null && proposed?.amount && proposed.rate_pct != null
      ? { amount: proposed.amount, rate_pct: proposed.rate_pct ?? 0, term_months: proposed.term_months ?? null, interest_only: false }
      : null;
  let newPayment = plan.new_payment_monthly;
  let source: string | null = plan.new_payment_source;
  if (newPayment == null && schedule) {
    newPayment = schedule.coverage_payment_monthly;
    source = source ?? "manual_terms";
  }
  if (schedule?.repayment_config) newPayment = Math.max(newPayment ?? 0, schedule.coverage_payment_monthly);
  // The recorded loan terms join the plan only when the desk adopted them.
  if (newPayment == null && !plan.new_loan_amount && source === "term_sheet" && cockpit.dscr.proposed?.monthly_payment != null) {
    newPayment = cockpit.dscr.proposed.monthly_payment;
  } else if (newPayment == null && source === "term_sheet") {
    source = null;
  }
  const configuredScheduleUnpriced = ((!!plan.new_loan_amount && plan.new_loan_repayment_config != null) || (!!adoptedTerms?.amount && adoptedTerms.repayment_config != null)) && schedule == null;
  const newLoanPaymentUnknown = (!!plan.new_loan_amount && newPayment == null) || configuredScheduleUnpriced;
  const legacyStatedOrdinary = plan.new_payment_monthly != null && !schedule?.repayment_config;
  const manualOrdinary = source === "manual" && legacyStatedOrdinary;
  const newRegularPayment = newLoanPaymentUnknown ? null : legacyStatedOrdinary ? plan.new_payment_monthly : schedule ? schedule.ordinary_payment_monthly ?? null : newPayment ?? 0;
  const newInterestOnlyPayment = newLoanPaymentUnknown || manualOrdinary ? null : schedule?.payment_io_monthly ?? null;
  const retainedAnnual = plan.terms_ref?.retained_annual_debt_service;
  const recordedRetained = source === "recorded_terms" && plan.terms_ref?.treatment === "refinance" && retainedAnnual != null && (plan.overrides?.debt_service_note ?? "").startsWith("Refinance per ") && serviceOverride != null && Math.abs(serviceOverride - roundEbitdaMoney(retainedAnnual / 12)) < 0.005;
  const exactRetained = schedule?.repayment_config && recordedRetained;
  const serviceBefore = serviceOverride ?? cockpit.debt.service.monthly ?? null;
  const retirementUnknown = retiredPaymentUnknown && !recordedRetained;
  const coverageUnavailableReason = retirementUnknown ? "A selected payoff has unknown monthly debt service. Review its payment before calculating coverage." : serviceBefore == null ? DSCR_SERVICE_MISSING : newLoanPaymentUnknown ? DSCR_NEW_PAYMENT_MISSING : null;
  const replayProjectionAvailable = !retirementUnknown && !newLoanPaymentUnknown && !retirementReplayUnknown;
  const replayUnavailableReason = retirementReplayUnknown ? PAYOFF_REPLAY_REVIEW_REQUIRED : retirementUnknown ? "A selected payoff has unknown monthly debt service. Review its payment before calculating coverage." : newLoanPaymentUnknown ? DSCR_NEW_PAYMENT_MISSING : null;
  const serviceBeforeNewPayment = serviceBefore == null || retirementUnknown ? null : r2(Math.max(0, recordedRetained ? serviceBefore : serviceBefore - retiredMonthly));
  const serviceAfter = serviceBeforeNewPayment == null || newLoanPaymentUnknown ? null : r2(Math.max(0, serviceBeforeNewPayment + (newPayment ?? 0)));
  const serviceAfterRegular = serviceBeforeNewPayment == null || newRegularPayment == null ? null : r2(Math.max(0, serviceBeforeNewPayment + newRegularPayment));
  const serviceAfterInterestOnly = serviceBeforeNewPayment == null || newInterestOnlyPayment == null ? null : r2(Math.max(0, serviceBeforeNewPayment + newInterestOnlyPayment));
  const netRegularMonthlyChange = serviceBefore == null || serviceAfterRegular == null ? null : r2(serviceAfterRegular - serviceBefore);
  const netInterestOnlyMonthlyChange = serviceBefore == null || serviceAfterInterestOnly == null ? null : r2(serviceAfterInterestOnly - serviceBefore);
  const newAnnualService = schedule?.repayment_config && Math.abs((newPayment ?? 0) - schedule.coverage_payment_monthly) < 0.005 ? schedule.coverage_annual_debt_service : (newPayment ?? 0) * 12;
  const existingAnnualService = exactRetained ? retainedAnnual : serviceBeforeNewPayment == null ? null : serviceBeforeNewPayment * 12;
  const serviceAfterAnnual = existingAnnualService == null || newLoanPaymentUnknown ? null : r2(Math.max(0, existingAnnualService + newAnnualService));
  const candidates: PlanCandidate[] = cockpit.dscr.candidates
    .filter((c) => c.numerator != null)
    .map((c) => {
      // Only additional operating adjustments raise earnings. Interest and D&A are already accounted for.
      const adjusted = r2((c.numerator as number) + addBacksAnnual + (c.key === "bank_cash_flow" ? excludedMonthly * 12 : 0));
      const numeratorAfter = incomeOverride != null ? r2(incomeOverride) : adjusted;
      const valueAfter = serviceAfterAnnual != null && serviceAfterAnnual > 0 ? r2(numeratorAfter / serviceAfterAnnual) : null;
      return { key: c.key, label: c.label, numerator_before: c.numerator as number, numerator_after: numeratorAfter, value_before: c.value, value_after: valueAfter, status_after: dscrStatusOf(valueAfter), no_debt_left: serviceAfterAnnual != null && serviceAfterAnnual <= 0 && numeratorAfter > 0, overridden: incomeOverride != null };
    });
  if (incomeOverride != null && !candidates.length) {
    const valueAfter = serviceAfterAnnual != null && serviceAfterAnnual > 0 ? r2(incomeOverride / serviceAfterAnnual) : null;
    candidates.push({ key: "desk_override", label: "Desk override", numerator_before: null, numerator_after: r2(incomeOverride), value_before: null, value_after: valueAfter, status_after: dscrStatusOf(valueAfter), no_debt_left: serviceAfterAnnual != null && serviceAfterAnnual <= 0 && incomeOverride > 0, overridden: true });
  }
  const headlineKey = cockpit.dscr.headline?.key ?? candidates[0]?.key ?? null;
  const headline = candidates.find((c) => c.key === headlineKey) ?? candidates[0] ?? null;
  // Replay with the retired obligations taken out, month by month.
  // A historical bank replay is an ordinary-payment proxy, not a dated loan
  // forecast. Maturity principal stays in the separate DSCR stress calculation.
  const added = newRegularPayment ?? 0;
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
      withdrawalsAfter: replayProjectionAvailable ? withdrawalsAfter : null,
      net: m.net,
      netAfter: !replayProjectionAvailable || m.deposits == null || withdrawalsAfter == null ? null : r2(m.deposits - withdrawalsAfter),
      ending: m.ending_balance,
      endingAfter: !replayProjectionAvailable || m.ending_balance == null ? null : r2(m.ending_balance + cumulative),
      lowest: m.low_balance,
      lowestAfter: !replayProjectionAvailable || m.low_balance == null ? null : r2(m.low_balance + before + change / 2),
      removed: retirementUnknown || retirementReplayUnknown ? null : removedHere,
      added: replayProjectionAvailable ? added : null,
      cumulative: replayProjectionAvailable ? cumulative : null,
    };
  });
  const netAfter = rows.map((r) => r.netAfter).filter((v): v is number => v != null);
  return {
    ebitda: evaluateRefinanceEbitda(cockpit, plan, { serviceAfter: serviceAfterRegular, netBefore: mean(months.map((row) => row.net)), netAfter: netAfter.length ? r2(netAfter.reduce((a, b) => a + b, 0) / netAfter.length) : null, retiredCount: retired.length, newPayment: newPayment == null ? null : newRegularPayment }),
    retiredMonthly,
    payoffTotal,
    payoffUnknown: retired.filter((o) => o.payoff == null).length,
    excludedMonthly,
    addBacksMonthly,
    excludedAddBacks,
    coverageUnavailableReason,
    incomeBefore: headline?.numerator_before ?? null,
    incomeAfter: headline?.numerator_after ?? null,
    loanTerms,
    schedule,
    newPayment: newPayment == null ? null : r2(newPayment),
    newRegularPayment: newRegularPayment == null ? null : r2(newRegularPayment),
    newInterestOnlyPayment: newInterestOnlyPayment == null ? null : r2(newInterestOnlyPayment),
    serviceAfterRegular,
    serviceAfterInterestOnly,
    netRegularMonthlyChange,
    netInterestOnlyMonthlyChange,
    newPaymentSource: newPayment == null ? null : source,
    loanAmountNeeded: Math.max(payoffTotal ?? 0, cockpit.requested_amount ?? 0) || null,
    serviceBefore,
    serviceBeforeNewPayment,
    serviceAfter,
    serviceAfterAnnual,
    candidates,
    headlineAfter: headline?.value_after ?? null,
    noDebtLeft: !!headline?.no_debt_left,
    rows,
    netAfterAverage: netAfter.length ? r2(netAfter.reduce((a, b) => a + b, 0) / netAfter.length) : null,
    endingAfterLast: rows.length ? rows[rows.length - 1].endingAfter : null,
    monthsDippingNegativeAfter: replayProjectionAvailable ? rows.filter((r) => r.lowestAfter != null && r.lowestAfter < 0).length : null,
    cashKept: replayProjectionAvailable ? cumulative : null,
    replayProjectionAvailable,
    replayUnavailableReason,
    retirementReplayUnknown,
    replayReviewRequiredIds,
  };
}
