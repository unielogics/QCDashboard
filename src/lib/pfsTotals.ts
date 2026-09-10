// Money as people type it, and the Form 413 totals — the browser's copy of
// `pfs_schema._amount` and `pfs_schema.totals`.
//
// The server is the authority: it recomputes every figure on save and stores
// the columns the underwriting metrics read. This exists so a borrower
// checking a total against the number in their head does not wait for a
// round trip, and it must agree with the server on every input, which is why
// it is one function imported by every form rather than a copy in each.

/** The number behind a typed money string, or zero.
 *
 *  Commas, dollar signs and spaces are noise. Accounting parentheses are the
 *  minus sign: "(500)" and "($500)" read as -500, the same as "-500" and
 *  "-$500". Blank and unparseable read as zero — the totals are the wrong
 *  place to reject a form. */
export function parseMoney(value: unknown): number {
  let raw = String(value ?? "").replace(/[,$\s]/g, "");
  const wrapped = /^\((.*)\)$/.exec(raw);
  if (wrapped) {
    // The parentheses carry the sign; an inner minus is the same statement
    // made twice, not a double negative.
    raw = "-" + wrapped[1].replace(/^-+/, "");
  }
  if (raw === "" || raw === "-" || raw === ".") return 0;
  // Number() would read "0x10" as 16, "1e3" as 1000 and "Infinity" as itself.
  // The server's `_amount` feeds Decimal(), which accepts none of those and
  // returns 0. A form that totals what the server will not store is worse than
  // one that reads an odd entry as nothing, so match the server exactly.
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(raw)) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** The sum of the named lines, from the raw strings. */
export function sumRows(rows: ReadonlyArray<{ key: string }>, values: Record<string, unknown> | undefined): number {
  return rows.reduce((sum, row) => sum + parseMoney(values?.[row.key]), 0);
}

/** A summary row exactly as `pfs_schema.describe()` serves it.
 *
 *  Only `key` and `liquid` are read here — liquidity is a property of the row,
 *  never of its label, which is the whole reason `pfs_schema` carries the flag.
 *  The rest of the payload is declared anyway so a response assigns straight
 *  into this type instead of tripping the excess-property check. */
export type PfsSchemaRow = {
  key: string;
  label?: string;
  liquid?: boolean;
  schedule?: string | null;
};

export type PfsTotalsInput = {
  assets: ReadonlyArray<PfsSchemaRow>;
  liabilities: ReadonlyArray<PfsSchemaRow>;
  income?: ReadonlyArray<PfsSchemaRow>;
  contingent?: ReadonlyArray<PfsSchemaRow>;
};

export type PfsTotals = {
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  liquid_assets: number;
  total_income: number;
  total_contingent: number;
};

/** Every derived 413 figure, the way the server computes them on save.
 *  Liquidity follows the row's `liquid` flag, never its label. Contingent
 *  liabilities are a disclosure and never fold into `total_liabilities`. */
export function computePfsTotals(
  schema: PfsTotalsInput,
  body: {
    assets?: Record<string, unknown>;
    liabilities?: Record<string, unknown>;
    income?: Record<string, unknown>;
    contingent?: Record<string, unknown>;
  },
): PfsTotals {
  const total_assets = sumRows(schema.assets, body.assets);
  const total_liabilities = sumRows(schema.liabilities, body.liabilities);
  return {
    total_assets,
    total_liabilities,
    net_worth: total_assets - total_liabilities,
    liquid_assets: sumRows(
      schema.assets.filter((row) => row.liquid),
      body.assets,
    ),
    total_income: sumRows(schema.income ?? [], body.income),
    total_contingent: sumRows(schema.contingent ?? [], body.contingent),
  };
}
