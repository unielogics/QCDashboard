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

import { useCallback, useEffect, useMemo, useRef, type ClipboardEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { cx } from "@/components/ds";
import { cellAt, isEditable, normalizeRange, rangeCells, rowAt } from "./coords";
import { cellText, parseTsv, planPaste, toTsv } from "./clipboard";
import { SheetCellView, type CommitHow } from "./SheetCellView";
import { useSelection, type SelectionState } from "./useSelection";
import type { CellMark } from "./useSheetValues";
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
};

const MIN_COL = 72;
const MAX_COL = 380;
/** The workbook's column widths are in character units; this is the ratio the
 *  xlsx renderer's own defaults were chosen against. */
const CHAR_PX = 7.4;

function columnPx(width: number | undefined): number {
  const px = Math.round((width ?? 16) * CHAR_PX);
  return Math.max(MIN_COL, Math.min(MAX_COL, px));
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
      return cellText(cell, values, computed);
    });
    const matrix = rows.map(() => [...line]);
    const plan = planPaste(layout, values, { r: source.r, c: c1 }, matrix);
    if (!plan.edits.length) {
      onNotice?.("There is nothing to fill into.");
      return;
    }
    onEdits(plan.edits);
    onNotice?.(null);
  }, [computed, layout, onEdits, onNotice, state.active, state.anchor, values]);

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
            primeCatcher(toTsv(layout, values, computed, state.anchor, state.active));
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
    [clearRange, computed, dispatch, fillDown, layout, onNotice, primeCatcher, read, state.active, state.anchor, values],
  );

  const onCopy = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (state.editing) return;
      event.clipboardData?.setData("text/plain", toTsv(layout, values, computed, state.anchor, state.active));
      event.preventDefault();
      restoreFocus();
    },
    [computed, layout, restoreFocus, state.active, state.anchor, state.editing, values],
  );

  const onCut = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (state.editing) return;
      event.clipboardData?.setData("text/plain", toTsv(layout, values, computed, state.anchor, state.active));
      event.preventDefault();
      if (canEdit) clearRange();
      restoreFocus();
    },
    [canEdit, clearRange, computed, layout, restoreFocus, state.active, state.anchor, state.editing, values],
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

  const template = useMemo(
    () => layout.columns.map((column) => `${columnPx(column.width)}px`).join(" "),
    [layout.columns],
  );
  const bounds = useMemo(() => normalizeRange(state.anchor, state.active), [state.anchor, state.active]);

  return (
    <div
      className="sg-wrap"
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
        aria-colcount={layout.columns.length}
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
          computed={cell?.compute ? computed[cell.compute] ?? null : null}
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
    return out;
  }
}

export type { SelectionState };
