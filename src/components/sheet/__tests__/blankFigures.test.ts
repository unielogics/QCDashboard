// A subtotal of nothing is not zero.
//
// The memo lines already showed an em dash for a blank add-back; these are the
// same rule applied to every computed cell, against the real layouts in
// `fixtures.test.ts` (the backend's own `sheet_layout.layout(...)` output) and
// the real arithmetic in `compute.ts`, so a formula the backend rewords cannot
// quietly fall out of the rule.

import { describe, expect, it } from "vitest";
import { blankFormulaNames, indexFormulas, shownFigure } from "../SheetGrid";
import { recompute } from "../compute";
import { BS_LAYOUT, DS_LAYOUT, PFS_LAYOUT, PFS_SCHEMA, PL_LAYOUT, PL_SCHEMA, BS_SCHEMA } from "./fixtures.test";
import type { SheetCell, SheetLayout, SheetValues } from "../types";

function formulaCell(layout: SheetLayout, name: string): SheetCell {
  for (const row of layout.rows) {
    for (const cell of row.cells ?? []) {
      if (cell.type === "formula" && cell.xlsx_name === name) return cell;
    }
  }
  throw new Error(`no formula cell named ${name} in ${layout.kind}`);
}

function blanks(layout: SheetLayout, values: SheetValues): Set<string> {
  return blankFormulaNames(indexFormulas(layout), values);
}

describe("a computed cell whose inputs are all blank", () => {
  it("is an em dash on an untouched P&L, where the arithmetic says zero", () => {
    const computed = recompute("p_and_l", PL_SCHEMA, {});
    // The bug this rule fixes: the engine really does answer 0 here.
    expect(computed.gross_profit).toBe(0);
    expect(computed.net_income).toBe(0);

    const empty = blanks(PL_LAYOUT, {});
    expect(empty.has("gross_profit")).toBe(true);
    expect(empty.has("total_operating_expenses")).toBe(true);
    expect(empty.has("operating_income")).toBe(true);
    expect(empty.has("net_income")).toBe(true);
    expect(empty.has("ebitda")).toBe(true);
    expect(empty.has("owner_compensation")).toBe(true);

    // Null is what `cellDisplay` renders as "—".
    expect(shownFigure(formulaCell(PL_LAYOUT, "gross_profit"), computed, empty)).toBeNull();
    expect(shownFigure(formulaCell(PL_LAYOUT, "net_income"), computed, empty)).toBeNull();
  });

  it("is a real $0.00 once the inputs exist and cancel out", () => {
    const values: SheetValues = { gross_revenue: "1000", cost_of_goods_sold: "1000" };
    const computed = recompute("p_and_l", PL_SCHEMA, values);
    expect(computed.gross_profit).toBe(0);

    const blank = blanks(PL_LAYOUT, values);
    expect(blank.has("gross_profit")).toBe(false);
    expect(shownFigure(formulaCell(PL_LAYOUT, "gross_profit"), computed, blank)).toBe(0);
  });

  it("follows one typed figure up through every subtotal that reads it", () => {
    const values: SheetValues = { supplies: "250" };
    const blank = blanks(PL_LAYOUT, values);
    expect(blank.has("total_operating_expenses")).toBe(false);
    expect(blank.has("operating_income")).toBe(false);
    expect(blank.has("net_income")).toBe(false);
    expect(blank.has("ebitda")).toBe(false);
    // Nothing in the revenue section was typed, so its own subtotal is still
    // a figure that does not exist.
    expect(blank.has("gross_profit")).toBe(true);
  });

  it("never withholds a figure that is not zero", () => {
    const computed = { gross_profit: 4200 };
    const everything = new Set(["gross_profit"]);
    expect(shownFigure(formulaCell(PL_LAYOUT, "gross_profit"), computed, everything)).toBe(4200);
  });

  it("reads the balance sheet's implied equity through the IF", () => {
    const untouched = blanks(BS_LAYOUT, {});
    expect(untouched.has("total_equity")).toBe(true);
    expect(untouched.has("imbalance")).toBe(true);
    expect(untouched.has("total_liabilities_and_equity")).toBe(true);

    // Equity is left blank and implied from assets less liabilities: the
    // figure exists because an asset was typed.
    const withAssets: SheetValues = { cash_in_bank: "10000" };
    const implied = blanks(BS_LAYOUT, withAssets);
    expect(implied.has("total_equity")).toBe(false);
    expect(implied.has("total_liabilities")).toBe(true);
    expect(recompute("balance_sheet", BS_SCHEMA, withAssets).total_equity).toBe(10000);
  });

  it("expands a debt-schedule range down its own column only", () => {
    const untouched = blanks(DS_LAYOUT, {});
    expect(untouched.has("total_balance")).toBe(true);
    expect(untouched.has("total_monthly_payment")).toBe(true);

    const paying: SheetValues = { "d2.monthly_payment": "450" };
    const some = blanks(DS_LAYOUT, paying);
    expect(some.has("total_monthly_payment")).toBe(false);
    // A payment is not a balance: the balance total still has no figures.
    expect(some.has("total_balance")).toBe(true);
  });

  it("holds on the 413", () => {
    const untouched = blanks(PFS_LAYOUT, {});
    expect(untouched.has("total_assets")).toBe(true);
    expect(untouched.has("net_worth")).toBe(true);
    expect(untouched.has("total_income")).toBe(true);

    const values: SheetValues = { cash_on_hand: "500" };
    const some = blanks(PFS_LAYOUT, values);
    expect(some.has("total_assets")).toBe(false);
    expect(some.has("net_worth")).toBe(false);
    expect(some.has("total_liabilities")).toBe(true);
    expect(recompute("pfs", PFS_SCHEMA, values).total_assets).toBe(500);
  });
});
