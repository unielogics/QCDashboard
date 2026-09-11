// The row controls, and where the tabs live.
//
// These render the real components with `react-dom/server` and read the
// markup, which is all the runner has: the worksheet's suite is `node`, with
// no DOM, and this file is deliberately not the reason to add one. Static
// markup is enough for what the owner actually asked to be true — that the tab
// strip is the bottom edge of the worksheet and not part of the sheet that
// scrolls, that a line is removed from the line itself and says which line
// that is, and that the extra cell at the end of a row does not walk the
// columns out of step with their headings.

import { describe, expect, it } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The suite's tsconfig leaves `jsx` at Next's "preserve", so esbuild compiles
// the components' JSX the classic way — to a free `React.createElement` — and
// nothing in a `node` test has ever put `React` in scope. The components are
// only *called* at render time, well after this line runs. The durable fix is
// `esbuild: { jsx: "automatic" }` in vitest.config.ts, which is not this
// slice's file.
(globalThis as unknown as { React: typeof React }).React = React;
import { SheetGrid } from "../SheetGrid";
import { Worksheet, type WorksheetSheetInput } from "../Worksheet";
import { DS_LAYOUT, PFS_LAYOUT, PL_LAYOUT } from "./fixtures.test";
import type { SheetLayout, SheetValues } from "../types";

// ── reading the markup ──────────────────────────────────────────────────────

/** The index just past the close of the element whose open tag contains
 *  `marker`. Only tags of the same name are counted, which is all it takes to
 *  find a matching close in output that is balanced by construction. */
function elementEnd(markup: string, marker: string): number {
  const at = markup.indexOf(marker);
  if (at < 0) throw new Error(`no element carrying ${marker}`);
  const open = markup.lastIndexOf("<", at);
  const tag = /^<([a-zA-Z0-9]+)/.exec(markup.slice(open))?.[1];
  if (!tag) throw new Error(`no tag name before ${marker}`);
  const pattern = new RegExp(`<(/?)${tag}\\b[^>]*>`, "g");
  pattern.lastIndex = open;
  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markup))) {
    depth += match[1] === "/" ? -1 : 1;
    if (depth === 0) return pattern.lastIndex;
  }
  throw new Error(`${tag} carrying ${marker} is never closed`);
}

/** Every grid row in the markup, as its own chunk. Split on the role rather
 *  than on the class: `sg-rowdel` starts with `sg-row` too. */
function rowChunks(markup: string): string[] {
  return markup.split('<div role="row"').slice(1);
}

/** The rendered cells of one row, as their opening tags. */
function cellsOf(chunk: string): string[] {
  return chunk.match(/<div role="gridcell"[^>]*>/g) ?? [];
}

/** How many columns a row covers: one per cell, more where a cell spans. */
function columnsCovered(chunk: string): number {
  return cellsOf(chunk).reduce((total, cell) => {
    const span = /aria-colspan="(\d+)"/.exec(cell);
    return total + (span ? Number(span[1]) : 1);
  }, 0);
}

function removeNames(markup: string): string[] {
  return [...markup.matchAll(/<button type="button" class="sg-rowdel" aria-label="([^"]*)"/g)].map(
    (match) => match[1],
  );
}

// ── fixtures ────────────────────────────────────────────────────────────────

const DEBT_VALUES: SheetValues = {
  "d1.lender": "Ally Bank",
  "d1.balance": "12000",
  "d2.lender": "First Merchants",
};

function grid(
  layout: SheetLayout,
  options: {
    values?: SheetValues;
    canEdit?: boolean;
    locked?: string[];
    onRemoveRow?: ((row: { rowKey: string; block: string; label: string }) => void) | undefined;
  } = {},
): string {
  return renderToStaticMarkup(
    createElement(SheetGrid, {
      layout,
      values: options.values ?? {},
      computed: {},
      canEdit: options.canEdit ?? true,
      lockedRows: options.locked ? new Set(options.locked) : null,
      onEdits: () => undefined,
      onRemoveRow: "onRemoveRow" in options ? options.onRemoveRow : () => undefined,
    }),
  );
}

