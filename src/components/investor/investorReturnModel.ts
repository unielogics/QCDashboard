/** Portable display/selection helpers. Financial amounts are supplied by the server. */
export type ReturnNumber = number | string | null | undefined;
export type InvestorProjectionRequest = { exit_month: number; investment_amount: number | null };
export type InvestorHoldingRow = {
  month: number;
  gross_receipts: number | null;
  interest: number | null;
  principal_returned: number | null;
  fees: number | null;
  reserve_release: number | null;
  net_distribution: number | null;
  net_cash_flow: number | null;
  cumulative_interest: number | null;
  cumulative_principal_returned: number | null;
  cumulative_fees: number | null;
  cumulative_net_profit: number | null;
  cumulative_net_roi_pct: number | null;
  cumulative_net_cash_flow: number | null;
  outstanding_principal: number | null;
};
export type InvestorExitPoint = {
  month: number;
  payoff_month: number | null;
  capped_at_maturity: boolean;
  status: "calculated" | "needs_review";
  principal_returned: number | null;
  gross_interest: number | null;
  earned_interest: number | null;
  minimum_interest_charge: number | null;
  payoff_charge_income: number | null;
  total_fees: number | null;
  known_fee_subtotal: number | null;
  initial_outlay: number | null;
  net_income: number | null;
  net_roi_pct: number | null;
  net_cash_profit: number | null;
  net_cash_received: number | null;
  reserve_released: number | null;
  reserve_held: number | null;
  missing_assumptions: string[];
  assumptions: string[];
};
export type InvestorReturnProjection = {
  policy_version: string;
  status: "calculated" | "needs_review" | "unavailable";
  currency: string | null;
  source: { kind: "staff_saved" | "staff_preview" | "listing_saved" | "published_listing"; id: string; budget_revision: number | null; terms_version: number | null; updated_at: string | null; fingerprint: string };
  request: InvestorProjectionRequest;
  basis: "offering_investor_capital" | "pro_rata_illustration";
  offering_investor_capital: number | null;
  investment_amount: number | null;
  initial_outlay: number | null;
  maturity_month: number | null;
  maximum_month: number | null;
  holding: InvestorHoldingRow[];
  selected_exit: InvestorExitPoint | null;
  full_term: InvestorExitPoint | null;
  payoff_curve_status: "complete" | "on_demand" | "unavailable";
  payoff_curve: InvestorExitPoint[];
  missing_inputs: string[];
  assumptions: string[];
  performance: { curve_work_estimate: number; curve_work_limit: number; curve_points: number };
};
export type InvestorProjectionLoader = (request: InvestorProjectionRequest, signal: AbortSignal) => Promise<InvestorReturnProjection>;

export function sameReturnRequest(a: InvestorProjectionRequest, b: InvestorProjectionRequest): boolean {
  return a.exit_month === b.exit_month && a.investment_amount === b.investment_amount;
}

export function returnExitForMonth(projection: InvestorReturnProjection, month: number): InvestorExitPoint | null {
  return projection.payoff_curve.find(point => point.month === month)
    ?? (projection.selected_exit?.month === month ? projection.selected_exit : null)
    ?? (projection.full_term?.month === month ? projection.full_term : null);
}
export type ReturnChartPoint = { month: number; value: ReturnNumber };
export type ReturnPlot = {
  paths: string[];
  points: Array<{ month: number; value: number | null; x: number; y: number | null }>;
  minimum: number;
  maximum: number;
  zeroY: number;
};

export function returnNumber(value: ReturnNumber): number | null {
  if (value == null || typeof value === "string" && !value.trim()) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function returnMoney(value: ReturnNumber, currency?: string | null): string {
  const amount = returnNumber(value);
  if (amount == null) return "Not confirmed";
  if (!currency) return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · currency not confirmed`;
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code", maximumFractionDigits: 2 }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

export function returnPercent(value: ReturnNumber): string {
  const amount = returnNumber(value);
  return amount == null ? "Not confirmed" : `${amount.toFixed(2)}%`;
}

export function returnTone(value: ReturnNumber): "positive" | "negative" | "unknown" {
  const amount = returnNumber(value);
  return amount == null ? "unknown" : amount < 0 ? "negative" : "positive";
}

const RETURN_REQUIREMENTS: Record<string, string> = {
  investor_costs_or_reserve_policy: "Confirm investor-paid fees and reserve return treatment.",
  repayment_schedule: "Complete the saved loan repayment schedule.",
  currency: "Confirm the currency of the saved loan and budget before pricing returns.",
  interest_policy: "Choose the contracted early payoff interest policy.",
  charge_amount: "Confirm the additional payoff charge, including 0 when none applies.",
  charge_recipient: "Confirm who receives the additional payoff charge.",
  minimum_interest_months: "Confirm the contractual minimum interest months.",
  reserve_release: "Confirm when the investor reserve is released.",
};
export const returnRequirement = (value: string) => RETURN_REQUIREMENTS[value] ?? value.replaceAll("_", " ");

export function selectReturnMonth<T extends { month: number }>(points: readonly T[], requested: number): T | undefined {
  let selected: T | undefined;
  for (const point of points) {
    if (!Number.isFinite(point.month) || point.month < 0) continue;
    if (!selected || Math.abs(point.month - requested) < Math.abs(selected.month - requested)) selected = point;
  }
  return selected;
}

/** Coordinate arithmetic only; null financial values break the line rather than becoming zero. */
export function returnPlot(input: readonly ReturnChartPoint[], width = 720, height = 220, padding = 14): ReturnPlot {
  const sorted = input.filter(point => Number.isFinite(point.month) && point.month >= 0).slice().sort((a, b) => a.month - b.month);
  const known = sorted.map(point => returnNumber(point.value)).filter((value): value is number => value != null);
  const minimum = Math.min(0, ...known), maximum = Math.max(0, ...known);
  const span = maximum - minimum || 1;
  const first = sorted[0]?.month ?? 0, last = sorted.at(-1)?.month ?? first;
  const y = (value: number) => height - padding - (value - minimum) / span * (height - padding * 2);
  const points = sorted.map(point => {
    const value = returnNumber(point.value);
    return { month: point.month, value, x: padding + (point.month - first) / (last - first || 1) * (width - padding * 2), y: value == null ? null : y(value) };
  });
  const paths: string[] = [];
  let current = "";
  for (const point of points) {
    if (point.y == null) { if (current) paths.push(current); current = ""; continue; }
    current += `${current ? " L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  }
  if (current) paths.push(current);
  return { paths, points, minimum, maximum, zeroY: y(0) };
}
