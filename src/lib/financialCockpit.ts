// The financial cockpit: the types that mirror app/services/financial_cockpit.py
// in qcbackend (the contract pinned by app/tests/test_financial_cockpit.py)
// and the pure helpers the tiles and charts use. Nothing here fetches.

export type DscrStatus = "unavailable" | "concerning" | "acceptable" | "healthy" | "very_strong";
export type CockpitConfidence = "filed" | "statement" | "statement_unverified" | "proxy";
export type CockpitTone = "ok" | "warn" | "bad" | "mut" | "acc";

export type CockpitMonth = {
  month: string;
  label: string;
  accounts: string[];
  file_ids: string[];
  accepted: boolean;
  deposits: number | null;
  withdrawals: number | null;
  beginning_balance: number | null;
  ending_balance: number | null;
  average_balance: number | null;
  low_balance: number | null;
  deposit_count: number | null;
  nsf: number | null;
  returned_checks: number | null;
  negative_days: number | null;
  net: number | null;
  outflow_ratio: number | null;
  negative_dates: string[];
  overdraft_items: OverdraftItem[];
  fees: number | null;
};

export type OverdraftItem = { date: string | null; description: string; amount: number | null; type: "nsf_fee" | "overdraft_fee" | "returned_item" | "negative_balance" | "other"; account?: string; month?: string };

export type CockpitOverdrafts = {
  by_month: Array<{ month: string; label: string; negative_dates: string[]; negative_days: number; nsf: number; returned_checks: number; low_balance: number | null; ending_balance: number | null; fees: number | null; items: OverdraftItem[] }>;
  items: OverdraftItem[];
  negative_days_total: number;
  negative_months: string[];
  nsf_total: number;
  returned_total: number;
  fees_total: number | null;
  lowest_balance: number | null;
};

export type CockpitBankSummary = {
  months: number;
  accepted_months: number;
  required_months: number;
  first_month: string | null;
  last_month: string | null;
  gaps: string[];
  avg_deposits: number | null;
  avg_withdrawals: number | null;
  avg_net: number | null;
  annualized_deposits: number | null;
  annualized_withdrawals: number | null;
  annualized_net: number | null;
  deposit_trend_pct: number | null;
  deposit_volatility_pct: number | null;
  highest_month: string | null;
  lowest_month: string | null;
  beginning_balance: number | null;
  ending_balance: number | null;
  average_balance: number | null;
  average_balance_basis: string | null;
  lowest_balance: number | null;
  avg_deposit_count: number | null;
  nsf_total: number;
  returned_checks_total: number;
  negative_days_total: number;
  avg_outflow_ratio: number | null;
  estimates_available: boolean;
};

/** An account a statement lists beside its own (a savings, an empty share account): named, never an account of its own. */
export type CockpitSubAccount = { last4: string; label?: string; ending_balance?: number | null };
export type CockpitAccount = { key: string; label: string; months: string[]; accepted_months: string[]; series: CockpitMonth[]; summary: CockpitBankSummary; counted: boolean; sub_accounts?: CockpitSubAccount[] };

export type BankAccountRead = { key: string; label: string; months: string[]; accepted_months: string[]; counted: boolean; latest_month: string | null; members: string[]; sub_accounts?: CockpitSubAccount[] };
export type BankAccountsRead = { profile_id: string; accounts: BankAccountRead[]; counted: string[]; aliases: Record<string, string> };
export type BankAccountsWrite = { counted: string[]; aliases?: Record<string, string> | null };

export type CockpitTaxYear = {
  file_id: string | null;
  year: string;
  entity: string;
  basis: string;
  period_start: string | null;
  period_end: string | null;
  gross_receipts: number | null;
  gross_income: number | null;
  total_income: number | null;
  ordinary_business_income: number | null;
  net_income: number | null;
  net_income_per_books: number | null;
  taxable_income: number | null;
  accepted: boolean;
  depreciation: number | null;
  interest: number | null;
  officer_compensation: number | null;
  cost_of_goods_sold: number | null;
  salaries_and_wages: number | null;
  rent: number | null;
  taxes_and_licenses: number | null;
  advertising: number | null;
  total_deductions: number | null;
  income: number | null;
  income_basis: string | null;
  ebitda: number | null;
  ebitda_complete: boolean;
  net_margin: number | null;
  gross_receipts_change_pct: number | null;
  income_change_pct: number | null;
};

