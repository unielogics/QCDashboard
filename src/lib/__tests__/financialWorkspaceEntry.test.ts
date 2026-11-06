import { describe, expect, it, vi } from "vitest";
import { addFinancialDebtDraft, financialDebtEntrySelection, financialDebtNavigationRows, financialWorkspaceEntryView, isBlankFinancialDebt, newFinancialDebtEntry, commitFinancialDebtEntry, financialDebtChoiceLabel } from "../financialWorkspaceEntry";
import { financialDebtTotals, financialLayout, meaningfulFinancialDebts, applyFinancialCells, type FinancialBody, type FinancialDebtRow } from "../financialWorkspaceApi";
import type { SheetLayout } from "@/components/sheet/types";

const lenders: FinancialDebtRow[] = ["Oakwood", "Kapfi", "IAC", "Aventus", "Newtek"].map((lender, index) => ({ id: `loan-${index}`, lender, balance: "100", monthly_payment: "10", status: "active" }));
const blank: FinancialDebtRow = { id: "old-blank", status: "active", lender: "", balance: "", monthly_payment: "", origin: "admin", evidence_links: [] };
const body = (rows = [...lenders, blank]): FinancialBody => ({ business_name: "Example therapy", debts: rows });

describe("debt schedule entry", () => {
  it("distinguishes separate loans at one lender without exposing storage IDs", () => {
    const first = financialDebtChoiceLabel({ id: "private-storage-id-1", lender: "SBA", balance: "1000", monthly_payment: "25" }, 1);
    const second = financialDebtChoiceLabel({ id: "private-storage-id-2", lender: "SBA", balance: "2000", monthly_payment: "50" }, 2);
    expect(first).toContain("Row 1 · SBA"); expect(second).toContain("Row 2 · SBA");
    expect(first).not.toBe(second); expect(first).not.toContain("private-storage");
  });
  it("provides categorical dropdowns while leaving dates, rates and amounts manually editable", () => {
    const source: SheetLayout = { kind: "debt_schedule", title: "Debt", schema_version: "v1", layout_version: "v1", name_prefix: "ds", freeze: [1, 1], columns: Array.from({ length: 17 }, (_, index) => ({ c: index + 1 })), rows: [{ r: 1, kind: "colhead", cells: [] }] };
    const current = { debts: [{ id: "sba", lender: "SBA", debt_type: "sba_loan", secured: "legacy security", mca_modified: "yes", mca_modification_note: "Old advance note" }] };
    const layout = financialLayout(current, source); const row = layout.rows.find((item) => item.row_key === "sba")!;
    const cell = (field: string) => row.cells!.find((item) => item.path?.at(-1) === field)!;
    for (const field of ["debt_type", "secured", "payment_status", "payment_frequency", "mca_modified"]) expect(cell(field).type).toBe("select");
    expect(cell("debt_type").option_labels?.sba_loan).toBe("SBA loan");
    expect(cell("secured").options).toContain("legacy security");
    expect(cell("originated_on").type).toBe("date"); expect(cell("maturity_on").type).toBe("date");
    expect(cell("rate").type).toBe("rate"); expect(cell("balance").type).toBe("money");
    const updated = applyFinancialCells(current, layout, [{ sheet: "debt_schedule", key: "sba.debt_type", value: "term_loan" }]);
    expect((updated.debts as FinancialDebtRow[])[0]).toMatchObject({ debt_type: "term_loan", mca_modified: "", mca_modification_note: "" });
  });
  it("keeps a new popup entry local until explicit commit and leaves cancelled entries out", () => {
    const current = body(); const before = structuredClone(current);
    const entry = newFinancialDebtEntry(current, () => "unused"); entry.lender = "New SBA lender";
    expect(current).toEqual(before);
    const saved = commitFinancialDebtEntry(current, { ...entry, debt_type: "sba_loan", balance: "5000", monthly_payment: "100" });
    expect(meaningfulFinancialDebts(saved)).toHaveLength(lenders.length + 1);
    expect(meaningfulFinancialDebts(current)).toHaveLength(lenders.length);
    const cancelled = newFinancialDebtEntry(saved, () => "cancelled"); cancelled.lender = "Never saved";
    expect((saved.debts as FinancialDebtRow[]).some((row) => row.id === "cancelled")).toBe(false);
  });
  it("saves multiple new SBA loans without fixed row counts, phantom blanks, or replacing older loans", () => {
    let current = body(lenders); let sequence = 0;
    for (let index = 0; index < 3; index++) {
      const entry = newFinancialDebtEntry(current, () => `sba-${++sequence}`);
      current = commitFinancialDebtEntry(current, { ...entry, lender: "SBA lender", debt_type: "sba_loan", balance: `${1000 + index}`, monthly_payment: "25" });
    }
    expect(meaningfulFinancialDebts(current)).toHaveLength(lenders.length + 3);
    expect((current.debts as FinancialDebtRow[]).slice(0, lenders.length)).toEqual(lenders);
    expect((current.debts as FinancialDebtRow[]).filter(isBlankFinancialDebt)).toEqual([]);
    expect(() => commitFinancialDebtEntry(current, { id: "empty", lender: "", status: "active" })).toThrow("Enter loan details");
    expect(() => commitFinancialDebtEntry(current, { id: lenders[0].id, lender: "Overwrite" })).toThrow("already exists");
  });
  it("opens normal Edit as the existing schedule worksheet rather than a blank form", () => {
    expect(financialWorkspaceEntryView("debt_schedule")).toBe("worksheet");
    expect(financialWorkspaceEntryView("debt_schedule", "form")).toBe("worksheet");
    expect(financialWorkspaceEntryView("debt_schedule", "worksheet")).toBe("worksheet");
  });
  it("keeps a selected lender in Worksheet while preserving source and history links", () => {
    expect(financialWorkspaceEntryView("debt_schedule", undefined, "loan-2")).toBe("worksheet");
    expect(financialWorkspaceEntryView("debt_schedule", "worksheet", "loan-2")).toBe("worksheet");
    expect(financialWorkspaceEntryView("debt_schedule", "pdf", "loan-2")).toBe("pdf");
    expect(financialWorkspaceEntryView("debt_schedule", "history")).toBe("history");
  });
  it.each(["pfs", "p_and_l", "balance_sheet", "real_estate_schedule"] as const)("keeps %s in Form by default", (kind) => {
    expect(financialWorkspaceEntryView(kind)).toBe("form");
    expect(financialWorkspaceEntryView(kind, "worksheet")).toBe("worksheet");
  });
  it("selects existing lender data regardless of whether an old blank row is first or last", () => {
    expect(financialDebtEntrySelection(body())).toBe("loan-0");
    expect(financialDebtEntrySelection(body([blank, ...lenders]))).toBe("loan-0");
    expect(financialDebtEntrySelection(body(), "missing-old-selection")).toBe("loan-0");
  });
  it("honors deliberate row selection including excluded rows for restore", () => {
    const removed: FinancialDebtRow = { id: "removed", lender: "Historical lender", status: "dismissed" };
    expect(financialDebtEntrySelection(body(), "loan-3")).toBe("loan-3");
    expect(financialDebtEntrySelection(body([...lenders, removed]), "removed")).toBe("removed");
    expect(financialDebtEntrySelection(body(), blank.id)).toBe(blank.id);
  });
  it("opening or reloading five lenders never creates a sixth obligation", () => {
    const current = body();
    const before = structuredClone(current);
    expect(financialDebtNavigationRows(current, financialDebtEntrySelection(current)).map((row) => row.id)).toEqual(lenders.map((row) => row.id));
    expect(meaningfulFinancialDebts(current)).toHaveLength(5);
    expect(financialDebtTotals(current)).toEqual({ total_balance: 500, total_monthly_payment: 50 });
    expect(current).toEqual(before);
  });
  it("reuses an untouched retained blank only after explicit Add, without another draft write", () => {
    const current = body();
    const createId = vi.fn(() => "must-not-create");
    const added = addFinancialDebtDraft(current, createId);
    expect(createId).not.toHaveBeenCalled();
    expect(added).toEqual({ body: current, rowId: blank.id });
    expect(added.body).toBe(current);
    expect(financialDebtNavigationRows(current, added.rowId)).toHaveLength(6);
    expect(meaningfulFinancialDebts(current)).toHaveLength(5);
    // Reopen resets to existing data and leaves the retained row untouched.
    expect(financialDebtEntrySelection(current)).toBe("loan-0");
    expect((current.debts as FinancialDebtRow[]).at(-1)).toBe(blank);
  });
  it("adds only one blank on explicit Add and reuses it on another click", () => {
    const current = body(lenders);
    const first = addFinancialDebtDraft(current, () => "new-row");
    expect(first.body).not.toBe(current);
    expect(first.body.debts).toHaveLength(6);
    const second = addFinancialDebtDraft(first.body, () => "unwanted-extra");
    expect(second.rowId).toBe("new-row");
    expect(second.body).toBe(first.body);
    expect(current.debts).toHaveLength(5);
  });
  it("an empty schedule stays empty until Add and clears no-debt only on that action", () => {
    const current = body([]);
    expect(financialDebtEntrySelection(current)).toBeNull();
    expect(financialDebtNavigationRows(current, null)).toEqual([]);
    const added = addFinancialDebtDraft({ debts: [blank], no_debt: true }, () => "extra");
    expect(added.rowId).toBe(blank.id);
    expect(added.body.no_debt).toBe(false);
  });
  it.each([{ balance: "0" }, { monthly_payment: 0 }, { notes: "A lender note" }, { debt_type: "unknown" }, { payment_frequency: "daily" }, { originated_on: "2026-06-01" }, { payment_status: "current" }, { secured: "secured" }, { mca_modified: "no" }])("preserves zero and partial row %j rather than recycling it", (fields) => {
    const partial = { id: "partial", ...fields } as FinancialDebtRow;
    expect(isBlankFinancialDebt(partial)).toBe(false);
    expect(financialDebtNavigationRows(body([partial]), null)).toEqual([partial]);
    expect(addFinancialDebtDraft(body([partial]), () => "new").rowId).toBe("new");
  });
  it.each([{ evidence_links: [{ file_id: "file", role: "agreement" }] }, { document_id: "document" }, { source_file_id: "source" }, { debt_intake_source: { file_id: "source" } }, { evidence: { source: "bank" } }])("never hides/reuses a source-associated row %j", (metadata) => {
    const sourceRow = { id: "source-row", ...metadata } as FinancialDebtRow;
    expect(isBlankFinancialDebt(sourceRow)).toBe(false);
    expect(financialDebtNavigationRows(body([sourceRow]), null)).toEqual([sourceRow]);
    expect(addFinancialDebtDraft(body([sourceRow]), () => "new").rowId).toBe("new");
  });
  it("preserves removed and duplicate rows and only reveals them on request", () => {
    const removed: FinancialDebtRow = { id: "removed", lender: "Removed", status: "dismissed" };
    const duplicate: FinancialDebtRow = { id: "duplicate", lender: "Oakwood LLC", status: "duplicate", duplicate_of_id: lenders[0].id };
    const current = body([...lenders, blank, removed, duplicate]);
    expect(financialDebtNavigationRows(current, null)).toEqual(lenders);
    expect(financialDebtNavigationRows(current, null, true)).toEqual([...lenders, removed, duplicate]);
    expect(current.debts).toHaveLength(8);
  });
  it("filtering the grid keeps stable UUID edits on the right lender", () => {
    const current = body([blank, ...lenders]);
    const source: SheetLayout = { kind: "debt_schedule", title: "Debt", schema_version: "v1", layout_version: "v1", name_prefix: "ds", freeze: [1, 1], columns: Array.from({ length: 17 }, (_, index) => ({ c: index + 1 })), rows: [{ r: 1, kind: "colhead", cells: [] }] };
    const layout = financialLayout(current, source);
    const visible = new Set(financialDebtNavigationRows(current, "loan-0").map((row) => row.id));
    const display = { ...layout, rows: layout.rows.filter((row) => !row.row_key || visible.has(row.row_key)) };
    expect(display.rows.filter((row) => row.kind === "data").map((row) => row.row_key)).toEqual(lenders.map((row) => row.id));
    const edited = applyFinancialCells(current, layout, [{ sheet: "debt_schedule", key: "loan-3.balance", value: "200" }]);
    expect((edited.debts as FinancialDebtRow[]).find((row) => row.id === "loan-3")?.balance).toBe("200");
    expect((edited.debts as FinancialDebtRow[])[0]).toEqual(blank);
  });
});
