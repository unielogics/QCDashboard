import { describe, expect, it, vi } from "vitest";
import { activeFinancialDebts, financialDebtReviewSummary, actOnFinancialDebt, applyFinancialCells, applyFinancialImport, financialValues, financialLayout, financialDebtTotals, readFinancialWorkspace, restoreFinancialVersion, saveFinancialDraft, saveFinancialVersion, financialMappingConfidence, financialMappingConflict, clearEditedDebtSources, stageDebtDocumentImport, savedFinancialCompletion, financialVersionPublicationState, type FinancialWorkspaceSnapshot } from "../financialWorkspaceApi";
import type { SheetLayout } from "@/components/sheet/types";

const layout: SheetLayout = {
  kind: "debt_schedule", title: "Debt schedule", schema_version: "v1", layout_version: "v1", name_prefix: "ds", freeze: [1, 1], columns: [{ c: 1 }, { c: 2 }],
  rows: [
    { r: 1, kind: "field", cells: [{ c: 1, type: "text", key: "business_name", path: ["business_name"] }] },
    { r: 2, kind: "data", row_key: "debt-a", block: "debts", cells: [{ c: 1, type: "text", key: "debt-a.lender", path: ["debts", "debt-a", "lender"] }, { c: 2, type: "money", key: "debt-a.balance", path: ["debts", "debt-a", "balance"] }] },
    { r: 3, kind: "data", row_key: "debt-b", block: "debts", cells: [{ c: 1, type: "text", key: "debt-b.lender", path: ["debts", "debt-b", "lender"] }, { c: 2, type: "money", key: "debt-b.balance", path: ["debts", "debt-b", "balance"] }] },
  ],
};
const body = {
  business_name: "Little Star Therapy",
  debts: [
    { id: "debt-b", lender: "Oakwood LLC", balance: "80000", origin: "ai_draft", status: "duplicate", duplicate_of_id: "debt-a", evidence_links: [{ file_id: "payoff-b", role: "payoff", is_current: true }] },
    { id: "debt-a", lender: "Oakwood", balance: "80000", origin: "admin", status: "active", evidence_links: [{ file_id: "contract-a", role: "agreement" }] },
  ],
};
const snapshot = { kind: "debt_schedule", family_id: "family-a", body, draft: { revision: 7, base_version_id: "version-2" } } as unknown as FinancialWorkspaceSnapshot;

