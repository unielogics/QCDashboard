// The clipboard: what Excel and Sheets actually write to text/plain, and how
// a block of it lands on a sheet. Pure; the grid binds this to the copy/cut/
// paste events.

import { colIndex, isEditable, rangeCells, rowIndex } from "./coords";
import { formatPlain, parseMoney } from "./money";
import type { CellAddr, ComputedValues, Edit, NewRow, PastePlan, SheetCell, SheetLayout, SheetRow, SheetValues } from "./types";

/** A tab-separated block as a matrix of strings.
 *
 *  Rows end in `\r\n`, `\n` or `\r`; one trailing terminator is dropped
 *  (Excel always adds one). A field containing a tab, a newline or a quote is
 *  wrapped in `"` with `""` for a literal quote. Text with no tab and no
 *  newline is one value, taken verbatim: a pasted `"Acme, Inc."` keeps its
 *  quotes rather than being read as a one-cell spreadsheet. */
export function parseTsv(text: string): string[][] {
  let body = String(text ?? "");
  if (body.endsWith("\r\n")) body = body.slice(0, -2);
  else if (body.endsWith("\n") || body.endsWith("\r")) body = body.slice(0, -1);
  if (!/[\t\r\n]/.test(body)) return [[body]];

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let atFieldStart = true;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
      continue;
    }
    if (ch === "\t") {
      row.push(field);
      field = "";
      atFieldStart = true;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      atFieldStart = true;
      continue;
    }
    field += ch;
    atFieldStart = false;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

