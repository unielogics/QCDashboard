import type { NoiReviewRead } from "./noiReview";
import type { NoiGovernance } from "./noiGovernance";
import type { AuthedApi } from "./worksheetApi";
import type { FinancialCockpit } from "./financialCockpit";

export type MetricSourceRef = { file_id: string | null; file_name: string | null; analysis_id?: string | null; content_hash?: string | null; accepted?: boolean; entity?: string | null; entity_comparable?: boolean | null; currency?: string | null; basis?: string | null; period_start?: string | null; period_end?: string | null; version_id?: string | null; pages?: number[]; fact_key?: string | null; citations?: Array<{ page?: number; quote?: string }> };
export type MetricCorrection = { id: string; input_key: string; action: "correct" | "restore"; value: number | null; effective_value?: number | null; previous_value: number | null; currency?: string | null; source_refs?: MetricSourceRef[]; mark_unknown?: boolean; reason: string; actor_id: string | null; actor_name: string | null; at: string; source_stamp: string; revision: number; stale?: boolean };
export type MetricCompositionComponent = { input_key: string; label: string; value: number | null; included: boolean; role?: string; required?: boolean; editable?: boolean; coefficient?: number; contribution?: number | null; source_refs?: MetricSourceRef[] };
export type MetricCompositionAdjustment = { id: string; label: string; amount: number };
export type MetricCompositionEvent = { id: string; calculation_key: string; action: "compose" | "restore"; components?: Array<{ input_key: string; included: boolean }>; adjustments?: MetricCompositionAdjustment[]; reason: string; actor_id?: string | null; actor_name?: string | null; at: string; source_stamp: string; revision: number; stale?: boolean };
export type MetricRecipe = { source_stamp: string; revision: number; components: MetricCompositionComponent[]; adjustments: MetricCompositionAdjustment[]; current_event?: MetricCompositionEvent | null; can_edit: boolean; unit?: string; kind?: "dscr" | "earnings" | "aggregate"; denominator?: { input_key: string; label: string; value: number | null; editable: false } | null; required_anchor?: string | null; reviewed_numerator?: number | null; base_value: number | null; reviewed_value: number | null; stale?: boolean; label?: string; annualization_factor?: number | null; annualize_before_rounding?: boolean };
export type MetricInput = { key: string; label: string; original_value: number | null; value: number | null; unit: "currency" | "months" | "number"; editable: boolean; editor_action?: "debt_schedule" | null; source_stamp: string; source_refs: MetricSourceRef[]; period: string | null; missing: boolean; correction: MetricCorrection | null; used_by?: string[]; used_by_headline?: string[]; unavailable_reason?: string | null };
export type MetricCalculation = { key: string; label: string; formula: string; value: number | null; currency?: string | null; unit?: "currency" | "ratio" | "number"; selected?: boolean; input_keys: string[]; period: string | null; annualization_factor: number | null; missing_inputs: string[]; notes: string[]; source_refs: MetricSourceRef[]; numerator?: number | null; denominator?: number | null; annualized_value?: number | null; difference?: number | null; basis_status?: string | null; numerator_currency?: string | null; denominator_currency?: string; source_currencies?: string[]; currency_comparable?: boolean; currency_status?: "comparable" | "mismatch" | "unknown"; currency_note?: string | null; denominator_currency_basis?: string; recipe?: MetricRecipe; source_value?: number | null; reviewed_value?: number | null; reviewed_label?: string; details?: { complete?: boolean; [key: string]: unknown } };
export type MetricResult = { key: string; label: string; value: number | null; annualized_value: number | null; currency?: string | null; basis?: string | null; period: string | null; months_covered: number | null; annualization_factor: number | null; kind: "tax_estimate" | "reported_ebitda" | "computed_ebitda"; complete: boolean; provisional: boolean; formula: string; input_keys: string[]; missing_inputs: string[]; notes: string[]; source_refs: MetricSourceRef[] };
export type ExcludedIncomeSource = { file_id: string | null; file_name: string | null; reason: string };
export type FinancialComparativeConflict = { year: string | null; field: string; file_id: string | null; value: number | null; comparative_file_id: string | null; comparative_value: number | null; difference: number | null; reason: string };
export type FinancialMetricReview = { revision: number; source_stamp: string; inputs: MetricInput[]; calculations: MetricCalculation[]; history: MetricCorrection[]; stale_corrections: MetricCorrection[]; excluded_income_sources?: ExcludedIncomeSource[]; comparative_conflicts?: FinancialComparativeConflict[]; composition_history?: MetricCompositionEvent[]; document_associations?: import("./documentAssociation").DocumentAssociation[] };
export type MetricCompositionWrite = { calculation_key: string; action: "compose" | "restore"; components: Array<{ input_key: string; included: boolean }>; adjustments: MetricCompositionAdjustment[]; reason: string; expected_revision: number; source_stamp: string; idempotency_key: string };
export function saveFinancialMetricComposition(api: AuthedApi, profileId: string, payload: MetricCompositionWrite) {
  return api<FinancialCockpit>(`${root(profileId)}/compositions`, { method: "POST", body: JSON.stringify(payload) });
}
export type EbitdaSource = { file_id: string; file_name: string | null; entity?: string | null; period?: string | null; period_end?: string | null; kind: "tax_return" | "profit_and_loss" | "personal_tax_return"; eligible: boolean; baseline_eligible?: boolean; comparative_only?: boolean; /** A P&L standing behind the filed return; staff may select it. */ fallback_only?: boolean; current_period?: boolean; included: boolean; selected: boolean; reason?: string | null; analysis_id?: string | null; content_hash?: string | null; currency?: string | null; ebitda_value?: number | null; annualized_ebitda?: number | null; missing_inputs?: string[]; source_refs?: MetricSourceRef[] };
export type EbitdaSourceEvent = { id?: string; at: string; actor_name?: string | null; reason: string; mode: "automatic" | "manual"; selected_file_id: string | null; excluded_file_ids: string[]; revision: number; stale?: boolean };
export type EbitdaForecastAssumptions = { revenue_growth_pct: number; ebitda_margin_pct: number | null };
export type EbitdaSourceSelection = { baseline_policy?: "filed_return_first" | "latest_business_period"; latest_file_id?: string | null; latest_period_end?: string | null; forecast_assumptions?: EbitdaForecastAssumptions | null; revision: number; source_stamp: string; mode: "automatic" | "manual"; selected_file_id: string | null; excluded_file_ids: string[]; stale: boolean; sources: EbitdaSource[]; history: EbitdaSourceEvent[] };
export type EbitdaSourceWrite = { forecast_assumptions?: EbitdaForecastAssumptions | null; mode: "automatic" | "manual"; selected_file_id: string | null; excluded_file_ids: string[]; reason: string; expected_revision: number; source_stamp: string; idempotency_key: string };
export type RevenueTrendPeriod = { year: string | number; period_start?: string | null; period_end?: string | null; months_covered?: number | null; revenue: number | null; average_monthly_revenue: number | null; ebitda: number | null; ebitda_kind?: string | null; currency: string | null; basis?: string | null; file_id: string | null; file_name: string | null; source_refs: MetricSourceRef[] };
export type RevenueTrend = { status: "available" | "insufficient"; periods: RevenueTrendPeriod[]; comparison: { direction?: "up" | "down" | "neutral" | null; prior_year: string | number; current_year: string | number; prior_revenue: number | null; current_revenue: number | null; change_amount: number | null; change_pct: number | null; monthly_change: number | null; comparable: boolean; reason: string | null } | null; forecast: { status: "illustration" | "unavailable"; method: "p_and_l_run_rate" | "historical_growth_scenario" | "reviewed_assumptions" | null; target_year: string | number | null; projected_revenue: number | null; change_amount: number | null; change_pct: number | null; projected_ebitda: number | null; ebitda_kind: string | null; margin: number | null; assumptions: string[]; source_refs: MetricSourceRef[]; reason: string | null } | null; bank_context?: { average_monthly_deposits: number | null; annualized_deposits: number | null; note: string }; notes: string[] };
export type EarningsPotentialCoverage = { annual_debt_service: number | null; dscr: number | null; earnings_less_debt_service?: number | null; funding_shortfall?: number | null; targets: Array<{ ratio: number; earnings_required: number | null; margin_pct: number | null; improvement_required: number | null }> };
export type EarningsPotential = { available: boolean; reason?: string | null; baseline?: { revenue: number | null; earnings: number | null; kind?: string | null; margin_pct: number | null; period?: string | null; currency?: string | null; basis?: string | null; provisional?: boolean }; trend?: { direction?: "up" | "down" | "neutral" | null; change_pct?: number | null; prior_year?: string | number | null; current_year?: string | number | null }; operating_break_even?: { earnings_required: number | null; improvement_required: number | null }; current?: EarningsPotentialCoverage | null; plan?: EarningsPotentialCoverage | null; forecast?: { status: string; earnings: number | null; revenue: number | null; dscr_current: number | null; dscr_plan: number | null; assumptions: string[] } | null; notes: string[] };
export type FinancialEbitda = { headline: MetricResult | null; candidates: MetricResult[]; reason: string | null; source_selection?: EbitdaSourceSelection; revenue_trend?: RevenueTrend; potential?: EarningsPotential };
export type NoiResult = Omit<MetricResult, "kind"> & { kind: "business_operating_income" | "tax_derived_noi" | "staff_reviewed_noi"; staff_reviewed?: boolean; staff_adjusted?: boolean; tax_derived_estimate?: boolean; source_value?: number | null; reviewed_value?: number | null; review_receipt?: { id: string; revision: number; at: string; mode: string }; year?: string | number | null; period_start?: string | null; period_end?: string | null; computed_value?: number | null; reported_value?: number | null; reconciliation_difference?: number | null; fundamentals: Array<{ key: string; label: string; value: number | null; signed_value: number | null; input_key?: string | null; source_refs: MetricSourceRef[] }> };
export type FinancialNoi = Partial<NoiGovernance> & { review?: NoiReviewRead; source_headline?: NoiResult | null; source_reason?: string | null; definition: { key: string; label: string; formula: string; includes_depreciation_and_amortization: boolean }; headline: NoiResult | null; candidates: NoiResult[]; years: NoiResult[]; reason?: string | null; trend?: { comparable: boolean; direction: "up" | "down" | "neutral" | null; prior_year?: string | number | null; current_year?: string | number | null; prior_noi?: number | null; current_noi?: number | null; change_amount?: number | null; change_pct?: number | null; change_pct_basis?: string | null; revenue_direction?: "up" | "down" | "neutral" | null; prior_revenue?: number | null; current_revenue?: number | null; revenue_change_pct?: number | null; reason?: string | null }; scenario?: { current: number | null; plan: number | null; operating_adjustments: Array<{ id?: string | null; label?: string | null; amount_annual: number }>; annual_debt_service_current: number | null; annual_debt_service_plan: number | null; after_debt_service_current: number | null; after_debt_service_plan: number | null; annualized_run_rate?: boolean; notes: string[] } | null };
export function saveEbitdaSources(api: AuthedApi, profileId: string, payload: EbitdaSourceWrite) {
  return api<FinancialCockpit>(`${root(profileId)}/ebitda-sources`, { method: "POST", body: JSON.stringify(payload) });
}
export type MetricCorrectionDraft = { profileId: string; input: MetricInput; revision: number; action: "correct" | "restore"; value: string; unknown: boolean; reason: string; idempotencyKey: string };

