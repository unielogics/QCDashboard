import { PAYMENT_FREQUENCIES } from "./options";
import type { PaymentFrequency, RateStructure, RepaymentStructure, TermSheetPaymentSummary } from "./types";

export type StructuredPaymentInput = {
  amount: number;
  termMonths: number;
  annualRatePct: number;
  repaymentStructure: RepaymentStructure;
  paymentFrequency: PaymentFrequency;
  paymentsPerYear?: number | null;
  paymentBasisAmount?: number | null;
  interestOnlyMonths?: number | null;
  amortizationMonths?: number | null;
  periodicPaymentOverride?: number | null;
  balloonAmountOverride?: number | null;
};

export type StructuredRateInput = {
  structure: RateStructure;
  fixedOrCustomRatePct: number;
  indexRatePct?: number | null;
  marginPct?: number | null;
  floorPct?: number | null;
  capPct?: number | null;
};

const finite = (value: number | null | undefined): number | null => Number.isFinite(value) ? Number(value) : null;
const positive = (value: number | null | undefined): number | null => {
  const n = finite(value);
  return n !== null && n > 0 ? n : null;
};
const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const money = (value: number): string => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export function periodsPerYear(frequency: PaymentFrequency, custom?: number | null): number | null {
  if (frequency === "custom") return positive(custom);
  return PAYMENT_FREQUENCIES.find((option) => option.value === frequency)?.periods ?? null;
}

export function effectiveAnnualRate(input: StructuredRateInput): number {
  if (input.structure !== "variable") return Math.max(0, finite(input.fixedOrCustomRatePct) ?? 0);
  let rate = Math.max(0, finite(input.indexRatePct) ?? 0) + (finite(input.marginPct) ?? 0);
  const floor = finite(input.floorPct);
  const cap = finite(input.capPct);
  if (floor !== null) rate = Math.max(rate, floor);
  if (cap !== null) rate = Math.min(rate, cap);
  return Math.max(0, rate);
}

function countForMonths(months: number, periods: number): number {
  return Math.max(1, Math.round((Math.max(0, months) * periods) / 12));
}

function amortizingPayment(principal: number, annualRatePct: number, months: number, periods: number): number {
  const count = countForMonths(months, periods);
  const rate = annualRatePct / 100 / periods;
  return rate === 0 ? principal / count : (principal * rate) / (1 - Math.pow(1 + rate, -count));
}

function paymentForTargetBalance(principal: number, target: number, annualRatePct: number, months: number, periods: number): number {
  const count = countForMonths(months, periods);
  const rate = annualRatePct / 100 / periods;
  const endingBalance = Math.max(0, target);
  if (rate === 0) return Math.max(0, principal - endingBalance) / count;
  const discount = Math.pow(1 + rate, count);
  return ((principal - endingBalance / discount) * rate) / (1 - 1 / discount);
}

function remainingBalance(principal: number, annualRatePct: number, payment: number, paymentsMade: number, periods: number): number {
  if (paymentsMade <= 0) return principal;
  const rate = annualRatePct / 100 / periods;
  if (rate === 0) return Math.max(0, principal - payment * paymentsMade);
  const growth = Math.pow(1 + rate, paymentsMade);
  return Math.max(0, principal * growth - payment * ((growth - 1) / rate));
}