describe("the shared financial draft", () => {
  it("keeps operating expense and action rows linked across the form and worksheet", () => {
    const sheet: SheetLayout = { ...layout, kind: "operating_plan", rows: [{ r: 1, kind: "data", row_key: "expense", block: "expenses", cells: [{ c: 1, type: "money", key: "expenses.expense.current_amount", path: ["expenses", "expense", "current_amount"] }] }, { r: 2, kind: "data", row_key: "action", block: "adjustments", cells: [{ c: 1, type: "money", key: "adjustments.action.proposed_amount", path: ["adjustments", "action", "proposed_amount"] }] }] };
    const data = { expenses: [{ id: "expense", current_amount: "3000", cadence: "monthly" }], adjustments: [{ id: "action", expense_row_id: "expense", current_amount: "3000", proposed_amount: "2500", cadence: "monthly", status: "approved", review_source_stamp: "old" }] };
    const next = applyFinancialCells(data, sheet, [{ sheet: "operating_plan", key: "expenses.expense.current_amount", value: "3200" }]);
    expect((next.expenses as Array<{current_amount:number}>)[0].current_amount).toBe(3200);
    expect((next.adjustments as unknown[])[0]).toMatchObject({ current_amount: 3200, proposed_amount: 2500, status: "proposed", review_source_stamp: null });
    const empty = applyFinancialCells({}, sheet, [{ sheet: "operating_plan", key: "expenses.expense.current_amount", value: "3200" }]);
    expect(Array.isArray(empty.expenses)).toBe(true);
  });
  it("shows working draft counts separately from the accepted schedule", () => {
    const complete = { complete: true, missing_fields: [], reason: "Complete", no_debt: false, active_rows: 2 };
    const pending = { ...complete, complete: false, missing_fields: ["debt-a.monthly_payment"], active_rows: 1 };
    const saved = { ...snapshot, current_version_id: "version-2", evidence: [], completion: pending, accepted_completion: complete };
    expect(financialDebtReviewSummary(saved)).toMatchObject({ onSchedule: 1, missingAnswers: 1, read: 0, publishedComplete: true, publishedRows: 2, draftComplete: false });
    expect(financialDebtReviewSummary({ ...saved, completion: complete, accepted_completion: pending })).toMatchObject({ onSchedule: 1, missingAnswers: 0, draftComplete: true, publishedComplete: false, publishNeeded: true });
    expect(financialDebtReviewSummary({ ...saved, current_version_id: null, accepted_completion: null })).toMatchObject({ onSchedule: 1, read: 1, missingAnswers: 1, publishedComplete: false });
  });
  it("does not replace a completed working schedule with the empty original PDF's completion", () => {
    const complete = { complete: true, missing_fields: [], reason: "Complete", no_debt: false, active_rows: 1 };
    const original = { ...snapshot, current_version_id: "original-v1", evidence: [], completion: complete, accepted_completion: null };
    expect(financialDebtReviewSummary(original)).toMatchObject({ onSchedule: 1, missingAnswers: 0, draftComplete: true, publishedComplete: false, publishNeeded: true, removed: 1 });
  });
  it("ignores fully blank editor placeholders while retaining legitimate lender-only obligations", () => {
    const value = { debts: [{ id: "complete", lender: "Bank", balance: "100", monthly_payment: "10" }, { id: "placeholder", status: "active", lender: "", balance: "", monthly_payment: "" }] };
    const complete = { complete: true, missing_fields: [], reason: "Complete", no_debt: false, active_rows: 1 };
    expect(financialDebtReviewSummary({ ...snapshot, body: value, completion: complete, evidence: [] })).toMatchObject({ onSchedule: 1, missingAnswers: 0, removed: 0 });
    expect(financialDebtTotals(value)).toEqual({ total_balance: 100, total_monthly_payment: 10 });
    expect(activeFinancialDebts(value)).toHaveLength(2);
    expect(financialDebtTotals({ debts: [...value.debts, { id: "real-missing", lender: "Another lender" }] })).toEqual({ total_balance: null, total_monthly_payment: null });
    expect(financialDebtTotals({ debts: [value.debts[1]] })).toEqual({ total_balance: null, total_monthly_payment: null });
    expect(financialDebtTotals({ debts: [value.debts[1]], no_debt: true })).toEqual({ total_balance: 0, total_monthly_payment: 0 });
  });
  it("keeps MCA answers before the appended contract terms when building an empty 17-column layout", () => {
    const empty = { ...layout, columns: Array.from({ length: 17 }, (_, index) => ({ c: index + 1 })), rows: [{ r: 1, kind: "colhead" as const, cells: [] }] };
    const sheet = financialLayout({ debts: [{ id: "new", mca_modified: "yes", mca_modification_note: "Reduced daily pull", factor_rate: "1.375", payment_amount: "100", payment_frequency: "daily" }] }, empty);
    const cells = sheet.rows.find((row) => row.kind === "data")!.cells!;
    expect(cells.slice(11).map((cell) => cell.path?.at(-1))).toEqual(["mca_modified", "mca_modification_note", "notes", "factor_rate", "payment_amount", "payment_frequency"]);
    expect(financialValues({ debts: [{ id: "new", factor_rate: "1.375" }] }, sheet)["new.factor_rate"]).toBe("1.375");
  });

  it("requires explicit review before a mapping replaces an existing answer", () => {
    expect(financialMappingConflict("100", "120")).toBe(true);
    expect(financialMappingConflict("0", "120")).toBe(true);
    expect(financialMappingConflict("", "120")).toBe(false);
    expect(financialMappingConflict("100", "100")).toBe(false);
    expect(financialMappingConfidence("high")).toBe("Source verified");
    expect(financialMappingConfidence("needs_review")).toBe("Needs review");
    expect(financialMappingConfidence(0.92)).toBe("92% confidence");
  });
  it("addresses debt cells by stable identity even when rows reorder", () => {
    const next = applyFinancialCells(body, layout, [{ sheet: "debt_schedule", key: "debt-a.balance", value: "75000" }]);
    expect(next.debts).toEqual([body.debts[0], { ...body.debts[1], balance: "75000" }]);
    expect(body.debts[1].balance).toBe("80000");
  });
  it("round trips form and worksheet values without dropping source or duplicate metadata", () => {
    const next = applyFinancialCells(body, layout, [{ sheet: "debt_schedule", key: "debt-b.lender", value: "Oakwood Finance LLC" }]);
    expect(financialValues(next, layout)["debt-b.lender"]).toBe("Oakwood Finance LLC");
    expect((next.debts as typeof body.debts)[0]).toMatchObject({ duplicate_of_id: "debt-a", origin: "ai_draft", evidence_links: body.debts[0].evidence_links });
  });
  it("adds new and excluded debt identities to the local layout before autosave", () => {
    const nextBody = { ...body, debts: [...body.debts, { id: "new-debt", lender: "New lender", status: "active" }] };
    const publishedLayout = { ...layout, rows: layout.rows.filter((row) => row.row_key !== "debt-b") };
    const nextLayout = financialLayout(nextBody, publishedLayout);
    expect(nextLayout.rows.filter((row) => row.kind === "data").map((row) => row.row_key)).toEqual(["debt-b", "debt-a", "new-debt"]);
    expect(financialValues(nextBody, nextLayout)["new-debt.lender"]).toBe("New lender");
    const edited = applyFinancialCells(nextBody, nextLayout, [{ sheet: "debt_schedule", key: "new-debt.balance", value: "5000" }]);
    expect((edited.debts as Record<string, unknown>[]).find((row) => row.id === "new-debt")?.balance).toBe("5000");
  });
  it("filters excluded obligations from totals without destroying them", () => {
    const mixed = { debts: [...body.debts, { id: "removed", status: "dismissed", balance: "100" }] };
    expect(activeFinancialDebts(mixed).map((row) => row.id)).toEqual(["debt-a"]);
    expect(mixed.debts).toHaveLength(3);
  });
  it("distinguishes missing monthly payments from an explicit zero", () => {
    expect(financialDebtTotals({ debts: [{ id: "a", balance: "100", monthly_payment: "" }] })).toEqual({ total_balance: 100, total_monthly_payment: null });
    expect(financialDebtTotals({ debts: [{ id: "a", balance: "100", monthly_payment: "0" }, { id: "duplicate", status: "duplicate" }] })).toEqual({ total_balance: 100, total_monthly_payment: 0 });
    expect(financialDebtTotals({ debts: [{ id: "a", balance: "unknown", monthly_payment: "50" }] })).toEqual({ total_balance: null, total_monthly_payment: 50 });
  });
  it("preserves PFS schedule IDs and other schedule fields when editing the worksheet", () => {
    const pfs = { schedules: { real_estate: [{ id: "home-a", address: "123 Main", market_value: "200000", source_file_id: "pfs-v1" }] } };
    const pfsLayout = { ...layout, kind: "pfs", rows: [{ r: 1, kind: "data", cells: [{ c: 1, type: "money", key: "real_estate.home-a.market_value", path: ["schedules", "real_estate", "home-a", "market_value"] }] }] } as SheetLayout;
    const next = applyFinancialCells(pfs, pfsLayout, [{ sheet: "pfs", key: "real_estate.home-a.market_value", value: "250000" }]);
    expect(next).toEqual({ schedules: { real_estate: [{ ...pfs.schedules.real_estate[0], market_value: "250000" }] } });
  });
  it("ignores keys from another sheet or absent from the server layout", () => {
    expect(applyFinancialCells(body, layout, [{ sheet: "pfs", key: "debt-a.balance", value: "1" }, { sheet: "debt_schedule", key: "untrusted", value: "1" }])).toEqual(body);
  });
  it("native worksheet terms derive monthly on the selected debt while retaining other debts", () => {
    const paymentLayout = { ...layout, rows: [{ r: 2, kind: "data", row_key: "debt-a", block: "debts", cells: [{ c: 1, type: "money", key: "debt-a.payment_amount", path: ["debts", "debt-a", "payment_amount"] }, { c: 2, type: "select", key: "debt-a.payment_frequency", path: ["debts", "debt-a", "payment_frequency"] }] }] } as SheetLayout;
    const next = applyFinancialCells(body, paymentLayout, [{ sheet: "debt_schedule", key: "debt-a.payment_amount", value: "100" }, { sheet: "debt_schedule", key: "debt-a.payment_frequency", value: "daily" }]);
    expect((next.debts as Record<string, unknown>[])[1]).toMatchObject({ monthly_payment: "2100.00", monthly_payment_source: "native_terms" });
    expect((next.debts as Record<string, unknown>[])[0]).toEqual(body.debts[0]);
  });
  it("clears only the replaced field's extracted source after a native correction", () => {
    const sourced = { ...body, field_sources: { "debt-a.balance": { file_id: "contract-a" }, "debt-a.lender": { file_id: "contract-a" } } };
    const edited = applyFinancialCells(sourced, layout, [{ sheet: "debt_schedule", key: "debt-a.balance", value: "75000" }]);
    expect(clearEditedDebtSources(sourced, edited).field_sources).toEqual({ "debt-a.lender": { file_id: "contract-a" } });
  });
});