export function metricDraftValue(draft: MetricCorrectionDraft): number | null | undefined {
  if (draft.action === "restore") return draft.input.original_value;
  if (draft.unknown) return draft.input.unit === "months" ? undefined : null;
  if (!draft.value.trim()) return undefined;
  const value = Number(draft.value);
  if (!Number.isFinite(value) || draft.input.unit === "months" && (!Number.isInteger(value) || value < 1 || value > 12)) return undefined;
  return value;
}
export function metricDraftIsStale(draft: MetricCorrectionDraft, review: FinancialMetricReview) {
  return review.revision !== draft.revision || review.inputs.find((input) => input.key === draft.input.key)?.source_stamp !== draft.input.source_stamp;
}
const root = (profileId: string) => `/application-profiles/${encodeURIComponent(profileId)}/financial-metrics`;
export const readFinancialMetrics = (api: AuthedApi, profileId: string) => api<FinancialCockpit>(root(profileId));
export function saveFinancialMetricCorrection(api: AuthedApi, profileId: string, draft: MetricCorrectionDraft) {
  if (draft.profileId !== profileId) throw new Error("This correction belongs to another file. Reopen the input on the current file.");
  const value = metricDraftValue(draft);
  if (value === undefined) throw new Error(draft.input.unit === "months" ? "Enter the reporting period length between 1 and 12 months." : "Enter a valid amount or explicitly mark it unknown.");
  return api<FinancialCockpit>(`${root(profileId)}/corrections`, { method: "POST", body: JSON.stringify({ input_key: draft.input.key, action: draft.action, ...(draft.action === "correct" ? { value, ...(draft.unknown ? { mark_unknown: true } : {}) } : {}), reason: draft.reason.trim(), expected_revision: draft.revision, source_stamp: draft.input.source_stamp, idempotency_key: draft.idempotencyKey }) });
}
export function metricInputProvenance(input: MetricInput) {
  return input.correction ? "Staff correction" : input.source_refs.some((source) => source.version_id) ? "Saved financial form" : input.source_refs.some((source) => source.analysis_id) ? "AI-read source" : "Source value";
}
export function ebitdaKpi(result: MetricResult | null | undefined) {
  return { value: result?.annualized_value ?? result?.value ?? null, annualized: result?.annualized_value != null && result.annualization_factor != null && result.annualization_factor !== 1, period: result?.period ?? null, provisional: result?.provisional ?? false };
}
export function ebitdaIsStaffCorrected(result: MetricResult | null | undefined, review: FinancialMetricReview | undefined) {
  const keys = [...(result?.input_keys ?? []), ...(result?.key === "profit_and_loss" && result.annualized_value != null ? ["profit_and_loss.months_covered"] : [])];
  return keys.some((key) => review?.inputs.some((input) => input.key === key && input.correction));
}
export function metricCurrency(currency: string | null | undefined, sources: MetricSourceRef[] = []): string | null {
  const valid = (value: string | null | undefined) => value && /^[A-Z]{3}$/i.test(value.trim()) && value.trim().toUpperCase() !== "XXX" ? value.trim().toUpperCase() : null;
  if (currency !== undefined) return valid(currency);
  const currencies = sources.map((source) => valid(source.currency));
  if (currencies.some((value) => !value)) return null;
  const known = [...new Set(currencies.filter((value): value is string => Boolean(value)))];
  return known.length === 1 ? known[0] : null;
}
export function metricInputCurrency(input: MetricInput | undefined) {
  return input?.key.startsWith("debt.") ? "USD" : metricCurrency(undefined, input?.source_refs);
}
export function metricAmountLabel(value: number | null | undefined, currency: string | null | undefined, digits = 2, showUnknownCurrency = true) {
  if (value == null || !Number.isFinite(value)) return "Unknown";
  const known = metricCurrency(currency);
  if (known) return new Intl.NumberFormat("en-US", { style: "currency", currency: known, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  return `${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}${showUnknownCurrency ? " (currency unknown)" : ""}`;
}
