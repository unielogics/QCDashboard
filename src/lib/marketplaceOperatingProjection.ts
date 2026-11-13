export type MarketplaceOperatingPoint = {
  status?: string; basis?: string;
  noi_annual: number | null; noi_currency: string | null; noi_delta_annual: number | null;
  earnings_annual: number | null; earnings_currency: string | null; earnings_kind: string | null; earnings_delta_annual: number | null;
  dscr_current_debt: number | null; dscr_with_refinance: number | null; dscr_current_debt_delta: number | null; dscr_with_refinance_delta: number | null;
  cash_after_debt_annual: number | null; cash_after_debt_monthly: number | null; cash_currency: string | null; cash_delta_annual: number | null; cash_delta_monthly: number | null;
};
export type MarketplaceOperatingProjection = {
  schema_version: "marketplace-operating-projection-v1"; status: "conditional" | "incomplete";
  saved_version: { id: string; version_number: number; state: string; saved_at: string | null };
  qualification: "proposed" | "reviewed" | "needs_inputs";
  saved_terms?: { terms_state: string | null; recorded_terms_ref: string | null; deal_budget_revision: number | null; program_name: string | null; currency: string | null; amount: number | null; rate_pct: number | null; term_months: number | null } | null;
  historical_figures_unchanged: true; basis: "future_operating_plan";
  current: MarketplaceOperatingPoint; refinance_only: MarketplaceOperatingPoint; proposed_operating: MarketplaceOperatingPoint; reviewed_operating: MarketplaceOperatingPoint;
  missing: string[]; notes: string[];
};
export type MarketplaceProjectionRow = { label: string; value: keyof MarketplaceOperatingPoint; delta: keyof MarketplaceOperatingPoint; currency?: "noi_currency" | "earnings_currency" | "cash_currency" };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
/** Only the versioned saved-plan sidecar is rendered; no working draft or old refinance pair is substituted. */
export function marketplaceOperatingProjection(value: unknown): MarketplaceOperatingProjection | null {
  return object(value) && value.schema_version === "marketplace-operating-projection-v1" && object(value.saved_version) && object(value.current) && object(value.refinance_only) && object(value.proposed_operating) ? value as unknown as MarketplaceOperatingProjection : null;
}
export function marketplaceOperatingRows(projection: MarketplaceOperatingProjection): MarketplaceProjectionRow[] {
  const kind = projection.current.earnings_kind;
  return [
    { label: "Operating income / year", value: "noi_annual", delta: "noi_delta_annual", currency: "noi_currency" },
    { label: `${kind === "reported_ebitda" || kind === "computed_ebitda" ? "EBITDA" : kind === "tax_estimate" ? "Coverage earnings (tax estimate)" : "Annual earnings"} / year`, value: "earnings_annual", delta: "earnings_delta_annual", currency: "earnings_currency" },
    { label: "DSCR · current debt", value: "dscr_current_debt", delta: "dscr_current_debt_delta" },
    { label: "DSCR · saved refinance", value: "dscr_with_refinance", delta: "dscr_with_refinance_delta" },
    { label: "Cash after debt / month (illustration)", value: "cash_after_debt_monthly", delta: "cash_delta_monthly", currency: "cash_currency" },
    { label: "Cash after debt / year (illustration)", value: "cash_after_debt_annual", delta: "cash_delta_annual", currency: "cash_currency" },
  ];
}
export const marketplaceProjectionNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
export function marketplaceProjectionMoney(value: number | null | undefined, currency: string | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return currency && /^[A-Z]{3}$/.test(currency) && currency !== "XXX" ? new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value) : `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} (currency unconfirmed)`;
}
/** Formatting only; currencies and deltas come from the same canonical metric point. */
export function marketplaceProjectionValue(point: MarketplaceOperatingPoint | undefined, row: MarketplaceProjectionRow, delta = false) {
  const value = marketplaceProjectionNumber(point?.[delta ? row.delta : row.value]);
  if (value == null) return "—";
  const magnitude = delta ? Math.abs(value) : value;
  const sign = delta ? value > 0 ? "+" : value < 0 ? "−" : "" : "";
  if (!row.currency) return `${sign}${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(magnitude)}x`;
  const currency = point?.[row.currency];
  const formatted = marketplaceProjectionMoney(magnitude, currency);
  return `${sign}${formatted}`;
}