function debtSheet(values: SheetValues = DEBT_VALUES): WorksheetSheetInput {
  return {
    kind: "debt_schedule",
    title: DS_LAYOUT.title,
    columns: DS_LAYOUT.columns,
    rows: DS_LAYOUT.rows,
    freeze: null,
    values,
  };
}

function worksheet(canEdit = true): string {
  return renderToStaticMarkup(
    createElement(Worksheet, {
      sheets: [debtSheet()],
      scope: { can_edit: canEdit, sheets: ["debt_schedule"], open_at: "debt_schedule" },
      onSave: () => undefined,
      onRowOp: () => undefined,
    }),
  );
}

// ── the tab strip ───────────────────────────────────────────────────────────

describe("the tab strip", () => {
  it("renders after the grid, on the worksheet's bottom edge", () => {
    const markup = worksheet();
    expect(markup).toContain('class="sg-tabs"');
    expect(markup.indexOf('class="sg-tabs"')).toBeGreaterThan(markup.indexOf('class="sg-grid"'));
  });

  it("is outside the box that scrolls", () => {
    const markup = worksheet();
    const wrapEnds = elementEnd(markup, 'class="sg-wrap"');
    // The grid is inside the scroll box; the tabs are past its closing tag, so
    // scrolling the sheet can never carry them off the screen.
    expect(markup.indexOf('class="sg-grid"')).toBeLessThan(wrapEnds);
    expect(markup.indexOf('class="sg-tabs"')).toBeGreaterThan(wrapEnds);
  });

  it("keeps its tablist, its selected tab and its status chip", () => {
    const markup = worksheet();
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain("sg-tabchip");
  });

  it("says so once, on the strip, when the link cannot edit", () => {
    expect(worksheet(false)).toContain("View only");
  });
});

// ── "Add a line" ────────────────────────────────────────────────────────────

describe("add a line", () => {
  it("is green, carries a plus and is still called Add a line", () => {
    const markup = worksheet();
    expect(markup).toContain("sg-addrow");
    expect(markup).toContain("Add a line");
    // The design system's plus, not a typed "+": `M12 5v14M5 12h14`.
    expect(markup).toContain("M12 5v14M5 12h14");
  });

  it("is not offered on a view-only link", () => {
    expect(worksheet(false)).not.toContain("sg-addrow");
  });

  it("has no toolbar twin that removes whatever the caret is on", () => {
    expect(worksheet()).not.toContain("Remove this line");
  });
});

// ── the remove control ──────────────────────────────────────────────────────

describe("the remove control", () => {
  it("is on every editable list row, and only on those", () => {
    const markup = grid(DS_LAYOUT, { values: DEBT_VALUES });
    const rows = DS_LAYOUT.rows.filter((row) => row.kind === "data" && row.row_key);
    expect(rows).toHaveLength(3);
    expect(removeNames(markup)).toHaveLength(rows.length);
  });

  it("names the row it removes", () => {
    // The lender once there is one; the line's place in the list until then.
    expect(removeNames(grid(DS_LAYOUT, { values: DEBT_VALUES }))).toEqual([
      "Remove Ally Bank",
      "Remove First Merchants",
      "Remove line 3",
    ]);
  });

  it("never reads as a bare Remove", () => {
    for (const name of removeNames(grid(DS_LAYOUT, { values: {} }))) {
      expect(name).not.toBe("Remove");
      expect(name.length).toBeGreaterThan("Remove".length);
    }
  });

  it("is absent from a row another origin owns", () => {
    const markup = grid(DS_LAYOUT, { values: DEBT_VALUES, locked: ["d2"] });
    expect(removeNames(markup)).toEqual(["Remove Ally Bank", "Remove line 3"]);
  });

  it("is absent from a view-only link, and so is its track", () => {
    const markup = grid(DS_LAYOUT, { values: DEBT_VALUES, canEdit: false });
    expect(removeNames(markup)).toEqual([]);
    expect(markup).not.toContain("sg-rowend");
  });

  it("is absent where the container has no row transport", () => {
    const markup = grid(DS_LAYOUT, { values: DEBT_VALUES, onRemoveRow: undefined });
    expect(markup).not.toContain("sg-rowend");
  });

  it("is not offered on the two fixed statements", () => {
    const markup = grid(PL_LAYOUT, { values: {} });
    expect(markup).not.toContain("sg-rowend");
    expect(markup).toContain(`aria-colcount="${PL_LAYOUT.columns.length}"`);
  });

  it("is offered on the personal statement's supporting schedules only", () => {
    const markup = grid(PFS_LAYOUT, { values: {} });
    const schedules = PFS_LAYOUT.rows.filter((row) => row.kind === "data" && row.row_key);
    expect(schedules.length).toBeGreaterThan(0);
    expect(removeNames(markup)).toHaveLength(schedules.length);
  });

  it("stops the keystroke that would otherwise open a cell", () => {
    // The grid's one delegated keydown calls preventDefault on Enter, which is
    // the default action a focused button needs, so the cell swallows it.
    expect(grid(DS_LAYOUT).match(/class="sg-cell sg-rowend"/g)?.length).toBe(DS_LAYOUT.rows.length);
  });
});

