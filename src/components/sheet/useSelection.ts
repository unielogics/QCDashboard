"use client";

// The selection: which cell has focus, which corner it was extended from, and
// whether it is being typed into. A reducer over `coords.ts`, so every rule is
// one pure function of (state, action, layout) and the tests never need a DOM.
//
// The rules, from the design's §5, and the reasons they differ from each other:
//
// - **Arrows land on anything rendered**, formula cells and headings included.
//   That is Sheets behaviour, and it is what makes copying a subtotal work.
// - **Tab and Enter-after-commit land only on inputs.** Filling a form by
//   pressing Tab should never stop on a heading; navigating with the arrow
//   keys should never refuse to visit a total.
// - **Ctrl+arrow** walks the filled run; **Home/End** are the row's ends and
//   Ctrl+Home/End the sheet's.
// - **Any printable character starts editing and replaces**, the way a
//   spreadsheet does: you select a cell, you type, the old value is gone.
// - **There is no Ctrl+Z.** Remote edits arrive while you work, so a naive
//   undo stack reverts somebody else's cell — `interpretKey` answers the
//   keystroke with a command the grid explains in words rather than an action
//   that quietly does the wrong thing.

import { useCallback, useMemo, useReducer, useRef } from "react";
import {
  anchorOf,
  cellAt,
  ctrlJump,
  firstAddr,
  homeEnd,
  isEditable,
  move,
  nextEditable,
  type Direction,
} from "./coords";
import type { CellAddr, SelectionMode, SheetLayout, SheetValues } from "./types";

/** The cell being typed into. `seed` is the character that started the edit —
 *  null when editing began from Enter or a double click, in which case the
 *  editor opens on the existing value with it selected. */
export type Editing = { addr: CellAddr; seed: string | null };

export type SelectionState = {
  active: CellAddr;
  anchor: CellAddr;
  editing: Editing | null;
  mode: SelectionMode;
};

/** What the reducer needs to know about the sheet. Held by the caller and
 *  passed in, so the reducer itself stays a pure function of its arguments. */
export type SelectionContext = {
  layout: SheetLayout;
  values: SheetValues;
  /** False on a view-only link: every cell still selects and copies, none opens. */
  canEdit: boolean;
  /** Row keys this participant may not write — a debt row another origin owns. */
  lockedRows?: ReadonlySet<string> | null;
};

export type SelectionAction =
  /** Click, or a programmatic jump. */
  | { type: "select"; addr: CellAddr; extend?: boolean }
  | { type: "move"; dir: Direction; extend?: boolean; jump?: boolean }
  /** Tab, and Enter once a commit has landed. */
  | { type: "hop"; dir: "next" | "prev" | "down" | "up" }
  | { type: "edge"; which: "home" | "end"; whole?: boolean; extend?: boolean }
  | { type: "edit"; seed?: string | null; addr?: CellAddr }
  | { type: "cancel" }
  /** The editor committed. `hop` is where the caret goes next. */
  | { type: "done"; hop?: "down" | "next" | "prev" | "up" | null }
  | { type: "reset"; addr?: CellAddr };

/** The keystrokes the grid answers with something other than a move. */
export type GridCommand = "copy" | "cut" | "paste" | "clear" | "fillDown" | "undoUnavailable";

export type KeyOutcome = {
  action?: SelectionAction;
  command?: GridCommand;
  /** False for copy/cut/paste: the native clipboard event has to be allowed
   *  to fire — it is the only way to reach the real clipboard. */
  preventDefault: boolean;
};

/** Enough of a KeyboardEvent to decide, so the tests can pass an object. */
export type KeyLike = {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
};

const DIRECTIONS: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

export function initialSelection(layout: SheetLayout): SelectionState {
  const start = anchorOf(layout, firstAddr(layout));
  // Open on the first cell somebody can type into when there is one: the top
  // left of a statement is its title, and landing there means the first thing
  // a Tab does is leave the header.
  const first = isEditable(cellAt(layout, start)) ? start : nextEditable(layout, start, "next") ?? start;
  return { active: first, anchor: first, editing: null, mode: "cell" };
}

function sameAddr(a: CellAddr, b: CellAddr): boolean {
  return a.r === b.r && a.c === b.c;
}

function settle(state: SelectionState, addr: CellAddr, extend: boolean): SelectionState {
  const anchor = extend ? state.anchor : addr;
  const mode: SelectionMode = sameAddr(anchor, addr) ? "cell" : "range";
  if (sameAddr(state.active, addr) && sameAddr(state.anchor, anchor) && state.mode === mode && !state.editing) {
    return state;
  }
  return { active: addr, anchor, editing: null, mode };
}

/** Whether this participant may open the cell at an address. A view-only link
 *  and a row owned by somebody else are both refusals, and both leave the cell
 *  selectable and copyable — the accountant reading over your shoulder is a
 *  case worth building deliberately. */
export function canOpen(ctx: SelectionContext, addr: CellAddr): boolean {
  if (!ctx.canEdit) return false;
  const cell = cellAt(ctx.layout, addr);
  if (!isEditable(cell)) return false;
  const row = ctx.layout.rows.find((candidate) => candidate.r === addr.r);
  const rowKey = row?.row_key ?? null;
  if (rowKey && ctx.lockedRows?.has(rowKey)) return false;
  return true;
}

