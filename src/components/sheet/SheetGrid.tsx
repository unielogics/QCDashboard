"use client";

// The grid.
//
// **CSS Grid, not a `<table>`.** A sticky first column and a sticky heading
// row are two declarations on grid items and a fight on `<td>`s; a personal
// statement's summary band spanning six columns is one `grid-column: span n`.
// What that costs is implicit table semantics, so it is paid back explicitly:
// `role="grid"`/`row`/`gridcell` and `aria-rowindex`/`aria-colindex` on every
// rendered position, void ones included, because a screen reader counting
// columns must count the same way the eye does.
//
// **One delegated keydown** on the wrapper, and one interpretation of it
// (`interpretKey`). Every rule about where the caret goes lives in
// `useSelection`/`coords`, which are pure and tested; this file is the wiring.
//
// **Clipboard is bound to the copy/cut/paste events, not to Ctrl+C.** Those
// events are the only way to reach the real clipboard without the async
// permission API. The 1×1 offscreen `.sg-catcher` textarea is what makes them
// fire: a copy keystroke first moves focus into it with the TSV selected —
// which is also what makes copy work in Safari, where a copy event on a
// non-editable element with no selection simply never happens — and focus
// returns to the cell as soon as the event has been handled.
//
// **No virtualization.** The largest sheet is the personal statement at ~120
// rows. Windowing would fight Ctrl+End and paste-appends for no gain.
//
// **A list row carries its own remove control**, in one extra track at the end
// of the sheet. It is a track on the whole grid rather than on the rows that
// use it — `--sg-cols` is the template every row shares — so each row emits a
// closing cell whether or not there is anything in it, and the ARIA column
// count, the column heads and the row's own cell count stay in step.
//
// **The sheet is a document, not a ribbon.** The workbook's column widths are
// character units and they are the floor, never the ceiling: the label column
// is `minmax(natural, 1fr)` and the figure columns keep their own width, so a
// two-column statement grows into the room on a wide screen with the money
// still landing on one edge, and the CSS stops the whole thing at a page width
// and centres it. A sheet wider than the box — the twelve-column debt schedule
// — has no free space to hand out, so it renders and scrolls exactly as it did.

