import type { EbitdaSource, EbitdaSourceSelection, EbitdaSourceWrite } from "@/lib/financialMetrics";

export type EbitdaSourceDraft = { profileId: string; forecast: boolean; growth: string; margin: string; mode: "automatic" | "manual"; selectedFileId: string; excludedFileIds: string[]; reason: string; revision: number; sourceStamp: string; idempotencyKey: string };

export function ebitdaSourceDraft(profileId: string, selection: EbitdaSourceSelection): EbitdaSourceDraft {
  return { profileId, forecast: !!selection.forecast_assumptions, growth: selection.forecast_assumptions ? String(selection.forecast_assumptions.revenue_growth_pct) : "", margin: selection.forecast_assumptions?.ebitda_margin_pct != null ? String(selection.forecast_assumptions.ebitda_margin_pct) : "", mode: selection.mode, selectedFileId: selection.mode === "manual" ? selection.selected_file_id ?? "" : "", excludedFileIds: [...selection.excluded_file_ids], reason: "", revision: selection.revision, sourceStamp: selection.source_stamp, idempotencyKey: crypto.randomUUID() };
}
export function ebitdaSourceStatus(source: EbitdaSource, selection?: EbitdaSourceSelection) {
  if (!source.eligible) return source.kind === "personal_tax_return" ? "Personal return · excluded automatically" : "Not eligible for business EBITDA";
  if (selection?.excluded_file_ids.includes(source.file_id)) return "Excluded from EBITDA by staff";
  if (source.selected) return "Current EBITDA baseline";
  return "Available business source · not in current baseline";
}
export function ebitdaSourceDraftStale(draft: EbitdaSourceDraft, selection: EbitdaSourceSelection) {
  return draft.revision !== selection.revision || draft.sourceStamp !== selection.source_stamp;
}
export function ebitdaSourceWrite(profileId: string, selection: EbitdaSourceSelection, draft: EbitdaSourceDraft): EbitdaSourceWrite {
  if (draft.profileId !== profileId) throw new Error("This source selection belongs to another file. Reopen it on the current file.");
  if (ebitdaSourceDraftStale(draft, selection)) throw new Error("Financial sources changed. Reload the latest source selection before saving.");
  const eligible = new Set(selection.sources.filter((source) => source.eligible).map((source) => source.file_id));
  if (draft.mode === "manual" && (!eligible.has(draft.selectedFileId) || draft.excludedFileIds.includes(draft.selectedFileId))) throw new Error("Choose an eligible, included business source for the EBITDA baseline.");
  if (draft.reason.trim().length < 8) throw new Error("Explain the reviewed source selection in at least eight characters.");
  const growth = Number(draft.growth), margin = draft.margin.trim() ? Number(draft.margin) : null;
  if (draft.forecast && (!draft.growth.trim() || !Number.isFinite(growth) || growth < -100 || growth > 1000 || margin != null && (!Number.isFinite(margin) || margin < -1000 || margin > 100))) throw new Error("Enter reviewed revenue growth between -100% and 1,000%, and an EBITDA margin between -1,000% and 100% if supplied.");
  return { forecast_assumptions: draft.forecast ? { revenue_growth_pct: growth, ebitda_margin_pct: margin } : null, mode: draft.mode, selected_file_id: draft.mode === "manual" ? draft.selectedFileId : null, excluded_file_ids: [...new Set(draft.excludedFileIds.filter((id) => eligible.has(id)))].sort(), reason: draft.reason.trim(), expected_revision: draft.revision, source_stamp: draft.sourceStamp, idempotency_key: draft.idempotencyKey };
}
