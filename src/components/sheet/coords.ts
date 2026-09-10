// Navigation over a sheet layout, with no DOM. Addresses are the workbook's
// (r, c); movement happens in grid space — the index of a row in
// `layout.rows` and of a column in `layout.columns` — because neither is
// contiguous (the debt schedule skips row 6, the PFS skips column 3).
//
// The rules, from the design:
// - Arrows land on any rendered position, formula cells and headings
//   included — that is Sheets behaviour, and it makes copying a subtotal work.
// - Tab and Enter-after-commit skip to the next *editable* cell, stepping
//   over headings, blanks and totals.
// - Ctrl+arrow jumps to the boundary of the filled run.
// - Home/End are the row's ends; Ctrl+Home/End the sheet's.

import type { CellAddr, SheetCell, SheetLayout, SheetRow, SheetValues } from "./types";

export type Located = { addr: CellAddr; row: SheetRow; cell: SheetCell };

export type Direction = "up" | "down" | "left" | "right";

export function rowIndex(layout: SheetLayout, r: number): number {
  return layout.rows.findIndex((row) => row.r === r);
}

export function colIndex(layout: SheetLayout, c: number): number {
  return layout.columns.findIndex((column) => column.c === c);
}

export function rowAt(layout: SheetLayout, r: number): SheetRow | undefined {
  return layout.rows.find((row) => row.r === r);
}

export function isEditable(cell: SheetCell | null | undefined): cell is SheetCell & { key: string } {
  return !!cell && cell.editable === true && typeof cell.key === "string" && cell.type !== "formula";
}

function span(cell: SheetCell): number {
  return Math.max(1, cell.colspan ?? 1);
}

/** The cell rendered at an address: the one anchored there, or the one
 *  spanning across it. Null on a void position (a blank row, or a PFS
 *  summary row's unused columns). */
export function cellAt(layout: SheetLayout, addr: CellAddr): SheetCell | null {
  const row = rowAt(layout, addr.r);
  if (!row?.cells) return null;
  for (const cell of row.cells) {
    if (cell.c === addr.c) return cell;
    if (cell.c < addr.c && addr.c < cell.c + span(cell)) return cell;
  }
  return null;
}

/** The address a position resolves to: a spanning cell's first column. */
export function anchorOf(layout: SheetLayout, addr: CellAddr): CellAddr {
  const cell = cellAt(layout, addr);
  return cell && cell.c !== addr.c ? { r: addr.r, c: cell.c } : addr;
}

export function firstAddr(layout: SheetLayout): CellAddr {
  return { r: layout.rows[0]?.r ?? 1, c: layout.columns[0]?.c ?? 1 };
}

export function lastAddr(layout: SheetLayout): CellAddr {
  return {
    r: layout.rows[layout.rows.length - 1]?.r ?? 1,
    c: layout.columns[layout.columns.length - 1]?.c ?? 1,
  };
}

function clamp(index: number, length: number): number {
  return Math.max(0, Math.min(length - 1, index));
}

function at(layout: SheetLayout, ri: number, ci: number): CellAddr {
  return { r: layout.rows[ri].r, c: layout.columns[ci].c };
}

/** One step in grid space, clamped to the sheet, landing on whatever is
 *  there. Stepping right out of a spanning cell clears its whole span;
 *  landing inside one snaps to its first column. */
export function move(layout: SheetLayout, addr: CellAddr, dr: number, dc: number): CellAddr {
  if (!layout.rows.length || !layout.columns.length) return addr;
  const anchored = anchorOf(layout, addr);
  let ri = rowIndex(layout, anchored.r);
  let ci = colIndex(layout, anchored.c);
  if (ri < 0) ri = 0;
  if (ci < 0) ci = 0;
  if (dc > 0) {
    const cell = cellAt(layout, anchored);
    if (cell && span(cell) > 1) {
      // The first layout column at or past the span's end.
      const end = cell.c + span(cell);
      const past = layout.columns.findIndex((column) => column.c >= end);
      ci = past < 0 ? layout.columns.length - 1 : past;
      dc -= 1;
    }
  }
  ri = clamp(ri + dr, layout.rows.length);
  ci = clamp(ci + dc, layout.columns.length);
  return anchorOf(layout, at(layout, ri, ci));
}

/** The next input cell: "next"/"prev" in reading order (Tab, wrapping to the
 *  following row's first input), "down"/"up" in the same column (Enter after
 *  a commit). Null when there is none, so the caller stays put. */
