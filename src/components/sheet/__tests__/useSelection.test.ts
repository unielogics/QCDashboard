// The keyboard, over the real layouts the backend serves.
//
// Two rules pull in opposite directions and both are deliberate: an arrow key
// lands on anything rendered, so a subtotal can be selected and copied, while
// Tab and Enter-after-commit land only on cells somebody can type into, so
// filling in a form never stops on a heading. Nearly everything below is one
// of those two rules seen from a different angle.
//
// The reducer is pure and the context is passed in, so none of this needs a
// DOM — which is the point of keeping it out of the components.

import { describe, expect, it } from "vitest";
import { cellAt } from "../coords";
import {
  canOpen,
  initialSelection,
  interpretKey,
  selectionReducer,
  type SelectionAction,
  type SelectionContext,
  type SelectionState,
} from "../useSelection";
import type { SheetValues } from "../types";
import { DS_LAYOUT, PFS_LAYOUT, PL_LAYOUT } from "./fixtures.test";

function context(overrides: Partial<SelectionContext> = {}): SelectionContext {
  return { layout: PL_LAYOUT, values: {}, canEdit: true, lockedRows: null, ...overrides };
}

function at(state: SelectionState, r: number, c: number): SelectionState {
  return { ...state, active: { r, c }, anchor: { r, c }, mode: "cell", editing: null };
}

function run(ctx: SelectionContext, state: SelectionState, ...actions: SelectionAction[]): SelectionState {
  return actions.reduce((current, action) => selectionReducer(current, action, ctx), state);
}

const key = (k: string, mods: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
  key: k,
  ...mods,
});

describe("where the selection starts", () => {
  it("opens on the first cell somebody can type into, not on the title", () => {
    const state = initialSelection(PL_LAYOUT);
    // Row 1 is the sheet's title and row 4 is "Business name".
    expect(state.active).toEqual({ r: 4, c: 2 });
    expect(state.anchor).toEqual({ r: 4, c: 2 });
    expect(state.mode).toBe("cell");
    expect(state.editing).toBeNull();
  });
});

describe("arrows land on anything rendered", () => {
  const ctx = context();

  it("steps down from the last input of a section onto its subtotal", () => {
    // Row 12 is cost of goods sold; row 13 is the gross profit formula.
    const state = run(ctx, at(initialSelection(PL_LAYOUT), 12, 2), { type: "move", dir: "down" });
    expect(state.active).toEqual({ r: 13, c: 2 });
    expect(cellAt(PL_LAYOUT, state.active)?.type).toBe("formula");
  });

  it("will not open the subtotal it just landed on", () => {
    const start = at(initialSelection(PL_LAYOUT), 13, 2);
    const state = run(ctx, start, { type: "edit", seed: "9" });
    expect(state.editing).toBeNull();
    expect(state.active).toEqual({ r: 13, c: 2 });
  });

  it("crosses the personal statement's missing column without stopping in it", () => {
    // The 413 has no column 3: the columns are 1, 2, 4, 5…
    const ctx413 = context({ layout: PFS_LAYOUT });
    const state = run(ctx413, at(initialSelection(PFS_LAYOUT), 49, 2), { type: "move", dir: "right" });
    expect(state.active).toEqual({ r: 49, c: 4 });
  });

  it("extends from the anchor with shift, and collapses without it", () => {
    const start = at(initialSelection(PL_LAYOUT), 11, 2);
    const extended = run(
      ctx,
      start,
      { type: "move", dir: "down", extend: true },
      { type: "move", dir: "down", extend: true },
    );
    expect(extended.anchor).toEqual({ r: 11, c: 2 });
    expect(extended.active).toEqual({ r: 13, c: 2 });
    expect(extended.mode).toBe("range");

    const collapsed = run(ctx, extended, { type: "move", dir: "down" });
    expect(collapsed.anchor).toEqual(collapsed.active);
    expect(collapsed.mode).toBe("cell");
  });

  it("jumps to the end of the filled run with ctrl", () => {
    const values: SheetValues = { supplies: "500", depreciation_and_amortization: "2000", bank_charges: "40" };
    const ctx2 = context({ values });
    // Rows 16, 17, 18 are filled; 19 (payroll) is not.
    const state = run(ctx2, at(initialSelection(PL_LAYOUT), 16, 2), { type: "move", dir: "down", jump: true });
    expect(state.active).toEqual({ r: 18, c: 2 });
  });

  it("does not move while the editor is open", () => {
    const editing = { ...at(initialSelection(PL_LAYOUT), 11, 2), editing: { addr: { r: 11, c: 2 }, seed: null } };
    expect(run(ctx, editing, { type: "move", dir: "down" })).toBe(editing);
  });
});

describe("tab and enter-after-commit land only on inputs", () => {
  const ctx = context();

  it("steps over the subtotal, the blank line and the heading", () => {
    // Row 12 is the last input of Revenue; row 16 is the first of Operating
    // expenses, with a formula, a blank and a heading in between.
    const state = run(ctx, at(initialSelection(PL_LAYOUT), 12, 2), { type: "hop", dir: "next" });
    expect(state.active).toEqual({ r: 16, c: 2 });
  });

  it("goes back the way it came", () => {
    const state = run(ctx, at(initialSelection(PL_LAYOUT), 16, 2), { type: "hop", dir: "prev" });
    expect(state.active).toEqual({ r: 12, c: 2 });
  });

  it("commits down the column, skipping the total", () => {
    const editing = { ...at(initialSelection(PL_LAYOUT), 12, 2), editing: { addr: { r: 12, c: 2 }, seed: null } };
    const state = run(ctx, editing, { type: "done", hop: "down" });
    expect(state.editing).toBeNull();
    expect(state.active).toEqual({ r: 16, c: 2 });
  });

  it("stays put when there is nothing further to fill in", () => {
    const last = { r: PL_LAYOUT.rows[PL_LAYOUT.rows.length - 1].r, c: 2 };
    const state = run(ctx, { active: last, anchor: last, editing: null, mode: "cell" }, { type: "hop", dir: "next" });
    expect(state.active).toEqual(last);
  });
});

