// Eligibility / gating logic for the loan simulator.
//
// MIRROR: keep in sync with qcmobile/src/lib/eligibility.ts (1:1).
// MIRROR: cap constants must match qcbackend/app/constants.py and the
// sizing math must match qcbackend/app/services/math/sizing.py to the cent.
//
// Pure logic — no React, no API calls.

export type EligibilityTier = "blocked" | "warn" | "basic" | "pro";

export interface EligibilityInputs {
  fico: number | null;
  propertyCount: number;
  hasYearOfOwnership: boolean;
  // Derived from /credit/current — when true, treat the pull as missing.
  creditExpired?: boolean;
  // True when the pull is still valid but within
  // SOFT_PULL_EXPIRING_SOON_DAYS of expiring. Non-blocking nudge.
  creditExpiringSoon?: boolean;
  daysUntilExpiry?: number | null;
}

export interface EligibilityBanner {
  kind:
    | "credit-blocked"
    | "credit-warn"
    | "experience"
    | "no-credit"
    | "credit-expired"
    | "credit-expiring";
  title: string;
  body: string;
  ctaLabel?: string;
  ctaTarget?: "credit-pull" | "vault" | "new-loan";
}

export interface EligibilityResult {
  tier: EligibilityTier;
  maxLTV: number;
  allowedLTVs: number[];
  allLTVs: number[];
  banner: EligibilityBanner | null;
}

const ALL_LTVS = [0.6, 0.65, 0.7, 0.75];

// Mirror qcbackend/app/constants.py
export const DSCR_MAX_LTV_PURCHASE = 0.8;
export const DSCR_MAX_LTV_CASH_OUT = 0.75;
export const FF_MAX_LTC = 0.85;
export const FF_MAX_ARV_LTV = 0.7;

export function computeEligibility(input: EligibilityInputs): EligibilityResult {
  const { fico, propertyCount, hasYearOfOwnership, creditExpired, creditExpiringSoon, daysUntilExpiry } = input;

  // Expired pulls behave the same as no-credit, but the banner copy makes
  // it clear the user *had* a pull and just needs to refresh it.
  if (creditExpired) {
    return {
      tier: "blocked",
      maxLTV: 0,
      allowedLTVs: [],
      allLTVs: ALL_LTVS,
      banner: {
        kind: "credit-expired",
        title: "Credit verification expired",
        body: "Soft pulls are valid for 90 days. Refresh your credit to unlock current rates.",
        ctaLabel: "Refresh Credit · Soft Pull",
        ctaTarget: "credit-pull",
      },
    };
  }

  if (fico == null) {
    return {
      tier: "blocked",
      maxLTV: 0,
      allowedLTVs: [],
      allLTVs: ALL_LTVS,
      banner: {
        kind: "no-credit",
        title: "Credit not verified",
        body: "Run a soft credit pull to unlock loan offers. No score impact.",
        ctaLabel: "Unlock Pro Terms · Soft Pull",
        ctaTarget: "credit-pull",
      },
    };
  }

  if (fico < 620) {
    return {
      tier: "blocked",
      maxLTV: 0,
      allowedLTVs: [],
      allLTVs: ALL_LTVS,
      banner: {
        kind: "credit-blocked",
        title: "Credit below threshold",
        body: `Score ${fico} doesn't meet our 620 minimum. Start a guided new-loan workflow — our AI can route you to credit-repair options and structure a path forward.`,
        ctaLabel: "Start guided workflow",
        ctaTarget: "new-loan",
      },
    };
  }

  // Caution band — 620–679. Credit is on file, so no UI banner: the system
  // silently caps LTV at 65% and the loan team handles outreach in the
  // background. Surfacing a banner here was deemed nagging UX.
  if (fico < 680) {
    return {
      tier: "warn",
      maxLTV: 0.65,
      allowedLTVs: [0.6, 0.65],
      allLTVs: ALL_LTVS,
      banner: maybeExpiringSoon(creditExpiringSoon, daysUntilExpiry),
    };
  }

  const hasFullExperience = hasYearOfOwnership && propertyCount >= 2;
  if (!hasFullExperience) {
    const reasons: string[] = [];
    if (!hasYearOfOwnership) reasons.push("1+ year of ownership history");
    if (propertyCount < 2) reasons.push("at least 2 owned properties");
    return {
      tier: "basic",
      maxLTV: 0.65,
      allowedLTVs: [0.6, 0.65],
      allLTVs: ALL_LTVS,
      banner:
        maybeExpiringSoon(creditExpiringSoon, daysUntilExpiry) ?? {
          kind: "experience",
          title: "Add experience to unlock 70%+ LTV",
          body: `Higher LTV options need ${reasons.join(" and ")}. Add HUDs from past closings or your owned properties to your investor profile.`,
          ctaLabel: "Open Vault",
          ctaTarget: "vault",
        },
    };
  }

  return {
    tier: "pro",
    maxLTV: 0.75,
    allowedLTVs: ALL_LTVS,
    allLTVs: ALL_LTVS,
    banner: maybeExpiringSoon(creditExpiringSoon, daysUntilExpiry),
  };
}

