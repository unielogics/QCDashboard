import { describe, expect, it } from "vitest";
import { orderDebtScheduleColumns } from "../debtWorksheetLayout";
import { applyFinancialCells, financialDebtComputed, financialLayout, financialValues } from "../financialWorkspaceApi";
import { isEditable, move, nextEditable } from "@/components/sheet/coords";
import { planPaste, toTsv } from "@/components/sheet/clipboard";
import type { SheetCell, SheetLayout } from "@/components/sheet/types";

const fields = ["lender", "debt_type", "original_amount", "balance", "rate", "monthly_payment", "originated_on", "maturity_on", "secured", "payment_status", "collateral", "mca_modified", "mca_modification_note", "notes", "factor_rate", "payment_amount", "payment_frequency"];
const labels = ["Lender", "Type of debt", "Original amount", "Current balance", "Interest rate (%)", "Monthly payment", "Origination date", "Maturity date", "Secured", "Status", "Collateral", "Modified", "Modification", "Notes", "Factor", "Payment", "Frequency", "Paid down (%)"];
const dataCells: SheetCell[] = [...fields.map((field, i) => ({ c: i + 1, type: "text" as const, key: `a.${field}`, path: ["debts", "a", field], editable: true })), { c: 18, type: "formula", format: "percent", compute: "a.paid_down_pct", editable: false }];
const source: SheetLayout = { kind: "debt_schedule", title: "Debt schedule", schema_version: "1", layout_version: "1", name_prefix: "ds", freeze: [5, 1], columns: labels.map((label, i) => ({ c: i + 1, label })), rows: [
  { r: 3, kind: "field", cells: [{ c: 1, type: "label", label: "Business name" }, { c: 2, type: "text", key: "business_name", path: ["business_name"], editable: true }] },
  { r: 5, kind: "colhead", cells: labels.map((label, i) => ({ c: i + 1, type: "label", label })) },
  { r: 7, kind: "data", block: "debts", row_key: "a", cells: dataCells },
  { r: 8, kind: "formula", block: "debts", cells: [{ c: 1, type: "label", label: "Total" }, { c: 4, type: "formula", compute: "total_balance" }, { c: 6, type: "formula", compute: "total_monthly_payment" }] },
] };

describe("debt worksheet display order", () => {
  it("places dates and percentages next to their loan fields, with aligned headings and totals", () => {
    const before = structuredClone(source); const layout = orderDebtScheduleColumns(source);
    expect(layout.columns.slice(0, 6).map((column) => column.label)).toEqual(["Lender", "Origination date", "Type of debt", "Original amount", "Current balance", "Paid down (%)"]);
    expect(layout.columns.map((column) => column.c)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(layout.rows[1].cells?.slice(0, 6).map((cell) => cell.label)).toEqual(layout.columns.slice(0, 6).map((column) => column.label));
    expect(layout.rows[2].cells?.find((cell) => cell.c === 2)?.path).toEqual(["debts", "a", "originated_on"]);
    expect(layout.rows[2].cells?.find((cell) => cell.c === 6)).toMatchObject({ compute: "a.paid_down_pct", editable: false });
    expect(layout.rows[3].cells?.find((cell) => cell.compute === "total_balance")?.c).toBe(5);
    expect(layout.rows[3].cells?.find((cell) => cell.compute === "total_monthly_payment")?.c).toBe(8);
    expect(layout.rows[0]).toEqual(source.rows[0]); expect(source).toEqual(before);
    expect(orderDebtScheduleColumns(layout)).toBe(layout);
  });
  it("copies and pastes the displayed order without writing the calculated percentage", () => {
    const layout = orderDebtScheduleColumns(source);
    const line = ["Example lender", "2023-07-03", "sba", "100", "75", "99", "7.5", "10"];
    const plan = planPaste(layout, {}, { r: 7, c: 1 }, [line]);
    expect(Object.fromEntries(plan.edits.map((edit) => [edit.key, edit.value]))).toEqual({ "a.lender": line[0], "a.originated_on": line[1], "a.debt_type": line[2], "a.original_amount": line[3], "a.balance": line[4], "a.rate": line[6], "a.monthly_payment": line[7] });
    const body = applyFinancialCells({ debts: [{ id: "a" }] }, layout, plan.edits);
    const copied = toTsv(layout, financialValues(body, layout), financialDebtComputed(body), { r: 7, c: 1 }, { r: 7, c: 8 });
    expect(copied).toBe("Example lender\t2023-07-03\tsba\t100\t75\t25.0%\t7.5\t10");
    expect(nextEditable(layout, { r: 7, c: 1 }, "next")).toEqual({ r: 7, c: 2 });
    expect(nextEditable(layout, { r: 7, c: 5 }, "next")).toEqual({ r: 7, c: 7 });
    expect(move(layout, { r: 7, c: 5 }, 0, 1)).toEqual({ r: 7, c: 6 });
  });
  it("rebuilds new UUID rows from ordered layouts without turning the last input into a formula", () => {
    const layout = financialLayout({ debts: [{ id: "new", original_amount: "100", balance: "50" }] }, orderDebtScheduleColumns(source));
    const cells = layout.rows.find((row) => row.kind === "data")!.cells!;
    expect(cells.filter(isEditable)).toHaveLength(17);
    expect(cells.find((cell) => cell.c === 2)?.key).toBe("new.originated_on");
    expect(cells.find((cell) => cell.c === 6)?.compute).toBe("new.paid_down_pct");
    expect(cells.find((cell) => cell.key === "new.payment_frequency")?.type).toBe("select");
    expect(cells.find((cell) => cell.key === "new.payment_frequency")?.c).toBe(18);
  });
  it("leaves other sheets and unsafe merged financial cells unchanged", () => {
    const pfs = { ...source, kind: "pfs" as const }; expect(orderDebtScheduleColumns(pfs)).toBe(pfs);
    const merged = structuredClone(source); merged.rows[2].cells!.find((cell) => cell.c === 4)!.colspan = 3;
    expect(orderDebtScheduleColumns(merged)).toBe(merged);
    const sparse = { ...source, columns: [{ c: 1 }], rows: [] }; expect(orderDebtScheduleColumns(sparse)).toBe(sparse);
  });
});
