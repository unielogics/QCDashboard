"use client";

// The profit and loss statement and the balance sheet, one component.
//
// Every line, every add-back flag and every subtotal label comes from the
// server (`GET /application-profiles/financial-forms/schema/{kind}`), the way
// Pfs413Form takes the 413 from `financial-statements/schema`. The two forms
// differ in their rows, not in how a row behaves, so one schema-driven
// component serves both — and the desk's editor, the borrower's link and the
// packet page all render this same thing.
//
// Phone-first, the DebtScheduleForm lesson: a stacked label-and-money field
// per line, one disclosure per section with its running subtotal in the
// summary, and never a table. Nothing scrolls sideways.
//
// The totals are mirrored here from the raw strings the person typed — the
// server computes the same figures on save, but a borrower checking their
// gross profit against the number in their head should not have to wait for
// a round trip to see it.
//
// Controlled and presentational: it fetches nothing and keeps whatever was
// typed, commas and dollar signs included. The server strips them.

import { useMemo } from "react";
import { Icon } from "@/components/design-system/Icon";
import { parseMoney } from "@/lib/pfsTotals";

export type StatementKind = "p_and_l" | "balance_sheet";

/** What a section is on the statement — how the balance sheet rolls up. */
export type StatementSectionRole = "asset" | "liability" | "equity" | "income" | "expense" | "other";

/** How a computed line is shown: dollars, a ratio to two places, or a count. */
export type StatementComputedFormat = "money" | "ratio" | "count";

export type StatementHeaderField = {
  key: string;
  label: string;
  input: "text" | "date" | "select";
  options?: Array<string | { value: string; label: string }>;
};

export type StatementRow = {
  key: string;
  label: string;
  addback: boolean;
  contra: boolean;
  owner_comp: boolean;
  /** Words, not money — never summed, rendered as a text input. */
  text?: boolean;
  hint: string | null;
};

export type StatementSection = {
  key: string;
  label: string;
  role?: StatementSectionRole;
  rows: StatementRow[];
  subtotal: { key: string; label: string };
};

export type StatementComputed = {
  key: string;
  label: string;
  emphasis: boolean;
  format?: StatementComputedFormat;
};

export type StatementSchema = {
  schema_version: string;
  kind: StatementKind;
  header: StatementHeaderField[];
  sections: StatementSection[];
  computed: StatementComputed[];
  collects_ssn: boolean;
};

export type StatementBody = {
  schema_version?: string;
  header?: Record<string, string | null>;
  sections?: Record<string, Record<string, string | null>>;
  notes?: string;
};

/** Money as typed, not as stored. */
function money(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/** The number behind a typed string, or zero — the tolerance every form
 *  shares: commas, dollar signs and spaces are noise, "(500)" is -500. */
const parse = parseMoney;

/** A row that carries words, not money — the schema says so with `text`. It
 *  never enters a sum and gets a text input rather than a decimal one. */
const isTextRow = (row: StatementRow) => row.text === true;

const currency = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** A computed line by its kind. A ratio through the currency formatter reads
 *  "$1.50", and a count "$6" — which is how these lines went unrendered. Null
 *  is "—": a sheet with no current liabilities has no current ratio, and
 *  "$0" there would be a wrong number, not a blank. */
export function formatComputed(format: StatementComputedFormat | undefined, value: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  switch (format) {
    case "ratio":
      return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "count":
      return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    default:
      return currency(value);
  }
}

/** The signed sum of a section's money rows: contra rows subtract. */
function sectionSum(section: StatementSection, values: Record<string, string | null> | undefined): number {
  return section.rows.reduce((sum, row) => {
    if (isTextRow(row)) return sum;
    const amount = parse(values?.[row.key]);
    return sum + (row.contra ? -amount : amount);
  }, 0);
}

function anyTyped(section: StatementSection | undefined, values: Record<string, string | null> | undefined): boolean {
  if (!section) return false;
  return section.rows.some((row) => !isTextRow(row) && String(values?.[row.key] ?? "").trim() !== "");
}

/** What a section is, from the schema — with the old key sniffing kept only
 *  for a schema cached before `role` was served. */
function sectionRole(section: StatementSection): StatementSectionRole {
  if (section.role) return section.role;
  if (section.key === "equity" || section.key.endsWith("_equity")) return "equity";
  if (section.key.includes("liabilit")) return "liability";
  return "asset";
}

const isoDate = /^(\d{4})-(\d{2})-(\d{2})/;

/** Inclusive calendar months between two ISO dates; null when either is
 *  blank, unparseable, or the period runs backwards — `months_between` on the
 *  server, to the month. */
export function monthsBetween(start: unknown, end: unknown): number | null {
  const parts = (value: unknown): [number, number, number] | null => {
    const match = isoDate.exec(String(value ?? "").trim());
    if (!match) return null;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return [year, month, day];
  };
  const first = parts(start);
  const last = parts(end);
  if (!first || !last) return null;
  const [fy, fm, fd] = first;
  const [ly, lm, ld] = last;
  if (ly < fy || (ly === fy && (lm < fm || (lm === fm && ld < fd)))) return null;
  return (ly - fy) * 12 + (lm - fm) + 1;
}

/** `numerator / denominator` to two places, or null when there is no
 *  denominator — the server's `_ratio`. */
function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
}

