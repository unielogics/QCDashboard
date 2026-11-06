import type { AuthedApi } from "./worksheetApi";
import { financialMappingConflict, type FinancialDebtRow, type FinancialImport, type FinancialWorkspaceSnapshot } from "./financialWorkspaceApi";

export type DebtBatchMapping = FinancialImport["mappings"][number] & { field: string };
export type DebtBatchCandidate = {
  id: string; lender: string | null; loan_reference: string | null; source_file_ids: string[];
  suggested_action: "create" | "update" | "review"; suggested_target_row_id?: string | null;
  reference_strength?: "full" | "partial" | "missing"; requires_separate_loan_confirmation?: boolean;
  possible_duplicate_row_ids: string[]; warnings: string[]; mappings: DebtBatchMapping[];
};
export type DebtBatchReview = {
  id: string; family_id: string; base_revision: number; status: "queued" | "processing" | "proposed" | "applied";
  progress?: { total: number; done: number };
  files: Array<{ file_id: string; file_name: string; content_hash?: string | null; content_type?: string | null; status: "queued" | "processing" | "ready" | "duplicate" | "ambiguous" | "unreadable" | "unavailable"; error?: string | null; duplicate_of_file_id?: string | null; candidate_ids: string[] }>;
  candidates: DebtBatchCandidate[];
};
export type DebtBatchChoice = {
  action: "" | "create" | "update" | "link" | "skip"; target_row_id: string; selected_keys: string[]; confirmed: boolean; confirm_separate_loan?: boolean;
};
export type DebtBatchDecision = Omit<DebtBatchChoice, "action" | "target_row_id"> & { candidate_id: string; action: Exclude<DebtBatchChoice["action"], "">; target_row_id?: string };
export type DebtBatchApplyAttempt = { signature: string; key: string; revision: number };
export const debtBatchApplySignature = (review: DebtBatchReview, decisions: DebtBatchDecision[]) => JSON.stringify([review.id, decisions]);
/** An uncertain response must replay the original accepted command, even after its revision advances. */
export function debtBatchApplyAttempt(review: DebtBatchReview, decisions: DebtBatchDecision[], revision: number, prior: DebtBatchApplyAttempt | null, createKey: () => string): DebtBatchApplyAttempt {
  const signature = debtBatchApplySignature(review, decisions);
  if (prior?.signature === signature) return prior;
  if (revision !== review.base_revision) throw new Error("The working schedule changed. Refresh this batch review against the current draft before applying.");
  return { signature, key: createKey(), revision };
}
export const blankDebtBatchChoice = (): DebtBatchChoice => ({ action: "", target_row_id: "", selected_keys: [], confirmed: false });
export const debtBatchField = (mapping: DebtBatchMapping) => mapping.field || mapping.key.slice(mapping.key.lastIndexOf(".") + 1);
export function debtBatchMappingConflict(mapping: DebtBatchMapping, choice: DebtBatchChoice, rows: FinancialDebtRow[]): boolean {
  const row = rows.find((item) => item.id === choice.target_row_id);
  return choice.action === "update" && financialMappingConflict(row?.[debtBatchField(mapping)], mapping.value);
}
/** Two source alternatives for one answer cannot both be accepted. */
export function selectDebtBatchMapping(candidate: DebtBatchCandidate, selected: string[], key: string, checked: boolean): string[] {
  if (!checked) return selected.filter((item) => item !== key);
  const mapping = candidate.mappings.find((item) => item.key === key);
  if (!mapping) return selected;
  const field = debtBatchField(mapping);
  return [...selected.filter((item) => candidate.mappings.find((other) => other.key === item && debtBatchField(other) === field) == null), key];
}
export function debtBatchChoiceReady(candidate: DebtBatchCandidate, choice: DebtBatchChoice, rows: FinancialDebtRow[]): boolean {
  if (!choice.action) return false;
  if (choice.action === "skip") return true;
  if (!choice.confirmed) return false;
  if (choice.action === "create" && candidate.requires_separate_loan_confirmation && !choice.confirm_separate_loan) return false;
  if (choice.action !== "create" && !rows.some((row) => row.id === choice.target_row_id && (row.status ?? "active") === "active" && !row.duplicate_of_id)) return false;
  if (choice.action === "link") return choice.selected_keys.length === 0;
  if (!choice.selected_keys.length) return false;
  const mappings = choice.selected_keys.map((key) => candidate.mappings.find((mapping) => mapping.key === key));
  if (mappings.some((mapping) => !mapping)) return false;
  if (choice.action === "create" && !mappings.some((mapping) => debtBatchField(mapping!) === "lender" && String(mapping!.value ?? "").trim())) return false;
  const fields = mappings.map((mapping) => debtBatchField(mapping!));
  return new Set(fields).size === fields.length;
}
export function debtBatchReviewReady(review: DebtBatchReview, choices: Record<string, DebtBatchChoice>, rows: FinancialDebtRow[], revision: number): boolean {
  return review.status === "proposed" && review.base_revision === revision
    && review.candidates.every((candidate) => debtBatchChoiceReady(candidate, choices[candidate.id] ?? blankDebtBatchChoice(), rows));
}
/** Retain exact source identities across retries; refreshed answers require confirmation again. */
export function reconcileDebtBatchChoices(review: DebtBatchReview, choices: Record<string, DebtBatchChoice>): Record<string, DebtBatchChoice> {
  const pending = review.status === "queued" || review.status === "processing";
  const ids = pending ? Object.keys(choices) : review.candidates.map((candidate) => candidate.id);
  return Object.fromEntries(ids.flatMap((id) => choices[id] && ["", "create", "update", "link", "skip"].includes(choices[id].action) && Array.isArray(choices[id].selected_keys) ? [[id, {
    ...choices[id], selected_keys: choices[id].selected_keys.filter((key) => typeof key === "string" && (pending || review.candidates.find((candidate) => candidate.id === id)?.mappings.some((mapping) => mapping.key === key))), confirmed: false,
  }]] : []));
}
const root = (profileId: string) => `/application-profiles/${encodeURIComponent(profileId)}/financial-workspace/debt-batch-imports`;
export function stageDebtBatchImport(api: AuthedApi, profileId: string, workspace: FinancialWorkspaceSnapshot, fileIds: string[], key: string) {
  return api<DebtBatchReview>(root(profileId), { method: "POST", body: JSON.stringify({ family_id: workspace.family_id, expected_revision: workspace.draft.revision, file_ids: [...new Set(fileIds)], idempotency_key: key, role: "supporting" }) });
}
export function retryDebtBatchImport(api: AuthedApi, profileId: string, review: DebtBatchReview, revision: number, fileIds: string[]) {
  return api<DebtBatchReview>(`${root(profileId)}/${encodeURIComponent(review.id)}/retry`, { method: "POST", body: JSON.stringify({ expected_revision: revision, file_ids: fileIds }) });
}
export function readDebtBatchImport(api: AuthedApi, profileId: string, batchId: string) {
  return api<DebtBatchReview>(`${root(profileId)}/${encodeURIComponent(batchId)}`);
}
export function listDebtBatchImports(api: AuthedApi, profileId: string, familyId: string) {
  return api<{ items: DebtBatchReview[] }>(`${root(profileId)}?${new URLSearchParams({ family_id: familyId })}`);
}
export function refreshDebtBatchImport(api: AuthedApi, profileId: string, review: DebtBatchReview, revision: number, key: string) {
  return api<DebtBatchReview>(`${root(profileId)}/${encodeURIComponent(review.id)}/refresh`, { method: "POST", body: JSON.stringify({ expected_revision: revision, idempotency_key: key }) });
}
export function applyDebtBatchImport(api: AuthedApi, profileId: string, review: DebtBatchReview, revision: number, decisions: DebtBatchDecision[], key: string) {
  return api<FinancialWorkspaceSnapshot>(`${root(profileId)}/${encodeURIComponent(review.id)}/apply`, { method: "POST", body: JSON.stringify({ expected_revision: revision, idempotency_key: key, decisions }) });
}
