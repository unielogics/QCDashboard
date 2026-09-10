// The recompute adapter: every figure a sheet's formula cells show, from the
// flat key → raw-string map the worksheet holds. No formula engine — the
// statements reuse `computeStatementTotals` unchanged, the 413 reuses
// `computePfsTotals`, and the debt schedule is two sums. The server's
// `computed` map replaces this on every save; this is what you see while
// typing.

import {
  computeStatementTotals,
  type StatementBody,
  type StatementSchema,
} from "@/components/application/BusinessStatementForm";
import { computePfsTotals, type PfsTotalsInput } from "@/lib/pfsTotals";
import { parseMoney } from "./money";
import type { ComputedValues, SheetKind, SheetValues } from "./types";

/** What the 413 sheet ships alongside its rows: `pfs_schema.describe()`. */
export type PfsSheetSchema = PfsTotalsInput & { schema_version?: string };

export type SheetSchema = StatementSchema | PfsSheetSchema;

/** The statement body `computeStatementTotals` reads, from flat values: the
 *  schema says which keys are header fields and which section each line
 *  belongs to. Keys are unique per kind, which is what makes this a lookup. */
export function statementBody(schema: StatementSchema, values: SheetValues): StatementBody {
  const header: Record<string, string | null> = {};
  for (const field of schema.header) header[field.key] = values[field.key] ?? null;
  const sections: Record<string, Record<string, string | null>> = {};
  for (const section of schema.sections) {
    const lines: Record<string, string | null> = {};
    for (const row of section.rows) lines[row.key] = values[row.key] ?? null;
    sections[section.key] = lines;
  }
  return { schema_version: schema.schema_version, header, sections, notes: values.notes ?? "" };
}

function sumOf(values: SheetValues, suffix: string): number {
  let total = 0;
  for (const key of Object.keys(values)) {
    if (key.endsWith(suffix)) total += parseMoney(values[key]).value;
  }
  return total;
}

/** The debt schedule's two totals, the way `sheet_layout.debt_totals` reads them. */
export function debtTotals(values: SheetValues): ComputedValues {
  return {
    total_balance: sumOf(values, ".balance"),
    total_monthly_payment: sumOf(values, ".monthly_payment"),
  };
}

function pick(values: SheetValues, rows: ReadonlyArray<{ key: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = values[row.key] ?? "";
  return out;
}

/** The 413's totals, including net worth, total income and contingent liabilities. */
export function pfsTotals(schema: PfsSheetSchema, values: SheetValues): ComputedValues {
  const totals = computePfsTotals(schema, {
    assets: pick(values, schema.assets),
    liabilities: pick(values, schema.liabilities),
    income: pick(values, schema.income ?? []),
    contingent: pick(values, schema.contingent ?? []),
  });
  return { ...totals };
}

/** Every computed figure of one sheet, by the `totals` key its formula cells name. */
export function recompute(kind: SheetKind, schema: SheetSchema | null | undefined, values: SheetValues): ComputedValues {
  switch (kind) {
    case "p_and_l":
    case "balance_sheet": {
      if (!schema || !("sections" in schema)) return {};
      return computeStatementTotals(schema, statementBody(schema, values)).values;
    }
    case "debt_schedule":
      return debtTotals(values);
    case "pfs": {
      if (!schema || !("assets" in schema)) return {};
      return pfsTotals(schema, values);
    }
    default:
      return {};
  }
}
