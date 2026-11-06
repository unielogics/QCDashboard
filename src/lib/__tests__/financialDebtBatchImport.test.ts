import { describe, expect, it, vi } from "vitest";
import { applyDebtBatchImport, blankDebtBatchChoice, debtBatchApplyAttempt, debtBatchChoiceReady, debtBatchMappingConflict, debtBatchReviewReady, reconcileDebtBatchChoices, refreshDebtBatchImport, selectDebtBatchMapping, stageDebtBatchImport, type DebtBatchCandidate, type DebtBatchChoice, type DebtBatchReview } from "../financialDebtBatchImport";
import type { AuthedApi } from "../worksheetApi";
import type { FinancialWorkspaceSnapshot } from "../financialWorkspaceApi";

const source = { file_id: "source-A", kind: "image", content_hash: "a".repeat(64) };
const candidate: DebtBatchCandidate = { id: "SBA-reference-1", lender: "SBA", loan_reference: "COV6002057805", suggested_action: "review", source_file_ids: ["source-A", "source-B"], possible_duplicate_row_ids: ["existing"], warnings: [], mappings: [
  { key: "A.balance", field: "balance", value: "1000", source, confidence: "needs_review" },
  { key: "B.balance", field: "balance", value: "1200", source: { ...source, file_id: "source-B" }, confidence: "needs_review" },
  { key: "A.lender", field: "lender", value: "SBA", source, confidence: "needs_review" },
] };
const rows = [{ id: "existing", lender: "SBA", balance: "900", status: "active" as const }, { id: "separate", lender: "SBA", balance: "1200", status: "active" as const }, { id: "removed", status: "dismissed" as const }];
const choice = (changes: Partial<DebtBatchChoice> = {}): DebtBatchChoice => ({ action: "update", target_row_id: "existing", selected_keys: ["A.balance"], confirmed: true, ...changes });
const review = { id: "batch", family_id: "family", base_revision: 12, status: "proposed", candidates: [candidate], files: [] } as DebtBatchReview;

