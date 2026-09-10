// Navigation over the real layouts the backend serves (the fixtures), not a
// toy grid — the rules only matter because the sheets have gaps: the debt
// schedule has no row 6, the PFS has no column 3, and both statements merge
// their section headings across the value column.
//
// The contract under test, from the design's §5 and §11:
//   arrows land on anything rendered (formula cells included), Tab and
//   Enter-after-commit land only on inputs, Ctrl+arrow walks the filled run,
//   Home/End are the row's ends and Ctrl+Home/End the sheet's.

import { describe, expect, it } from "vitest";
import {
  anchorOf,
  cellAt,
  colIndex,
  ctrlJump,
  firstAddr,
  homeEnd,
  isEditable,
  isFilled,
  lastAddr,
  move,
  nextEditable,
  normalizeRange,
  rangeCells,
  rowIndex,
} from "../coords";
import type { SheetValues } from "../types";
import { BS_LAYOUT, DS_LAYOUT, PFS_LAYOUT, PL_LAYOUT } from "./fixtures.test";

/** Operating expenses with a filled run at the top of the section:
 *  supplies, depreciation, bank charges, payroll — then nothing until
 *  interest. */
const PL_RUN: SheetValues = {
  supplies: "500",
  depreciation_and_amortization: "2,000",
  bank_charges: "40",
  payroll: "12000",
  interest: "1000",
};

/** One debt, filled left to right and stopping before the rate column. */
const DS_RUN: SheetValues = {
  "d1.lender": "Acme Bank",
  "d1.debt_type": "Term loan",
  "d1.original_amount": "50000",
  "d1.balance": "$1,000.50",
  "d2.lender": "Second Bank",
};

describe("the layout's own numbering", () => {
  it("indexes by the workbook's row and column, gaps and all", () => {
    // The debt schedule leaves row 6 out; the first debt is row 7.
    expect(rowIndex(DS_LAYOUT, 6)).toBe(-1);
    expect(DS_LAYOUT.rows[rowIndex(DS_LAYOUT, 7)].row_key).toBe("d1");
    // The PFS leaves column 3 out.
    expect(colIndex(PFS_LAYOUT, 3)).toBe(-1);
    expect(PFS_LAYOUT.columns[colIndex(PFS_LAYOUT, 4)].c).toBe(4);
  });

  it("resolves a merged heading to its first column", () => {
    // The P&L's "Revenue" heading spans both columns of row 10.
    expect(cellAt(PL_LAYOUT, { r: 10, c: 2 })?.label).toBe("Revenue");
    expect(anchorOf(PL_LAYOUT, { r: 10, c: 2 })).toEqual({ r: 10, c: 1 });
    expect(anchorOf(PL_LAYOUT, { r: 11, c: 2 })).toEqual({ r: 11, c: 2 });
  });

  it("has nothing at a void position", () => {
    expect(cellAt(PL_LAYOUT, { r: 14, c: 2 })).toBeNull(); // a blank row
    expect(cellAt(PFS_LAYOUT, { r: 58, c: 3 })).toBeNull(); // the missing column
  });
});

describe("arrows (move)", () => {
  it("steps over the debt schedule's missing row", () => {
    expect(move(DS_LAYOUT, { r: 5, c: 1 }, 1, 0)).toEqual({ r: 7, c: 1 });
    expect(move(DS_LAYOUT, { r: 7, c: 1 }, -1, 0)).toEqual({ r: 5, c: 1 });
  });

  it("steps over the PFS's missing column", () => {
    expect(move(PFS_LAYOUT, { r: 58, c: 2 }, 0, 1)).toEqual({ r: 58, c: 4 });
    expect(move(PFS_LAYOUT, { r: 58, c: 4 }, 0, -1)).toEqual({ r: 58, c: 2 });
  });

  it("lands on a formula cell — that is what makes copying a subtotal work", () => {
    const landed = move(PL_LAYOUT, { r: 12, c: 2 }, 1, 0);
    expect(landed).toEqual({ r: 13, c: 2 });
    const cell = cellAt(PL_LAYOUT, landed);
    expect(cell?.type).toBe("formula");
    expect(cell?.compute).toBe("gross_profit");
    // Selectable, so it can be copied; never editable.
    expect(isEditable(cell)).toBe(false);
  });

  it("lands on a heading, at the merge's first column", () => {
    expect(move(PL_LAYOUT, { r: 11, c: 2 }, -1, 0)).toEqual({ r: 10, c: 1 });
  });

  it("leaves a merged cell by its far edge", () => {
    // The PFS's schedule heading on row 48 spans columns 1–6; right of it is
    // column 7, the next column the layout actually has.
    expect(move(PFS_LAYOUT, { r: 48, c: 1 }, 0, 1)).toEqual({ r: 48, c: 7 });
  });

  it("clamps at the sheet's edges rather than wrapping", () => {
    expect(move(PL_LAYOUT, firstAddr(PL_LAYOUT), -1, -1)).toEqual({ r: 1, c: 1 });
    expect(move(PL_LAYOUT, { r: 51, c: 2 }, 1, 1)).toEqual({ r: 51, c: 2 });
    expect(lastAddr(PL_LAYOUT)).toEqual({ r: 51, c: 2 });
  });
});