describe("financial workspace transport", () => {
  it("only claims debt publication for the exact current completed accepted version", () => {
    const complete = { complete: true, missing_fields: [], reason: "Complete", no_debt: false, active_rows: 5 };
    const result = { ...snapshot, current_version_id: "version-2", accepted_version_id: "version-2", saved_completion: complete, accepted_completion: complete };
    expect(financialVersionPublicationState(result, "version-2")).toBe("published");
    for (const changed of [{ saved_completion: { ...complete, complete: false } }, { accepted_completion: { ...complete, complete: false } }, { accepted_version_id: "version-1" }, { accepted_version_id: null }, { accepted_completion: null }]) {
      expect(financialVersionPublicationState({ ...result, ...changed }, "version-2")).toBe("saved_pdf");
    }
  });
  it("does not treat an older successful save replay as the current publication", () => {
    const complete = { complete: true, missing_fields: [], reason: "Complete", no_debt: false, active_rows: 5 };
    expect(financialVersionPublicationState({ ...snapshot, current_version_id: "version-2", accepted_version_id: "version-2", saved_completion: complete, accepted_completion: complete }, "version-1")).toBe("historical");
  });
  it("preserves publication behavior for the other financial forms", () => {
    for (const kind of ["pfs", "p_and_l", "balance_sheet", "real_estate_schedule"] as const) {
      expect(financialVersionPublicationState({ ...snapshot, kind, current_version_id: "version-2" }, "version-2")).toBe("published");
    }
  });
  it("uses the exact returned version's completion for an idempotent older save receipt", () => {
    const complete = { complete: true, missing_fields: [], reason: "Complete", no_debt: false, active_rows: 1 };
    const incomplete = { ...complete, complete: false, missing_fields: ["debt-a.monthly_payment"], reason: "Monthly payment needed" };
    const result = { ...snapshot, current_version_id: "version-2", completion: complete, accepted_completion: complete, saved_completion: incomplete };
    expect(savedFinancialCompletion(result, "version-1")).toEqual(incomplete);
    expect(savedFinancialCompletion({ ...result, saved_completion: null }, "version-1")).toBeNull();
    const { saved_completion: _saved, ...legacy } = result;
    expect(savedFinancialCompletion(legacy, "version-1")).toBeNull();
    expect(savedFinancialCompletion({ ...legacy, accepted_completion: null }, "version-2")).toBeNull();
    expect(savedFinancialCompletion(legacy, "version-2")).toEqual(complete);
  });
  it("scopes contract review to a chosen loan and role without linking or publishing", async () => {
    const api = vi.fn().mockResolvedValue({ id: "import-a", target_row_id: "debt-a" });
    await stageDebtDocumentImport(api, "profile-a", snapshot, "debt-a", "contract-a", "agreement");
    expect(api).toHaveBeenCalledTimes(1);
    expect(api.mock.calls[0][0]).toBe("/application-profiles/profile-a/financial-workspace/debts/debt-a/document-imports");
    expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({ family_id: "family-a", expected_revision: 7, file_id: "contract-a", role: "agreement" });
  });
  it("sends draft revision separately from publication and includes the idempotency key", async () => {
    const api = vi.fn().mockResolvedValue(snapshot);
    await saveFinancialDraft(api, "profile-a", snapshot, body);
    await saveFinancialVersion(api, "profile-a", snapshot, "save-once");
    expect(api.mock.calls[0][0]).toBe("/application-profiles/profile-a/financial-workspace/draft");
    expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({ kind: "debt_schedule", family_id: "family-a", body, expected_revision: 7 });
    expect(JSON.parse(api.mock.calls[1][1].body)).toMatchObject({ expected_revision: 7, base_version_id: "version-2", idempotency_key: "save-once", submit: false });
    await saveFinancialVersion(api, "profile-a", snapshot, "file-once", true);
    expect(JSON.parse(api.mock.calls[2][1].body)).toMatchObject({ idempotency_key: "file-once", submit: true });
  });
  it("scopes family reads and uses explicit canonical row/document identities", async () => {
    const api = vi.fn().mockResolvedValue(snapshot);
    await readFinancialWorkspace(api, "profile-a", "pfs", "owner-a");
    await actOnFinancialDebt(api, "profile-a", snapshot, { op: "duplicate", row_id: "debt-b", target_row_id: "debt-a" });
    expect(api.mock.calls[0][0]).toContain("kind=pfs&family_id=owner-a");
    expect(JSON.parse(api.mock.calls[1][1].body)).toEqual({ family_id: "family-a", expected_revision: 7, op: "duplicate", row_id: "debt-b", target_row_id: "debt-a" });
  });
  it("stages restore and import with the current revision and selected mappings", async () => {
    const api = vi.fn().mockResolvedValue(snapshot);
    await restoreFinancialVersion(api, "profile-a", "version-1", 7);
    await applyFinancialImport(api, "profile-a", "import-a", 7, ["assets.cash"]);
    expect(api.mock.calls[0][0]).toMatch(/\/versions\/version-1\/restore$/);
    expect(JSON.parse(api.mock.calls[1][1].body)).toEqual({ expected_revision: 7, selected_keys: ["assets.cash"] });
  });
  it("propagates stale draft/save errors so they remain retryable", async () => {
    const stale = new Error("Draft changed in another session");
    const api = vi.fn().mockRejectedValue(stale);
    await expect(saveFinancialDraft(api, "profile-a", snapshot, body)).rejects.toBe(stale);
  });
});