// ── the columns stay in step ────────────────────────────────────────────────

describe("the extra cell at the end of a row", () => {
  it("gives the column heads one too, matching the data rows", () => {
    const chunks = rowChunks(grid(DS_LAYOUT, { values: DEBT_VALUES }));
    const heads = chunks.find((chunk) => chunk.includes("sg-r-colhead"));
    const data = chunks.filter((chunk) => chunk.includes("sg-r-data"));
    expect(heads).toBeDefined();
    expect(data).not.toHaveLength(0);
    for (const row of data) expect(cellsOf(row)).toHaveLength(cellsOf(heads as string).length);
  });

  it("leaves every row covering the same number of columns", () => {
    const width = DS_LAYOUT.columns.length + 1;
    for (const chunk of rowChunks(grid(DS_LAYOUT, { values: DEBT_VALUES }))) {
      expect(columnsCovered(chunk)).toBe(width);
    }
    // The personal statement's banner rows span the sheet; the gutter is the
    // one column they do not cover, and it is still there.
    const pfsWidth = PFS_LAYOUT.columns.length + 1;
    for (const chunk of rowChunks(grid(PFS_LAYOUT, { values: {} }))) {
      expect(columnsCovered(chunk)).toBe(pfsWidth);
    }
  });

  it("is counted by ARIA, in sequence, as the last column", () => {
    const markup = grid(DS_LAYOUT, { values: DEBT_VALUES });
    expect(markup).toContain(`aria-colcount="${DS_LAYOUT.columns.length + 1}"`);
    const last = `aria-colindex="${DS_LAYOUT.columns.length + 1}"`;
    expect(markup.match(new RegExp(last, "g"))).toHaveLength(DS_LAYOUT.rows.length);
    for (const chunk of rowChunks(markup)) {
      const indices = [...chunk.matchAll(/aria-colindex="(\d+)"/g)].map((match) => Number(match[1]));
      expect(indices).toEqual([...indices].sort((a, b) => a - b));
      expect(indices[indices.length - 1]).toBe(DS_LAYOUT.columns.length + 1);
    }
  });

  it("keeps the first column sticky by keeping it first", () => {
    for (const chunk of rowChunks(grid(DS_LAYOUT, { values: DEBT_VALUES }))) {
      expect(cellsOf(chunk)[0]).toContain('aria-colindex="1"');
    }
  });

  it("adds one track to the template, and its width to the sheet's own", () => {
    const markup = grid(DS_LAYOUT, { values: DEBT_VALUES });
    const template = /--sg-cols:([^;"]*)/.exec(markup)?.[1] ?? "";
    expect(template.trim().split(/\s+(?![^(]*\))/)).toHaveLength(DS_LAYOUT.columns.length + 1);
    const plain = grid(DS_LAYOUT, { values: DEBT_VALUES, canEdit: false });
    const natural = (source: string) => Number(/--sg-natural:(\d+)px/.exec(source)?.[1]);
    expect(natural(markup)).toBe(natural(plain) + 34);
  });
});