function quote(field: string): string {
  return /[\t\r\n"]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

/** What one cell copies as: the raw string of an input, the number a formula
 *  shows (a subtotal copies as its figure, so copy → paste inside the grid is
 *  lossless), a label's text, nothing for a void position. */
export function cellText(cell: SheetCell | null, values: SheetValues, computed: ComputedValues): string {
  if (!cell) return "";
  if (cell.type === "label") return String(cell.label ?? "");
  if (cell.type === "formula") {
    if (cell.compute) return formatPlain(computed[cell.compute] ?? null);
    if (cell.source) return formatPlain(parseMoney(values[cell.source]).value);
    return "";
  }
  if (typeof cell.key === "string") return String(values[cell.key] ?? "");
  return "";
}

/** The rectangle as a tab-separated block, one line per grid row, every
 *  layout column present so the shape survives a round trip. */
export function toTsv(
  layout: SheetLayout,
  values: SheetValues,
  computed: ComputedValues,
  a: CellAddr,
  b: CellAddr,
): string {
  const r1 = Math.min(a.r, b.r);
  const r2 = Math.max(a.r, b.r);
  const c1 = Math.min(a.c, b.c);
  const c2 = Math.max(a.c, b.c);
  const columns = layout.columns.filter((column) => column.c >= c1 && column.c <= c2);
  const lines: string[] = [];
  for (const row of layout.rows) {
    if (row.r < r1 || row.r > r2) continue;
    const byC = new Map<number, SheetCell>();
    for (const cell of row.cells ?? []) byC.set(cell.c, cell);
    lines.push(columns.map((column) => quote(cellText(byC.get(column.c) ?? null, values, computed))).join("\t"));
  }
  return lines.join("\n");
}

function defaultMint(): string {
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** A template row's cell key re-addressed to a new row: `d3.balance` → `<new>.balance`,
 *  `real_estate.r2.cost` → `real_estate.<new>.cost`. */
function rekey(key: string, oldRowKey: string, newRowKey: string): string {
  if (key === oldRowKey) return newRowKey;
  if (key.startsWith(`${oldRowKey}.`)) return `${newRowKey}${key.slice(oldRowKey.length)}`;
  const infix = `.${oldRowKey}.`;
  const index = key.indexOf(infix);
  if (index >= 0) return `${key.slice(0, index)}.${newRowKey}.${key.slice(index + infix.length)}`;
  return key;
}

export type PasteOptions = {
  /** Mints the key of an appended list row. Defaults to a local unique id. */
  mintRowKey?: () => string;
  /** When set and the matrix is a single value, it is tiled over this range
   *  (Sheets behaviour for a one-cell paste, and what Delete over a range
   *  uses with an empty string) rather than placed at `topLeft`. */
  range?: { from: CellAddr; to: CellAddr } | null;
};

/** Where a block of values lands.
 *
 *  - Formula and label cells inside the target rectangle are skipped, never
 *    overwritten.
 *  - On a fixed sheet (P&L, balance sheet, the PFS summary) the paste stops at
 *    the end of the contiguous run of rows with an input under it, and
 *    `clipped` counts the rows that had nowhere to go — so the UI can say
 *    "12 of 15 rows pasted, the section ends here" rather than filing an
 *    expense figure into the next section's first line.
 *  - Starting on a list row (a debt, a PFS schedule line), rows past the end
 *    of the block are appended: `newRows` carries them and their edits are
 *    addressed by the minted row key. Forty debts pasted in one action is
 *    the point. */
export function planPaste(
  layout: SheetLayout,
  values: SheetValues,
  topLeft: CellAddr,
  matrix: string[][],
  options: PasteOptions = {},
): PastePlan {
  const edits: Edit[] = [];
  const newRows: NewRow[] = [];
  const sheet = layout.kind;
  const seen = new Set<string>();
  const push = (cell: SheetCell, addr: CellAddr, value: string) => {
    if (!isEditable(cell) || seen.has(cell.key)) return;
    seen.add(cell.key);
    edits.push({ sheet, key: cell.key, value, addr });
  };

  if (options.range && matrix.length === 1 && matrix[0].length === 1) {
    const value = matrix[0][0];
    for (const { addr, cell } of rangeCells(layout, options.range.from, options.range.to)) push(cell, addr, value);
    return { edits, newRows, clipped: 0 };
  }

  const ri0 = rowIndex(layout, topLeft.r);
  const ci0 = colIndex(layout, topLeft.c);
  if (ri0 < 0 || ci0 < 0 || !matrix.length) return { edits, newRows, clipped: matrix.length };

  const rows = layout.rows;
  const start = rows[ri0];
  const block = start.kind === "data" && start.block ? start.block : null;
  const mint = options.mintRowKey ?? defaultMint;

  const write = (row: SheetRow, addr: number, line: string[], keyFor: (cell: SheetCell) => string | null) => {
    for (let j = 0; j < line.length; j += 1) {
      const column = layout.columns[ci0 + j];
      if (!column) break;
      const cell = row.cells?.find((candidate) => candidate.c === column.c);
      if (!isEditable(cell)) continue;
      const key = keyFor(cell);
      if (!key) continue;
      push({ ...cell, key }, { r: addr, c: column.c }, line[j]);
    }
  };

  let clipped = 0;
  let template: SheetRow | null = null;
  let lastRowKey: string | null = null;
  for (let i = 0; i < matrix.length; i += 1) {
    const line = matrix[i];
    const row = rows[ri0 + i];
    if (block) {
      if (row && row.kind === "data" && row.block === block) {
        template = row;
        lastRowKey = row.row_key ?? null;
        write(row, row.r, line, (cell) => cell.key ?? null);
        continue;
      }
      if (!template || !template.row_key) {
        clipped += matrix.length - i;
        break;
      }
      const oldKey = template.row_key;
      const rowKey = mint();
      newRows.push({ sheet, block, rowKey, after: lastRowKey });
      // An appended row has no workbook row yet; it takes the number after
      // the template's so the edit still carries an address.
      write(template, template.r + newRows.length, line, (cell) => (cell.key ? rekey(cell.key, oldKey, rowKey) : null));
      lastRowKey = rowKey;
      continue;
    }
    const usable =
      !!row &&
      line.some((_, j) => {
        const column = layout.columns[ci0 + j];
        return !!column && isEditable(row.cells?.find((candidate) => candidate.c === column.c));
      });
    if (!usable) {
      clipped += matrix.length - i;
      break;
    }
    write(row, row.r, line, (cell) => cell.key ?? null);
  }
  return { edits, newRows, clipped };
}
