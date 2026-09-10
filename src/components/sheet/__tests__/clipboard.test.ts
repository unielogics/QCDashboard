// The clipboard: what Excel and Sheets actually put on text/plain, what one
// cell copies as, and where a pasted block lands on the real layouts.
//
// The accountant's paste is the feature this exists for: forty debts out of
// their own spreadsheet in one action, and a paste that runs past the end of
// a fixed section stopping with a count rather than filing an expense figure
// into the next section.

import { describe, expect, it } from "vitest";
import { cellText, parseTsv, planPaste, toTsv } from "../clipboard";
import type { ComputedValues, SheetValues } from "../types";
import { DEBT_CASE, DS_LAYOUT, PFS_LAYOUT, PL_LAYOUT } from "./fixtures.test";

const PL_VALUES: SheetValues = {
  gross_revenue: "100000",
  cost_of_goods_sold: "40000",
  depreciation_and_amortization: "2,000",
  supplies: "",
};

const PL_COMPUTED: ComputedValues = {
  gross_profit: 60000,
  total_operating_expenses: 2000,
  ebitda: null,
};

/** A deterministic minter, so an appended row's key is assertable. */
function minter(): () => string {
  let n = 0;
  return () => `n${(n += 1)}`;
}

describe("parseTsv", () => {
  it("reads a tab-separated block", () => {
    expect(parseTsv("a\tb\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("drops the one terminator Excel always adds, on \\r\\n and on \\n", () => {
    expect(parseTsv("a\tb\r\nc\td\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(parseTsv("a\tb\nc\td\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    // An old-Mac block, and a lone column.
    expect(parseTsv("a\rb\r")).toEqual([["a"], ["b"]]);
  });

  it("keeps empty fields, so a blank column does not shift the row", () => {
    expect(parseTsv("a\t\tc\r\n\t\t\r\n")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });

  it("unwraps a quoted field the way Excel writes one", () => {
    expect(parseTsv('"Tools, Inc."\t100\r\n')).toEqual([["Tools, Inc.", "100"]]);
    // A field with a tab in it.
    expect(parseTsv('"a\tb"\tc')).toEqual([["a\tb", "c"]]);
  });

  it("keeps a newline that is inside quotes inside the field", () => {
    expect(parseTsv('"line one\nline two"\tb')).toEqual([["line one\nline two", "b"]]);
    expect(parseTsv('a\t"x\ny"\nc\td')).toEqual([
      ["a", "x\ny"],
      ["c", "d"],
    ]);
  });

  it('reads "" as a literal quote', () => {
    expect(parseTsv('"say ""hi"""\tb')).toEqual([['say "hi"', "b"]]);
    expect(parseTsv('"""quoted"""\t2')).toEqual([['"quoted"', "2"]]);
  });

  it("takes a single plain-text cell verbatim, not as a one-cell spreadsheet", () => {
    // The common case: one value copied out of a sentence, or a company name
    // that happens to have been typed with quotes around it.
    expect(parseTsv("Acme")).toEqual([["Acme"]]);
    expect(parseTsv('"Acme, Inc."')).toEqual([['"Acme, Inc."']]);
    expect(parseTsv("$1,250.00")).toEqual([["$1,250.00"]]);
    expect(parseTsv("")).toEqual([[""]]);
  });

  it("only treats a quote as an opener at the start of a field", () => {
    expect(parseTsv('6" pipe\tb')).toEqual([['6" pipe', "b"]]);
  });
});

describe("cellText", () => {
  it("copies an input's raw string, a label's text, and a formula's figure", () => {
    const row = PL_LAYOUT.rows.find((candidate) => candidate.r === 13);
    const label = row?.cells?.find((cell) => cell.c === 1) ?? null;
    const formula = row?.cells?.find((cell) => cell.c === 2) ?? null;
    expect(cellText(label, PL_VALUES, PL_COMPUTED)).toBe("Gross profit");
    expect(cellText(formula, PL_VALUES, PL_COMPUTED)).toBe("60000");
    expect(cellText(null, PL_VALUES, PL_COMPUTED)).toBe("");
  });

  it("copies a memo line from the input it echoes, and blanks a figure that does not exist", () => {
    const echo = PL_LAYOUT.rows.find((row) => row.r === 45)?.cells?.find((cell) => cell.c === 2) ?? null;
    expect(echo?.source).toBe("depreciation_and_amortization");
    expect(cellText(echo, PL_VALUES, PL_COMPUTED)).toBe("2000");

    const ebitda = PL_LAYOUT.rows.find((row) => row.r === 48)?.cells?.find((cell) => cell.c === 2) ?? null;
    expect(cellText(ebitda, PL_VALUES, PL_COMPUTED)).toBe("");
  });
});

describe("toTsv", () => {
  it("emits a formula cell's display value, so a subtotal copies as its number", () => {
    const tsv = toTsv(PL_LAYOUT, PL_VALUES, PL_COMPUTED, { r: 11, c: 1 }, { r: 13, c: 2 });
    expect(tsv.split("\n")).toEqual([
      "Gross revenue\t100000",
      "Cost of goods sold\t40000",
      "Gross profit\t60000",
    ]);
  });

  it("keeps the shape: every layout column, and a blank row as an empty line", () => {
    const lines = toTsv(PL_LAYOUT, PL_VALUES, PL_COMPUTED, { r: 13, c: 1 }, { r: 16, c: 2 }).split("\n");
    expect(lines).toHaveLength(4); // rows 13, 14, 15, 16
    expect(lines[1]).toBe("\t"); // the blank row keeps both columns
    expect(lines[2]).toBe("Operating expenses\t"); // the merged heading is not repeated
    expect(lines[3]).toBe("Supplies\t");
  });

  it("takes the corners in any order", () => {
    const a = toTsv(PL_LAYOUT, PL_VALUES, PL_COMPUTED, { r: 11, c: 1 }, { r: 12, c: 2 });
    const b = toTsv(PL_LAYOUT, PL_VALUES, PL_COMPUTED, { r: 12, c: 2 }, { r: 11, c: 1 });
    expect(b).toBe(a);
  });

  it("quotes a field that carries a tab, a newline or a quote", () => {
    const values: SheetValues = { ...DEBT_CASE.values, "d1.notes": 'two\nlines\twide and a "quote"' };
    const line = toTsv(DS_LAYOUT, values, {}, { r: 7, c: 12 }, { r: 7, c: 12 });
    expect(line).toBe('"two\nlines\twide and a ""quote"""');
    expect(parseTsv(line)).toEqual([['two\nlines\twide and a "quote"']]);
  });

  it("round-trips a block of debts through the clipboard unchanged", () => {
    const tsv = toTsv(DS_LAYOUT, DEBT_CASE.values, {}, { r: 7, c: 1 }, { r: 9, c: 12 });
    const expected = [7, 8, 9].map((r) =>
      DS_LAYOUT.columns.map((column) => {
        const cell = DS_LAYOUT.rows.find((row) => row.r === r)?.cells?.find((candidate) => candidate.c === column.c);
        return DEBT_CASE.values[cell?.key ?? ""] ?? "";
      }),
    );
    // The raw strings, not a normalised number: "$1,000.50" and "(25)" survive.
    expect(expected[0][3]).toBe("$1,000.50");
    expect(parseTsv(tsv)).toEqual(expected);
  });
});

describe("planPaste on a fixed sheet", () => {
  it("skips the label column and the formula row, and counts what had nowhere to go", () => {
    const plan = planPaste(PL_LAYOUT, PL_VALUES, { r: 11, c: 1 }, [
      ["Gross revenue", "250000"],
      ["Cost of goods sold", "90000"],
      ["Gross profit", "160000"],
    ]);
    expect(plan.edits).toEqual([
      { sheet: "p_and_l", key: "gross_revenue", value: "250000", addr: { r: 11, c: 2 } },
      { sheet: "p_and_l", key: "cost_of_goods_sold", value: "90000", addr: { r: 12, c: 2 } },
    ]);
    expect(plan.newRows).toEqual([]);
    // The subtotal row is where the paste stops.
    expect(plan.clipped).toBe(1);
  });

  it("stops at the end of a section and reports the rows it did not place", () => {
    const plan = planPaste(PL_LAYOUT, PL_VALUES, { r: 34, c: 2 }, [["1200"], ["travel and tolls"], ["900"], ["800"]]);
    expect(plan.edits.map((edit) => edit.key)).toEqual(["other", "other_description"]);
    expect(plan.clipped).toBe(2);
  });

  it("stops at the bottom of the sheet", () => {
    const plan = planPaste(PL_LAYOUT, PL_VALUES, { r: 51, c: 2 }, [["a note"], ["overflow"], ["more"]]);
    expect(plan.edits.map((edit) => edit.key)).toEqual(["notes"]);
    expect(plan.clipped).toBe(2);
  });

  it("fills a column of inputs without clipping", () => {
    const plan = planPaste(PL_LAYOUT, PL_VALUES, { r: 16, c: 2 }, [["1"], ["2"], ["3"], ["4"]]);
    expect(plan.edits.map((edit) => edit.key)).toEqual([
      "supplies",
      "depreciation_and_amortization",
      "bank_charges",
      "payroll",
    ]);
    expect(plan.clipped).toBe(0);
  });

  it("ignores columns past the end of the sheet rather than wrapping", () => {
    const plan = planPaste(PL_LAYOUT, PL_VALUES, { r: 11, c: 2 }, [["250000", "spilled", "further"]]);
    expect(plan.edits.map((edit) => edit.key)).toEqual(["gross_revenue"]);
    expect(plan.clipped).toBe(0);
  });

  it("places nothing when the target address is not on the sheet", () => {
    // Row 6 does not exist on the debt schedule.
    const plan = planPaste(DS_LAYOUT, {}, { r: 6, c: 1 }, [["Acme"], ["Beta"]]);
    expect(plan.edits).toEqual([]);
    expect(plan.clipped).toBe(2);
  });
});

describe("planPaste on a list", () => {
  it("appends rows on the debt schedule past the end of the block", () => {
    const plan = planPaste(
      DS_LAYOUT,
      {},
      { r: 7, c: 1 },
      [
        ["Acme Bank", "Term loan"],
        ["Beta Credit", "Line of credit"],
        ["Gamma Leasing", "Equipment"],
        ["Delta Card", "Credit card"],
        ["Epsilon Fund", "Merchant advance"],
      ],
      { mintRowKey: minter() },
    );

    expect(plan.clipped).toBe(0);
    expect(plan.newRows).toEqual([
      { sheet: "debt_schedule", block: "debts", rowKey: "n1", after: "d3" },
      { sheet: "debt_schedule", block: "debts", rowKey: "n2", after: "n1" },
    ]);
    expect(plan.edits.map((edit) => edit.key)).toEqual([
      "d1.lender",
      "d1.debt_type",
      "d2.lender",
      "d2.debt_type",
      "d3.lender",
      "d3.debt_type",
      "n1.lender",
      "n1.debt_type",
      "n2.lender",
      "n2.debt_type",
    ]);
    expect(plan.edits[6].value).toBe("Delta Card");

    // Every edit still carries an address, appended rows included, and the
    // appended ones step down one workbook row at a time from the template.
    // They are nominal — an appended row has no workbook row until the server
    // renumbers the sheet, and here row 10 is still the totals row — so a
    // consumer must address these edits by `key`, never by `addr`.
    expect(plan.edits.every((edit) => typeof edit.addr?.r === "number")).toBe(true);
    expect(plan.edits.slice(6).map((edit) => edit.addr?.r)).toEqual([10, 10, 11, 11]);
  });

  it("appends rows on a PFS schedule, re-addressing the key inside the block", () => {
    const plan = planPaste(
      PFS_LAYOUT,
      {},
      { r: 50, c: 1 },
      [
        ["First National", "10000"],
        ["Second National", "20000"],
        ["Third National", "30000"],
      ],
      { mintRowKey: minter() },
    );

    expect(plan.newRows).toEqual([{ sheet: "pfs", block: "notes_payable", rowKey: "n1", after: "r2" }]);
    expect(plan.edits.map((edit) => edit.key)).toEqual([
      "notes_payable.r1.name_and_address_of_noteholder",
      "notes_payable.r1.original_balance",
      "notes_payable.r2.name_and_address_of_noteholder",
      "notes_payable.r2.original_balance",
      "notes_payable.n1.name_and_address_of_noteholder",
      "notes_payable.n1.original_balance",
    ]);
    expect(plan.clipped).toBe(0);
  });

  it("writes into the rows that exist and appends nothing when the block is long enough", () => {
    const plan = planPaste(DS_LAYOUT, {}, { r: 8, c: 1 }, [["Acme Bank"], ["Beta Credit"]], {
      mintRowKey: minter(),
    });
    expect(plan.newRows).toEqual([]);
    expect(plan.edits.map((edit) => edit.key)).toEqual(["d2.lender", "d3.lender"]);
  });
});

describe("planPaste of a single value", () => {
  it("lands at the top left when there is no range", () => {
    const plan = planPaste(PL_LAYOUT, PL_VALUES, { r: 16, c: 2 }, [["750"]]);
    expect(plan.edits).toEqual([{ sheet: "p_and_l", key: "supplies", value: "750", addr: { r: 16, c: 2 } }]);
  });

  it("tiles over a range, skipping the labels and the subtotal — this is also Delete", () => {
    const plan = planPaste(PL_LAYOUT, PL_VALUES, { r: 11, c: 1 }, [[""]], {
      range: { from: { r: 11, c: 1 }, to: { r: 13, c: 2 } },
    });
    expect(plan.edits).toEqual([
      { sheet: "p_and_l", key: "gross_revenue", value: "", addr: { r: 11, c: 2 } },
      { sheet: "p_and_l", key: "cost_of_goods_sold", value: "", addr: { r: 12, c: 2 } },
    ]);
    expect(plan.clipped).toBe(0);
  });

  it("writes one edit per cell even when the range is walked twice", () => {
    const plan = planPaste(DS_LAYOUT, {}, { r: 7, c: 1 }, [["x"]], {
      range: { from: { r: 7, c: 1 }, to: { r: 9, c: 2 } },
    });
    const keys = plan.edits.map((edit) => edit.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(["d1.lender", "d1.debt_type", "d2.lender", "d2.debt_type", "d3.lender", "d3.debt_type"]);
  });
});
