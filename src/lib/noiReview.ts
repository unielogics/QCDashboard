import type { FinancialCockpit } from "./financialCockpit";
import type { MetricSourceRef } from "./financialMetrics";
import type { AuthedApi } from "./worksheetApi";

export type NoiReviewMode = "automatic" | "source" | "manual";
export type NoiReviewSource = {
  file_id: string; file_name: string | null; kind: "profit_and_loss" | "business_tax_return";
  year: number | null; currency: string | null; period_start?: string | null; period_end?: string | null;
  proposed_annual_value: number | null; eligible: boolean; reason: string | null; notes: string[];
  automatic_eligible?: boolean; automatic_reason?: string | null;
  source_stamp?: string; citation_status?: string; source_refs: MetricSourceRef[];
};
export type NoiReviewReceipt = {
  id: string; revision: number; at: string; mode: NoiReviewMode; selected_file_id: string | null;
  annual_value: number | null; year: number | null; currency: string | null;
  period_start?: string | null; period_end?: string | null; reason: string;
  source_metric?: "noi"; source_stamp: string; source_refs: MetricSourceRef[];
  actor_id?: string | null; actor_name?: string | null;
};
export type NoiReviewRead = {
  revision: number; source_stamp: string; mode: NoiReviewMode; stale: boolean;
  sources: NoiReviewSource[]; current: NoiReviewReceipt | null; history: NoiReviewReceipt[];
};
export type NoiReviewDraft = {
  mode: NoiReviewMode; selectedFileId: string; annualValue: string; year: string; currency: string;
  periodStart: string; periodEnd: string; reason: string; revision: number; sourceStamp: string; idempotencyKey: string;
};

export function draftForNoiSource(draft: NoiReviewDraft, source: NoiReviewSource): NoiReviewDraft {
  const pairedDates = Boolean(source.period_start && source.period_end);
  return { ...draft, selectedFileId: source.file_id, annualValue: source.proposed_annual_value == null ? "" : String(source.proposed_annual_value),
    year: source.year == null ? "" : String(source.year), currency: source.currency ?? "",
    periodStart: pairedDates ? source.period_start! : "", periodEnd: pairedDates ? source.period_end! : "" };
}

export function initialNoiReviewDraft(review: NoiReviewRead, idempotencyKey: string, currentSourceFileId?: string | null): NoiReviewDraft {
  const current = review.current?.mode === "automatic" ? null : review.current;
  const source = review.sources.find((item) => item.file_id === current?.selected_file_id && item.eligible)
    ?? review.sources.find((item) => item.file_id === currentSourceFileId && item.eligible && item.automatic_eligible !== false)
    ?? review.sources.find((item) => item.eligible && item.automatic_eligible !== false);
  const draft: NoiReviewDraft = {
    mode: current && current.mode !== "automatic" ? current.mode : source ? "source" : "manual",
    selectedFileId: current?.selected_file_id ?? "", annualValue: current?.annual_value == null ? "" : String(current.annual_value),
    year: current?.year == null ? "" : String(current.year), currency: current?.currency ?? "",
    periodStart: current?.period_start ?? "", periodEnd: current?.period_end ?? "", reason: "",
    revision: review.revision, sourceStamp: review.source_stamp, idempotencyKey,
  };
  return !current && source ? draftForNoiSource(draft, source) : draft;
}

export function noiReviewDraftStale(draft: NoiReviewDraft, review: NoiReviewRead) {
  return draft.revision !== review.revision || draft.sourceStamp !== review.source_stamp;
}

function annualAmount(value: string): number | null {
  const text = value.trim().replaceAll(",", "");
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const amount = Number(text);
  return Number.isFinite(amount) && Math.abs(amount) <= 1e15 ? amount : null;
}
function dateValue(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = Date.parse(value);
  return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value ? date : null;
}

export function noiReviewIssues(draft: NoiReviewDraft, review: NoiReviewRead): string[] {
  const issues: string[] = [];
  if (!draft.reason.trim() || draft.reason.trim().length > 2000) issues.push("Enter a review reason of up to 2,000 characters.");
  if (noiReviewDraftStale(draft, review)) issues.push("Review the latest evidence before saving these entries.");
  if (draft.mode === "automatic") return issues;
  if (annualAmount(draft.annualValue) === null) issues.push("Enter a finite annual NOI amount, including zero or a negative amount when appropriate.");
  const year = Number(draft.year);
  const yearValid = /^\d{4}$/.test(draft.year) && year >= 1900 && year <= 2100;
  if (!yearValid) issues.push("Enter the reviewed year between 1900 and 2100.");
  const currency = draft.currency.trim().toUpperCase();
  const currencyValid = /^[A-Z]{3}$/.test(currency) && currency !== "XXX";
  if (!currencyValid) issues.push("Enter the reviewed three-letter currency.");
  const source = review.sources.find((item) => item.file_id === draft.selectedFileId);
  if ((draft.mode === "source" || draft.selectedFileId) && !source?.eligible) issues.push("Choose an eligible business tax return or P&L, or remove the optional source for a manual review.");
  if (source?.eligible && draft.selectedFileId) {
    if (yearValid && source.year != null && source.year !== year) issues.push("The reviewed year must match the selected source year.");
    if (currencyValid && source.currency && source.currency !== currency) issues.push("The reviewed currency must match the selected source; no currency conversion is applied.");
  }
  if (draft.periodStart || draft.periodEnd) {
    const start = dateValue(draft.periodStart), end = dateValue(draft.periodEnd);
    if (start === null || end === null || end < start || end - start > 366 * 86400000 || Number(draft.periodEnd.slice(0, 4)) !== year)
      issues.push("Enter both period dates in order, no more than 366 days apart, ending in the reviewed year.");
  }
  return issues;
}

export function noiReviewPayload(draft: NoiReviewDraft, review: NoiReviewRead) {
  const issues = noiReviewIssues(draft, review);
  if (issues.length) throw new Error(issues[0]);
  const automatic = draft.mode === "automatic";
  return { mode: draft.mode, selected_file_id: automatic ? null : draft.selectedFileId || null,
    annual_value: automatic ? null : annualAmount(draft.annualValue), year: automatic ? null : Number(draft.year),
    currency: automatic ? null : draft.currency.trim().toUpperCase(), period_start: automatic ? null : draft.periodStart || null,
    period_end: automatic ? null : draft.periodEnd || null, reason: draft.reason.trim(), expected_revision: draft.revision,
    source_stamp: draft.sourceStamp, idempotency_key: draft.idempotencyKey };
}

export function saveNoiReview(api: AuthedApi, profileId: string, draft: NoiReviewDraft, review: NoiReviewRead) {
  return api<FinancialCockpit>(`/application-profiles/${encodeURIComponent(profileId)}/financial-metrics/noi-review`, {
    method: "POST", body: JSON.stringify(noiReviewPayload(draft, review)),
  });
}
