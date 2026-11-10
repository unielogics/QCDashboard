import type { TermsOnFile } from "@/components/file/UnderwritingFlow";
import type { WorkingFinancing } from "./workingFinancing";
import { buildSchedule, STRUCTURE_LABELS, normalizeStructure } from "./loanSchedule";
import { workingLoanFromPlan } from "./loanTermsSync";
import { termsReferenceMatches } from "./offerDeliveryState";

const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

function paymentCadence(periods: number | null) {
  if (periods === 12) return "Payment · monthly";
  if (periods === 52 || periods === 51.96) return "Payment · weekly";
  if (periods === 26 || periods === 25.98) return "Payment · biweekly";
  if (periods === 252 || periods === 260) return "Payment · business day";
  if (periods === 365 || periods === 366) return "Payment · daily";
  return periods == null ? "Payment" : `Payment · ${periods} payments per year`;
}

/** A current proposal and an immutable delivered offer are separate records. */
export function liveFinancingPreview(financing: WorkingFinancing | null | undefined, saved: TermsOnFile | null = null) {
  if (!financing) return {
    working: false, pending: false, hasLoan: Boolean(saved), label: saved ? `Saved terms · version ${saved.version}` : "Client-ready offer preview",
    amount: saved?.amount ?? null, ratePct: saved?.ratePct ?? null, termMonths: saved?.termMonths ?? null,
    paymentAmount: saved?.paymentAmount ?? saved?.paymentMonthly ?? null, paymentLabel: saved?.paymentLabel ?? "Payment / month",
    structureLabel: saved?.structureLabel ?? null, interestOnlyMonths: saved?.interestOnlyMonths ?? 0,
    coverageAfter: saved?.coverageAfter ?? null, debtServiceAnnual: null as number | null,
  };
  const plan = financing.plan;
  const explicit = workingLoanFromPlan(plan);
  const recordedFallback = !explicit && !financing.dirty && saved && (
    termsReferenceMatches(plan.terms_ref ?? null, saved) || plan.new_payment_source === "term_sheet");
  const manualPayment = !explicit && plan.new_payment_source === "manual" ? finite(plan.new_payment_monthly) : null;
  // Never resurrect an old offer after the working loan was deliberately cleared.
  const evaluated = explicit || recordedFallback ? financing.budgetEvaluation?.loan_terms : null;
  const pending = financing.budgetPending === true;
  const amount = evaluated ? finite(evaluated.amount) : explicit?.amount ?? (recordedFallback ? saved?.amount ?? null : null);
  const rate = explicit ? explicit.ratePct : evaluated ? finite(evaluated.rate_pct) : recordedFallback ? saved?.ratePct ?? null : null;
  const term = explicit ? explicit.termMonths : evaluated ? finite(evaluated.term_months) : recordedFallback ? saved?.termMonths ?? null : null;
  const structure = normalizeStructure(explicit?.structure ?? evaluated?.structure, term);
  const io = explicit ? explicit.interestOnlyMonths ?? 0 : evaluated?.interest_only_months ?? (recordedFallback ? saved?.interestOnlyMonths : 0) ?? 0;
  const periods = evaluated ? finite(evaluated.payments_per_year) : explicit?.paymentsPerYear ?? (recordedFallback ? 12 : null);
  let payment: number | null = null;
  if (!pending && amount != null && rate != null && term != null && periods != null) {
    try {
      const schedule = buildSchedule(amount, rate, term, { structure, interestOnlyMonths: io, periodsPerYear: periods,
        repaymentConfig: explicit ? explicit.repaymentConfig : evaluated?.repayment_config });
      payment = schedule?.payment_after ?? schedule?.payment_io ?? null;
    } catch { /* Invalid partial inputs remain editable; no saved payment is substituted. */ }
  }
  if (!pending && recordedFallback && !evaluated) payment = saved?.paymentAmount ?? saved?.paymentMonthly ?? null;
  // Unchanged recorded scalar quotes may have a lender-stated payment. Their
  // exact version remains authoritative until the desk edits the loan itself.
  const recordedPayment = !pending && !explicit?.repaymentConfig && saved && plan.new_payment_source === "recorded_terms"
    && termsReferenceMatches(plan.terms_ref ?? null, saved) && amount === saved.amount && rate === saved.ratePct && term === saved.termMonths;
  if (recordedPayment) payment = saved.paymentAmount ?? saved.paymentMonthly;
  return {
    working: true, pending, hasLoan: Boolean(explicit || evaluated || recordedFallback || manualPayment != null),
    label: financing.dirty ? "Working preview · unsaved" : "Current plan preview",
    amount: pending ? null : amount, ratePct: rate, termMonths: term,
    paymentAmount: pending ? null : manualPayment ?? payment,
    paymentLabel: manualPayment != null ? "Manual payment / month" : recordedPayment || recordedFallback && !evaluated ? saved?.paymentLabel ?? "Payment / month" : paymentCadence(periods),
    structureLabel: manualPayment != null ? "Manual payment" : recordedFallback && !evaluated ? saved?.structureLabel ?? null : explicit || evaluated ? STRUCTURE_LABELS[structure] : null,
    interestOnlyMonths: io, coverageAfter: pending ? null : financing.projectedDscr,
    debtServiceAnnual: pending ? null : financing.projectedDebtServiceAnnual,
  };
}