export type CockpitStatement = {
  file_id: string | null;
  business_name: string | null;
  basis: string | null;
  currency: string | null;
  period_start: string | null;
  period_end: string | null;
  period_label: string | null;
  months_covered: number | null;
  gross_revenue: number | null;
  cost_of_goods_sold: number | null;
  gross_profit: number | null;
  other_income: number | null;
  total_operating_expenses: number | null;
  operating_income: number | null;
  depreciation_and_amortization: number | null;
  interest: number | null;
  income_taxes: number | null;
  taxes_and_licenses: number | null;
  owner_salaries: number | null;
  net_income: number | null;
  ebitda: number | null;
  annualized_revenue: number | null;
  annualized_ebitda: number | null;
  typed: boolean;
};

export type CockpitProfitAndLoss = CockpitStatement & {
  accepted: boolean;
  annualized_net_income: number | null;
  annualized_operating_expenses: number | null;
  gross_margin: number | null;
  net_margin: number | null;
  opex_ratio: number | null;
  cogs_ratio: number | null;
  statements: CockpitStatement[];
};

export type CockpitBalanceSheet = {
  file_id: string | null;
  business_name: string | null;
  as_of_date: string | null;
  basis: string | null;
  currency: string | null;
  cash: number | null;
  accounts_receivable: number | null;
  inventory: number | null;
  total_current_assets: number | null;
  total_fixed_assets: number | null;
  total_other_assets: number | null;
  total_assets: number | null;
  accounts_payable: number | null;
  current_portion_long_term_debt: number | null;
  total_current_liabilities: number | null;
  total_long_term_liabilities: number | null;
  total_liabilities: number | null;
  total_equity: number | null;
  accepted: boolean;
  current_ratio: number | null;
  debt_to_equity: number | null;
};

export type CockpitExpenseLine = {
  key: string;
  label: string;
  amount: number | null;
  annualized: number | null;
  period: string | null;
  source: string;
  ratio_to_revenue: number | null;
};

export type CockpitDebtRow = {
  id: string;
  lender: string;
  category: string;
  /** The type as a person reads it (`debt_types.debt_type_label`). */
  category_label?: string | null;
  payment_status?: string | null;
  secured?: string | null;
  collateral?: string | null;
  originated_on?: string | null;
  mca_modified?: boolean | null;
  mca_modification_note?: string | null;
  is_mca: boolean;
  balance: number | null;
  monthly_payment: number | null;
  payment_amount: number | null;
  payment_frequency: string | null;
  rate: number | null;
  factor_rate: number | null;
  term_months: number | null;
  maturity_on: string | null;
  payoff_amount: number | null;
  origin: string | null;
  count_in_dscr: boolean;
  source: "debt_schedule_row";
};

export type CockpitDocumentedDebt = {
  lender: string;
  balance: number | null;
  original_amount: number | null;
  monthly_payment: number | null;
  payment_amount: number | null;
  payment_frequency: string | null;
  factor_rate: number | null;
  maturity_on: string | null;
  is_mca: boolean;
  file_id: string;
  source: "document";
};

export type DebtServiceSource = "debt_schedule_rows" | "debt_schedule_rows+bank_observed" | "debt_schedule_document" | "advance_terms" | "bank_observed" | "declared_none" | "none";

/** Where the debt schedule stands. It is a standing part of every file: the
 *  block is always there, and only the desk's declaration ("voided") means the
 *  business carries no debt. */
export type DebtScheduleStatus = "voided" | "rows" | "document" | "advance_terms" | "received" | "requested" | "missing";
export type DebtScheduleDeclaration = { reason: string; by: string | null; by_user_id: string | null; at: string | null };
export type CockpitDebtSchedule = {
  status: DebtScheduleStatus;
  label: string;
  rows: number;
  documented: number;
  has_document: boolean;
  voided: DebtScheduleDeclaration | null;
  requested_at: string | null;
  received_at: string | null;
  requirement_status: string | null;
  requirement_present: boolean;
  can_void: boolean;
};
export const EMPTY_SCHEDULE: CockpitDebtSchedule = { status: "missing", label: "Not requested yet", rows: 0, documented: 0, has_document: false, voided: null, requested_at: null, received_at: null, requirement_status: null, requirement_present: false, can_void: false };
export type DebtScheduleVoidWrite = { reason?: string | null };

export function scheduleStatusTone(status: DebtScheduleStatus | null | undefined): CockpitTone {
  switch (status) {
    case "voided":
    case "rows":
    case "document":
      return "ok";
    case "received":
      return "acc";
    case "advance_terms":
    case "requested":
      return "warn";
    case "missing":
      return "bad";
    default:
      return "mut";
  }
}