export type StatementTotals = {
  /** Every figure the form can show, by the key the schema names it. Null is
   *  a figure that does not exist for this sheet (a ratio with no
   *  denominator, months with no dates), never zero. */
  values: Record<string, number | null>;
  /** Balance sheet only: the typed equity section is blank, so equity is implied. */
  equityImplied: boolean;
};

/** Every subtotal and computed line, from the raw strings, the way the server
 *  will compute them on save.
 *
 *  Section subtotals are signed sums, with three shapes the flags alone do not
 *  express: gross profit is revenue less cost of goods sold, net income is
 *  operating income plus other income less income taxes, and the balance-sheet
 *  totals roll their sections up by what the section is (assets, liabilities,
 *  equity). EBITDA comes from the add-back flags, never from the labels. */
export function computeStatementTotals(schema: StatementSchema, body: StatementBody): StatementTotals {
  const values: Record<string, number | null> = {};
  const sections = body.sections ?? {};
  const header = body.header ?? {};
  const byKey = new Map(schema.sections.map((section) => [section.key, section]));
  const subtotals: Record<string, number> = {};

  for (const section of schema.sections) {
    subtotals[section.subtotal.key] = sectionSum(section, sections[section.key]);
    values[section.subtotal.key] = subtotals[section.subtotal.key];
  }

  // Flagged rows across every section.
  let addbacks = 0;
  let ownerComp = 0;
  for (const section of schema.sections) {
    for (const row of section.rows) {
      if (isTextRow(row)) continue;
      const amount = parse(sections[section.key]?.[row.key]);
      if (row.addback) addbacks += amount;
      if (row.owner_comp) ownerComp += amount;
    }
  }
  values.addbacks = addbacks;
  values.owner_compensation = ownerComp;

  if (schema.kind === "p_and_l") {
    const revenue = sections.revenue ?? {};
    const grossRevenue = parse(revenue.gross_revenue);
    const cogs = parse(revenue.cost_of_goods_sold);
    const grossProfit = grossRevenue - cogs;
    const opex = byKey.get("operating_expenses");
    const totalOpex = opex ? sectionSum(opex, sections.operating_expenses) : 0;
    const operatingIncome = grossProfit - totalOpex;
    const below = sections.below_the_line ?? {};
    const otherIncome = parse(below.other_income);
    const incomeTaxes = parse(below.income_taxes);
    const netIncome = operatingIncome + otherIncome - incomeTaxes;
    values.gross_revenue = grossRevenue;
    values.cost_of_goods_sold = cogs;
    values.gross_profit = grossProfit;
    values.total_operating_expenses = totalOpex;
    values.operating_income = operatingIncome;
    values.other_income = otherIncome;
    values.income_taxes = incomeTaxes;
    values.net_income = netIncome;
    values.ebitda = netIncome + addbacks;
    values.months_covered = monthsBetween(header.period_start, header.period_end);
    return { values, equityImplied: false };
  }

  // Balance sheet: roll the sections up by what they are.
  let totalAssets = 0;
  let totalLiabilities = 0;
  let typedEquity = 0;
  let currentAssets = 0;
  let currentLiabilities = 0;
  let equitySection: StatementSection | undefined;
  for (const section of schema.sections) {
    const sum = subtotals[section.subtotal.key];
    switch (sectionRole(section)) {
      case "equity":
        typedEquity += sum;
        equitySection = section;
        break;
      case "liability":
        totalLiabilities += sum;
        break;
      case "asset":
        totalAssets += sum;
        break;
      default:
        break;
    }
    if (section.key === "current_assets") currentAssets = sum;
    if (section.key === "current_liabilities") currentLiabilities = sum;
  }
  const equityImplied = !anyTyped(equitySection, sections[equitySection?.key ?? "equity"]);
  const implied = totalAssets - totalLiabilities;
  const totalEquity = equityImplied ? implied : typedEquity;
  values.total_assets = totalAssets;
  values.total_liabilities = totalLiabilities;
  values.implied_equity = implied;
  values.total_equity = totalEquity;
  values.total_liabilities_and_equity = totalLiabilities + totalEquity;
  values.imbalance = equityImplied ? 0 : totalAssets - totalLiabilities - typedEquity;
  values.working_capital = currentAssets - currentLiabilities;
  // Ratios are null, not zero, when there is nothing to divide by — the
  // server's rule, and "$0" for a missing ratio is a wrong number.
  values.current_ratio = ratio(currentAssets, currentLiabilities);
  values.debt_to_equity = totalEquity > 0 ? ratio(totalLiabilities, totalEquity) : null;
  return { values, equityImplied };
}