describe("Tab and Enter-after-commit (nextEditable)", () => {
  it("wraps to the next row's first editable cell", () => {
    // The last column of the first debt → the first column of the second.
    expect(nextEditable(DS_LAYOUT, { r: 7, c: 12 }, "next")).toEqual({ r: 8, c: 1 });
    expect(nextEditable(DS_LAYOUT, { r: 8, c: 1 }, "prev")).toEqual({ r: 7, c: 12 });
  });

  it("skips formula cells, headings and blank rows", () => {
    // Cost of goods sold → (gross profit, blank, "Operating expenses") → supplies.
    expect(nextEditable(PL_LAYOUT, { r: 12, c: 2 }, "next")).toEqual({ r: 16, c: 2 });
    expect(nextEditable(PL_LAYOUT, { r: 16, c: 2 }, "prev")).toEqual({ r: 12, c: 2 });
  });

  it("skips a label column and reaches the input beside it", () => {
    expect(nextEditable(PL_LAYOUT, { r: 11, c: 1 }, "next")).toEqual({ r: 11, c: 2 });
  });

  it("skips the PFS's missing column", () => {
    expect(nextEditable(PFS_LAYOUT, { r: 58, c: 2 }, "next")).toEqual({ r: 58, c: 4 });
  });

  it("returns null at the ends, so the caller stays put", () => {
    expect(nextEditable(PL_LAYOUT, { r: 51, c: 2 }, "next")).toBeNull(); // notes, the last input
    expect(nextEditable(PL_LAYOUT, { r: 4, c: 2 }, "prev")).toBeNull(); // business name, the first
  });

  it("moves down the same column on Enter, skipping the subtotal", () => {
    expect(nextEditable(PL_LAYOUT, { r: 12, c: 2 }, "down")).toEqual({ r: 16, c: 2 });
    expect(nextEditable(PL_LAYOUT, { r: 16, c: 2 }, "up")).toEqual({ r: 12, c: 2 });
    expect(nextEditable(DS_LAYOUT, { r: 7, c: 4 }, "down")).toEqual({ r: 8, c: 4 });
    expect(nextEditable(DS_LAYOUT, { r: 9, c: 4 }, "down")).toBeNull(); // the totals row is not an input
  });
});

describe("down from a section's last input", () => {
  it("lands on the subtotal, which is selectable but not editable", () => {
    // The P&L's revenue section: cost of goods sold → gross profit.
    const subtotal = move(PL_LAYOUT, { r: 12, c: 2 }, 1, 0);
    expect(cellAt(PL_LAYOUT, subtotal)?.compute).toBe("gross_profit");
    expect(isEditable(cellAt(PL_LAYOUT, subtotal))).toBe(false);

    // The balance sheet's equity section: owner draws → total equity.
    const equity = move(BS_LAYOUT, { r: 50, c: 2 }, 1, 0);
    expect(equity).toEqual({ r: 51, c: 2 });
    expect(cellAt(BS_LAYOUT, equity)?.compute).toBe("total_equity");
    expect(isEditable(cellAt(BS_LAYOUT, equity))).toBe(false);

    // The debt schedule's totals row, under the last debt.
    const total = move(DS_LAYOUT, { r: 9, c: 4 }, 1, 0);
    expect(total).toEqual({ r: 10, c: 4 });
    expect(cellAt(DS_LAYOUT, total)?.compute).toBe("total_balance");
    expect(isEditable(cellAt(DS_LAYOUT, total))).toBe(false);
  });
});

describe("isFilled", () => {
  it("counts a label's text, any formula, and an input with something in it", () => {
    expect(isFilled(PL_LAYOUT, {}, { r: 10, c: 1 })).toBe(true); // the "Revenue" heading
    expect(isFilled(PL_LAYOUT, {}, { r: 13, c: 2 })).toBe(true); // a subtotal, always
    expect(isFilled(PL_LAYOUT, {}, { r: 14, c: 2 })).toBe(false); // a blank row
    expect(isFilled(PL_LAYOUT, PL_RUN, { r: 16, c: 2 })).toBe(true);
    expect(isFilled(PL_LAYOUT, PL_RUN, { r: 20, c: 2 })).toBe(false);
    expect(isFilled(PL_LAYOUT, { supplies: "   " }, { r: 16, c: 2 })).toBe(false);
  });
});

