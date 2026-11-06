import type { AuthedApi } from "./worksheetApi";
import { meaningfulFinancialDebts, type FinancialDebtRow, type FinancialWorkspaceSnapshot } from "./financialWorkspaceApi";

export type DebtIntakeMode = "documents" | "banking";
export type DebtIntakeProposal = { id: string; lender: string; body: FinancialDebtRow; file_ids: string[]; file_names: string[]; warnings: string[]; eligible: boolean; reason: string };
export type DebtIntakeReview = { family_id: string; revision: number; mode: DebtIntakeMode; blocked_reason: string | null; proposals: DebtIntakeProposal[]; source_count: number; warnings: string[] };

export function canDraftDebtIntake(workspace: FinancialWorkspaceSnapshot) {
  return workspace.body.no_debt !== true && !workspace.completion?.complete && !workspace.accepted_completion?.complete;
}
export function hasPendingDebtIntakeReview(workspace: FinancialWorkspaceSnapshot) {
  const review = workspace.body.debt_intake_review as { status?: string } | undefined;
  return workspace.body.no_debt !== true && review?.status === "pending_review" && !(workspace.accepted_completion?.complete && !workspace.draft.dirty);
}
export function debtIntakeValue(value: unknown) {
  return value == null || String(value).trim() === "" ? "needed" : String(value);
}
export function debtIntakeIsEmpty(workspace: FinancialWorkspaceSnapshot) {
  return !meaningfulFinancialDebts(workspace.body).length && canDraftDebtIntake(workspace);
}
const root = (profileId: string) => `/application-profiles/${encodeURIComponent(profileId)}/financial-workspace/debt-intake`;
export function proposeDebtIntake(api: AuthedApi, profileId: string, workspace: FinancialWorkspaceSnapshot, mode: DebtIntakeMode) {
  return api<DebtIntakeReview>(`${root(profileId)}/proposals`, { method: "POST", body: JSON.stringify({ mode, expected_revision: workspace.draft.revision, family_id: workspace.family_id }) });
}
export function applyDebtIntake(api: AuthedApi, profileId: string, review: DebtIntakeReview, selectedIds: string[], idempotencyKey: string) {
  return api<FinancialWorkspaceSnapshot>(`${root(profileId)}/apply`, { method: "POST", body: JSON.stringify({ mode: review.mode, family_id: review.family_id, expected_revision: review.revision, selected_ids: selectedIds, idempotency_key: idempotencyKey }) });
}
