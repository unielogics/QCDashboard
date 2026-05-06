// Eligibility / gating logic for the loan simulator.
//
// Mirrors qcmobile/src/lib/eligibility.ts. Pure logic — no React, no API calls.
// Keep these in sync until they live in @qc/shared.

export type EligibilityTier = "blocked" | "warn" | "basic" | "pro";

export interface EligibilityInputs {
  fico: number | null;
  propertyCount: number;
  hasYearOfOwnership: boolean;
}

export interface EligibilityBanner {
  kind: "credit-blocked" | "credit-warn" | "experience" | "no-credit";
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

export function computeEligibility(input: EligibilityInputs): EligibilityResult {
  const { fico, propertyCount, hasYearOfOwnership } = input;

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

  if (fico < 680) {
    return {
      tier: "warn",
      maxLTV: 0.65,
      allowedLTVs: [0.6, 0.65],
      allLTVs: ALL_LTVS,
      banner: {
        kind: "credit-warn",
        title: "Credit needs review",
        body: `Score ${fico}: we can run estimates but cannot guarantee a loan at these terms. Our team will reach out with options to address the credit issue.`,
      },
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
      banner: {
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
    banner: null,
  };
}

// ── Pricing math (mirror of mobile) ─────────────────────────────────────────

export interface SimulatorInputs {
  arv: number;
  ltv: number;
  discountPoints: number;
  productKey: "dscr" | "ff" | "gu" | "br";
  // Optional override — when the caller has fetched today's rate from FRED
  // (index + lender spread) we use it instead of the hardcoded fallback.
  // Expressed as a percentage (e.g. 7.875 == 7.875%).
  baseRatePct?: number;
}

export interface SimulatorOutputs {
  loanAmount: number;
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

export function computeSimulator({
  arv,
  ltv,
  discountPoints,
  productKey,
  baseRatePct,
}: SimulatorInputs): SimulatorOutputs {
  const loanAmount = arv * ltv;
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
    rentEstimate = loanAmount * 0.0085;
    const taxIns = rentEstimate * 0.18;
    cashFlow = rentEstimate - monthlyPI - taxIns;
    dscr = rentEstimate / (monthlyPI + taxIns);
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
