// The recompute adapter, against the figures Python produced for the same
// inputs (see `fixtures.test.ts`). This is the test that keeps the two
// arithmetic engines from diverging: the browser shows these numbers while
// someone types, the server's `computed` map replaces them on save, and a
// disagreement is a wrong number on a credit file.

import { describe, expect, it } from "vitest";
import type { StatementSchema } from "@/components/application/BusinessStatementForm";
import { debtTotals, pfsTotals, recompute, statementBody } from "../compute";
import type { ComputedValues, SheetKind, SheetValues } from "../types";
import { BS_CASES, BS_SCHEMA, COMPUTE_KEYS, DEBT_CASE, PFS_CASE, PFS_SCHEMA, PL_CASES, PL_SCHEMA } from "./fixtures.test";

/** Figures `pfs_schema.totals` / `bss.totals` return that the browser has no
 *  business recomputing: `cash` is a server-side underwriting column, and the
 *  two flags are booleans rather than figures. */
const SERVER_ONLY = new Set(["cash", "equity_implied", "balances"]);

function expectMatchesPython(got: ComputedValues, expected: Record<string, number | boolean | null>) {
  for (const [key, want] of Object.entries(expected)) {
    if (SERVER_ONLY.has(key)) continue;
    expect(Object.keys(got), key).toContain(key);
    if (want === null) expect(got[key], key).toBeNull();
    // To the cent, and then some: the only slack is IEEE against Python's Decimal.
    else expect(got[key], key).toBeCloseTo(want as number, 6);
  }
}

function clone(schema: StatementSchema): StatementSchema {
  return JSON.parse(JSON.stringify(schema)) as StatementSchema;
}

describe("statementBody", () => {
  it("shapes the flat worksheet map back into the body the totals engine reads", () => {
    const values: SheetValues = { business_name: "Acme", gross_revenue: "100", supplies: "5", notes: "n" };
    const body = statementBody(PL_SCHEMA, values);
    expect(body.schema_version).toBe(PL_SCHEMA.schema_version);
    expect(body.header?.business_name).toBe("Acme");
    expect(body.header?.period_start).toBeNull();
    expect(body.sections?.revenue?.gross_revenue).toBe("100");
    expect(body.sections?.operating_expenses?.supplies).toBe("5");
    expect(body.sections?.below_the_line?.other_income).toBeNull();
    expect(body.notes).toBe("n");
    // Every section the schema declares is present, so a blank section is a
    // blank section rather than a missing one.
    expect(Object.keys(body.sections ?? {})).toEqual(PL_SCHEMA.sections.map((section) => section.key));
  });
});

describe("recompute against the Python fixtures", () => {
  for (const [name, testCase] of Object.entries(PL_CASES)) {
    it(`agrees with the server on the P&L: ${name}`, () => {
      expectMatchesPython(recompute("p_and_l", PL_SCHEMA, testCase.values), testCase.expected);
    });
  }

  for (const [name, testCase] of Object.entries(BS_CASES)) {
    it(`agrees with the server on the balance sheet: ${name}`, () => {
      expectMatchesPython(recompute("balance_sheet", BS_SCHEMA, testCase.values), testCase.expected);
    });
  }

  it("agrees with the server on the 413", () => {
    expectMatchesPython(recompute("pfs", PFS_SCHEMA, PFS_CASE.values), PFS_CASE.expected);
  });

  it("agrees with the server on the debt schedule", () => {
    expectMatchesPython(recompute("debt_schedule", null, DEBT_CASE.values), DEBT_CASE.expected);
  });

  it("produces every figure the layout's formula cells ask for", () => {
    const produced: Record<SheetKind, ComputedValues> = {
      p_and_l: recompute("p_and_l", PL_SCHEMA, PL_CASES.ebitda_reads_the_flags.values),
      balance_sheet: recompute("balance_sheet", BS_SCHEMA, BS_CASES.equity_implied.values),
      debt_schedule: recompute("debt_schedule", null, DEBT_CASE.values),
      pfs: recompute("pfs", PFS_SCHEMA, PFS_CASE.values),
    };
    for (const kind of Object.keys(produced) as SheetKind[]) {
      for (const key of COMPUTE_KEYS[kind]) {
        expect(Object.keys(produced[kind]), `${kind}.${key}`).toContain(key);
      }
    }
  });
});

