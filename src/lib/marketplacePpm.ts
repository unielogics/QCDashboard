import { isMarketplaceField, marketplacePublishIssues, type MarketplaceIssue } from "./marketplaceIssues";
import type { MarketplaceMembershipPolicy } from "./marketplaceMembership";

export type PpmMissing = { key: string; label: string; section: "terms" | "documents" | "budget" | "coverage_plan" | "client_terms" | "use_of_funds" | "snapshot" | "legal"; required: boolean };
export type PpmDocument = { title: string; listing_ref: string; issuer: string; source_fingerprint: string; sections: Array<{ key: string; title: string; paragraphs: string[]; facts: Array<{ label: string; value: string; note?: string | null }>; table?: { columns: string[]; rows: string[][] } | null }>; missing: PpmMissing[]; warnings: string[] };
export type PpmLegalPreset = { key: string; label: string; text: string; unresolved?: boolean };
export type PpmLegalField = { key: string; label: string; required: boolean; options?: PpmLegalPreset[]; default_value?: string | null; default_preset?: string | null; help?: string | null; read_only?: boolean };
export type PpmVersion = { document_id: string; version: number; source: "generated_ppm" | "uploaded"; status: "draft" | "approved" | "superseded"; source_fingerprint: string; stale: boolean; created_at: string; reviewed_at: string | null; document: PpmDocument; legal_inputs: Record<string, string>; legal_presets?: Record<string, string>; narrative_sections: Record<string, string>; ai_sections?: Record<string, string> };
export type MarketplacePpm = { managed: boolean; auto_refresh: boolean; status: "not_started" | "draft" | "approved" | "stale"; generation_status: "not_generated" | "source_based" | "ai_draft" | "manual_upload"; source_fingerprint: string; current_draft: PpmVersion | null; current_approved: PpmVersion | null; history: PpmVersion[]; missing: PpmMissing[]; warnings: string[]; legal_fields: PpmLegalField[]; narrative_fields: Array<{ key: string; label: string }>; membership_policy?: MarketplaceMembershipPolicy; legal_defaults?: Record<string, string>; legal_default_presets?: Record<string, string> };
export type PpmEdit = { version: number; sourceFingerprint: string; legalInputs: Record<string, string>; legalPresets: Record<string, string>; narrativeSections: Record<string, string> };
export type PpmGenerate = { expected_source_fingerprint: string; idempotency_key: string; force?: boolean; auto_refresh?: boolean };
export type PpmSave = { expected_version: number; expected_source_fingerprint: string; idempotency_key: string; legal_inputs: Record<string, string>; legal_presets?: Record<string, string>; narrative_sections: Record<string, string> };
export type PpmReview = { expected_version: number; expected_source_fingerprint: string; idempotency_key: string; confirmed: boolean; reason: string };

