// Fix & Flip Deal Analyzer — shared types.
// IMPORTANT: this file is byte-identical between QCDashboard and
// QCMobile (src/lib/fixFlip/). Any change must be applied to both.

export type ProgramType = "fix_flip" | "bridge" | "construction" | "dscr" | "commercial";

export type ExperienceTier =
  | "0_flips"
  | "1_2_flips"
  | "3_5_flips"
  | "5_plus_flips"
  | "pro";

export interface LendingProgram {
  id: string;
  name: string;
  programType: ProgramType;
  minCreditScore: number;          // PRIMARY gatekeeper
  minLiquidity?: number;
  minExperience: ExperienceTier;   // secondary gatekeeper
  maxLTC: number;                  // fraction (0–1)
  maxARVLTV: number;               // fraction (0–1)
  maxPurchaseFundingPct?: number;  // fraction of purchase price
  maxRehabFundingPct?: number;     // fraction of rehab funded (often 1.0, draws)
  interestRate: number;            // annual, fraction (0.1175 = 11.75%)
  points: number;                  // lender points, whole number (2 = 2.0)
  termMonths: number;
  allowsFirstTimeFlipper: boolean;
  allowsConstructionReserve: boolean;
  allowsInterestReserve: boolean;
  notes?: string;
}

export interface PropertyAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  county?: string;
  unit?: string;
  parcelId?: string;
}

export type PropertyType =
  | "single_family"
  | "2_4_unit"
  | "multifamily"
  | "mixed_use"
  | "commercial"
  | "condo"
  | "townhouse"
  | "other";

export interface FixFlipInputs {
  address: PropertyAddress;
  propertyType: PropertyType;

  // Deal numbers
  purchasePrice: number;          // BRV
  arv: number;
  rehabCost: number;
  rehabContingencyPct: number;    // fraction, default 0.10
  monthlyHoldingCost: number;     // default 0
  sellingCostPct: number;         // fraction, default 0.06
  closingCostPct: number;         // fraction, default 0.02

  // Timeline
  constructionMonths: number;
  monthsToSell: number;

  // Borrower / credit
  creditScore?: number;
  experience: ExperienceTier;
  liquidity?: number;
  entityType?: "individual" | "llc" | "corporation" | "partnership" | "other";
  priorFlips?: number;
  bankruptcyFlag?: boolean;

  // Advanced (all optional)
  interestRateOverride?: number;  // annual fraction
  pointsOverride?: number;
  originationFee?: number;
  underwritingFee?: number;
  processingFee?: number;
  appraisalFee?: number;
  titleLegalEstimate?: number;
  transferTaxEstimate?: number;
  insuranceEstimate?: number;
  taxEscrowEstimate?: number;
  arvHaircutPct?: number;         // fraction applied to ARV
  rehabOverrunPct?: number;       // fraction added to rehab
  delayMonths?: number;           // extra hold months
}

export type Grade = "Excellent" | "Good" | "Fair" | "Risky" | "Poor";
export type DealGrade = "Excellent" | "Good" | "Thin" | "Risky" | "Poor";

export interface SensitivityScenario {
  key: string;
  label: string;
  netProfit: number;
  profitMargin: number;
  cashNeeded: number;
  grade: DealGrade;
}

export interface ProgramFitResult {
  program: LendingProgram;
  loanAmount: number;
  estimatedCashToClose: number;
  projectedNetProfit: number;
  costOfCapital: number;
  reasons?: string[]; // ineligible reasons
}

export interface FixFlipAnalysisResult {
  totalProjectCost: number;
  rehabContingencyAmount: number;
  holdMonths: number;
  estimatedClosingCosts: number;
  estimatedSellingCosts: number;
  estimatedHoldingCosts: number;
  estimatedInterestPaid: number;
  lenderPointsCost: number;
  loanAmount: number;
  estimatedCashToClose: number;
  projectedNetProfit: number;
  profitMargin: number;
  cashOnCashReturn: number;
  maxSafePurchasePrice: number;
  purchasePriceGrade: Grade;
  dealScore: number;
  dealGrade: DealGrade;
  bestProgram?: LendingProgram;
  eligiblePrograms: ProgramFitResult[];
  ineligiblePrograms: ProgramFitResult[];
  buckets: {
    bestOverall?: ProgramFitResult;
    lowestCash?: ProgramFitResult;
    highestProfit?: ProgramFitResult;
    backup?: ProgramFitResult;
  };
  warnings: string[];
  recommendations: string[];
  explanation: string;
  sensitivity: SensitivityScenario[];
  validationErrors: string[];
}

export type ScenarioStatus =
  | "draft"
  | "saved"
  | "funding_requested"
  | "converted_to_prequal";

export interface FixFlipScenario {
  id?: string;
  createdBy?: string;
  clientId?: string;
  dealId?: string;
  loanId?: string;
  status: ScenarioStatus;
  inputs: FixFlipInputs;
  result: FixFlipAnalysisResult;
  selectedProgramId?: string;
  createdAt?: string;
  updatedAt?: string;
}