describe("implied equity", () => {
  it("is assets less liabilities while the equity section is blank", () => {
    const totals = recompute("balance_sheet", BS_SCHEMA, BS_CASES.equity_implied.values);
    expect(totals.total_assets).toBe(1000);
    expect(totals.total_liabilities).toBe(400);
    expect(totals.total_equity).toBe(600);
    expect(totals.implied_equity).toBe(600);
    // Nothing was typed, so there is nothing to be out of balance with.
    expect(totals.imbalance).toBe(0);
    expect(totals.total_liabilities_and_equity).toBe(1000);
  });

  it("stops being implied the moment one equity line is typed, and then the sheet can be out of balance", () => {
    const values: SheetValues = { ...BS_CASES.equity_implied.values, owner_capital: "100" };
    const totals = recompute("balance_sheet", BS_SCHEMA, values);
    expect(totals.total_equity).toBe(100);
    expect(totals.implied_equity).toBe(600);
    expect(totals.imbalance).toBe(500);
  });

  it("counts a typed zero as typed, not as blank", () => {
    const totals = recompute("balance_sheet", BS_SCHEMA, BS_CASES.typed_zero_counts.values);
    expect(totals.total_equity).toBe(0);
    expect(totals.imbalance).toBe(1000);
  });
});

describe("ratios", () => {
  it("are null, never zero, when there is no denominator", () => {
    const none = recompute("balance_sheet", BS_SCHEMA, BS_CASES.ratios_none.values);
    // No current liabilities at all: there is no current ratio to show.
    expect(none.current_ratio).toBeNull();
    expect(none.debt_to_equity).toBe(0);

    const negative = recompute("balance_sheet", BS_SCHEMA, BS_CASES.ratios_de_none.values);
    // Equity is negative, so debt-to-equity is not a number anyone should read.
    expect(negative.total_equity).toBe(-1000);
    expect(negative.debt_to_equity).toBeNull();
    expect(negative.current_ratio).toBe(0.5);

    const zeroEquity = recompute("balance_sheet", BS_SCHEMA, BS_CASES.typed_zero_counts.values);
    expect(zeroEquity.debt_to_equity).toBeNull();
  });

  it("round to two places, the server's rule", () => {
    const totals = recompute("balance_sheet", BS_SCHEMA, BS_CASES.big_and_messy.values);
    expect(totals.current_ratio).toBe(2.99);
    expect(totals.debt_to_equity).toBe(333.33);
  });

  it("gives months covered only for a period that runs forwards", () => {
    expect(recompute("p_and_l", PL_SCHEMA, PL_CASES.accounting_parentheses_and_months.values).months_covered).toBe(12);
    expect(recompute("p_and_l", PL_SCHEMA, PL_CASES.empty.values).months_covered).toBeNull();
    const backwards: SheetValues = { period_start: "2024-12-31", period_end: "2024-01-01" };
    expect(recompute("p_and_l", PL_SCHEMA, backwards).months_covered).toBeNull();
  });
});

describe("EBITDA", () => {
  it("comes from the add-back flags", () => {
    const totals = recompute("p_and_l", PL_SCHEMA, PL_CASES.ebitda_reads_the_flags.values);
    // Depreciation 2,000 + interest 1,000 + income taxes 3,000.
    expect(totals.addbacks).toBe(6000);
    expect(totals.ebitda).toBe(50600);
    expect(totals.net_income).toBe(44600);
    // Owner salaries are a candidate, reported separately and never added.
    expect(totals.owner_compensation).toBe(9000);
    expect(totals.ebitda).toBe((totals.net_income ?? 0) + (totals.addbacks ?? 0));
  });

  it("follows the flags even when the labels have been swapped", () => {
    // The same schema with two labels exchanged: the flags stay where they
    // were, so the arithmetic must too. A label-sniffing engine would read
    // "Depreciation and amortization" and add back the wrong 5,000.
    const swapped = clone(PL_SCHEMA);
    const opex = swapped.sections.find((section) => section.key === "operating_expenses");
    const supplies = opex?.rows.find((row) => row.key === "supplies");
    const depreciation = opex?.rows.find((row) => row.key === "depreciation_and_amortization");
    expect(supplies?.addback).toBe(false);
    expect(depreciation?.addback).toBe(true);
    if (supplies) supplies.label = "Depreciation and amortization";
    if (depreciation) depreciation.label = "Supplies";

    const onTheLabel = recompute("p_and_l", swapped, { gross_revenue: "10000", supplies: "5000" });
    expect(onTheLabel.addbacks).toBe(0);
    expect(onTheLabel.ebitda).toBe(5000);

    const onTheFlag = recompute("p_and_l", swapped, { gross_revenue: "10000", depreciation_and_amortization: "5000" });
    expect(onTheFlag.addbacks).toBe(5000);
    expect(onTheFlag.ebitda).toBe(10000);
  });
});