export function nextEditable(
  layout: SheetLayout,
  addr: CellAddr,
  dir: "next" | "prev" | "down" | "up",
): CellAddr | null {
  const rows = layout.rows;
  const ri0 = rowIndex(layout, addr.r);
  if (dir === "down" || dir === "up") {
    const step = dir === "down" ? 1 : -1;
    for (let ri = ri0 + step; ri >= 0 && ri < rows.length; ri += step) {
      const cell = rows[ri].cells?.find((candidate) => candidate.c === addr.c);
      if (isEditable(cell)) return { r: rows[ri].r, c: cell.c };
    }
    return null;
  }
  const step = dir === "next" ? 1 : -1;
  let ri = ri0 < 0 ? 0 : ri0;
  let started = ri0 >= 0;
  while (ri >= 0 && ri < rows.length) {
    const cells = [...(rows[ri].cells ?? [])].sort((a, b) => (step > 0 ? a.c - b.c : b.c - a.c));
    for (const cell of cells) {
      if (started && ri === ri0 && (step > 0 ? cell.c <= addr.c : cell.c >= addr.c)) continue;
      if (isEditable(cell)) return { r: rows[ri].r, c: cell.c };
    }
    started = false;
    ri += step;
  }
  return null;
}

/** Whether a position shows anything: a label with text, a formula, or an
 *  input with a value. Void and blank positions are empty. */
export function isFilled(layout: SheetLayout, values: SheetValues, addr: CellAddr): boolean {
  const cell = cellAt(layout, addr);
  if (!cell) return false;
  if (cell.type === "label") return String(cell.label ?? "").trim() !== "";
  if (cell.type === "formula") return true;
  if (typeof cell.key === "string") return String(values[cell.key] ?? "").trim() !== "";
  return false;
}

const DELTA: Record<Direction, [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

/** Ctrl+arrow, the Sheets rule: from inside a filled run go to its last
 *  filled cell; from an empty cell (or the run's edge) go to the next filled
 *  cell; with nothing filled ahead, go to the sheet's edge. */
export function ctrlJump(layout: SheetLayout, values: SheetValues, addr: CellAddr, dir: Direction): CellAddr {
  const [dr, dc] = DELTA[dir];
  const same = (a: CellAddr, b: CellAddr) => a.r === b.r && a.c === b.c;
  let here = anchorOf(layout, addr);
  let next = move(layout, here, dr, dc);
  if (same(next, here)) return here;
  if (isFilled(layout, values, here) && isFilled(layout, values, next)) {
    while (!same(next, here) && isFilled(layout, values, next)) {
      here = next;
      next = move(layout, here, dr, dc);
    }
    return here;
  }
  while (!same(next, here) && !isFilled(layout, values, next)) {
    here = next;
    next = move(layout, here, dr, dc);
  }
  return same(next, here) ? here : next;
}

/** Home/End: the row's first or last column; with `whole`, the sheet's first
 *  or last cell. */
export function homeEnd(layout: SheetLayout, addr: CellAddr, which: "home" | "end", whole = false): CellAddr {
  if (!layout.rows.length || !layout.columns.length) return addr;
  if (whole) return which === "home" ? firstAddr(layout) : anchorOf(layout, lastAddr(layout));
  const c = which === "home" ? layout.columns[0].c : layout.columns[layout.columns.length - 1].c;
  return anchorOf(layout, { r: addr.r, c });
}

export type RangeBounds = { r1: number; c1: number; r2: number; c2: number };

/** The rectangle two corners describe, in workbook numbers. */
export function normalizeRange(a: CellAddr, b: CellAddr): RangeBounds {
  return {
    r1: Math.min(a.r, b.r),
    c1: Math.min(a.c, b.c),
    r2: Math.max(a.r, b.r),
    c2: Math.max(a.c, b.c),
  };
}

/** Every rendered cell inside the rectangle, row-major — headings, formulas
 *  and labels included; the caller filters with `isEditable`. A cell spanning
 *  into the rectangle counts, once. */
export function rangeCells(layout: SheetLayout, a: CellAddr, b: CellAddr): Located[] {
  const { r1, c1, r2, c2 } = normalizeRange(a, b);
  const out: Located[] = [];
  for (const row of layout.rows) {
    if (row.r < r1 || row.r > r2 || !row.cells) continue;
    const cells = [...row.cells].sort((x, y) => x.c - y.c);
    for (const cell of cells) {
      const end = cell.c + span(cell) - 1;
      if (cell.c > c2 || end < c1) continue;
      out.push({ addr: { r: row.r, c: cell.c }, row, cell });
    }
  }
  return out;
}
