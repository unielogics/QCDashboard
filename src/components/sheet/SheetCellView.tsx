"use client";

// One cell.
//
// The commit contract is lifted from `HudTab.tsx` — `InlineEdit` (:287) and
// `CurrencyEdit` (:333) already hold it: Enter commits, Escape reverts, blur
// commits. What a grid adds is type-to-replace and Tab-commits-and-moves, and
// what it cannot keep is their `<span>`: with a CSS grid instead of a table
// there is no implicit table semantics, so every rendered position — a void
// one included — is a `role="gridcell"` carrying its own row and column index.
//
// Two display rules that are not cosmetic:
//
// - **An unparseable value is shown verbatim**, with a warning corner and a
//   title saying so. Rendering "$0.00" for "1,2 50" is how a wrong number gets
//   filed, and the person who typed it would never see it happen.
// - **A computed figure that does not exist is an em dash, never a zero.** A
//   current ratio with no current liabilities is not 0.00.
//
// Formula cells are selectable and copyable and never editable: the subtotal
// belongs to the sheet, and typing over it would be a number nobody can trace.

import { memo, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cx } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { formatCount, formatMoney, formatRatio, parseMoney, parseRate } from "./money";
import type { CellMark } from "./useSheetValues";
import type { Editing } from "./useSelection";
import type { CellAddr, RowKind, SheetCell } from "./types";

/** Where the caret goes once the value is in. */
export type CommitHow = "enter" | "shift-enter" | "tab" | "shift-tab" | "blur";

export type CellDisplay = { text: string; warn: boolean; title?: string };

const NO_FIGURE = "—";

/** What a cell shows when it is not being typed into. */
export function cellDisplay(
  cell: SheetCell | null,
  value: string,
  computed: number | null | undefined,
): CellDisplay {
  if (!cell) return { text: "", warn: false };
  if (cell.type === "label") return { text: String(cell.label ?? ""), warn: false };

  if (cell.type === "formula") {
    // A memo line that echoes an input (the EBITDA add-backs) reads that
    // input; a blank one has no figure, and a blank one is not zero.
    const echoed = cell.compute ? null : parseMoney(value);
    const figure = cell.compute ? computed : echoed?.blank ? null : echoed?.value ?? null;
    if (figure === null || figure === undefined || !Number.isFinite(figure)) {
      return { text: NO_FIGURE, warn: false, title: "Not enough figures yet" };
    }
    if (cell.format === "ratio") return { text: formatRatio(figure), warn: false };
    if (cell.format === "count") return { text: formatCount(figure), warn: false };
    if (cell.format === "text") return { text: String(figure), warn: false };
    return { text: formatMoney(figure), warn: false };
  }

  const raw = String(value ?? "");
  if (raw.trim() === "") return { text: "", warn: false };

  if (cell.type === "money" || cell.format === "money") {
    const parsed = parseMoney(raw);
    if (parsed.warn) {
      return { text: raw, warn: true, title: `“${raw}” is not a number, so it counts as nothing in the totals.` };
    }
    return { text: formatMoney(parsed.value), warn: false };
  }
  if (cell.type === "rate") {
    const parsed = parseRate(raw);
    if (parsed.warn) {
      return { text: raw, warn: true, title: `“${raw}” is not a rate, so it counts as nothing.` };
    }
    return { text: formatRatio(parsed.value), warn: false };
  }
  return { text: raw, warn: false };
}

export type SheetCellViewProps = {
  cell: SheetCell | null;
  rowKind: RowKind;
  addr: CellAddr;
  /** ARIA indices: the position in the layout's row and column lists, 1-based.
   *  Not the workbook numbers — the debt schedule has no row 6 and the personal
   *  statement no column 3, and ARIA counts what is rendered. */
  ariaRow: number;
  ariaCol: number;
  span: number;
  value: string;
  computed: number | null | undefined;
  align: "left" | "right";
  editable: boolean;
  active: boolean;
  inRange: boolean;
  /** The roving tabindex: exactly one cell in the grid holds 0. */
  tabbable: boolean;
  editing: Editing | null;
  /** A remote edit that was discarded because this cell was being typed into. */
  mark?: CellMark | null;
  onCommit: (next: string, how: CommitHow) => void;
  onCancel: () => void;
};

