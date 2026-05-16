// Fix & Flip Deal Analyzer — deterministic deal engine.
// Mirrors the F&F sizing in src/lib/eligibility.ts and the backend
// app/services/math/sizing.py. No LLM; all explanations are templated
// with hedged language (never "approved"/"guaranteed"/"will qualify").
// BYTE-IDENTICAL between QCDashboard and QCMobile.

import type {
  AnalyzeOptions,
  ClosingCostTier,
  DealGrade,
  FixFlipAnalysisResult,
  FixFlipInputs,
  Grade,
  LendingProgram,
  ProgramFitResult,
  ScenarioNums,
  SensitivityScenario,
} from "./types";
import { matchPrograms } from "./programMatcher";

// Mirror eligibility.ts / sizing.py.
export const FF_MAX_LTC = 0.85;
// Global hard cap: BRV + construction + every acquisition fee must
// stay within 75% of ARV for the borrower to be "safe". This
// OVERRIDES every program's own maxARVLTV (firm-wide safety
// envelope). Anything above it is the borrower's liability outside
// the loan.
export const FF_MAX_ARV_LTV = 0.75;
// Purchase funding when no program is matched, so cash-to-close
// (≈ 20% of BRV + closing) holds in the no-program fallback.
export const DEFAULT_PURCHASE_FUNDING_PCT = 0.8;
const DEFAULT_RATE = 0.1075;
const DEFAULT_POINTS = 2;

// Closing % when no tier table is supplied / no tier matches.
export const DEFAULT_CLOSING_PCT = 0.02;
// System-generated monthly carry: interest + taxes + insurance.
// Taxes/insurance are annual fractions of (adjusted) ARV. Tunable.
export const TAX_RATE_ANNUAL = 0.011;
export const INS_RATE_ANNUAL = 0.005;

// Closing % for a deal against the SUPER_ADMIN tier table. The tier
// is matched by the BASE being charged: BRV + construction when the
// construction is financed, BRV alone when the borrower self-funds
// it. Each tier carries two rates — `percentage` (with construction)
// and `percentageNoConstruction` (without). No minimum-dollar floor.
export function resolveClosingPct(
  base: number,
  tiers: ClosingCostTier[] | undefined,
  withConstruction: boolean,
): number {
  if (!tiers || tiers.length === 0 || !(base > 0)) return DEFAULT_CLOSING_PCT;
  const tier = tiers.find((t) => {
    const lo = t.fromAmount == null ? -Infinity : t.fromAmount;
    const hi = t.toAmount == null ? Infinity : t.toAmount;
    return base >= lo && base <= hi;
  });
  if (!tier) return DEFAULT_CLOSING_PCT;
  return withConstruction
    ? n(tier.percentage)
    : n(tier.percentageNoConstruction);
}

function effRehabFundedPct(
  program?: LendingProgram,
  selfFundRehab?: boolean,
): number {
  if (selfFundRehab) return 0;
  return program ? (program.maxRehabFundingPct ?? 1) : 1;
}

function n(v: number | undefined | null, d = 0): number {
  return Number.isFinite(v as number) ? (v as number) : d;
}

export function holdMonths(i: FixFlipInputs): number {
  return n(i.constructionMonths) + n(i.monthsToSell) + n(i.delayMonths);
}

function arvAdjusted(i: FixFlipInputs): number {
  return n(i.arv) * (1 - n(i.arvHaircutPct));
}
function rehabAdjusted(i: FixFlipInputs): number {
  return n(i.rehabCost) * (1 + n(i.rehabOverrunPct));
}

export interface SizedLoan {
  loanAmount: number;
  // Loan dollars applied to the PURCHASE at the closing table. Rehab
  // is released as draws, never table cash, so it is excluded here.
  purchaseProceeds: number;
  // Loan dollars allocated to rehab (draws). Informational.
  rehabInLoan: number;
  rate: number;
  points: number;
}