export function scheduleStatusShort(status: DebtScheduleStatus | null | undefined, rows = 0): string {
  switch (status) {
    case "voided":
      return "voided, no debt";
    case "rows":
      return `${rows} row${rows === 1 ? "" : "s"}`;
    case "document":
      return "uploaded";
    case "advance_terms":
      return "advance terms only";
    case "received":
      return "received, in review";
    case "requested":
      return "requested, not received";
    case "missing":
      return "not requested";
    default:
      return "unknown";
  }
}

/** "by Jane Desk on Nov 3, 2026", or as much of it as the declaration carries. */
export function declaredBy(declaration: DebtScheduleDeclaration | null | undefined): string {
  if (!declaration) return "";
  const who = declaration.by ? `by ${declaration.by}` : "by the desk";
  if (!declaration.at) return who;
  const date = new Date(declaration.at);
  return Number.isNaN(date.getTime()) ? who : `${who} on ${date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
}

export type PayeeKind =
  | "merchant_cash_advance"
  | "loan"
  | "credit_card"
  | "lease"
  | "payroll"
  | "rent"
  | "tax"
  | "insurance"
  | "utilities"
  | "merchant_services"
  | "bank_fees"
  | "owner_draw"
  | "transfer"
  | "vendor"
  | "other"
  | "customer"
  | "card_settlement"
  | "advance_funding"
  | "loan_proceeds"
  | "refund"
  | "owner_contribution";

export type RecurringPayee = {
  key: string;
  payee: string;
  kind: PayeeKind;
  kind_label: string;
  rationale: string;
  cadence: string | null;
  same_amount: boolean | null;
  occurrences: number;
  total: number | null;
  average_amount: number | null;
  monthly_average: number | null;
  monthly: Record<string, number>;
  months: string[];
  months_seen: number;
  accounts: string[];
  first_date: string | null;
  last_date: string | null;
  file_ids: string[];
  accepted: boolean;
  is_debt: boolean;
  is_card: boolean;
};

export type CockpitRecurring = {
  payees: RecurringPayee[];
  months_read: string[];
  files_need_reread: string[];
  total_monthly: number | null;
  observed_debt_service_monthly: number | null;
  observed_mca_monthly: number | null;
  observed_loan_monthly: number | null;
  observed_card_monthly: number | null;
};

export type ReconciliationStatus = "matches" | "differs" | "not_seen" | "seen" | "no_statements_read";

export type ReconciliationRow = {
  row_id: string | null;
  lender: string;
  is_mca: boolean;
  declared_monthly: number | null;
  declared_balance: number | null;
  documented: { lender: string; balance: number | null; monthly_payment: number | null; payment_frequency: string | null } | null;
  documented_monthly_delta_pct: number | null;
  documented_balance_delta_pct: number | null;
  observed: { payee: string; kind: PayeeKind; cadence: string | null; average_amount: number | null; monthly_average: number | null; months_seen: number } | null;
  observed_delta_pct: number | null;
  status: ReconciliationStatus;
};

export type CockpitReconciliation = {
  rows: ReconciliationRow[];
  unmatched_observed: RecurringPayee[];
  unmatched_documented: CockpitDocumentedDebt[];
  months_read: number;
  matches: number;
  differs: number;
  not_seen: number;
};

export type AdvanceFrequency = "daily" | "weekly" | "biweekly" | "monthly";

export type AdvanceIn = {
  id?: string | null;
  lender: string;
  original_amount: number | null;
  balance: number | null;
  payment_amount: number | null;
  payment_frequency: AdvanceFrequency | null;
  factor_rate: number | null;
  payoff_amount: number | null;
  maturity_on: string | null;
  notes: string | null;
  count_in_dscr: boolean;
  /** The statement payee this advance is (cockpit payee key), when known. */
  payee_key?: string | null;
};

export type Obligation = {
  id: string;
  kind: "row" | "document" | "schedule_document" | "payee";
  lender: string;
  category: string;
  is_mca: boolean;
  monthly: number | null;
  balance: number | null;
  payoff: number | null;
  in_debt_service: boolean;
  count_in_dscr: boolean;
  linked_payee_key: string | null;
  linked_payee: string | null;
  observed_monthly: number | null;
  cadence: string | null;
  source: string;
  origin: string | null;
};

export type PlanAddBackKind = "owner_salary" | "interest_refinanced" | "depreciation" | "one_time_expense" | "rent_to_owner" | "other";
export const ADD_BACK_KINDS: Record<PlanAddBackKind, string> = {
  owner_salary: "Owner salary / officer compensation",
  interest_refinanced: "Interest on the debt the loan refinances",
  depreciation: "Depreciation and amortization",
  one_time_expense: "One-time or non-recurring expense",
  rent_to_owner: "Rent paid to the owner",
  other: "Other add-back",
};
/** One amount the desk adds back to the income available for debt service. */
export type PlanAddBack = { id?: string | null; kind: PlanAddBackKind; label?: string | null; amount_monthly: number; note?: string | null; source?: string | null };
/** Figures the desk sets outright, each with the reason. */
export type PlanOverrides = { income_annual: number | null; income_note: string | null; debt_service_monthly: number | null; debt_service_note: string | null };
export const EMPTY_OVERRIDES: PlanOverrides = { income_annual: null, income_note: null, debt_service_monthly: null, debt_service_note: null };
/** Principal at risk and the coverage on every payment, as the server reads it (loan_schedule.risk_profile). */
export type PlanRisk = {
  weighted_average_life_months: number | null; recovery_milestones: Record<string, number | null>; full_exposure_months: number | null; breakeven_month?: number | null; balloon: number; balloon_pct: number;
  income_monthly: number | null; existing_service_monthly: number; coverage_by_period: Array<{ period: number; month: number; phase: string; payment_monthly: number; coverage: number | null }>;
  coverage_during_interest_only: number | null; coverage_after_interest_only: number | null; lowest_coverage: number | null; lowest_coverage_month: number | null; words: string;
};
/** Desk only: the fees off the proceeds and the true cost of the money. Never on the package or the listing. */
export type PlanEconomics = {
  audience: "desk"; loan_amount: number | null; accepted_amount: number | null; origination_points: number | null; origination_fee: number | null; origination_basis: string | null;
  consulting_fee: number | null; total_fees: number; qc_earnings: number | null; net_to_client: number | null; fees_pct_of_loan: number | null; total_interest: number | null;
  client_total_cost: number | null; stated_rate_pct: number | null; structure_rate_pct: number | null; effective_rate_pct: number | null; words: string;
};
export type ProposedTerms = {
  source: "term_sheet" | "plan"; label: string | null; amount: number | null; rate_pct: number | null; term_months: number | null; monthly_payment: number | null; structure?: string | null; structure_label?: string | null;
  interest_only: boolean; interest_only_months: number; payment_io_monthly?: number | null; payment_after_monthly?: number | null; describe?: string; payment_note?: string | null;
  schedule?: Record<string, unknown> | null; schedule_rows?: Array<{ period: number; month: number; phase: string; payment: number; interest: number; principal: number; balance: number; balloon?: number; exposure_pct: number; recovered_pct: number }>; risk?: PlanRisk | null;
};
export type PlanLoanTerms = { amount: number; rate_pct: number; term_months: number | null; interest_only: boolean; structure?: string | null; interest_only_months?: number; payment_io?: number | null; payment_after?: number | null; annual_debt_service?: number | null; total_interest?: number | null; total_paid?: number | null; balloon?: number | null; describe?: string };

export type FinancialPlanRecord = {
  retire: string[];
  exclude: string[];
  new_payment_monthly: number | null;
  new_payment_source: string | null;
  new_loan_amount: number | null;
  new_loan_rate_pct: number | null;
  new_loan_term_months: number | null;
  new_loan_interest_only?: boolean;
  new_loan_structure?: "amortizing" | "simple_interest" | "interest_only" | null;
  new_loan_interest_only_months?: number | null;
  add_backs?: PlanAddBack[];
  overrides?: PlanOverrides | null;
  terms_ref?: PlanTermsRef | null;
  note: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
};
/** Which recorded terms the plan's loan was adopted from. */
export type PlanTermsRef = { kind: "client_terms" | "production_term_sheet" | string; id: string; version: number; label: string; adopted_at?: string | null };
/** The recorded terms as the plan reads them (the Underwriting tab's client terms or the dealer's term sheet). */
export type RecordedTerms = { kind: string; id: string; version: number; label: string; amount: number | null; rate_pct: number | null; term_months: number | null; interest_only: boolean; structure?: string; interest_only_months?: number; payment_monthly: number | null; treatment: string; retained_annual_debt_service: number | null };
/** Does the plan's loan mirror the recorded terms? */
export type PlanTermsLink = {
  state: "none" | "plan_only" | "recorded_not_in_plan" | "mirrored" | "differs";
  recorded: RecordedTerms | null;
  plan_loan: { amount: number | null; rate_pct: number | null; term_months: number | null; interest_only: boolean; payment_monthly: number | null } | null;
  adopted_from: PlanTermsRef | null;
  differences: string[];
  summary: string;
};

/** One line of the plan in plain words, for the package, the listing and the review. */
export type PlanModification = { kind: string; label: string; detail: string | null; monthly_effect: number | null; annual_effect: number | null };
export type PlanPair = { before: number | null; after: number | null; change: number | null };
/** Original, with the plan, and the difference. */
export type PlanImpact = {
  active: boolean;
  dscr: PlanPair & { basis: string | null; status_before: DscrStatus; status_after: DscrStatus; no_debt_left: boolean };
  income_annual: PlanPair;
  debt_service_monthly: PlanPair;
  net_cash_flow_monthly: PlanPair;
  ending_balance: PlanPair;
  months_negative: PlanPair;
  cash_kept: number | null;
  add_backs_monthly: number | null;
  retired_monthly: number | null;
  excluded_monthly: number | null;
  loan: (PlanLoanTerms & { payment_monthly: number | null; source: string | null }) | null;
  accounts: { counted: string[]; not_counted: string[] } | null;
};

export type PlanReplayRow = {
  month: string;
  label: string;
  deposits: number | null;
  withdrawals: number | null;
  withdrawals_after: number | null;
  net: number | null;
  net_after: number | null;
  ending: number | null;
  ending_after: number | null;
  lowest: number | null;
  lowest_after: number | null;
  removed: number;
  added: number;
  cumulative: number;
};

export type PlanCandidate = { key: string; label: string; numerator_before: number | null; numerator_after: number; value_before: number | null; value_after: number | null; status_after: DscrStatus; no_debt_left: boolean; overridden?: boolean };

export type PlanEvaluation = {
  active: boolean;
  retired_ids: string[];
  excluded_ids: string[];
  retired_monthly: number;
  retired_count: number;
  payoff_total: number | null;
  payoff_unknown: number;
  excluded_monthly: number;
  add_backs_monthly?: number;
  add_backs_annual?: number;
  income_override_annual?: number | null;
  debt_service_override_monthly?: number | null;
  interest_only?: boolean;
  loan_terms?: PlanLoanTerms | null;
  income_before_annual?: number | null;
  income_after_annual?: number | null;
  new_payment_monthly: number | null;
  new_payment_source: string | null;
  loan_amount_needed: number | null;
  debt_service_before_monthly: number | null;
  debt_service_before_new_payment_monthly: number;
  debt_service_after_monthly: number;
  debt_service_after_annual: number | null;
  candidates: PlanCandidate[];
  headline_before: number | null;
  headline_after: number | null;
  headline_after_status: DscrStatus;
  headline_key: string | null;
  no_debt_left: boolean;
  replay: PlanReplayRow[];
  net_before_avg: number | null;
  net_after_avg: number | null;
  ending_before_last: number | null;
  ending_after_last: number | null;
  months_dipping_negative_before: number;
  months_dipping_negative_after: number;
  cash_kept: number;
};

export type PlanLever = { key: string; label: string; detail: string; dscr_after: number | null; status_after: DscrStatus; apply: Partial<FinancialPlanRecord> | null; improves: boolean };

export type FinancialPlanWrite = {
  retire: string[];
  exclude: string[];
  new_payment_monthly: number | null;
  new_payment_source: "manual" | "term_sheet" | "offer" | "manual_terms" | "recorded_terms" | null;
  new_loan_amount: number | null;
  new_loan_rate_pct: number | null;
  new_loan_term_months: number | null;
  new_loan_interest_only: boolean;
  new_loan_structure: "amortizing" | "simple_interest" | "interest_only" | null;
  new_loan_interest_only_months: number | null;
  add_backs: PlanAddBack[];
  overrides: PlanOverrides | null;
  terms_ref?: PlanTermsRef | null;
  note: string | null;
};

export type FinancialPlanRead = { profile_id: string; record: FinancialPlanRecord; evaluation: PlanEvaluation; levers: PlanLever[]; obligations: Obligation[] };

export type AdvanceRead = AdvanceIn & { id: string; monthly_payment: number | null; origin: string; editable: boolean; source: string; payee_key?: string | null };
export type AdvancesRead = { profile_id: string; rows: AdvanceRead[]; origin: string };
export type StatementRereadResult = { queued: number; file_ids: string[] };

/** The intake's own cadence table, so a verbal breakdown lands on the same monthly figure as a typed one. */
export const PAYMENTS_PER_MONTH: Record<AdvanceFrequency, number> = { daily: 21, weekly: 4.33, biweekly: 2.17, monthly: 1 };

export function monthlyEquivalent(amount: number | null | undefined, frequency: AdvanceFrequency | null | undefined): number | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  return Math.round(amount * PAYMENTS_PER_MONTH[frequency ?? "monthly"] * 100) / 100;
}

export type CockpitDebtService = {
  monthly: number | null;
  annual: number | null;
  source: DebtServiceSource;
  schedule_monthly: number | null;
  schedule_balance: number | null;
  schedule_rows_counted: number;
  document_monthly: number | null;
  document_balance: number | null;
  documented_monthly: number | null;
  documented_balance: number | null;
  mca_count: number;
  mca_monthly: number | null;
  mca_balance: number | null;
  observed_monthly: number | null;
  observed_mca_monthly: number | null;
  observed_loan_monthly: number | null;
  observed_card_monthly: number | null;
  unexplained_observed_monthly: number | null;
  /** The desk voided the schedule as no debt on the business. */
  declared_none: boolean;
  /** Voided, yet the statements still show lender debits: the observed figure wins. */
  declaration_conflict: boolean;
};

export type CockpitProposedPayment = {
  source: string;
  label: string | null;
  amount: number | null;
  rate_pct: number | null;
  term_months: number | null;
  monthly_payment: number;
  annual_payment: number;
};

export type CockpitDscrCandidate = {
  key: "tax_return" | "profit_and_loss" | "bank_cash_flow";
  label: string;
  numerator: number | null;
  numerator_label: string;
  period: string | null;
  annual_debt_service: number | null;
  value: number | null;
  status: DscrStatus;
  pro_forma_value: number | null;
  pro_forma_status: DscrStatus;
  confidence: CockpitConfidence;
  note: string | null;
};

export type CockpitDscr = {
  candidates: CockpitDscrCandidate[];
  headline: CockpitDscrCandidate | null;
  pro_forma_headline: CockpitDscrCandidate | null;
  annual_debt_service: number | null;
  debt_service_source: CockpitDebtService["source"];
  proposed: CockpitProposedPayment | null;
  thresholds: { acceptable: number; healthy: number; very_strong: number };
  reason: string | null;
  /** No debt service because the desk declared the business debt-free. */
  no_debt: boolean;
};

export type CockpitProfitCandidate = {
  key: "tax_return" | "profit_and_loss" | "bank_cash_flow";
  label: string;
  value: number;
  basis: string | null;
  period: string | null;
  revenue: number | null;
  margin: number | null;
  confidence: CockpitConfidence;
};

export type CockpitCoverage = {
  files_analyzed: number;
  files_accepted: number;
  bank_months: number;
  bank_months_accepted: number;
  bank_months_required: number;
  bank_accounts: CockpitAccount[];
  bank_gaps: string[];
  first_month: string | null;
  last_month: string | null;
  tax_years: string[];
  has_profit_and_loss: boolean;
  has_balance_sheet: boolean;
  has_debt_schedule_document: boolean;
  debt_schedule_status: DebtScheduleStatus;
  debt_rows: number;
  documented_debts: number;
  recurring_months_read: number;
  statements_need_reread: number;
  bank_files_need_reread: string[];
};

/** One line the AI read off an uploaded debt schedule (field names as the reader prints them). */
export type UploadedScheduleLine = { lender?: string | null; debt_type?: string | null; current_balance?: number | null; balance?: number | null; monthly_payment?: number | null; rate_pct?: number | null; maturity_date?: string | null; original_amount?: number | null; secured_by?: string | null; current?: boolean | null; payment_frequency?: string | null } & Record<string, unknown>;

export type FinancialCockpit = {
  profile_id: string;
  generated_at: string;
  requested_amount: number | null;
  coverage: CockpitCoverage;
  bank: {
    months: CockpitMonth[];
    summary: CockpitBankSummary;
    accounts: CockpitAccount[];
    recurring: CockpitRecurring;
    recurring_credits: CockpitRecurring;
    overdrafts: CockpitOverdrafts;
    /** Keys the desk chose to count; empty when every account counts. */
    counted_accounts: string[];
    /** Every account combined, only when the desk narrowed the counted set. */
    all_months: CockpitMonth[] | null;
    all_summary: CockpitBankSummary | null;
  };
  tax: { years: CockpitTaxYear[] };
  profit_and_loss: CockpitProfitAndLoss | null;
  balance_sheet: CockpitBalanceSheet | null;
  expenses: {
    lines: CockpitExpenseLine[];
    outflow_ratio: number | null;
    opex_ratio: number | null;
    cogs_ratio: number | null;
    debt_service_to_deposits: number | null;
  };
  debt: {
    rows: CockpitDebtRow[];
    documented: CockpitDocumentedDebt[];
    document: { total_monthly_debt_service: number | null; total_outstanding_balance: number | null; debts: UploadedScheduleLine[] } | null;
    service: CockpitDebtService;
    reconciliation: CockpitReconciliation;
    obligations: Obligation[];
    schedule: CockpitDebtSchedule;
  };
  plan: { record: FinancialPlanRecord; evaluation: PlanEvaluation; levers: PlanLever[]; modifications?: PlanModification[]; impact?: PlanImpact; terms_link?: PlanTermsLink | null; schedule?: Record<string, unknown> | null; schedule_rows?: Array<{ period: number; phase: string; payment: number; interest: number; principal: number; balance: number; balloon?: number; exposure_pct?: number; recovered_pct?: number }>; risk?: PlanRisk | null; economics?: PlanEconomics | null };
  /** The terms the package and the listing speak of (recorded term sheet, else the plan's loan) with the schedule and the principal at risk. */
  proposed_terms?: ProposedTerms | null;
  dscr: CockpitDscr;
  net_profit: { candidates: CockpitProfitCandidate[]; conclusion: CockpitProfitCandidate | null; note: string | null };
  notes: string[];
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const EM_DASH = "—";

export function money(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return EM_DASH;
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** $1.2M · $57.5k · $980 — for axis ticks and tiles where the full figure is a table away. */
export function compactMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EM_DASH;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

/** 0.333 → "33%" (a ratio, not a percentage). */
export function ratioPct(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return EM_DASH;
  return `${(value * 100).toFixed(digits)}%`;
}

/** 4.2 → "+4.2%", -3 → "-3.0%" (already a percentage). */
export function signedPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return EM_DASH;
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function multiple(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EM_DASH;
  return `${value.toFixed(2)}x`;
}

export function count(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EM_DASH;
  return value.toLocaleString("en-US");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-05" → "May '26" for axis labels; the full label stays in the tooltip and table. */
export function monthShort(key: string): string {
  const [year, month] = key.split("-");
  const index = Number(month) - 1;
  if (!year || !MONTHS[index]) return key;
  return `${MONTHS[index]} '${year.slice(2)}`;
}