function maybeExpiringSoon(
  expiringSoon: boolean | undefined,
  days: number | null | undefined,
): EligibilityBanner | null {
  if (!expiringSoon) return null;
  return {
    kind: "credit-expiring",
    title: "Credit expires soon",
    body:
      typeof days === "number"
        ? `Refresh in ${days} day${days === 1 ? "" : "s"} to keep your rates accurate.`
        : "Refresh your soft pull to keep your rates accurate.",
    ctaLabel: "Refresh Credit",
    ctaTarget: "credit-pull",
  };
}

// ── Pricing math (mirror of mobile) ─────────────────────────────────────────

export type TransactionType = "purchase" | "refi";
export type BindingConstraint = "ltv" | "ltc" | "arv" | "refi-cap" | "requested";

export interface SimulatorInputs {
  arv: number;
  ltv: number;
  discountPoints: number;
  productKey: "dscr" | "ff" | "gu" | "br";
  // Optional override — when the caller has fetched today's rate from FRED
  // (index + lender spread) we use it instead of the hardcoded fallback.
  // Expressed as a percentage (e.g. 7.875 == 7.875%).
  baseRatePct?: number;
  // DSCR refinance — when transactionType==="refi" we collect payoff
  // and apply the 75% cap (DSCR_MAX_LTV_CASH_OUT).
  transactionType?: TransactionType;
  payoff?: number;
  // F&F / GU sizing inputs. brv = purchase price; rehabBudget = repair
  // budget. When both are present we size off LTC × (brv + rehab) capped
  // at FF_MAX_ARV_LTV × arv instead of the legacy arv × ltv.
  brv?: number;
  rehabBudget?: number;
  // When the user types a loan amount manually, pass it through here.
  // It will be clamped to the maxLoan in the output.
  requestedLoanAmount?: number;
  // Tier-derived LTV cap from computeEligibility.maxLTV. Optional — when
  // omitted, falls back to the product cap.
  ltvTierCap?: number;
  // DSCR — caller-provided monthly rent. When present, used directly to
  // compute DSCR + cash flow. When absent, falls back to the 0.85% of
  // loan-amount estimate. Ignored on non-amortized products (F&F / GU / Bridge).
  monthlyRent?: number;
}

export interface SimulatorOutputs {
  loanAmount: number;
  maxLoan: number;
  clamped: boolean;
  bindingConstraint: BindingConstraint;
  effectiveLtv: number;
  effectiveLtvCap: number | null;
  totalCost: number | null;
  cashToBorrower: number | null; // DSCR refi: loan - payoff (negative = cash to close)
  cashToClose: number | null;    // F&F / GU: total_cost - loan
  rate: number;
  monthlyPI: number;
  termMonths: number;
  isAmortized: boolean;
  rentEstimate: number | null;
  dscr: number | null;
  cashFlow: number | null;
  pointsCost: number;
  origination: number;
  fixedFees: number;
  titleIns: number;
  recording: number;
  appraisal: number;
  totalToClose: number;
}