import { useCallback, useEffect, useMemo, useRef, type CSSProperties, type ClipboardEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { cx } from "@/components/ds";
import { cellAt, isEditable, normalizeRange, rangeCells, rowAt } from "./coords";
import { cellText, parseTsv, planPaste, toTsv } from "./clipboard";
import { SheetCellView, SheetRowEnd, type CommitHow } from "./SheetCellView";
import { useSelection, type SelectionState } from "./useSelection";
import type { CellMark } from "./useSheetValues";
import { isListRow } from "./types";
import type { CellAddr, ComputedValues, Edit, SheetCell, SheetLayout, SheetRow, SheetValues } from "./types";

/** Where the caret is, for the toolbar's row buttons and for the presence
 *  half's cursor stream. Values never travel with a cursor. */
export type GridCursor = {
  addr: CellAddr;
  rowKey: string | null;
  block: string | null;
  editing: boolean;
};

export type SheetGridProps = {
  layout: SheetLayout;
  values: SheetValues;
  computed: ComputedValues;
  /** False on a view-only link: everything selects and copies, nothing opens. */
  canEdit: boolean;
  /** Row keys this participant may not write — a debt row another origin owns. */
  lockedRows?: ReadonlySet<string> | null;
  /** "changed by X" markers, by cell key. */
  marks?: Record<string, CellMark>;
  /** The presence half's cursor overlay, positioned by the live slice. */
  overlay?: ReactNode;
  onEdits: (edits: Edit[]) => void;
  onBeginEdit?: (key: string) => void;
  onEndEdit?: (key: string) => void;
  onPaste?: (topLeft: CellAddr, matrix: string[][]) => void;
  onCursor?: (cursor: GridCursor) => void;
  /** Sentences for the toolbar: what a paste did, why Ctrl+Z is not here. */
  onNotice?: (message: string | null) => void;
  /** Take one line off one of the two list-shaped sheets. Absent where there
   *  is nothing to remove — a fixed statement, a view-only link, or a
   *  container with no row transport — and the gutter is not drawn at all. */
  onRemoveRow?: (row: { rowKey: string; block: string; label: string }) => void;
};

const MIN_COL = 72;
const MAX_COL = 380;
/** The track at the end of a list row that holds its remove control. Wide
 *  enough for a 13px glyph and its hit area, narrow enough that it reads as a
 *  margin rather than a thirteenth column. */
const ROW_END_PX = 34;
/** The workbook's column widths are in character units; this is the ratio the
 *  xlsx renderer's own defaults were chosen against. */
const CHAR_PX = 7.4;

function columnPx(width: number | undefined): number {
  const px = Math.round((width ?? 16) * CHAR_PX);
  return Math.max(MIN_COL, Math.min(MAX_COL, px));
}

/** The width the sheet asks for: every column at the workbook's own size. It
 *  is handed to the CSS as `--sg-natural` and does two jobs there — it is the
 *  floor under the grid (below it the box scrolls sideways, which is what the
 *  twelve-column debt schedule needs) and it is what the scroll box's
 *  document cap is measured against. */
function naturalPx(layout: SheetLayout, rowEnd: boolean): number {
  const columns = layout.columns.reduce((total, column) => total + columnPx(column.width), 0);
  return columns + (rowEnd ? ROW_END_PX : 0);
}

/** The column template. The label column is `minmax(natural, 1fr)` and every
 *  figure column keeps its natural width, so a two-column statement on a wide
 *  screen grows down the left — the labels get the room — and the money stays
 *  right-aligned at one predictable edge instead of drifting across a 1500px
 *  monitor. When the sheet is wider than the box there is no free space to
 *  hand out and `1fr` resolves to exactly the natural width, so the scrolling
 *  sheets render as they always did. */
function columnTemplate(layout: SheetLayout, rowEnd: boolean): string {
  const tracks = layout.columns.map((column, index) =>
    index === 0 ? `minmax(${columnPx(column.width)}px, 1fr)` : `${columnPx(column.width)}px`,
  );
  // One extra fixed track, on every row of the sheet rather than on the rows
  // that use it, because `--sg-cols` is the whole grid's template: a row with
  // one track fewer would put its own columns out of step with the headings.
  if (rowEnd) tracks.push(`${ROW_END_PX}px`);
  return tracks.join(" ");
}

/** How many *rendered* columns a cell covers. `colspan` counts workbook
 *  columns and the personal statement's column list has a hole in it (there is
 *  no column 3), so the two numbers are not the same and the grid places cells
 *  by the rendered one. */
function spanOf(layout: SheetLayout, cell: SheetCell): number {
  const width = Math.max(1, cell.colspan ?? 1);
  if (width === 1) return 1;
  const covered = layout.columns.filter((column) => column.c >= cell.c && column.c < cell.c + width).length;
  return Math.max(1, covered);
}

// ── a subtotal of nothing ───────────────────────────────────────────────────
//
// "Gross profit $0.00" on a sheet nobody has filled in is a claim about the
// business, and it is not one the sheet is entitled to make. The memo lines
// already know this — a blank add-back shows an em dash — and these three
// functions extend the same rule to every subtotal, by asking whether any of
// the figures a formula reads has actually been typed.
//
// The layout carries the arithmetic: `formula` is written against keys in
// braces (`={gross_revenue}-{cost_of_goods_sold}`, `=SUM({supplies}:{other})`)
// and it is never evaluated here — only read for its names. A name is either
// an input key, another formula's `xlsx_name` (which is followed), or
// something this sheet does not define, and an undefined name counts as
// present, because hiding a figure that exists is the worse mistake.

type FormulaIndex = {
  /** Input key → the column it sits in and its position in row order. */
  inputs: Map<string, { c: number; order: number }>;
  /** Input keys per column, in row order, for expanding `{a}:{b}`. */
  byColumn: Map<number, string[]>;
  /** Formula name → the formula text. */
  formulas: Map<string, string>;
};

const REF = /\{([^}]+)\}/g;
const RANGE = /\{([^}]+)\}\s*:\s*\{([^}]+)\}/g;