export function trendDirection(pct: number | null | undefined): "up" | "down" | undefined {
  if (pct == null || !Number.isFinite(pct) || pct === 0) return undefined;
  return pct > 0 ? "up" : "down";
}

export function dscrTone(status: DscrStatus | null | undefined): CockpitTone {
  switch (status) {
    case "very_strong":
    case "healthy":
      return "ok";
    case "acceptable":
      return "warn";
    case "concerning":
      return "bad";
    default:
      return "mut";
  }
}

export function dscrLabel(status: DscrStatus | null | undefined): string {
  switch (status) {
    case "very_strong":
      return "Very strong (1.50x and above)";
    case "healthy":
      return "Healthy (1.25x to 1.50x)";
    case "acceptable":
      return "Thin (1.00x to 1.25x)";
    case "concerning":
      return "Below 1.00x";
    default:
      return "Not available";
  }
}

const SOURCE_LABELS: Record<string, string> = {
  debt_schedule_rows: "Debt schedule on the file",
  "debt_schedule_rows+bank_observed": "Schedule rows plus lender debits the rows forgot",
  bank_observed: "Lender debits seen in the statements",
  debt_schedule_document: "Uploaded debt schedule",
  advance_terms: "Advance terms read off documents",
  declared_none: "No debt on the business, declared by the desk",
  none: "No debt service on file",
  tax_return: "Tax return",
  profit_and_loss: "Profit and loss",
  bank_cash_flow: "Bank cash flow",
  bank_statements: "Bank statements",
  term_sheet: "Recorded loan terms",
};

