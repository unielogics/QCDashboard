import { describe, expect, it } from "vitest";
import { applyFinancialCells, financialDebtComputed, financialLayout, financialValues } from "../financialWorkspaceApi";
import { cellText } from "@/components/sheet/clipboard";
import { cellDisplay } from "@/components/sheet/SheetCellView";
import { isEditable } from "@/components/sheet/coords";
import { blankFormulaNames, indexFormulas, shownFigure } from "@/components/sheet/SheetGrid";
import { debtTotals, recompute } from "@/components/sheet/compute";
import type { SheetLayout } from "@/components/sheet/types";

const fields = ["lender", "debt_type", "original_amount", "balance", "rate", "monthly_payment", "originated_on", "maturity_on", "secured", "payment_status", "collateral", "mca_modified", "mca_modification_note", "notes", "factor_rate", "payment_amount", "payment_frequency"];
const source: SheetLayout = { kind: "debt_schedule", title: "Debt schedule", schema_version: "v1", layout_version: "v1", name_prefix: "ds", freeze: [1, 1], columns: Array.from({ length: 18 }, (_, i) => ({ c: i + 1 })), rows: [{ r: 8, kind: "data", block: "debts", row_key: "template", cells: [...fields.map((field, i) => ({ c: i + 1, type: "text" as const, key: `template.${field}`, path: ["debts", "template", field], editable: true })), { c: 18, type: "formula", editable: false, compute: "template.paid_down_pct", xlsx_name: "template_progress", formula: "={template.original_amount}-{template.balance}", format: "percent" }] }] };

describe("working loan progress cells", () => {
  it("updates the ordinary/public worksheet without changing its financial-total contract", () => {
    const values = { "a.original_amount": "100", "a.balance": "25", "a.monthly_payment": "10" };
    expect(debtTotals(values)).toEqual({ total_balance: 25, total_monthly_payment: 10 });
    expect(recompute("debt_schedule", null, values)).toEqual({ total_balance: 25, total_monthly_payment: 10, "a.paid_down_pct": 75 });
  });
  it("binds formulas to exact new and reordered rows, including legitimate zero progress", () => {
    const body = { debts: [{ id: "new", lender: "Same lender", original_amount: "100", balance: "100", monthly_payment: "10" }, { id: "other", lender: "Same lender", original_amount: "200", balance: "150", monthly_payment: "20" }] };
    const layout = financialLayout(body, source); const values = financialValues(body, layout); const computed = financialDebtComputed(body);
    const cells = layout.rows.map((row) => row.cells!.find((cell) => cell.compute?.endsWith(".paid_down_pct"))!);
    expect(cells.map((cell) => cell.compute)).toEqual(["new.paid_down_pct", "other.paid_down_pct"]);
    expect(cells[0].formula).toContain("{new.original_amount}");
    expect(cells[1].formula).toContain("{other.balance}");
    expect(shownFigure(cells[0], computed, blankFormulaNames(indexFormulas(layout), values))).toBe(0);
    expect(cellDisplay(cells[0], "", computed[cells[0].compute!]).text).toBe("0.0%");
    expect(cellText(cells[1], values, computed)).toBe("25.0%");
    expect(computed).toMatchObject({ total_balance: 250, total_monthly_payment: 30 });
  });
  it("cannot save or paste the derived field and refreshes it after financial edits", () => {
    const body = { debts: [{ id: "a", original_amount: "100", balance: "75", monthly_payment: "10" }] };
    const layout = financialLayout(body, source); const cell = layout.rows[0].cells!.find((item) => item.compute?.endsWith(".paid_down_pct"))!;
    expect(isEditable(cell)).toBe(false); expect(cell.path).toBeUndefined(); expect(cell.key).toBeUndefined();
    const next = applyFinancialCells(body, layout, [{ sheet: "debt_schedule", key: "a.paid_down_pct", value: "99" }, { sheet: "debt_schedule", key: "a.balance", value: "50" }]);
    expect(next.debts).toEqual([{ id: "a", original_amount: "100", balance: "50", monthly_payment: "10" }]);
    expect(financialDebtComputed(next)["a.paid_down_pct"]).toBe(50);
  });
  it("keeps excluded-row detail without counting its debt, and leaves unknown percentages blank", () => {
    const body = { debts: [{ id: "active", original_amount: "100", balance: "50", monthly_payment: "10" }, { id: "duplicate", status: "duplicate" as const, original_amount: "100", balance: "10", monthly_payment: "50" }, { id: "unknown", balance: "0", monthly_payment: "0" }] };
    expect(financialDebtComputed(body)).toMatchObject({ total_balance: 50, total_monthly_payment: 10, "duplicate.paid_down_pct": 90, "unknown.paid_down_pct": null });
    expect(cellDisplay({ c: 18, type: "formula", compute: "unknown.paid_down_pct", format: "percent" }, "", null).text).toBe("—");
  });
});
