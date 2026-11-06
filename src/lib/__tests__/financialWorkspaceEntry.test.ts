import { describe, expect, it, vi } from "vitest";
import { addFinancialDebtDraft, financialDebtEntrySelection, financialDebtNavigationRows, financialWorkspaceEntryView, isBlankFinancialDebt } from "../financialWorkspaceEntry";
import { financialDebtTotals, financialLayout, meaningfulFinancialDebts, applyFinancialCells, type FinancialBody, type FinancialDebtRow } from "../financialWorkspaceApi";
import type { SheetLayout } from "@/components/sheet/types";

const lenders: FinancialDebtRow[] = ["Oakwood", "Kapfi", "IAC", "Aventus", "Newtek"].map((lender, index) => ({ id: `loan-${index}`, lender, balance: "100", monthly_payment: "10", status: "active" }));
const blank: FinancialDebtRow = { id: "old-blank", status: "active", lender: "", balance: "", monthly_payment: "", origin: "admin", evidence_links: [] };
const body = (rows = [...lenders, blank]): FinancialBody => ({ business_name: "Example therapy", debts: rows });

describe("debt schedule entry", () => {
  it("opens normal Edit as the existing schedule worksheet rather than a blank form", () => {
    expect(financialWorkspaceEntryView("debt_schedule")).toBe("worksheet");
    expect(financialWorkspaceEntryView("debt_schedule", "form")).toBe("worksheet");
    expect(financialWorkspaceEntryView("debt_schedule", "worksheet")).toBe("worksheet");
  });
  it("opens an explicit lender in Form while preserving source and history links", () => {
    expect(financialWorkspaceEntryView("debt_schedule", undefined, "loan-2")).toBe("form");
    expect(financialWorkspaceEntryView("debt_schedule", "worksheet", "loan-2")).toBe("form");
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