// Program-aware loan sizing. The 75%-ARV envelope is a GLOBAL hard
// cap that overrides each program's own maxARVLTV. Construction can
// be financed up to 100% (program maxRehabFundingPct) as long as the
// loan stays within that envelope.
export function sizeLoan(
  i: FixFlipInputs,
  program?: LendingProgram,
  selfFundRehab?: boolean,
): SizedLoan {
  const purchase = n(i.purchasePrice);
  const rehab = rehabAdjusted(i);
  const arv = arvAdjusted(i);

  const pf = program?.maxPurchaseFundingPct ?? DEFAULT_PURCHASE_FUNDING_PCT;
  const rf = effRehabFundedPct(program, selfFundRehab);

  // 75%-ARV global hard cap overrides program.maxARVLTV.
  const arvCap = FF_MAX_ARV_LTV * arv;
  const ltcCap = (program ? program.maxLTC : FF_MAX_LTC) * (purchase + rehab);

  const purchaseLoan = purchase * pf;
  const rehabLoan = rehab * rf;
  const loanAmount = Math.max(
    0,
    Math.min(purchaseLoan + rehabLoan, arvCap, ltcCap),
  );

  // Purchase is funded first; the remainder (if any) is rehab draws.
  const purchaseProceeds = Math.min(loanAmount, purchaseLoan);
  const rehabInLoan = Math.min(
    rehabLoan,
    Math.max(0, loanAmount - purchaseProceeds),
  );

  const rate = n(i.interestRateOverride, program ? program.interestRate : DEFAULT_RATE);
  const points = n(i.pointsOverride, program ? program.points : DEFAULT_POINTS);
  return { loanAmount, purchaseProceeds, rehabInLoan, rate, points };
}

function feeTotal(i: FixFlipInputs): number {
  return (
    n(i.originationFee) +
    n(i.underwritingFee) +
    n(i.processingFee) +
    n(i.appraisalFee) +
    n(i.titleLegalEstimate) +
    n(i.transferTaxEstimate)
  );
}

export interface CoreNumbers {
  totalProjectCost: number;
  rehabContingencyAmount: number;
  holdMonths: number;
  estimatedClosingCosts: number;
  estimatedSellingCosts: number;
  estimatedHoldingCosts: number;
  estimatedMonthlyCarry: number;
  estimatedInterestPaid: number;
  lenderPointsCost: number;
  loanAmount: number;
  downPayment: number;
  estimatedCashToClose: number;
  // Construction the borrower funds OUTSIDE the loan. Financed →
  // only the overflow above the 75%-ARV envelope (usually $0).
  // Self-funded → the whole construction budget (+ any overflow).
  constructionOutsideLoan: number;
  withinArvEnvelope: boolean;
  arvEnvelopeOverflow: number;
  projectedNetProfit: number;
  profitMargin: number;
  cashOnCashReturn: number;
}

export function computeCore(
  i: FixFlipInputs,
  program?: LendingProgram,
  opts?: AnalyzeOptions,
): CoreNumbers {
  const purchase = n(i.purchasePrice);
  const rehab = rehabAdjusted(i);
  const arv = arvAdjusted(i);
  const hm = holdMonths(i);
  const rehabContingencyAmount = rehab * n(i.rehabContingencyPct, 0.1);
  const estimatedSellingCosts = arv * n(i.sellingCostPct, 0.06);

  const selfFund = !!opts?.selfFundRehab;
  const sized = sizeLoan(i, program, selfFund);

  // Closing/origination fee. Financed → charged on (BRV +
  // construction) at the tier's with-construction %. Self-funded →
  // charged on BRV alone at the without-construction %. The two
  // scenarios therefore never produce the same closing figure.
  const closingBase = selfFund ? purchase : purchase + rehab;
  const closingPct = resolveClosingPct(
    closingBase,
    opts?.closingTiers,
    !selfFund,
  );
  const estimatedClosingCosts = closingBase * closingPct;

  const estimatedInterestPaid = (sized.loanAmount * sized.rate * hm) / 12;
  const lenderPointsCost = sized.loanAmount * (sized.points / 100);

  // System-generated monthly carry: loan interest + ARV-derived
  // property taxes + insurance. inputs.monthlyHoldingCost is ignored.
  const monthlyInterest = (sized.loanAmount * sized.rate) / 12;
  const monthlyTax = (arv * TAX_RATE_ANNUAL) / 12;
  const monthlyInsurance = (arv * INS_RATE_ANNUAL) / 12;
  const estimatedMonthlyCarry = monthlyInterest + monthlyTax + monthlyInsurance;
  const estimatedHoldingCosts = estimatedMonthlyCarry * hm;

  const insurance = n(i.insuranceEstimate);
  const taxEscrow = n(i.taxEscrowEstimate);

  // Cash to close = acquisition-table money ONLY: the down payment
  // on the purchase + closing + origination points + lender fees.
  // Construction is NEVER in cash to close — it is either drawn by
  // the lender or carried by the borrower outside the loan.
  const downPayment = Math.max(0, purchase - sized.purchaseProceeds);
  const estimatedCashToClose =
    downPayment +
    estimatedClosingCosts +
    lenderPointsCost +
    feeTotal(i) +
    insurance +
    taxEscrow;

  // 75%-ARV safety envelope. acqFees are derived from the first-pass
  // loan (points/closing depend on loan size) — a deterministic,
  // close-enough approximation for the overflow test.
  const acqFees =
    estimatedClosingCosts + lenderPointsCost + feeTotal(i) + insurance + taxEscrow;
  const arvEnvelope = FF_MAX_ARV_LTV * arv;
  const arvEnvelopeOverflow = Math.max(
    0,
    purchase + rehab + rehabContingencyAmount + acqFees - arvEnvelope,
  );
  const withinArvEnvelope = arvEnvelopeOverflow <= 0;
  // Financed: lender wraps construction into the loan within the
  // 75%-ARV envelope, so only the overflow above it is the
  // borrower's. Self-funded: the whole construction budget sits
  // outside the loan by definition (the loan only covers purchase).
  const constructionOutsideLoan = opts?.selfFundRehab
    ? rehab
    : arvEnvelopeOverflow;

  const projectedNetProfit =
    arv -
    purchase -
    rehab -
    rehabContingencyAmount -
    estimatedClosingCosts -
    estimatedInterestPaid -
    estimatedHoldingCosts -
    estimatedSellingCosts;

  const profitMargin = arv > 0 ? projectedNetProfit / arv : 0;
  const cashOnCashReturn =
    estimatedCashToClose > 0 ? projectedNetProfit / estimatedCashToClose : 0;

  return {
    totalProjectCost: purchase + rehab,
    rehabContingencyAmount,
    holdMonths: hm,
    estimatedClosingCosts,
    estimatedSellingCosts,
    estimatedHoldingCosts,
    estimatedMonthlyCarry,
    estimatedInterestPaid,
    lenderPointsCost,
    loanAmount: sized.loanAmount,
    downPayment,
    estimatedCashToClose: Math.max(0, estimatedCashToClose),
    constructionOutsideLoan,
    withinArvEnvelope,
    arvEnvelopeOverflow,
    projectedNetProfit,
    profitMargin,
    cashOnCashReturn,
  };
}