const PRODUCT_BASE_RATE: Record<SimulatorInputs["productKey"], number> = {
  dscr: 7.375,
  ff: 9.625,
  gu: 10.25,
  br: 8.875,
};
const PRODUCT_TERM_MONTHS: Record<SimulatorInputs["productKey"], number> = {
  dscr: 360,
  ff: 12,
  gu: 18,
  br: 24,
};

function isReno(productKey: SimulatorInputs["productKey"]): boolean {
  return productKey === "ff" || productKey === "gu";
}

interface SizingDerived {
  loanAmount: number;
  maxLoan: number;
  clamped: boolean;
  bindingConstraint: BindingConstraint;
  effectiveLtv: number;
  effectiveLtvCap: number | null;
  totalCost: number | null;
  cashToBorrower: number | null;
  cashToClose: number | null;
}

// MIRROR: this must produce the same loan_amount as
// qcbackend/app/services/math/sizing.py:compute_loan_amount.
function deriveSizing(input: SimulatorInputs): SizingDerived {
  const { arv, ltv, productKey, transactionType, payoff, brv, rehabBudget, requestedLoanAmount, ltvTierCap } = input;

  if (isReno(productKey)) {
    const brvSafe = Number.isFinite(brv) && brv! > 0 ? brv! : arv;
    const rehab = Number.isFinite(rehabBudget) ? Math.max(0, rehabBudget!) : 0;
    const totalCost = brvSafe + rehab;
    const ltcMax = FF_MAX_LTC * totalCost;
    const arvMax = FF_MAX_ARV_LTV * arv;
    const maxLoan = Math.min(ltcMax, arvMax);
    const requested = Number.isFinite(requestedLoanAmount) && requestedLoanAmount! > 0
      ? requestedLoanAmount!
      : maxLoan;
    const clamped = requested > maxLoan + 0.005;
    const loanAmount = Math.min(requested, maxLoan);
    let binding: BindingConstraint;
    if (Math.abs(arvMax - maxLoan) < 1) binding = "arv";
    else binding = "ltc";
    if (!clamped && requested < maxLoan - 0.005) binding = "requested";
    return {
      loanAmount,
      maxLoan,
      clamped,
      bindingConstraint: binding,
      effectiveLtv: arv > 0 ? loanAmount / arv : 0,
      effectiveLtvCap: null,
      totalCost,
      cashToBorrower: null,
      cashToClose: totalCost - loanAmount,
    };
  }

  // DSCR / amortized products
  const isRefi = transactionType === "refi";
  const productCap = isRefi ? DSCR_MAX_LTV_CASH_OUT : DSCR_MAX_LTV_PURCHASE;
  const tierCap = ltvTierCap ?? ltv;
  const effectiveCap = Math.min(productCap, tierCap > 0 ? tierCap : productCap);
  const maxLoan = effectiveCap * arv;
  // Default sizing when the user hasn't typed an explicit amount: respect
  // the slider's chosen LTV but clamp at the cap.
  const sliderRequested = Math.min(ltv, effectiveCap) * arv;
  const requested = Number.isFinite(requestedLoanAmount) && requestedLoanAmount! > 0
    ? requestedLoanAmount!
    : sliderRequested;
  const clamped = requested > maxLoan + 0.005;
  const loanAmount = Math.min(requested, maxLoan);

  let binding: BindingConstraint;
  if (clamped) {
    binding = isRefi && effectiveCap === DSCR_MAX_LTV_CASH_OUT ? "refi-cap" : "ltv";
  } else if (requested < maxLoan - 0.005) {
    binding = "requested";
  } else {
    binding = "ltv";
  }

  let cashToBorrower: number | null = null;
  if (isRefi && Number.isFinite(payoff)) {
    cashToBorrower = loanAmount - (payoff ?? 0);
  }

  return {
    loanAmount,
    maxLoan,
    clamped,
    bindingConstraint: binding,
    effectiveLtv: arv > 0 ? loanAmount / arv : 0,
    effectiveLtvCap: effectiveCap,
    totalCost: null,
    cashToBorrower,
    cashToClose: null,
  };
}

