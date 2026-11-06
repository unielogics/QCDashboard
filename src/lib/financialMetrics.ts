import type { AuthedApi } from "./worksheetApi";
import type { FinancialCockpit } from "./financialCockpit";

export type MetricSourceRef = { file_id: string | null; file_name: string | null; analysis_id?: string | null; content_hash?: string | null; accepted?: boolean; entity?: string | null; entity_comparable?: boolean | null; currency?: string | null; basis?: string | null; period_start?: string | null; period_end?: string | null; version_id?: string | null; pages?: number[]; fact_key?: string | null; citations?: Array<{ page?: number; quote?: string }> };
export type MetricCorrection = { id: string; input_key: string; action: "correct" | "restore"; value: number | null; effective_value?: number | null; previous_value: number | null; currency?: string | null; source_refs?: MetricSourceRef[]; mark_unknown?: boolean; reason: string; actor_id: string | null; actor_name: string | null; at: string; source_stamp: string; revision: number; stale?: boolean };
export type MetricInput = { key: string; label: string; original_value: number | null; value: number | null; unit: "currency" | "months" | "number"; editable: boolean; editor_action?: "debt_schedule" | null; source_stamp: string; source_refs: MetricSourceRef[]; period: string | null; missing: boolean; correction: MetricCorrection | null; used_by?: string[]; used_by_headline?: string[]; unavailable_reason?: string | null };
export type MetricCalculation = { key: string; label: string; formula: string; value: number | null; currency?: string | null; unit?: "currency" | "ratio" | "number"; selected?: boolean; input_keys: string[]; period: string | null; annualization_factor: number | null; missing_inputs: string[]; notes: string[]; source_refs: MetricSourceRef[]; numerator?: number | null; denominator?: number | null; annualized_value?: number | null; difference?: number | null; basis_status?: string | null; numerator_currency?: string | null; denominator_currency?: string; source_currencies?: string[]; currency_comparable?: boolean; currency_status?: "comparable" | "mismatch" | "unknown"; currency_note?: string | null; denominator_currency_basis?: string };
export type MetricResult = { key: string; label: string; value: number | null; annualized_value: number | null; currency?: string | null; basis?: string | null; period: string | null; months_covered: number | null; annualization_factor: number | null; kind: "tax_estimate" | "reported_ebitda" | "computed_ebitda"; complete: boolean; provisional: boolean; formula: string; input_keys: string[]; missing_inputs: string[]; notes: string[]; source_refs: MetricSourceRef[] };
export type FinancialMetricReview = { revision: number; source_stamp: string; inputs: MetricInput[]; calculations: MetricCalculation[]; history: MetricCorrection[]; stale_corrections: MetricCorrection[] };
export type FinancialEbitda = { headline: MetricResult | null; candidates: MetricResult[]; reason: string | null };
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
