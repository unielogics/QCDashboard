// The worksheet's shapes, mirroring `app/services/sheet_layout.py` field for
// field. A sheet is an ordered row list over a fixed column template — not a
// sparse cell map — and every row's `r` and every named cell's `xlsx_name`
// are the same numbers and names the downloadable workbook writes. No React.

export type SheetKind = "p_and_l" | "balance_sheet" | "debt_schedule" | "pfs";

export type CellType = "label" | "text" | "money" | "date" | "select" | "rate" | "formula";

export type CellFormat = "money" | "ratio" | "count" | "text" | "date";

export type RowKind =
  | "title"
  | "subtitle"
  | "heading"
  | "blank"
  | "note"
  | "field"
  | "formula"
  | "colhead"
  | "data";

export type SheetColumn = {
  /** 1-based; the workbook column. Need not be contiguous (the PFS skips 3). */
  c: number;
  label?: string;
  width?: number;
  align?: "left" | "right";
};

export type SheetCell = {
  c: number;
  type: CellType;
  /** The save key. Absent on labels and formulas. */
  key?: string | null;
  /** The workbook defined-name suffix. Absent on labels. */
  xlsx_name?: string | null;
  /** How the value is shown. Defaults to "text". */
  format?: CellFormat;
  editable?: boolean;
  /** The text of a label cell. */
  label?: string | null;
  options?: string[] | null;
  /** The `totals` entry a formula cell shows. */
  compute?: string | null;
  /** An input key a formula cell merely echoes (the P&L memo lines). */
  source?: string | null;
  /** The workbook formula, written against keys in braces. Never evaluated here. */
  formula?: string | null;
  hint?: string | null;
  flags?: string[];
  emphasis?: boolean;
  colspan?: number;
  /** Where the value lives in the stored body. */
  path?: string[] | null;
};

export type SheetRow = {
  /** The workbook row. */
  r: number;
  kind: RowKind;
  label?: string | null;
  cells?: SheetCell[];
  /** The list a data row belongs to ("debts", or a PFS schedule key). */
  block?: string | null;
  /** A data row's stable identity: the stored row id, or `r{n}`. */
  row_key?: string | null;
  /** A data row's ordinal within its block, 1-based. */
  ordinal?: number | null;
};

/** Whether this row is one line of a list — the debt schedule's debts, a
 *  personal statement's supporting schedules — as opposed to a column head, a
 *  section heading or the total line under one. Those carry the block too.
 *
 *  It answers two questions that have to agree: which rows a person may take
 *  off the sheet, and how many lines the sheet is showing when it asks the
 *  server to add or remove one. A row-shaped predicate, so it lives with the
 *  row rather than in either of the two callers.
 */
export function isListRow(row: SheetRow): boolean {
  return row.kind === "data" && !!row.block && !!row.row_key;
}

/** How many lines the grid is showing for one list, blank lines included.
 *  The server pads a short list up to this count before adding or removing,
 *  so the count moves by one from the picture on screen rather than from the
 *  shorter list the file happens to hold. */
export function visibleLines(rows: SheetRow[] | undefined, block: string | null | undefined): number {
  if (!block) return 0;
  return (rows ?? []).filter((row) => isListRow(row) && row.block === block).length;
}

export type SheetLayout = {
  kind: SheetKind;
  title: string;
  schema_version: string;
  layout_version: string;
  name_prefix: string;
  columns: SheetColumn[];
  rows: SheetRow[];
  /** (rows, cols) frozen at the top left. */
  freeze: [number, number];
};

/** A grid position: the workbook row and column, exactly as the layout numbers them. */
export type CellAddr = { r: number; c: number };

/** The selection: the cell that has focus and the corner it was extended from. */
export type Selection = { active: CellAddr; anchor: CellAddr };

export type SelectionMode = "cell" | "range";

/** One committed change to one input cell. Saves use `key`, never the address. */
export type Edit = {
  sheet: SheetKind;
  key: string;
  value: string;
  addr?: CellAddr;
  clientSeq?: number;
};

/** A list row a paste appends: the block it belongs to, the client-minted
 *  row key its edits are addressed by, and the row it follows. */
export type NewRow = {
  sheet: SheetKind;
  block: string;
  rowKey: string;
  after: string | null;
};

export type PastePlan = {
  edits: Edit[];
  newRows: NewRow[];
  /** Matrix rows that had nowhere to go on a fixed sheet. */
  clipped: number;
};

/** Every input cell's raw string, by key — what the server's `flatten` sends. */
export type SheetValues = Record<string, string>;

/** Every computed figure, by the `totals` key. Null is a figure that does not
 *  exist for this sheet (a ratio with no denominator), never zero. */
export type ComputedValues = Record<string, number | null>;