export function BusinessStatementForm({
  schema,
  value,
  onChange,
  disabled = false,
}: {
  schema: StatementSchema;
  value: StatementBody;
  onChange: (next: StatementBody) => void;
  disabled?: boolean;
}) {
  const setHeader = (key: string, next: string) =>
    onChange({ ...value, header: { ...(value.header ?? {}), [key]: next } });

  const setRow = (sectionKey: string, key: string, next: string) =>
    onChange({
      ...value,
      sections: {
        ...(value.sections ?? {}),
        [sectionKey]: { ...(value.sections?.[sectionKey] ?? {}), [key]: next },
      },
    });

  /** Blank the whole equity section: the server implies equity from assets
   *  less liabilities when nothing is typed there. One click, no arithmetic. */
  const useImpliedEquity = () => {
    const equity = schema.sections.find((section) => sectionRole(section) === "equity");
    if (!equity) return;
    const blanked = Object.fromEntries(equity.rows.map((row) => [row.key, ""]));
    onChange({ ...value, sections: { ...(value.sections ?? {}), [equity.key]: blanked } });
  };

  const totals = useMemo(() => computeStatementTotals(schema, value), [schema, value]);
  const isBalanceSheet = schema.kind === "balance_sheet";
  // Shown to the cent here rather than rounded away: a sheet off by $40 is
  // still off, and the person fixing it needs the exact figure.
  const imbalance = totals.values.imbalance ?? 0;
  const unreconciled = isBalanceSheet && !totals.equityImplied && Math.abs(imbalance) >= 0.005;

  return (
    <div className="fp-stack pfs-form">
      {schema.header.length > 0 ? (
        <div className="fp-grid">
          {schema.header.map((field) => {
            const id = `bsf-${schema.kind}-${field.key}`;
            const current = money(value.header?.[field.key]);
            return (
              <div key={field.key} className="fp-field">
                <label htmlFor={id}>{field.label}</label>
                {field.input === "select" ? (
                  <select
                    id={id}
                    disabled={disabled}
                    value={current}
                    onChange={(event) => setHeader(field.key, event.target.value)}
                  >
                    <option value="">—</option>
                    {(field.options ?? []).map((option) => {
                      const opt = typeof option === "string" ? { value: option, label: option } : option;
                      return (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <input
                    id={id}
                    type={field.input === "date" ? "date" : "text"}
                    disabled={disabled}
                    value={current}
                    onChange={(event) => setHeader(field.key, event.target.value)}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {schema.sections.map((section) => {
        const values = value.sections?.[section.key];
        const subtotal = totals.values[section.subtotal.key] ?? 0;
        return (
          // Open by default: a borrower should see every line without hunting,
          // and can fold a section they have finished to keep their place.
          <details key={section.key} className="pfs-section fp-section" open>
            <summary className="fp-section-head">
              <span className="fp-caret" aria-hidden="true" />
              <h4>{section.label}</h4>
              <span className="fp-section-sum">
                <span>{section.subtotal.label}</span>
                <b className="num">{currency(subtotal)}</b>
              </span>
            </summary>
            <div className="fp-grid fp-section-rows">
              {section.rows.map((row) => {
                const id = `bsf-${schema.kind}-${section.key}-${row.key}`;
                const text = isTextRow(row);
                return (
                  <div key={row.key} className="fp-field">
                    <label htmlFor={id}>
                      {row.label}
                      {/* Shown because it changes an underwriting number — this
                          line is added back into EBITDA — and a borrower deciding
                          where a cost goes should know that. */}
                      {row.addback ? <span className="cellchip c-acc fp-addback">add-back</span> : null}
                      {row.owner_comp ? (
                        <span className="cellchip c-mut fp-addback">owner comp</span>
                      ) : null}
                    </label>
                    <input
                      id={id}
                      type="text"
                      inputMode={text ? "text" : "decimal"}
                      disabled={disabled}
                      placeholder={text ? "" : row.contra ? "0 — entered as a positive amount" : "0"}
                      value={money(values?.[row.key])}
                      onChange={(event) => setRow(section.key, row.key, event.target.value)}
                    />
                    {row.hint ? <small className="fp-hint">{row.hint}</small> : null}
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}

      {unreconciled ? (
        <div className="fp-balance-strip" role="status">
          <Icon name="alert" size={16} />
          <div>
            <strong>Unreconciled difference {currency(imbalance)}</strong>
            <span>
              Assets less liabilities and the equity you typed do not agree. You can still send
              this — or let equity be worked out from the other two.
            </span>
          </div>
          <button type="button" className="fp-balance-plug" disabled={disabled} onClick={useImpliedEquity}>
            Use implied equity
          </button>
        </div>
      ) : null}

      {isBalanceSheet && totals.equityImplied ? (
        <p className="fp-note">
          <span aria-hidden="true">◆</span>
          <span>
            Equity is left blank, so it is taken as assets less liabilities:{" "}
            <b className="num">{currency(totals.values.implied_equity ?? 0)}</b>. Fill the
            section in if you have the breakdown.
          </span>
        </p>
      ) : null}

      {schema.computed.length > 0 ? (
        <div className="fp-computed" aria-label="Totals">
          {schema.computed.map((line) => {
            const amount = totals.values[line.key];
            // A key the totals never produce is a schema line this form does
            // not know how to compute; a null is a figure that does not exist
            // for this sheet, shown as a dash.
            if (amount === undefined) return null;
            return (
              <div key={line.key} className={line.emphasis ? "pfs-total is-emphasis" : "pfs-total"}>
                <span>{line.label}</span>
                <b className="num">{formatComputed(line.format, amount)}</b>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="fp-field">
        <label htmlFor={`bsf-${schema.kind}-notes`}>Notes</label>
        <textarea
          id={`bsf-${schema.kind}-notes`}
          rows={3}
          disabled={disabled}
          placeholder="Anything a reader should know — what an “other” line holds, a one-off, a change in how the books are kept."
          value={value.notes ?? ""}
          onChange={(event) => onChange({ ...value, notes: event.target.value })}
        />
      </div>

      {!schema.collects_ssn ? (
        <div className="sub">This form does not ask for a Social Security Number.</div>
      ) : null}
    </div>
  );
}