describe("Ctrl+arrow (ctrlJump)", () => {
  it("jumps to the end of the filled run", () => {
    // supplies → payroll, stopping before the first empty line.
    expect(ctrlJump(PL_LAYOUT, PL_RUN, { r: 16, c: 2 }, "down")).toEqual({ r: 19, c: 2 });
    // The same rule sideways, across a debt's columns.
    expect(ctrlJump(DS_LAYOUT, DS_RUN, { r: 7, c: 1 }, "right")).toEqual({ r: 7, c: 4 });
  });

  it("jumps from an empty cell to the next filled one", () => {
    expect(ctrlJump(PL_LAYOUT, PL_RUN, { r: 20, c: 2 }, "down")).toEqual({ r: 24, c: 2 });
    expect(ctrlJump(DS_LAYOUT, DS_RUN, { r: 9, c: 1 }, "up")).toEqual({ r: 8, c: 1 });
  });

  it("runs to the sheet's edge when nothing ahead is filled", () => {
    expect(ctrlJump(DS_LAYOUT, DS_RUN, { r: 7, c: 11 }, "down")).toEqual({ r: 10, c: 11 });
    expect(ctrlJump(PL_LAYOUT, {}, { r: 1, c: 1 }, "up")).toEqual({ r: 1, c: 1 });
  });

  it("counts the column header as part of the run, the way a spreadsheet does", () => {
    // Up the lender column from the second debt: past the first, onto the
    // header row above it, and no further (row 4 is blank).
    expect(ctrlJump(DS_LAYOUT, DS_RUN, { r: 8, c: 1 }, "up")).toEqual({ r: 5, c: 1 });
  });
});

describe("Home and End", () => {
  it("go to the row's ends", () => {
    expect(homeEnd(PL_LAYOUT, { r: 16, c: 2 }, "home")).toEqual({ r: 16, c: 1 });
    expect(homeEnd(PL_LAYOUT, { r: 16, c: 1 }, "end")).toEqual({ r: 16, c: 2 });
    expect(homeEnd(DS_LAYOUT, { r: 7, c: 5 }, "home")).toEqual({ r: 7, c: 1 });
    expect(homeEnd(DS_LAYOUT, { r: 7, c: 5 }, "end")).toEqual({ r: 7, c: 12 });
    expect(homeEnd(PFS_LAYOUT, { r: 58, c: 4 }, "end")).toEqual({ r: 58, c: 9 });
  });

  it("stay inside a merged heading rather than splitting it", () => {
    expect(homeEnd(PL_LAYOUT, { r: 10, c: 1 }, "end")).toEqual({ r: 10, c: 1 });
  });

  it("go to the sheet's ends with Ctrl", () => {
    expect(homeEnd(PL_LAYOUT, { r: 16, c: 2 }, "home", true)).toEqual({ r: 1, c: 1 });
    expect(homeEnd(PL_LAYOUT, { r: 16, c: 2 }, "end", true)).toEqual({ r: 51, c: 2 });
    expect(homeEnd(DS_LAYOUT, { r: 7, c: 1 }, "home", true)).toEqual({ r: 1, c: 1 });
  });
});

describe("ranges", () => {
  it("orders the two corners", () => {
    expect(normalizeRange({ r: 13, c: 2 }, { r: 11, c: 1 })).toEqual({ r1: 11, c1: 1, r2: 13, c2: 2 });
    expect(normalizeRange({ r: 11, c: 1 }, { r: 13, c: 2 })).toEqual({ r1: 11, c1: 1, r2: 13, c2: 2 });
  });

  it("spans a heading row without listing the heading twice", () => {
    const cells = rangeCells(PL_LAYOUT, { r: 11, c: 1 }, { r: 16, c: 2 });
    const headings = cells.filter((located) => located.row.kind === "heading");
    expect(headings).toHaveLength(1);
    expect(headings[0].cell.label).toBe("Operating expenses");
    expect(headings[0].addr).toEqual({ r: 15, c: 1 });

    // The blank row contributes nothing, the subtotal is there to be copied,
    // and only three cells in the rectangle can be written to.
    expect(cells.some((located) => located.row.r === 14)).toBe(false);
    expect(cells.filter((located) => located.cell.type === "formula")).toHaveLength(1);
    expect(cells.filter((located) => isEditable(located.cell)).map((located) => located.cell.key)).toEqual([
      "gross_revenue",
      "cost_of_goods_sold",
      "supplies",
    ]);
  });

  it("counts a cell that merely spans into the rectangle, once, at its anchor", () => {
    const cells = rangeCells(PL_LAYOUT, { r: 15, c: 2 }, { r: 15, c: 2 });
    expect(cells).toHaveLength(1);
    expect(cells[0].addr).toEqual({ r: 15, c: 1 });
  });

  it("reads a debt row in column order", () => {
    const cells = rangeCells(DS_LAYOUT, { r: 7, c: 1 }, { r: 7, c: 4 });
    expect(cells.map((located) => located.cell.key)).toEqual([
      "d1.lender",
      "d1.debt_type",
      "d1.original_amount",
      "d1.balance",
    ]);
  });
});