describe("reviewed debt batch decisions", () => {
  it("replaces a conflicting source alternative without dropping other selected fields", () => {
    expect(selectDebtBatchMapping(candidate, ["A.balance", "A.lender"], "B.balance", true)).toEqual(["A.lender", "B.balance"]);
    expect(selectDebtBatchMapping(candidate, ["A.balance", "A.lender"], "A.balance", false)).toEqual(["A.lender"]);
  });
  it("compares conflicts to the exact chosen row, including separate loans at one lender", () => {
    const mapping = candidate.mappings[1];
    expect(debtBatchMappingConflict(mapping, choice(), rows)).toBe(true);
    expect(debtBatchMappingConflict(mapping, choice({ target_row_id: "separate" }), rows)).toBe(false);
    expect(debtBatchMappingConflict(mapping, choice({ action: "create" }), rows)).toBe(false);
  });
  it("requires a deliberate action, valid active destination, selected fields, and confirmation", () => {
    expect(debtBatchChoiceReady(candidate, blankDebtBatchChoice(), rows)).toBe(false);
    for (const changes of [{ confirmed: false }, { target_row_id: "missing" }, { target_row_id: "removed" }, { selected_keys: [] }, { selected_keys: ["invented"] }, { selected_keys: ["A.balance", "B.balance"] }]) expect(debtBatchChoiceReady(candidate, choice(changes), rows)).toBe(false);
    expect(debtBatchChoiceReady(candidate, choice(), rows)).toBe(true);
  });
  it("allows explicit link-only or skip without inventing financial answers", () => {
    expect(debtBatchChoiceReady(candidate, choice({ action: "link", selected_keys: [] }), rows)).toBe(true);
    expect(debtBatchChoiceReady(candidate, choice({ action: "link" }), rows)).toBe(false);
    expect(debtBatchChoiceReady(candidate, choice({ action: "skip", target_row_id: "", selected_keys: [], confirmed: false }), rows)).toBe(true);
  });
  it("finishes an all-skip review without requiring a financial change", () => {
    const choices = { [candidate.id]: choice({ action: "skip", selected_keys: [] }) };
    expect(debtBatchReviewReady(review, choices, rows, 12)).toBe(true);
    expect(debtBatchReviewReady(review, choices, rows, 13)).toBe(false);
    expect(debtBatchReviewReady({ ...review, status: "processing" }, choices, rows, 12)).toBe(false);
    expect(debtBatchReviewReady({ ...review, candidates: [] }, {}, rows, 12)).toBe(true);
  });
  it("retains exact source destinations and selections across refresh but requires a new confirmation", () => {
    const original = { [candidate.id]: choice({ selected_keys: ["A.balance", "removed-source-key"] }), unrelated: choice() };
    expect(reconcileDebtBatchChoices(review, original)).toEqual({ [candidate.id]: choice({ confirmed: false }) });
    expect(original[candidate.id].confirmed).toBe(true);
    const pending = reconcileDebtBatchChoices({ ...review, status: "processing", candidates: [] }, original);
    expect(pending[candidate.id].target_row_id).toBe("existing");
    expect(pending[candidate.id].selected_keys).toEqual(["A.balance", "removed-source-key"]);
    expect(pending[candidate.id].confirmed).toBe(false);
    expect(reconcileDebtBatchChoices(review, pending)).toEqual({ [candidate.id]: choice({ confirmed: false }) });
  });
  it("requires a second explicit confirmation before adding a possible duplicate as a separate loan", () => {
    const possible = { ...candidate, requires_separate_loan_confirmation: true };
    expect(debtBatchChoiceReady(possible, choice({ action: "create", target_row_id: "" }), rows)).toBe(false);
    expect(debtBatchChoiceReady(possible, choice({ action: "create", target_row_id: "", confirm_separate_loan: true }), rows)).toBe(false);
    expect(debtBatchChoiceReady(possible, choice({ action: "create", target_row_id: "", selected_keys: ["A.lender", "A.balance"], confirm_separate_loan: true }), rows)).toBe(true);
  });
  it("submits one atomic draft apply with unchanged source keys and retry identity", async () => {
    const api = vi.fn().mockResolvedValue({}) as unknown as AuthedApi;
    const decisions = [{ candidate_id: candidate.id, action: "update" as const, target_row_id: "existing", selected_keys: ["B.balance"], confirmed: true }];
    await applyDebtBatchImport(api, "profile", review, 12, decisions, "same-retry-key");
    await applyDebtBatchImport(api, "profile", review, 12, decisions, "same-retry-key");
    const calls = vi.mocked(api).mock.calls;
    expect(calls[0]).toEqual(calls[1]);
    expect(JSON.parse(calls[0][1]!.body as string)).toEqual({ expected_revision: 12, idempotency_key: "same-retry-key", decisions });
    expect(calls[0][0]).toMatch(/debt-batch-imports\/batch\/apply$/);
  });
  it("replays an uncertain apply with the original revision after the current draft advances", () => {
    const decisions = [{ candidate_id: candidate.id, action: "link" as const, target_row_id: "existing", selected_keys: [], confirmed: true }];
    const original = debtBatchApplyAttempt(review, decisions, 12, null, () => "original-key");
    const retry = debtBatchApplyAttempt(review, decisions, 13, original, () => "must-not-replace-key");
    expect(retry).toBe(original); expect(retry).toMatchObject({ revision: 12, key: "original-key" });
    expect(() => debtBatchApplyAttempt(review, [{ ...decisions[0], target_row_id: "separate" }], 13, original, () => "new-key")).toThrow("working schedule changed");
  });
  it("deduplicates received file IDs without inferring lender identity, and explicitly refreshes stale review", async () => {
    const api = vi.fn().mockResolvedValue({}) as unknown as AuthedApi;
    const workspace = { family_id: "family", draft: { revision: 13 } } as FinancialWorkspaceSnapshot;
    await stageDebtBatchImport(api, "profile", workspace, ["file-A", "file-A", "file-B"], "read-key");
    expect(JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string)).toMatchObject({ file_ids: ["file-A", "file-B"], family_id: "family", expected_revision: 13 });
    await refreshDebtBatchImport(api, "profile", review, 13, "refresh-key");
    expect(vi.mocked(api).mock.calls[1][0]).toMatch(/batch\/refresh$/);
    expect(JSON.parse(vi.mocked(api).mock.calls[1][1]!.body as string)).toEqual({ expected_revision: 13, idempotency_key: "refresh-key" });
  });
});