function SheetCellViewInner({
  cell,
  rowKind,
  addr,
  ariaRow,
  ariaCol,
  span,
  value,
  computed,
  align,
  editable,
  active,
  inRange,
  tabbable,
  editing,
  mark,
  onCommit,
  onCancel,
}: SheetCellViewProps) {
  const shown = cellDisplay(cell, value, computed);
  const isFormula = cell?.type === "formula";
  const className = cx(
    "sg-cell",
    !cell && "sg-void",
    cell?.type === "label" && "sg-label",
    isFormula && "sg-formula",
    cell?.emphasis && "sg-em",
    editable && "sg-input",
    !editable && cell && cell.type !== "label" && !isFormula && "sg-locked",
    align === "right" && "sg-right",
    rowKind === "colhead" && "sg-colhead",
    rowKind === "title" && "sg-title",
    rowKind === "subtitle" && "sg-subtitle",
    rowKind === "heading" && "sg-heading",
    rowKind === "note" && "sg-note",
    active && "sg-active",
    inRange && "sg-inrange",
    shown.warn && "sg-warned",
    editing && "sg-editing",
  );
  const title = shown.title ?? cell?.hint ?? undefined;

  return (
    <div
      role="gridcell"
      aria-rowindex={ariaRow}
      aria-colindex={ariaCol}
      aria-colspan={span > 1 ? span : undefined}
      aria-readonly={cell && !editable ? true : undefined}
      aria-selected={active || inRange ? true : undefined}
      data-addr={`${addr.r}:${addr.c}`}
      data-editable={editable ? "1" : undefined}
      tabIndex={tabbable ? 0 : -1}
      title={title}
      className={className}
      style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
    >
      {editing ? (
        <CellEditor cell={cell} value={value} seed={editing.seed} onCommit={onCommit} onCancel={onCancel} />
      ) : (
        <>
          <span className="sg-text">{shown.text}</span>
          {shown.warn ? <span className="sg-flag" aria-hidden="true" /> : null}
          {mark ? (
            <span
              className="sg-mark"
              title={`${mark.name} changed this while you were typing. Your value was kept.`}
              aria-hidden="true"
            />
          ) : null}
        </>
      )}
    </div>
  );
}

export const SheetCellView = memo(SheetCellViewInner);

/** The cell at the end of a list row — the one place a line can be taken away.
 *
 *  A toolbar button that removes "the current line" acts on wherever the caret
 *  happens to be, and the caret is not always where the eye is: that is how
 *  somebody deletes the wrong debt. This control sits *on* the row it removes
 *  and says which row that is in its own accessible name — the lender once one
 *  has been typed, the line's position in the list until then. Never a bare
 *  "Remove", which is the same ambiguity written smaller.
 *
 *  Every row is given this cell, the column heads included, so the grid's
 *  tracks, the `aria-colindex` sequence and the number of cells in a row all
 *  stay in step; only a row a person may actually remove gets the button
 *  inside it. It is dimmed until the row is hovered or the button is focused,
 *  and it is a real button throughout — reachable by Tab, never `display:none`.
 *
 *  Keystrokes stop here. The grid's one delegated `keydown` reads Enter as
 *  "open this cell" and calls `preventDefault`, and `preventDefault` on Enter
 *  is precisely what stops a focused button from firing.
 */
export function SheetRowEnd({
  ariaRow,
  ariaCol,
  label,
  onRemove,
}: {
  ariaRow: number;
  ariaCol: number;
  /** The control's accessible name. Absent when there is nothing to remove. */
  label?: string | null;
  onRemove?: (() => void) | null;
}) {
  return (
    <div
      role="gridcell"
      aria-rowindex={ariaRow}
      aria-colindex={ariaCol}
      className="sg-cell sg-rowend"
      onKeyDown={(event) => event.stopPropagation()}
    >
      {onRemove && label ? (
        <button type="button" className="sg-rowdel" aria-label={label} title={label} onClick={() => onRemove()}>
          <Icon name="trash" size={13} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/** The editor, mounted only while the cell is open so its draft starts fresh
 *  every time. A seed is the character that opened it — the old value is gone,
 *  which is what typing over a selected cell means in a spreadsheet. */
function CellEditor({
  cell,
  value,
  seed,
  onCommit,
  onCancel,
}: {
  cell: SheetCell | null;
  value: string;
  seed: string | null;
  onCommit: (next: string, how: CommitHow) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(seed === null ? String(value ?? "") : seed);
  const cancelled = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.focus();
      // Opened from Enter or a double click: the raw string, selected, so the
      // next keystroke replaces it and an arrow key does not.
      if (seed === null) input.select();
      else input.setSelectionRange(input.value.length, input.value.length);
      return;
    }
    selectRef.current?.focus();
  }, [seed]);

  const finish = (next: string, how: CommitHow) => {
    cancelled.current = true;
    onCommit(next, how);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    // The editor owns the keyboard while it is open; nothing here reaches the
    // grid's delegated handler.
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      finish(draft, event.shiftKey ? "shift-enter" : "enter");
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      finish(draft, event.shiftKey ? "shift-tab" : "tab");
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelled.current = true;
      onCancel();
    }
  };

  if (cell?.options?.length) {
    return (
      <select
        ref={selectRef}
        className="field sg-editor"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          finish(event.target.value, "blur");
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (!cancelled.current) onCommit(draft, "blur");
        }}
        aria-label={cell.label ?? cell.key ?? undefined}
      >
        <option value="" />
        {cell.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      ref={inputRef}
      className="field sg-editor"
      type={cell?.type === "date" ? "date" : "text"}
      inputMode={cell?.type === "money" || cell?.type === "rate" ? "decimal" : undefined}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => {
        if (!cancelled.current) onCommit(draft, "blur");
      }}
      aria-label={cell?.label ?? cell?.key ?? undefined}
    />
  );
}
