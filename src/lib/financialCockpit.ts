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

export type CockpitAccount = { key: string; label: string; months: string[]; accepted_months: string[] };

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

export type CockpitDebtService = {
  monthly: number | null;
  annual: number | null;
  source: "debt_schedule_rows" | "debt_schedule_document" | "advance_terms" | "none";
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
  debt_rows: number;
  documented_debts: number;
};

export type FinancialCockpit = {
  profile_id: string;
  generated_at: string;
  requested_amount: number | null;
  coverage: CockpitCoverage;
  bank: { months: CockpitMonth[]; summary: CockpitBankSummary; accounts: CockpitAccount[] };
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
    document: { total_monthly_debt_service: number | null; total_outstanding_balance: number | null; debts: Record<string, unknown>[] } | null;
    service: CockpitDebtService;
  };
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
  debt_schedule_document: "Uploaded debt schedule",
  advance_terms: "Advance terms read off documents",
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