export function selectionReducer(
  state: SelectionState,
  action: SelectionAction,
  ctx: SelectionContext,
): SelectionState {
  const { layout } = ctx;
  switch (action.type) {
    case "reset":
      return action.addr
        ? { active: action.addr, anchor: action.addr, editing: null, mode: "cell" }
        : initialSelection(layout);

    case "select":
      return settle(state, anchorOf(layout, action.addr), !!action.extend);

    case "move": {
      // Arrows inside the editor move the caret, not the selection. The grid
      // does not forward them, and this is the belt.
      if (state.editing) return state;
      const [dr, dc] =
        action.dir === "up" ? [-1, 0] : action.dir === "down" ? [1, 0] : action.dir === "left" ? [0, -1] : [0, 1];
      const next = action.jump
        ? ctrlJump(layout, ctx.values, state.active, action.dir)
        : move(layout, state.active, dr, dc);
      return settle(state, next, !!action.extend);
    }

    case "hop": {
      const next = nextEditable(layout, state.active, action.dir);
      // No next input: stay where you are rather than wrapping to the top,
      // which on a form reads as "the field you just filled was undone".
      return next ? settle(state, next, false) : { ...state, editing: null };
    }

    case "edge": {
      if (state.editing) return state;
      const next = homeEnd(layout, state.active, action.which, !!action.whole);
      return settle(state, next, !!action.extend);
    }

    case "edit": {
      const addr = anchorOf(layout, action.addr ?? state.active);
      if (!canOpen(ctx, addr)) {
        // Selecting it is still right — the person meant to go there.
        return sameAddr(addr, state.active) && !state.editing ? state : settle(state, addr, false);
      }
      return {
        active: addr,
        anchor: addr,
        mode: "cell",
        editing: { addr, seed: action.seed ?? null },
      };
    }

    case "cancel":
      return state.editing ? { ...state, editing: null } : state;

    case "done": {
      const from = state.editing?.addr ?? state.active;
      const settled: SelectionState = { active: from, anchor: from, editing: null, mode: "cell" };
      if (!action.hop) return settled;
      const next = nextEditable(layout, from, action.hop);
      return next ? { active: next, anchor: next, editing: null, mode: "cell" } : settled;
    }

    default:
      return state;
  }
}

/** One keystroke, read as an intention. Returns null for anything the grid
 *  should leave to the browser — and for everything while the editor is open,
 *  because there the input owns the keyboard. */
export function interpretKey(event: KeyLike, state: SelectionState): KeyOutcome | null {
  if (state.editing) return null;
  const { key } = event;
  const mod = !!event.ctrlKey || !!event.metaKey;

  const dir = DIRECTIONS[key];
  if (dir) {
    return { action: { type: "move", dir, extend: !!event.shiftKey, jump: mod }, preventDefault: true };
  }
  if (key === "Tab") {
    return { action: { type: "hop", dir: event.shiftKey ? "prev" : "next" }, preventDefault: true };
  }
  if (key === "Enter") {
    // Shift+Enter walks back up the column without opening anything, the way
    // it does after a commit.
    if (event.shiftKey) return { action: { type: "hop", dir: "up" }, preventDefault: true };
    return { action: { type: "edit", seed: null }, preventDefault: true };
  }
  if (key === "F2") return { action: { type: "edit", seed: null }, preventDefault: true };
  if (key === "Home" || key === "End") {
    return {
      action: { type: "edge", which: key === "Home" ? "home" : "end", whole: mod, extend: !!event.shiftKey },
      preventDefault: true,
    };
  }
  if (key === "Delete" || key === "Backspace") {
    return { command: "clear", preventDefault: true };
  }
  if (mod) {
    const lower = key.toLowerCase();
    if (lower === "c") return { command: "copy", preventDefault: false };
    if (lower === "x") return { command: "cut", preventDefault: false };
    if (lower === "v") return { command: "paste", preventDefault: false };
    if (lower === "d") return { command: "fillDown", preventDefault: true };
    if (lower === "z" || (lower === "y" && !event.shiftKey)) {
      return { command: "undoUnavailable", preventDefault: true };
    }
    return null;
  }
  if (event.altKey) return null;
  // A printable character: start editing and replace, as a spreadsheet does.
  if (key.length === 1 && key !== " ") {
    return { action: { type: "edit", seed: key }, preventDefault: true };
  }
  if (key === " ") return { action: { type: "edit", seed: "" }, preventDefault: true };
  return null;
}

export type SelectionHandle = {
  state: SelectionState;
  dispatch: (action: SelectionAction) => void;
  /** The keystroke reader, bound to the current selection. */
  read: (event: KeyLike) => KeyOutcome | null;
  /** Whether the cell under the caret can be opened by this participant. */
  canOpenActive: boolean;
};

/** The hook. The context is read through a ref so the reducer always sees the
 *  values as they are now — `ctrlJump` walks the filled run, and a run that
 *  was filled one render ago is the wrong answer. */
export function useSelection(ctx: SelectionContext): SelectionHandle {
  const ref = useRef(ctx);
  ref.current = ctx;
  const [state, dispatch] = useReducer(
    (current: SelectionState, action: SelectionAction) => selectionReducer(current, action, ref.current),
    ctx.layout,
    initialSelection,
  );
  const read = useCallback((event: KeyLike) => interpretKey(event, state), [state]);
  const canOpenActive = useMemo(() => canOpen(ctx, state.active), [ctx, state.active]);
  return { state, dispatch, read, canOpenActive };
}