export function computeSimulator(input: SimulatorInputs): SimulatorOutputs {
  const { discountPoints, productKey, baseRatePct } = input;
  const sizing = deriveSizing(input);
  const { loanAmount } = sizing;

  const basePct = baseRatePct ?? PRODUCT_BASE_RATE[productKey];
  const rate = (basePct - discountPoints * 0.25) / 100;
  const monthlyRate = rate / 12;
  const termMonths = PRODUCT_TERM_MONTHS[productKey];
  const isAmortized = productKey === "dscr";
  const monthlyPI = isAmortized
    ? (loanAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths))
    : loanAmount * monthlyRate;

  let rentEstimate: number | null = null;
  let dscr: number | null = null;
  let cashFlow: number | null = null;
  if (isAmortized) {
    // Caller-provided monthly rent wins. Otherwise fall back to the
    // 0.85% of loan-amount estimate (a reasonable national mid-tier
    // rent-to-loan ratio for 1-4 unit DSCR rentals).
    const rent = input.monthlyRent != null && input.monthlyRent > 0
      ? input.monthlyRent
      : loanAmount * 0.0085;
    rentEstimate = rent;
    const taxIns = rent * 0.18;
    cashFlow = rent - monthlyPI - taxIns;
    dscr = rent / (monthlyPI + taxIns);
  }

  const pointsCost = loanAmount * (discountPoints / 100);
  const origination = loanAmount * 0.0075;
  const processing = 1495;
  const underwriting = 995;
  const titleIns = loanAmount * 0.005;
  const recording = 285;
  const appraisal = 650;
  const fixedFees = processing + underwriting;
  const totalToClose =
    pointsCost + origination + processing + underwriting + titleIns + recording + appraisal;

  return {
    loanAmount,
    maxLoan: sizing.maxLoan,
    clamped: sizing.clamped,
    bindingConstraint: sizing.bindingConstraint,
    effectiveLtv: sizing.effectiveLtv,
    effectiveLtvCap: sizing.effectiveLtvCap,
    totalCost: sizing.totalCost,
    cashToBorrower: sizing.cashToBorrower,
    cashToClose: sizing.cashToClose,
    rate,
    monthlyPI,
    termMonths,
    isAmortized,
    rentEstimate,
    dscr,
    cashFlow,
    pointsCost,
    origination,
    fixedFees,
    titleIns,
    recording,
    appraisal,
    totalToClose,
  };
}

export function ltvLabel(ltv: number): string {
  if (Math.abs(ltv - 0.75) < 0.001) return "Best case";
  if (Math.abs(ltv - 0.7) < 0.001) return "Strong";
  if (Math.abs(ltv - 0.65) < 0.001) return "Standard";
  if (Math.abs(ltv - 0.6) < 0.001) return "Conservative";
  return `${(ltv * 100).toFixed(0)}% LTV`;
}

export function bindingConstraintLabel(b: BindingConstraint): string {
  switch (b) {
    case "ltv":
      return "LTV cap";
    case "ltc":
      return "LTC cap (85%)";
    case "arv":
      return "ARV cap (70%)";
    case "refi-cap":
      return "Cash-out cap (75%)";
    case "requested":
      return "Borrower request";
  }
}

export function cappedReasonLabel(b: BindingConstraint, maxLoan: number): string {
  const dollars = maxLoan.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  switch (b) {
    case "ltv":
      return `Capped at ${dollars} — LTV max`;
    case "ltc":
      return `Capped at ${dollars} — 85% LTC binds`;
    case "arv":
      return `Capped at ${dollars} — 70% ARV cap binds`;
    case "refi-cap":
      return `Capped at ${dollars} — 75% cash-out max`;
    case "requested":
      return "";
  }
}