export function maxSafePurchasePrice(
  i: FixFlipInputs,
  program?: LendingProgram,
  opts?: AnalyzeOptions,
): number {
  const arv = arvAdjusted(i);
  const rehab = rehabAdjusted(i);
  const targetProfit = Math.max(arv * 0.1, 25000);
  const core = computeCore(i, program, opts);
  return (
    arv -
    targetProfit -
    rehab -
    core.rehabContingencyAmount -
    core.estimatedInterestPaid -
    core.estimatedHoldingCosts -
    core.estimatedSellingCosts -
    core.estimatedClosingCosts
  );
}

function gradePurchasePrice(purchase: number, maxSafe: number): Grade {
  if (maxSafe <= 0) return "Poor";
  const delta = (purchase - maxSafe) / maxSafe; // negative = below max (good)
  if (delta <= -0.1) return "Excellent";
  if (delta <= 0) return "Good";
  if (delta <= 0.05) return "Fair";
  if (delta <= 0.1) return "Risky";
  return "Poor";
}

function dealGradeFromScore(s: number): DealGrade {
  if (s >= 85) return "Excellent";
  if (s >= 70) return "Good";
  if (s >= 55) return "Thin";
  if (s >= 40) return "Risky";
  return "Poor";
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function scoreDeal(
  i: FixFlipInputs,
  core: CoreNumbers,
  programFit: boolean,
): number {
  const arv = arvAdjusted(i);
  const marginScore = clamp01(core.profitMargin / 0.2) * 30; // 20%+ margin = full
  const cashScore =
    clamp01(1 - core.estimatedCashToClose / Math.max(1, core.totalProjectCost)) * 20;
  const arvSpread = arv > 0 ? (arv - core.totalProjectCost) / arv : 0;
  const arvScore = clamp01(arvSpread / 0.35) * 20;
  const timelineScore = clamp01(1 - (core.holdMonths - 4) / 14) * 10;
  const rehabRisk =
    arv > 0 ? clamp01(1 - n(i.rehabCost) / (arv * 0.3)) : 0;
  const rehabScore = rehabRisk * 10;
  const programScore = programFit ? 10 : 0;
  return Math.round(
    marginScore + cashScore + arvScore + timelineScore + rehabScore + programScore,
  );
}

function buildSensitivity(
  i: FixFlipInputs,
  program?: LendingProgram,
  opts?: AnalyzeOptions,
): SensitivityScenario[] {
  const variants: { key: string; label: string; mut: (x: FixFlipInputs) => FixFlipInputs }[] = [
    { key: "base", label: "Base Case", mut: (x) => x },
    {
      key: "rehab10",
      label: "Rehab Cost +10%",
      mut: (x) => ({ ...x, rehabOverrunPct: n(x.rehabOverrunPct) + 0.1 }),
    },
    {
      key: "sale2mo",
      label: "Sale Delayed 2 Months",
      mut: (x) => ({ ...x, delayMonths: n(x.delayMonths) + 2 }),
    },
    {
      key: "arv5",
      label: "ARV Drops 5%",
      mut: (x) => ({ ...x, arvHaircutPct: n(x.arvHaircutPct) + 0.05 }),
    },
    {
      key: "rehab10arv5",
      label: "Rehab +10% & ARV −5%",
      mut: (x) => ({
        ...x,
        rehabOverrunPct: n(x.rehabOverrunPct) + 0.1,
        arvHaircutPct: n(x.arvHaircutPct) + 0.05,
      }),
    },
    {
      key: "rate1",
      label: "Interest Rate +1%",
      mut: (x) => ({
        ...x,
        interestRateOverride:
          n(x.interestRateOverride, program ? program.interestRate : DEFAULT_RATE) + 0.01,
      }),
    },
  ];
  return variants.map((v) => {
    const c = computeCore(v.mut(i), program, opts);
    const score = scoreDeal(v.mut(i), c, !!program);
    return {
      key: v.key,
      label: v.label,
      netProfit: c.projectedNetProfit,
      profitMargin: c.profitMargin,
      cashNeeded: c.estimatedCashToClose,
      grade: dealGradeFromScore(score),
    };
  });
}

function validate(i: FixFlipInputs): string[] {
  const e: string[] = [];
  if (!i.address?.state) e.push("State is required for lender eligibility");
  if (!(n(i.purchasePrice) > 0)) e.push("Purchase price is required");
  if (!(n(i.arv) > 0)) e.push("ARV is required");
  if (!(n(i.rehabCost) >= 0)) e.push("Rehab cost is required");
  if (!(n(i.constructionMonths) > 0)) e.push("Construction timeline is required");
  if (!(n(i.monthsToSell) > 0)) e.push("Months to sell is required");
  if (i.creditScore == null) e.push("Credit score is required for program matching");
  return e;
}

function buildWarnings(i: FixFlipInputs, core: CoreNumbers, program?: LendingProgram): string[] {
  const w: string[] = [];
  const arv = arvAdjusted(i);
  if (arv <= n(i.purchasePrice)) w.push("ARV must be higher than purchase price");
  if (arv > 0 && n(i.rehabCost) > arv * 0.3)
    w.push("Rehab cost exceeds 30% of ARV");
  if (arv > 0 && core.totalProjectCost > arv * 0.85)
    w.push("Total project cost exceeds 85% of ARV");
  if (core.profitMargin < 0.1)
    w.push("Profit margin is below 10%");
  if (i.liquidity != null && core.estimatedCashToClose > i.liquidity)
    w.push(
      `Estimated cash to close exceeds borrower liquidity by ${money(
        core.estimatedCashToClose - i.liquidity,
      )}`,
    );
  if (program && core.holdMonths > program.termMonths)
    w.push("Hold period exceeds the loan term");
  return w;
}

function money(x: number): string {
  return `$${Math.round(x).toLocaleString()}`;
}

function buildRecommendations(
  i: FixFlipInputs,
  core: CoreNumbers,
  maxSafe: number,
  grade: DealGrade,
): string[] {
  if (grade === "Excellent" || grade === "Good") {
    return [
      "This deal appears financeable and profitable based on current assumptions. Next step: save this as a scenario and request funding terms.",
    ];
  }
  const recs: string[] = [];
  const over = n(i.purchasePrice) - maxSafe;
  if (over > 0) recs.push(`Negotiate purchase price down by ${money(over)}`);
  if (n(i.rehabCost) > arvAdjusted(i) * 0.2)
    recs.push("Reduce rehab budget or tighten the scope");
  recs.push("Find a lower-rate or higher-leverage program");
  recs.push("Shorten the project timeline to cut holding + interest cost");
  if (i.liquidity != null && core.estimatedCashToClose > i.liquidity)
    recs.push("Bring additional liquidity or add an experienced partner");
  return recs;
}

function buildExplanation(
  i: FixFlipInputs,
  core: CoreNumbers,
  grade: DealGrade,
  bestProgram?: LendingProgram,
): string {
  const parts: string[] = [];
  if (grade === "Excellent" || grade === "Good") {
    parts.push(
      `This deal is profitable in the base case with a projected net profit of ${money(
        core.projectedNetProfit,
      )} (${(core.profitMargin * 100).toFixed(1)}% margin).`,
    );
  } else {
    parts.push(
      `The margin is thin/sensitive — projected net profit ${money(
        core.projectedNetProfit,
      )} (${(core.profitMargin * 100).toFixed(1)}%).`,
    );
  }
  if (bestProgram) {
    parts.push(
      `The borrower appears eligible for "${bestProgram.name}" based on credit and deal leverage; liquidity should be verified before submission.`,
    );
  } else {
    parts.push(
      "No program is a clear fit yet under current rules — adjust the deal or borrower profile and re-check.",
    );
  }
  return parts.join(" ");
}

export function analyzeFixFlip(
  inputs: FixFlipInputs,
  opts?: AnalyzeOptions,
): FixFlipAnalysisResult {
  const validationErrors = validate(inputs);
  const { eligible, ineligible } = matchPrograms(inputs);

  // Rank eligible programs by their own computed outcomes.
  const fits: ProgramFitResult[] = eligible.map((program) => {
    const c = computeCore(inputs, program, opts);
    return {
      program,
      loanAmount: c.loanAmount,
      estimatedCashToClose: c.estimatedCashToClose,
      constructionOutsideLoan: c.constructionOutsideLoan,
      projectedNetProfit: c.projectedNetProfit,
      costOfCapital: c.estimatedInterestPaid + c.lenderPointsCost,
    };
  });

  const byCash = [...fits].sort(
    (a, b) => a.estimatedCashToClose - b.estimatedCashToClose,
  );
  const byProfit = [...fits].sort(
    (a, b) => b.projectedNetProfit - a.projectedNetProfit,
  );
  const byCost = [...fits].sort((a, b) => a.costOfCapital - b.costOfCapital);

  // Best overall: lowest cash, then strongest profit, then cost.
  const bestOverall = byCash[0]
    ? [...fits].sort(
        (a, b) =>
          a.estimatedCashToClose - b.estimatedCashToClose ||
          b.projectedNetProfit - a.projectedNetProfit ||
          a.costOfCapital - b.costOfCapital,
      )[0]
    : undefined;

  const bestProgram = bestOverall?.program;
  const core = computeCore(inputs, bestProgram, opts);
  const maxSafe = maxSafePurchasePrice(inputs, bestProgram, opts);
  const purchasePriceGrade = gradePurchasePrice(n(inputs.purchasePrice), maxSafe);
  const dealScore = scoreDeal(inputs, core, !!bestProgram);
  const dealGrade = dealGradeFromScore(dealScore);
  const warnings = buildWarnings(inputs, core, bestProgram);
  const recommendations = buildRecommendations(inputs, core, maxSafe, dealGrade);
  const explanation = buildExplanation(inputs, core, dealGrade, bestProgram);
  const sensitivity = buildSensitivity(inputs, bestProgram, opts);

  // Construction side-by-side: lender draws the rehab (financed)
  // vs the borrower self-funds it (selfFunded). `core` is already
  // the financed case for the best program.
  const selfCore = computeCore(inputs, bestProgram, {
    ...opts,
    selfFundRehab: true,
  });
  const scenarioNums = (c: typeof core): ScenarioNums => ({
    loanAmount: c.loanAmount,
    estimatedCashToClose: c.estimatedCashToClose,
    constructionOutsideLoan: c.constructionOutsideLoan,
    projectedNetProfit: c.projectedNetProfit,
    holdMonths: c.holdMonths,
  });
  const constructionScenarios = {
    financed: scenarioNums(core),
    selfFunded: scenarioNums(selfCore),
  };

  return {
    ...core,
    constructionScenarios,
    maxSafePurchasePrice: maxSafe,
    purchasePriceGrade,
    dealScore,
    dealGrade,
    bestProgram,
    eligiblePrograms: fits,
    ineligiblePrograms: ineligible.map((x) => ({
      program: x.program,
      loanAmount: 0,
      estimatedCashToClose: 0,
      constructionOutsideLoan: 0,
      projectedNetProfit: 0,
      costOfCapital: 0,
      reasons: x.reasons,
    })),
    buckets: {
      bestOverall,
      lowestCash: byCash[0],
      highestProfit: byProfit[0],
      backup: byCost[1] ?? byCost[0],
    },
    warnings,
    recommendations,
    explanation,
    sensitivity,
    validationErrors,
  };
}