export function computePaymentSummary(input: StructuredPaymentInput): TermSheetPaymentSummary {
  const amount = positive(input.amount) ?? 0;
  const basis = positive(input.paymentBasisAmount) ?? amount;
  const periods = periodsPerYear(input.paymentFrequency, input.paymentsPerYear);
  const term = Math.max(0, input.termMonths || 0);
  const ioMonths = Math.max(0, input.interestOnlyMonths || 0);
  const amortizationMonths = positive(input.amortizationMonths) ?? Math.max(1, term - ioMonths || term || 1);
  const rate = Math.max(0, input.annualRatePct || 0);
  const assumptions: string[] = [];
  const lines: string[] = [];

  if (!amount || !periods || !term) {
    return {
      periodic_payment: null,
      monthly_equivalent_payment: null,
      post_io_payment: null,
      post_io_monthly_equivalent: null,
      balloon_amount: null,
      payment_basis_amount: basis || null,
      payments_per_year: periods,
      lines,
      assumptions,
    };
  }

  const periodicInterest = basis * (rate / 100) / periods;
  let calculatedPeriodic: number | null = null;
  let postIo: number | null = null;
  let balloon: number | null = null;

  switch (input.repaymentStructure) {
    case "fully_amortizing": {
      calculatedPeriodic = amortizingPayment(basis, rate, amortizationMonths, periods);
      const paymentsMade = countForMonths(term, periods);
      balloon = remainingBalance(basis, rate, calculatedPeriodic, paymentsMade, periods);
      lines.push(`${money(calculatedPeriodic)} ${input.paymentFrequency} principal and interest`);
      break;
    }
    case "interest_only": {
      calculatedPeriodic = periodicInterest;
      balloon = basis;
      lines.push(`${money(periodicInterest)} ${input.paymentFrequency} interest-only estimate`);
      assumptions.push(`Interest is estimated on a ${money(basis)} balance; the actual payment changes with principal and rate.`);
      break;
    }
    case "interest_only_then_amortizing": {
      calculatedPeriodic = periodicInterest;
      postIo = amortizingPayment(basis, rate, amortizationMonths, periods);
      const amortizingMonthsInTerm = Math.max(0, term - ioMonths);
      const paymentsMade = amortizingMonthsInTerm > 0 ? countForMonths(amortizingMonthsInTerm, periods) : 0;
      balloon = remainingBalance(basis, rate, postIo, paymentsMade, periods);
      lines.push(`${money(periodicInterest)} ${input.paymentFrequency} for the first ${ioMonths} month${ioMonths === 1 ? "" : "s"}`);
      lines.push(`${money(postIo)} ${input.paymentFrequency} after the interest-only period`);
      break;
    }
    case "balloon": {
      const targetBalloon = finite(input.balloonAmountOverride);
      calculatedPeriodic = targetBalloon !== null && targetBalloon >= 0
        ? paymentForTargetBalance(basis, targetBalloon, rate, term, periods)
        : amortizingPayment(basis, rate, amortizationMonths, periods);
      balloon = targetBalloon !== null && targetBalloon >= 0
        ? targetBalloon
        : remainingBalance(basis, rate, calculatedPeriodic, countForMonths(term, periods), periods);
      lines.push(`${money(calculatedPeriodic)} ${input.paymentFrequency} on a ${amortizationMonths}-month amortization`);
      break;
    }
    case "revolving_interest_only": {
      calculatedPeriodic = periodicInterest;
      balloon = basis;
      lines.push(`${money(periodicInterest)} ${input.paymentFrequency} at the selected ${money(basis)} balance`);
      assumptions.push("This is an estimate only; draws, repayments and variable-rate changes alter the payment.");
      break;
    }
    case "fixed_payment": {
      calculatedPeriodic = positive(input.periodicPaymentOverride);
      lines.push(calculatedPeriodic ? `${money(calculatedPeriodic)} ${input.paymentFrequency} lender-stated payment` : "Enter the lender-stated periodic payment.");
      balloon = calculatedPeriodic === null ? null : remainingBalance(basis, rate, calculatedPeriodic, countForMonths(term, periods), periods);
      break;
    }
    case "custom": {
      calculatedPeriodic = positive(input.periodicPaymentOverride);
      lines.push(calculatedPeriodic ? `${money(calculatedPeriodic)} ${input.paymentFrequency} lender-stated payment` : "Enter the lender-stated periodic payment.");
      break;
    }
  }

  const override = positive(input.periodicPaymentOverride);
  const periodic = override ?? calculatedPeriodic;
  if (override && input.repaymentStructure !== "fixed_payment" && input.repaymentStructure !== "custom") {
    assumptions.push("The lender-stated payment overrides the formula estimate.");
    lines.unshift(`${money(override)} ${input.paymentFrequency} lender-stated payment`);
    if (input.repaymentStructure === "fully_amortizing" || input.repaymentStructure === "balloon") {
      balloon = remainingBalance(basis, rate, override, countForMonths(term, periods), periods);
    }
  }
  const explicitBalloon = finite(input.balloonAmountOverride);
  if ((input.repaymentStructure === "fixed_payment" || input.repaymentStructure === "custom") && explicitBalloon !== null && explicitBalloon >= 0) {
    balloon = explicitBalloon;
  }
  if (balloon !== null && balloon < 0.01) balloon = 0;
  if (balloon && balloon > 0) lines.push(`${money(balloon)} estimated principal / balloon remaining at maturity`);

  return {
    periodic_payment: periodic === null ? null : roundMoney(periodic),
    monthly_equivalent_payment: periodic === null ? null : roundMoney((periodic * periods) / 12),
    post_io_payment: postIo === null ? null : roundMoney(postIo),
    post_io_monthly_equivalent: postIo === null ? null : roundMoney((postIo * periods) / 12),
    balloon_amount: balloon === null ? null : roundMoney(balloon),
    payment_basis_amount: roundMoney(basis),
    payments_per_year: periods,
    lines,
    assumptions,
  };
}

export function defaultProgramCoverage(summary: TermSheetPaymentSummary): number | null {
  const scheduled = positive(summary.monthly_equivalent_payment);
  const postIo = positive(summary.post_io_monthly_equivalent);
  if (scheduled === null) return postIo;
  if (postIo === null) return scheduled;
  return Math.max(scheduled, postIo);
}
