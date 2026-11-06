import type { AuthedApi } from "./worksheetApi";
import type { FinancialWorkspaceSnapshot } from "./financialWorkspaceApi";
import type { PayeeKind, RecurringPayee } from "./financialCockpit";

export type FinancialDebtCandidate = {
  key: string; vendor_key: string; payee: string; kind: PayeeKind; kind_label: string;
  monthly_average: number | null; accounts: string[]; file_ids: string[];
  source_refs: Array<{ file_id?: string; file_name?: string; page?: number | null; account?: string; month?: string }>;
  status: "unreviewed" | "included" | "disabled"; row_id: string | null;
  binding?: "existing" | "created" | null; possible_row_ids?: string[];
  related_rows?: Array<{ row_id: string; lender: string; status: string }>;
  eligible: boolean; reason: string; account_key?: string; account_label?: string;
  cadence?: string | null; average_amount?: number | null; occurrences?: number;
  months_seen?: number; monthly?: Record<string, number>; rationale?: string; same_amount?: boolean | null;
};
export type FinancialDebtReviewWorkspace = Pick<FinancialWorkspaceSnapshot, "family_id" | "body" | "draft" | "completion" | "accepted_completion" | "accepted_version_id" | "current_version_id">;
export type FinancialDebtReview = {
  workspace: FinancialDebtReviewWorkspace;
  candidates: FinancialDebtCandidate[];
  working: { complete: boolean; active_rows: number; monthly: number | null };
  published: { version_id: string | null; complete: boolean; monthly: number | null };
  unresolved_previous_selections?: Array<{ id?: string; key?: string; lender?: string; reason?: string } | string>;
};
export type FinancialDebtReviewResponse = Omit<FinancialDebtReview, "workspace"> & { workspace: FinancialWorkspaceSnapshot };
export type CandidateAction = "include" | "disable" | "restore" | "link_existing";
const base = (profileId: string) => `/application-profiles/${encodeURIComponent(profileId)}/financial-workspace/debt-review`;
export const readFinancialDebtReview = (api: AuthedApi, profileId: string) => api<FinancialDebtReviewResponse>(base(profileId));
export const actOnFinancialDebtCandidate = (api: AuthedApi, profileId: string, review: FinancialDebtReview, candidateKey: string, action: CandidateAction, idempotencyKey: string, targetRowId?: string) => api<FinancialDebtReviewResponse>(`${base(profileId)}/actions`, {
  method: "POST", body: JSON.stringify({ family_id: review.workspace.family_id, expected_revision: review.workspace.draft.revision, candidate_key: candidateKey, action, idempotency_key: idempotencyKey, ...(targetRowId ? { target_row_id: targetRowId } : {}) }),
});

export type RecurringReviewRow = { key: string; payee: RecurringPayee; candidate: FinancialDebtCandidate | null };
/** Keep separate account-scoped candidates separate, even when their lender names match. */
export function recurringReviewRows(payees: RecurringPayee[], candidates: FinancialDebtCandidate[]): RecurringReviewRow[] {
  const rows: RecurringReviewRow[] = [];
  const covered = new Set<string>();
  for (const payee of payees) {
    const matches = candidates.filter((candidate) => candidate.vendor_key === payee.key);
    if (!matches.length) rows.push({ key: payee.key, payee, candidate: null });
    for (const candidate of matches) {
      covered.add(candidate.key);
      rows.push({ key: candidate.key, candidate, payee: {
        ...payee, key: candidate.key, payee: candidate.payee,
        monthly_average: candidate.monthly_average, accounts: candidate.accounts,
        kind: candidate.kind, kind_label: candidate.kind_label, file_ids: candidate.file_ids,
        monthly: candidate.monthly ?? {}, cadence: candidate.cadence ?? null, same_amount: candidate.same_amount ?? null,
        average_amount: candidate.average_amount ?? null, occurrences: candidate.occurrences ?? 0,
        months_seen: candidate.months_seen ?? 0, rationale: candidate.rationale ?? candidate.reason,
      } });
    }
  }
  for (const candidate of candidates.filter((candidate) => !covered.has(candidate.key))) rows.push({ key: candidate.key, candidate, payee: {
    key: candidate.key, payee: candidate.payee, kind: candidate.kind, kind_label: candidate.kind_label,
    monthly_average: candidate.monthly_average, accounts: candidate.accounts, file_ids: candidate.file_ids,
    rationale: candidate.rationale ?? candidate.reason, monthly: candidate.monthly ?? {}, cadence: candidate.cadence ?? null,
    average_amount: candidate.average_amount ?? null, occurrences: candidate.occurrences ?? 0,
    months_seen: candidate.months_seen ?? 0, months: Object.keys(candidate.monthly ?? {}), total: null,
    same_amount: null, accepted: false, first_date: null, last_date: null, is_debt: false, is_card: false,
  } });
  return rows;
}

export const candidateDecisionLabel = (candidate: FinancialDebtCandidate | null) => candidate?.status === "included" ? "Linked schedule row" : candidate?.status === "disabled" ? "Disabled candidate" : candidate ? "Unreviewed candidate" : "Observed payment";
export function reviewPage<T>(rows: T[], page: number, size = 8) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  return { page: current, pages, items: rows.slice(current * size, (current + 1) * size) };
}