export function sourceLabel(key: string | null | undefined): string {
  if (!key) return EM_DASH;
  return SOURCE_LABELS[key] ?? key.replace(/_/g, " ");
}

export function confidenceLabel(key: CockpitConfidence | null | undefined): string {
  switch (key) {
    case "filed":
      return "Filed return";
    case "statement":
      return "Statement";
    case "statement_unverified":
      return "Statement, unverified";
    case "proxy":
      return "Proxy";
    default:
      return EM_DASH;
  }
}

export function confidenceTone(key: CockpitConfidence | null | undefined): CockpitTone {
  switch (key) {
    case "filed":
      return "ok";
    case "statement":
      return "acc";
    case "statement_unverified":
      return "warn";
    case "proxy":
      return "warn";
    default:
      return "mut";
  }
}

// ---------------------------------------------------------------------------
// Scales
// ---------------------------------------------------------------------------

/** Clean tick values spanning [min, max] and always including zero. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi === lo) return [0];
  const raw = (hi - lo) / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / magnitude;
  const step = (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10) * magnitude;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

export function extent(values: Array<number | null | undefined>): [number, number] | null {
  const numbers = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!numbers.length) return null;
  return [Math.min(...numbers), Math.max(...numbers)];
}

/** An SVG path through the points; a null point breaks the line (a missing month is a gap, not a slope). */
export function linePath(points: Array<{ x: number; y: number } | null>): string {
  let path = "";
  let pen = false;
  for (const point of points) {
    if (!point) {
      pen = false;
      continue;
    }
    path += `${pen ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)} `;
    pen = true;
  }
  return path.trim();
}

