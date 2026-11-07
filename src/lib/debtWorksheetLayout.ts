import type { SheetCell, SheetLayout } from "@/components/sheet/types";

/** Presentation coordinates only. Save keys, row identities and workbook columns remain unchanged. */
export function orderDebtScheduleColumns(layout: SheetLayout): SheetLayout {
  if (layout.kind !== "debt_schedule") return layout;
  const data = layout.rows.filter((row) => row.kind === "data");
  const normalized = (value: string | null | undefined) => (value ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const columnFor = (field: string, labels: string[]) => {
    for (const row of data) {
      const cell = row.cells?.find((cell) => cell.path?.at(-1) === field || cell.key?.endsWith(`.${field}`) || cell.compute?.endsWith(`.${field}`));
      if (cell) return cell.c;
    }
    return layout.columns.find((column) => labels.includes(normalized(column.label)) || layout.rows.some((row) => row.kind === "colhead" && row.cells?.some((cell) => cell.c === column.c && labels.includes(normalized(cell.label)))))?.c;
  };
  const lender = columnFor("lender", ["lender"]);
  const date = columnFor("originated_on", ["originationdate", "dateoriginated", "origindate", "originated"]);
  const balance = columnFor("balance", ["currentbalance", "balance"]);
  const paid = columnFor("paid_down_pct", ["paiddown", "percentpaiddown"]);
  if (lender == null || balance == null || (date == null && paid == null)) return layout;
  const special = [lender, balance, date, paid].filter((value): value is number => value != null);
  if (new Set(special).size !== special.length || new Set(layout.columns.map((column) => column.c)).size !== layout.columns.length) return layout;
  const byColumn = new Map(layout.columns.map((column) => [column.c, column]));
  if (special.some((column) => !byColumn.has(column))) return layout;
  const ordered = layout.columns.filter((column) => column.c !== date && column.c !== paid).flatMap((column) => [column,
    ...(column.c === lender && date != null ? [byColumn.get(date)!] : []),
    ...(column.c === balance && paid != null ? [byColumn.get(paid)!] : []),
  ]);
  if (ordered.every((column, index) => column.c === layout.columns[index].c)) return layout;
  const positions = new Map(ordered.map((column, index) => [column.c, index + 1]));
  let safe = true;
  const remap = (cell: SheetCell): SheetCell => {
    const covered = layout.columns.filter((column) => column.c >= cell.c && column.c < cell.c + (cell.colspan ?? 1));
    const mapped = covered.map((column) => positions.get(column.c)!).sort((a, b) => a - b);
    if (!mapped.length || mapped.at(-1)! - mapped[0] + 1 !== mapped.length) { safe = false; return cell; }
    return { ...cell, c: mapped[0], ...(cell.colspan != null ? { colspan: mapped.length } : {}) };
  };
  const rows = layout.rows.map((row) => ["data", "colhead", "formula"].includes(row.kind)
    ? { ...row, cells: row.cells?.map(remap).sort((a, b) => a.c - b.c) }
    : row);
  return safe ? { ...layout, columns: ordered.map((column, index) => ({ ...column, c: index + 1 })), rows } : layout;
}