describe("home and end", () => {
  const ctx = context({ layout: DS_LAYOUT });

  it("are the row's ends", () => {
    const start = at(initialSelection(DS_LAYOUT), 7, 4);
    expect(run(ctx, start, { type: "edge", which: "home" }).active).toEqual({ r: 7, c: 1 });
    expect(run(ctx, start, { type: "edge", which: "end" }).active).toEqual({ r: 7, c: 12 });
  });

  it("are the sheet's ends with ctrl", () => {
    const start = at(initialSelection(DS_LAYOUT), 7, 4);
    const home = run(ctx, start, { type: "edge", which: "home", whole: true });
    const end = run(ctx, start, { type: "edge", which: "end", whole: true });
    expect(home.active).toEqual({ r: DS_LAYOUT.rows[0].r, c: 1 });
    expect(end.active.r).toBe(DS_LAYOUT.rows[DS_LAYOUT.rows.length - 1].r);
  });

  it("extends to the row's end with shift", () => {
    const start = at(initialSelection(DS_LAYOUT), 7, 1);
    const state = run(ctx, start, { type: "edge", which: "end", extend: true });
    expect(state.anchor).toEqual({ r: 7, c: 1 });
    expect(state.mode).toBe("range");
  });
});

describe("who may open a cell", () => {
  it("refuses everything on a view-only link, but still selects", () => {
    const ctx = context({ canEdit: false });
    const state = run(ctx, at(initialSelection(PL_LAYOUT), 11, 2), { type: "edit", seed: "1" });
    expect(state.editing).toBeNull();
    expect(state.active).toEqual({ r: 11, c: 2 });
    expect(canOpen(ctx, { r: 11, c: 2 })).toBe(false);
  });

  it("refuses a debt row another origin owns and allows the one beside it", () => {
    const ctx = context({ layout: DS_LAYOUT, lockedRows: new Set(["d1"]) });
    expect(canOpen(ctx, { r: 7, c: 1 })).toBe(false);
    expect(canOpen(ctx, { r: 8, c: 1 })).toBe(true);
    const state = run(ctx, at(initialSelection(DS_LAYOUT), 7, 1), { type: "edit", seed: "A" });
    expect(state.editing).toBeNull();
  });

  it("opens an input, and escape leaves it as it was", () => {
    const ctx = context();
    const opened = run(ctx, at(initialSelection(PL_LAYOUT), 11, 2), { type: "edit", seed: "5" });
    expect(opened.editing).toEqual({ addr: { r: 11, c: 2 }, seed: "5" });
    const cancelled = run(ctx, opened, { type: "cancel" });
    expect(cancelled.editing).toBeNull();
    expect(cancelled.active).toEqual({ r: 11, c: 2 });
  });
});

describe("reading a keystroke", () => {
  const state = at(initialSelection(PL_LAYOUT), 11, 2);

  it("turns an arrow into a move, and shift and ctrl into how", () => {
    expect(interpretKey(key("ArrowDown"), state)).toEqual({
      action: { type: "move", dir: "down", extend: false, jump: false },
      preventDefault: true,
    });
    expect(interpretKey(key("ArrowRight", { shiftKey: true }), state)?.action).toMatchObject({ extend: true });
    expect(interpretKey(key("ArrowUp", { metaKey: true }), state)?.action).toMatchObject({ jump: true });
  });

  it("starts an edit that replaces on any printable character", () => {
    expect(interpretKey(key("7"), state)).toEqual({ action: { type: "edit", seed: "7" }, preventDefault: true });
    expect(interpretKey(key("Enter"), state)).toEqual({ action: { type: "edit", seed: null }, preventDefault: true });
  });

  it("clears a range on delete and fills down on ctrl+D", () => {
    expect(interpretKey(key("Delete"), state)).toEqual({ command: "clear", preventDefault: true });
    expect(interpretKey(key("Backspace"), state)).toEqual({ command: "clear", preventDefault: true });
    expect(interpretKey(key("d", { ctrlKey: true }), state)).toEqual({ command: "fillDown", preventDefault: true });
  });

  it("lets the browser's own clipboard event fire", () => {
    for (const [k, command] of [["c", "copy"], ["x", "cut"], ["v", "paste"]] as const) {
      expect(interpretKey(key(k, { metaKey: true }), state)).toEqual({ command, preventDefault: false });
    }
  });

  it("answers ctrl+Z with a sentence rather than an undo", () => {
    // A naive undo stack reverts somebody else's cell, because remote edits
    // arrive while you work. The grid says so instead.
    expect(interpretKey(key("z", { ctrlKey: true }), state)).toEqual({
      command: "undoUnavailable",
      preventDefault: true,
    });
  });

  it("hands the keyboard to the editor while it is open", () => {
    const editing = { ...state, editing: { addr: { r: 11, c: 2 }, seed: null } };
    for (const k of ["ArrowDown", "Enter", "a", "Delete", "Tab"]) {
      expect(interpretKey(key(k), editing)).toBeNull();
    }
  });

  it("leaves keystrokes it has no opinion about alone", () => {
    expect(interpretKey(key("F5"), state)).toBeNull();
    expect(interpretKey(key("s", { ctrlKey: true }), state)).toBeNull();
    expect(interpretKey(key("PageDown"), state)).toBeNull();
  });
});