export const ppmLegalId = (key: string) => `marketplace-ppm-legal-${encodeURIComponent(key)}`;
export const ppmContentKey = (value: PpmEdit | null) => JSON.stringify({ legal: Object.fromEntries(Object.entries(value?.legalInputs ?? {}).sort()), presets: Object.fromEntries(Object.entries(value?.legalPresets ?? {}).sort()), narrative: Object.fromEntries(Object.entries(value?.narrativeSections ?? {}).sort()) });
export function ppmEdit(version: PpmVersion): PpmEdit { return { version: version.version, sourceFingerprint: version.source_fingerprint, legalInputs: { ...version.legal_inputs }, legalPresets: { ...version.legal_presets }, narrativeSections: { ...version.narrative_sections } }; }
export function ppmDirty(edit: PpmEdit | null, base: PpmEdit | null) { return Boolean(edit && base && ppmContentKey(edit) !== ppmContentKey(base)); }
export function ppmSelectedPreset(field: PpmLegalField, edit: PpmEdit): string {
  const key = edit.legalPresets[field.key];
  const preset = field.options?.find(option => option.key === key);
  return preset && preset.text === edit.legalInputs[field.key] ? preset.key : key === "custom" || edit.legalInputs[field.key] ? "custom" : "";
}
export function ppmChoosePreset(edit: PpmEdit, field: PpmLegalField, key: string): PpmEdit {
  if (key === "custom") {
    return { ...edit, legalPresets: { ...edit.legalPresets, [field.key]: "custom" } };
  }
  const preset = field.options?.find(option => option.key === key);
  return preset ? { ...edit, legalInputs: { ...edit.legalInputs, [field.key]: preset.text }, legalPresets: { ...edit.legalPresets, [field.key]: preset.key } } : edit;
}
export function ppmSetLegalText(edit: PpmEdit, key: string, text: string): PpmEdit {
  return { ...edit, legalInputs: { ...edit.legalInputs, [key]: text }, legalPresets: { ...edit.legalPresets, [key]: "custom" } };
}
export function ppmMissingLegalKey(missing: PpmMissing, fields: MarketplacePpm["legal_fields"]): string | null {
  if (missing.section !== "legal" && missing.key !== "currency") return null;
  const key = missing.key === "currency" ? "offering_currency" : missing.key;
  return fields.some(field => field.key === key) ? key : null;
}
export const ppmEditableVersion = (state: MarketplacePpm | undefined) => state?.current_draft ?? state?.current_approved ?? null;
export const ppmIsLegacy = (state: MarketplacePpm | undefined) => Boolean(state && !state.managed && state.current_approved?.source === "uploaded" && !state.current_draft);
export function ppmConflict(edit: PpmEdit | null, state: MarketplacePpm | undefined) { return !ppmIsLegacy(state) && Boolean(edit && state && (edit.version !== ppmEditableVersion(state)?.version || edit.sourceFingerprint !== state.source_fingerprint)); }
export function ppmNeedsRefresh(state: MarketplacePpm) {
  if (!state.managed && state.current_approved?.source === "uploaded") return false;
  if (!state.current_draft && state.current_approved && !state.current_approved.stale && state.current_approved.source_fingerprint === state.source_fingerprint) return false;
  return !state.current_draft || state.current_draft.stale || state.current_draft.source_fingerprint !== state.source_fingerprint;
}
export function ppmCanReview(state: MarketplacePpm | undefined, dirty: boolean, conflict: boolean) {
  const draft = state?.current_draft;
  return Boolean(draft && !draft.stale && draft.source_fingerprint === state?.source_fingerprint && !state?.missing.some(item => item.required) && !dirty && !conflict && !(state?.current_approved?.document_id === draft.document_id && !state.current_approved.stale));
}
export function ppmApplyEditsToLatest(base: PpmEdit, edit: PpmEdit, latest: PpmVersion): PpmEdit {
  const next = ppmEdit(latest);
  const legalKeys = new Set([...Object.keys(base.legalInputs), ...Object.keys(edit.legalInputs), ...Object.keys(base.legalPresets), ...Object.keys(edit.legalPresets)]);
  for (const key of legalKeys) {
    if (base.legalInputs[key] === edit.legalInputs[key] && base.legalPresets[key] === edit.legalPresets[key]) continue;
    // A switch to custom pins the displayed wording, even if its text did not
    // change. Keep that intent and its wording together across a source rebase.
    for (const kind of ["legalInputs", "legalPresets"] as const) {
      if (Object.hasOwn(edit[kind], key)) next[kind][key] = edit[kind][key];
      else delete next[kind][key];
    }
  }
  for (const key of new Set([...Object.keys(base.narrativeSections), ...Object.keys(edit.narrativeSections)])) {
    if (base.narrativeSections[key] === edit.narrativeSections[key]) continue;
    if (Object.hasOwn(edit.narrativeSections, key)) next.narrativeSections[key] = edit.narrativeSections[key];
    else delete next.narrativeSections[key];
  }
  return next;
}
export function ppmMissingIssue(missing: PpmMissing, linked: boolean): MarketplaceIssue | null {
  if (missing.section === "legal") return null;
  const known: Record<string, string> = { name_required: "name", note_rate_required: "note_rate_pct", term_required: "term_months", offered_amount_required: "offered_amount", minimum_investment_required: "minimum_investment", minimum_exceeds_offered: "minimum_investment" };
  const field = known[missing.key] ?? missing.key;
  if (missing.section === "terms" && !isMarketplaceField(field)) return null;
  const issue = marketplacePublishIssues([], [{ code: missing.key, message: missing.label, section: missing.section, field: missing.section === "terms" ? field : undefined, document_kind: missing.section === "documents" ? "ppm" : undefined }], { linked })[0];
  return issue?.target ? issue : null;
}