describe("row flags", () => {
  it("keeps a text row out of the sums, even when a number is typed into it", () => {
    const withProse = recompute("p_and_l", PL_SCHEMA, {
      gross_revenue: "10000",
      supplies: "100",
      other_description: "travel and tolls",
    });
    expect(withProse.total_operating_expenses).toBe(100);

    // The point of the flag: the description line is a text row, so a figure
    // typed there is not an expense.
    const withDigits = recompute("p_and_l", PL_SCHEMA, {
      gross_revenue: "10000",
      supplies: "100",
      other_description: "1000",
    });
    expect(withDigits.total_operating_expenses).toBe(100);
    expect(withDigits.operating_income).toBe(9900);
    expect(withDigits.addbacks).toBe(0);
  });

  it("subtracts a contra row instead of adding it", () => {
    expectMatchesPython(
      recompute("balance_sheet", BS_SCHEMA, BS_CASES.contra_rows_subtract.values),
      BS_CASES.contra_rows_subtract.expected,
    );
    // Cost of goods sold is the P&L's contra row: revenue less cost.
    const totals = recompute("p_and_l", PL_SCHEMA, { gross_revenue: "100000", cost_of_goods_sold: "40000" });
    expect(totals.gross_profit).toBe(60000);
  });
});

describe("debtTotals", () => {
  it("sums the balance and payment columns as typed", () => {
    expect(debtTotals(DEBT_CASE.values)).toEqual(DEBT_CASE.expected);
  });

  it("reads accounting parentheses and counts an unreadable entry as nothing", () => {
    expect(
      debtTotals({
        "d1.balance": "(1,000.50)",
        "d1.monthly_payment": "n/a",
        "d2.balance": "$2,000",
        "d2.monthly_payment": "100",
      }),
    ).toEqual({ total_balance: 999.5, total_monthly_payment: 100 });
  });

  it("sums nothing when nothing is filled", () => {
    expect(debtTotals({})).toEqual({ total_balance: 0, total_monthly_payment: 0 });
  });
});

describe("pfsTotals", () => {
  it("reports net worth, liquidity, income and contingent liabilities", () => {
    const totals = pfsTotals(PFS_SCHEMA, PFS_CASE.values);
    expect(totals).toEqual(PFS_CASE.expected);
    // Contingent liabilities are a disclosure and never fold into the total.
    expect(totals.total_contingent).toBe(5000);
    expect(totals.net_worth).toBe((totals.total_assets ?? 0) - (totals.total_liabilities ?? 0));
  });

  it("takes liquidity from the row's flag, not its label", () => {
    const liquid = PFS_SCHEMA.assets.filter((row) => row.liquid).map((row) => row.key);
    const values: SheetValues = Object.fromEntries(PFS_SCHEMA.assets.map((row) => [row.key, "10"]));
    expect(pfsTotals(PFS_SCHEMA, values).liquid_assets).toBe(liquid.length * 10);
    expect(pfsTotals(PFS_SCHEMA, values).total_assets).toBe(PFS_SCHEMA.assets.length * 10);
  });
});

describe("recompute with nothing to compute from", () => {
  it("returns an empty map rather than wrong figures when the schema is missing", () => {
    expect(recompute("p_and_l", null, { gross_revenue: "1" })).toEqual({});
    expect(recompute("balance_sheet", undefined, { cash_in_bank: "1" })).toEqual({});
    expect(recompute("pfs", null, { cash_on_hand: "1" })).toEqual({});
    // A statement schema handed to the 413, or the other way round, is a
    // mismatch and must not half-compute.
    expect(recompute("pfs", PL_SCHEMA, PFS_CASE.values)).toEqual({});
    expect(recompute("p_and_l", PFS_SCHEMA, PL_CASES.empty.values)).toEqual({});
  });

  it("still totals the debt schedule, which needs no schema", () => {
    expect(recompute("debt_schedule", null, DEBT_CASE.values)).toEqual(DEBT_CASE.expected);
  });
});