export function indexFormulas(layout: SheetLayout): FormulaIndex {
  const inputs = new Map<string, { c: number; order: number }>();
  const byColumn = new Map<number, string[]>();
  const formulas = new Map<string, string>();
  let order = 0;
  for (const row of layout.rows) {
    for (const cell of row.cells ?? []) {
      if (cell.type === "formula") {
        if (cell.xlsx_name && cell.formula) formulas.set(cell.xlsx_name, cell.formula);
        continue;
      }
      if (!cell.key) continue;
      const column = byColumn.get(cell.c) ?? [];
      column.push(cell.key);
      byColumn.set(cell.c, column);
      inputs.set(cell.key, { c: cell.c, order: order++ });
    }
  }
  return { inputs, byColumn, formulas };
}

/** The names one formula reads, with `{a}:{b}` expanded over the inputs
 *  between the two endpoints in the endpoints' own column — a range down the
 *  balance column of the debt schedule must not pick up the payment column. */
function refsOf(formula: string, index: FormulaIndex): string[] {
  const out: string[] = [];
  const rest = formula.replace(RANGE, (whole, from: string, to: string) => {
    const start = index.inputs.get(from);
    const end = index.inputs.get(to);
    // An endpoint this sheet has no input for is left in place, so the pass
    // below reads it as an ordinary name rather than dropping it.
    if (!start || !end || start.c !== end.c) return whole;
    const low = Math.min(start.order, end.order);
    const high = Math.max(start.order, end.order);
    for (const key of index.byColumn.get(start.c) ?? []) {
      const at = index.inputs.get(key);
      if (at && at.order >= low && at.order <= high) out.push(key);
    }
    return "";
  });
  for (const match of rest.matchAll(REF)) out.push(match[1]);
  return out;
}

/** Has anything this name stands for been typed? `seen` is the cycle guard:
 *  a name already on the walk contributes nothing, and a name already settled
 *  as absent cannot become present on a second path. */
function hasFigure(name: string, index: FormulaIndex, values: SheetValues, seen: Set<string>): boolean {
  const input = index.inputs.get(name);
  if (input) return String(values[name] ?? "").trim() !== "";
  const formula = index.formulas.get(name);
  if (formula === undefined) return true;
  if (seen.has(name)) return false;
  seen.add(name);
  return refsOf(formula, index).some((ref) => hasFigure(ref, index, values, seen));
}

/** Every formula name on the sheet that reads nothing but blanks. */
export function blankFormulaNames(index: FormulaIndex, values: SheetValues): Set<string> {
  const out = new Set<string>();
  for (const [name] of index.formulas) {
    if (!hasFigure(name, index, values, new Set())) out.add(name);
  }
  return out;
}

/** What a formula cell shows. Only a zero is ever withheld: if the figure is
 *  anything else it is a real number and it is rendered, whatever this file
 *  believes about the inputs it was made from. */
export function shownFigure(
  cell: SheetCell,
  computed: ComputedValues,
  blanks: ReadonlySet<string>,
): number | null {
  const figure = cell.compute ? computed[cell.compute] ?? null : null;
  if (figure !== 0) return figure;
  const name = cell.xlsx_name ?? cell.compute ?? null;
  return name && blanks.has(name) ? null : 0;
}

// Which rows a person may take off the sheet. Defined in `types` beside the
// row itself, because the same rule decides how many lines the sheet reports
// it is showing when it asks for one more.
export { isListRow };

/** What the remove control on this row is called. The row's own name once the
 *  person has typed one — the lender, the creditor, the property — and its
 *  place in the list until then. The name is the only thing standing between
 *  somebody and deleting a different debt from the one they are looking at,
 *  so "Remove" on its own is never an answer. */
export function removeLabel(row: SheetRow, values: SheetValues): string {
  for (const cell of row.cells ?? []) {
    if (!cell.key) continue;
    if (cell.type !== "text" && cell.type !== "select") continue;
    const named = String(values[cell.key] ?? "").trim();
    if (named) return `Remove ${named}`;
  }
  return `Remove line ${row.ordinal ?? row.r}`;
}