export function payeeKindTone(kind: PayeeKind | null | undefined): CockpitTone {
  switch (kind) {
    case "merchant_cash_advance":
      return "bad";
    case "loan":
    case "lease":
      return "acc";
    case "credit_card":
      return "warn";
    case "advance_funding":
    case "loan_proceeds":
      return "warn";
    case "card_settlement":
    case "customer":
      return "ok";
    case "payroll":
    case "rent":
    case "tax":
    case "insurance":
    case "utilities":
      return "mut";
    default:
      return "mut";
  }
}

export function reconciliationLabel(row: ReconciliationRow): { tone: CockpitTone; label: string } {
  switch (row.status) {
    case "matches":
      return { tone: "ok", label: `Statements: ${money(row.observed?.monthly_average)} / mo, matches` };
    case "differs":
      return { tone: "warn", label: `Statements: ${money(row.observed?.monthly_average)} / mo (${signedPct(row.observed_delta_pct)} declared)` };
    case "seen":
      return { tone: "acc", label: `Seen in statements as ${row.observed?.payee ?? "a lender"}` };
    case "not_seen":
      return { tone: "warn", label: "Not seen in the statements" };
    default:
      return { tone: "mut", label: "Statements not read for payees yet" };
  }
}

export function cadenceLabel(value: string | null | undefined): string {
  switch ((value ?? "").toLowerCase()) {
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "biweekly":
    case "bi-weekly":
      return "Every two weeks";
    case "monthly":
      return "Monthly";
    case "irregular":
      return "Irregular";
    default:
      return "—";
  }
}