/** Every figure *as the sheet shows it*: the arithmetic's map with each
 *  subtotal that reads as an em dash on screen set back to null.
 *
 *  This is what the clipboard is handed. `cellText` formats the `computed` map
 *  it is given and has no way to know that a total of nothing is being
 *  withheld, so copying an untouched sheet used to put a `0` on the clipboard
 *  under a heading the screen left blank — a figure somebody could paste into
 *  a lender's model as though the business had reported it. */
export function shownFigures(
  layout: SheetLayout,
  computed: ComputedValues,
  blanks: ReadonlySet<string>,
): ComputedValues {
  const out: ComputedValues = { ...computed };
  for (const row of layout.rows) {
    for (const cell of row.cells ?? []) {
      if (cell.type !== "formula" || !cell.compute) continue;
      if (shownFigure(cell, computed, blanks) === null) out[cell.compute] = null;
    }
  }
  return out;
}

export function SheetGrid({
  layout,
  values,
  computed,
  canEdit,
  lockedRows,
  marks,
  overlay,
  onEdits,
  onBeginEdit,
  onEndEdit,
  onPaste,
  onCursor,
  onNotice,
  onRemoveRow,
}: SheetGridProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const catcherRef = useRef<HTMLTextAreaElement | null>(null);
  const dragging = useRef(false);
  const wantsFocus = useRef(false);

  const ctx = useMemo(
    () => ({ layout, values, canEdit, lockedRows: lockedRows ?? null }),
    [layout, values, canEdit, lockedRows],
  );
  const { state, dispatch, read } = useSelection(ctx);

  const index = useMemo(() => indexFormulas(layout), [layout]);
  const blanks = useMemo(() => blankFormulaNames(index, values), [index, values]);

  /** What the clipboard copies from: the screen's figures, not the
   *  arithmetic's. See `shownFigures`. */
  const shownComputed = useMemo(() => shownFigures(layout, computed, blanks), [blanks, computed, layout]);

  /** Which rows carry a remove control, and therefore whether the sheet has a
   *  gutter at all. The track is drawn for a sheet that *has* list rows even
   *  when one of them is locked, so a row somebody else owns keeps its place
   *  in the columns with an empty cell rather than a short row. */
  const rowEnd = !!onRemoveRow && canEdit && layout.rows.some(isListRow);
  const removableRow = useCallback(
    (row: SheetRow): boolean => {
      if (!rowEnd || !isListRow(row)) return false;
      return !(row.row_key && lockedRows?.has(row.row_key));
    },
    [lockedRows, rowEnd],
  );

  const editableAt = useCallback(
    (row: SheetRow | undefined, cell: SheetCell | null): boolean => {
      if (!canEdit || !isEditable(cell)) return false;
      const rowKey = row?.row_key ?? null;
      return !(rowKey && lockedRows?.has(rowKey));
    },
    [canEdit, lockedRows],
  );

  // ── focus ───────────────────────────────────────────────────────────────

  const focusActive = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const target = wrap.querySelector<HTMLElement>(`[data-addr="${state.active.r}:${state.active.c}"]`);
    target?.focus({ preventScroll: false });
  }, [state.active]);

  useEffect(() => {
    if (state.editing) return;
    if (!wantsFocus.current) return;
    focusActive();
  }, [focusActive, state.editing, state.active]);

  // ── the cursor feed ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!onCursor) return;
    const row = rowAt(layout, state.active.r);
    onCursor({
      addr: state.active,
      rowKey: row?.row_key ?? null,
      block: row?.block ?? null,
      editing: !!state.editing,
    });
  }, [layout, onCursor, state.active, state.editing]);

  // ── commands ────────────────────────────────────────────────────────────

  /** Every editable cell inside the current selection, as blanking edits. One
   *  list, one save: clearing a column of twenty figures is one change. */
  const rangeEdits = useCallback(
    (value: string): Edit[] => {
      const cells = rangeCells(layout, state.anchor, state.active);
      const edits: Edit[] = [];
      for (const { addr, row, cell } of cells) {
        if (!editableAt(row, cell) || !cell.key) continue;
        edits.push({ sheet: layout.kind, key: cell.key, value, addr });
      }
      return edits;
    },
    [editableAt, layout, state.active, state.anchor],
  );

  const clearRange = useCallback(() => {
    const edits = rangeEdits("");
    if (!edits.length) {
      onNotice?.("Nothing there can be cleared from here.");
      return;
    }
    onEdits(edits);
  }, [onEdits, onNotice, rangeEdits]);

  /** Ctrl+D. The fill handle's job without the fill handle: the top row of the
   *  selection, repeated down it. `planPaste` decides what is writable, so a
   *  subtotal or a heading in the way is stepped over rather than filled. */
  const fillDown = useCallback(() => {
    const { r1, c1, r2, c2 } = normalizeRange(state.anchor, state.active);
    const rows = layout.rows.filter((row) => row.r >= r1 && row.r <= r2);
    if (rows.length < 2) {
      onNotice?.("Select the cell and the cells under it, then press Ctrl+D.");
      return;
    }
    const columns = layout.columns.filter((column) => column.c >= c1 && column.c <= c2);
    const source = rows[0];
    const line = columns.map((column) => {
      const cell = source.cells?.find((candidate) => candidate.c === column.c) ?? null;
      return cellText(cell, values, shownComputed);
    });
    const matrix = rows.map(() => [...line]);
    const plan = planPaste(layout, values, { r: source.r, c: c1 }, matrix);
    if (!plan.edits.length) {
      onNotice?.("There is nothing to fill into.");
      return;
    }
    onEdits(plan.edits);
    onNotice?.(null);
  }, [layout, onEdits, onNotice, shownComputed, state.active, state.anchor, values]);

  /** Move focus into the offscreen textarea so the browser's own clipboard
   *  event fires, with the payload already selected for the browsers that will
   *  not fire `copy` without a selection. */
  const primeCatcher = useCallback((text: string | null) => {
    const catcher = catcherRef.current;
    if (!catcher) return;
    catcher.value = text ?? "";
    catcher.focus({ preventScroll: true });
    if (text) catcher.select();
  }, []);

  const restoreFocus = useCallback(() => {
    wantsFocus.current = true;
    // After the clipboard event has been delivered, not during it.
    setTimeout(() => focusActive(), 0);
  }, [focusActive]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const outcome = read(event);
      if (!outcome) return;
      wantsFocus.current = true;
      if (outcome.preventDefault) event.preventDefault();
      if (outcome.command) {
        switch (outcome.command) {
          case "copy":
          case "cut":
            primeCatcher(toTsv(layout, values, shownComputed, state.anchor, state.active));
            return;
          case "paste":
            primeCatcher("");
            return;
          case "clear":
            clearRange();
            return;
          case "fillDown":
            fillDown();
            return;
          case "undoUnavailable":
            // Not a stub: an undo stack would revert somebody else's cell,
            // because remote edits arrive while you work.
            onNotice?.(
              "There is no undo here — other people may be editing the same sheet, and everything saves as you type. Retype the value, or use Download to keep a copy before a big change.",
            );
            return;
          default:
            return;
        }
      }
      if (outcome.action) dispatch(outcome.action);
    },
    [clearRange, dispatch, fillDown, layout, onNotice, primeCatcher, read, shownComputed, state.active, state.anchor, values],
  );

  const onCopy = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (state.editing) return;
      event.clipboardData?.setData("text/plain", toTsv(layout, values, shownComputed, state.anchor, state.active));
      event.preventDefault();
      restoreFocus();
    },
    [layout, restoreFocus, shownComputed, state.active, state.anchor, state.editing, values],
  );

  const onCut = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (state.editing) return;
      event.clipboardData?.setData("text/plain", toTsv(layout, values, shownComputed, state.anchor, state.active));
      event.preventDefault();
      if (canEdit) clearRange();
      restoreFocus();
    },
    [canEdit, clearRange, layout, restoreFocus, shownComputed, state.active, state.anchor, state.editing, values],
  );

  const onPasteEvent = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (state.editing) return;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      event.preventDefault();
      restoreFocus();
      if (!canEdit) {
        onNotice?.("This link is view only, so nothing was pasted.");
        return;
      }
      if (!text) return;
      onPaste?.(state.active, parseTsv(text));
    },
    [canEdit, onNotice, onPaste, restoreFocus, state.active, state.editing],
  );

  // ── mouse ───────────────────────────────────────────────────────────────

  const addrFrom = (target: EventTarget | null): CellAddr | null => {
    const element = (target as HTMLElement | null)?.closest?.("[data-addr]");
    const raw = element?.getAttribute("data-addr");
    if (!raw) return null;
    const [r, c] = raw.split(":").map((part) => Number(part));
    return Number.isFinite(r) && Number.isFinite(c) ? { r, c } : null;
  };

  const onMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const addr = addrFrom(event.target);
      if (!addr) return;
      if (state.editing && addr.r === state.editing.addr.r && addr.c === state.editing.addr.c) return;
      wantsFocus.current = true;
      dragging.current = true;
      if (state.editing) {
        // Clicking away from an open editor has to commit it, and the commit
        // is the input's own blur. Moving the selection here and now would
        // unmount the input first and the keystrokes would be gone, so the
        // click is honoured one turn later — after the blur has landed.
        const extend = event.shiftKey;
        setTimeout(() => dispatch({ type: "select", addr, extend }), 0);
        return;
      }
      dispatch({ type: "select", addr, extend: event.shiftKey });
    },
    [dispatch, state.editing],
  );

  const onMouseOver = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!dragging.current || state.editing) return;
      const addr = addrFrom(event.target);
      if (!addr) return;
      dispatch({ type: "select", addr, extend: true });
    },
    [dispatch, state.editing],
  );

  const onDoubleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const addr = addrFrom(event.target);
      if (!addr) return;
      dispatch({ type: "edit", addr, seed: null });
    },
    [dispatch],
  );

  useEffect(() => {
    const stop = () => {
      dragging.current = false;
    };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

  // ── the editor's contract ───────────────────────────────────────────────

  const editingCell = state.editing ? cellAt(layout, state.editing.addr) : null;
  const editingKey = editingCell?.key ?? null;

  useEffect(() => {
    if (!editingKey) return;
    onBeginEdit?.(editingKey);
    return () => onEndEdit?.(editingKey);
  }, [editingKey, onBeginEdit, onEndEdit]);

  const onCommit = useCallback(
    (next: string, how: CommitHow) => {
      const addr = state.editing?.addr;
      const cell = addr ? cellAt(layout, addr) : null;
      wantsFocus.current = true;
      if (cell?.key && editableAt(rowAt(layout, addr!.r), cell)) {
        const before = values[cell.key] ?? "";
        if (before !== next) onEdits([{ sheet: layout.kind, key: cell.key, value: next, addr }]);
      }
      const hop =
        how === "enter" ? "down" : how === "shift-enter" ? "up" : how === "tab" ? "next" : how === "shift-tab" ? "prev" : null;
      dispatch({ type: "done", hop });
    },
    [dispatch, editableAt, layout, onEdits, state.editing, values],
  );

  const onCancel = useCallback(() => {
    wantsFocus.current = true;
    dispatch({ type: "cancel" });
  }, [dispatch]);

  // ── render ──────────────────────────────────────────────────────────────

  const template = useMemo(() => columnTemplate(layout, rowEnd), [layout, rowEnd]);
  // The sheet's own width, for the CSS: the floor the grid never goes under
  // (below it the box scrolls sideways) and the width a short sheet is
  // measured against before the page cap centres it.
  const wrapStyle = useMemo(
    () => ({ ["--sg-natural" as string]: `${naturalPx(layout, rowEnd)}px` }) as CSSProperties,
    [layout, rowEnd],
  );
  const bounds = useMemo(() => normalizeRange(state.anchor, state.active), [state.anchor, state.active]);

  return (
    <div
      className="sg-wrap"
      style={wrapStyle}
      ref={wrapRef}
      onKeyDown={onKeyDown}
      onCopy={onCopy}
      onCut={onCut}
      onPaste={onPasteEvent}
    >
      <div
        className="sg-grid"
        role="grid"
        aria-label={layout.title}
        aria-rowcount={layout.rows.length}
        aria-colcount={layout.columns.length + (rowEnd ? 1 : 0)}
        aria-readonly={canEdit ? undefined : true}
        style={{ ["--sg-cols" as string]: template }}
        onMouseDown={onMouseDown}
        onMouseOver={onMouseOver}
        onDoubleClick={onDoubleClick}
      >
        {layout.rows.map((row, rowIndex) => (
          <div key={row.r} role="row" aria-rowindex={rowIndex + 1} className={cx("sg-row", `sg-r-${row.kind}`)}>
            {renderRow(row, rowIndex)}
          </div>
        ))}
      </div>
      {overlay}
      <textarea
        ref={catcherRef}
        className="sg-catcher"
        tabIndex={-1}
        aria-hidden="true"
        readOnly={!canEdit}
        onChange={() => undefined}
      />
    </div>
  );

  function renderRow(row: SheetRow, rowIndex: number): ReactNode {
    const out: ReactNode[] = [];
    let index = 0;
    while (index < layout.columns.length) {
      const column = layout.columns[index];
      const cell = row.cells?.find((candidate) => candidate.c === column.c) ?? null;
      const span = cell ? spanOf(layout, cell) : 1;
      const addr: CellAddr = { r: row.r, c: column.c };
      const editable = editableAt(row, cell);
      const inRange =
        !(bounds.r1 === bounds.r2 && bounds.c1 === bounds.c2) &&
        row.r >= bounds.r1 &&
        row.r <= bounds.r2 &&
        column.c >= bounds.c1 &&
        column.c <= bounds.c2;
      const active = state.active.r === row.r && state.active.c === column.c;
      // Numbers right, words left — the spreadsheet rule, and the reason the
      // column's own alignment is only the fallback: the input column of a
      // statement is a money column, and "Business name" is not money.
      const align: "left" | "right" =
        cell && (cell.type === "money" || cell.type === "rate" || cell.type === "formula")
          ? "right"
          : cell && (cell.type === "text" || cell.type === "date" || cell.type === "select")
            ? "left"
            : column.align === "right"
              ? "right"
              : "left";
      const key = cell?.key ?? null;
      const value = key ? values[key] ?? "" : cell?.source ? values[cell.source] ?? "" : "";
      out.push(
        <SheetCellView
          key={`${row.r}:${column.c}`}
          cell={cell}
          rowKind={row.kind}
          addr={addr}
          ariaRow={rowIndex + 1}
          ariaCol={index + 1}
          span={span}
          value={value}
          computed={cell ? shownFigure(cell, computed, blanks) : null}
          align={align}
          editable={editable}
          active={active}
          inRange={inRange}
          tabbable={active}
          editing={state.editing && active ? state.editing : null}
          mark={key ? marks?.[`${layout.kind}:${key}`] ?? null : null}
          onCommit={onCommit}
          onCancel={onCancel}
        />,
      );
      // A spanning cell covers the columns it reaches; ARIA is told with
      // `aria-colspan` rather than by emitting an element per covered track,
      // which would double-count the row.
      index += Math.max(1, span);
    }
    // The gutter closes every row that the grid draws a track for — the
    // column heads and the banner rows included, empty. A row one cell short
    // of its headings is a row whose columns have quietly shifted.
    if (rowEnd) {
      const removable = removableRow(row);
      out.push(
        <SheetRowEnd
          key={`${row.r}:end`}
          ariaRow={rowIndex + 1}
          ariaCol={layout.columns.length + 1}
          label={removable ? removeLabel(row, values) : null}
          onRemove={
            removable && row.row_key && row.block
              ? () =>
                  onRemoveRow?.({
                    rowKey: row.row_key as string,
                    block: row.block as string,
                    label: removeLabel(row, values),
                  })
              : null
          }
        />,
      );
    }
    return out;
  }
}

export type { SelectionState };