/** Level payment for a principal at an annual rate over a term; a factor-rate product divides payback by the term. */
export function amortizedPayment(principal: number | null | undefined, ratePct: number | null | undefined, months: number | null | undefined, factorRate?: number | null): number | null {
  if (principal == null || !Number.isFinite(principal) || principal <= 0 || !months || months <= 0) return null;
  if (factorRate != null && Number.isFinite(factorRate) && factorRate > 0) return Math.round((principal * factorRate / months) * 100) / 100;
  const rate = (ratePct ?? 0) / 100 / 12;
  if (rate <= 0) return Math.round((principal / months) * 100) / 100;
  return Math.round((principal * rate / (1 - Math.pow(1 + rate, -months))) * 100) / 100;
}

/** The new loan's monthly payment: interest alone when interest-only (principal at maturity), else the level payment. */
export function loanPayment(principal: number | null | undefined, ratePct: number | null | undefined, months: number | null | undefined, interestOnly: boolean, factorRate?: number | null): number | null {
  if (principal == null || !Number.isFinite(principal) || principal <= 0) return null;
  if (interestOnly && !(factorRate != null && factorRate > 0)) return Math.round((principal * ((ratePct ?? 0) / 100 / 12)) * 100) / 100;
  return amortizedPayment(principal, ratePct, months, factorRate);
}

/** Coverage once a new monthly payment is added to today's debt service. */
export function dscrWithPayment(incomeAnnual: number | null | undefined, existingMonthly: number | null | undefined, payment: number | null | undefined): number | null {
  if (incomeAnnual == null || payment == null || !Number.isFinite(incomeAnnual) || !Number.isFinite(payment)) return null;
  const annual = (existingMonthly ?? 0) * 12 + payment * 12;
  if (annual <= 0) return null;
  return Math.round((incomeAnnual / annual) * 100) / 100;
}

export function dscrStatusOf(value: number | null | undefined): DscrStatus {
  if (value == null || !Number.isFinite(value)) return "unavailable";
  if (value < 1) return "concerning";
  if (value < 1.25) return "acceptable";
  if (value < 1.5) return "healthy";
  return "very_strong";
}
