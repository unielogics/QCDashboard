"use client";

// The Personal Financial Statement, laid out as SBA Form 413.
//
// Every label, every liquidity flag and every schedule column comes from the
// server (`GET /application-profiles/financial-statements/schema`). The form it
// replaces hardcoded eight asset labels here and the matching liquidity rules
// again in the backend, with a comment in both asking that they be kept in
// sync. They drifted, and because `pfs_total_liquid_assets` gates programme
// eligibility, the drift moved the line between qualifying and not. There is
// one copy now, and it is not this one.
//
// Controlled and presentational on purpose: the same component has to serve the
// staff editor, the borrower's own page, and the public link, which differ in
// who saves and when, not in what the form is.

import { useCallback } from "react";
import { Btn, Field, Input, Textarea } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { sumRows } from "@/lib/pfsTotals";

export type PfsSummaryRow = {
  key: string;
  label: string;
  liquid: boolean;
  schedule: string | null;
};

/** One schedule column: the key a stored row is addressed by, and the label
 *  the 413 prints. */
export type PfsScheduleField = { key: string; label: string };

export type PfsScheduleSpec = {
  key: string;
  label: string;
  /** The labels, verbatim, in print order. */
  columns: string[];
  /** The same columns paired with their stable keys. Optional only so a
   *  schema cached before the keys existed still renders. */
  fields?: PfsScheduleField[];
};

/** The columns of a schedule as (key, label) pairs, whichever the server sent. */
export function scheduleFields(spec: PfsScheduleSpec): PfsScheduleField[] {
  if (spec.fields && spec.fields.length === spec.columns.length) return spec.fields;
  return spec.columns.map((label) => ({ key: label, label }));
}

/** A schedule cell, whether the row was stored keyed by column key (the
 *  worksheet) or by column label (rows written before the keys existed). */
export function scheduleCell(row: Record<string, string>, field: PfsScheduleField): string {
  return row[field.key] ?? row[field.label] ?? "";
}

export type PfsSchema = {
  schema_version: string;
  assets: PfsSummaryRow[];
  liabilities: PfsSummaryRow[];
  income: PfsSummaryRow[];
  contingent: PfsSummaryRow[];
  schedules: PfsScheduleSpec[];
  collects_ssn: boolean;
};

export type PfsBody = {
  schema_version?: string;
  applicant?: Record<string, string>;
  /** The "as of" date the 413 prints. The statement's date falls back to it. */
  as_of?: string;
  assets?: Record<string, unknown>;
  liabilities?: Record<string, unknown>;
  income?: Record<string, unknown>;
  contingent?: Record<string, unknown>;
  schedules?: Record<string, Record<string, string>[]>;
  notes?: string;
};

/** Money as typed, not as stored. The server strips commas and symbols; this
 *  only needs to keep what the person entered so the field does not fight them
 *  mid-keystroke. */
function money(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/** The sum of a summary column from the raw strings — `parseMoney`'s
 *  tolerance, shared with the other forms so "(500)" means the same thing on
 *  every one of them. */
const total = sumRows;

const currency = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD" });

export function Pfs413Form({
  schema,
  value,
  onChange,
  disabled = false,
}: {
  schema: PfsSchema;
  value: PfsBody;
  onChange: (next: PfsBody) => void;
  disabled?: boolean;
}) {
  const setSection = useCallback(
    (section: keyof PfsBody, key: string, next: string) => {
      onChange({
        ...value,
        [section]: { ...((value[section] as Record<string, unknown>) ?? {}), [key]: next },
      });
    },
    [onChange, value],
  );

  const setScheduleRows = useCallback(
    (key: string, rows: Record<string, string>[]) => {
      onChange({ ...value, schedules: { ...(value.schedules ?? {}), [key]: rows } });
    },
    [onChange, value],
  );

  const totalAssets = total(schema.assets, value.assets);
  const totalLiabilities = total(schema.liabilities, value.liabilities);

  const summary = (
    rows: PfsSummaryRow[],
    section: "assets" | "liabilities" | "income" | "contingent",
    heading: string,
    footer?: { label: string; amount: number },
  ) => (
    <div className="pfs-section">
      <h4>{heading}</h4>
      <table className="tbl pfs-table">
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>
                {row.label}
                {/* Shown because it changes an underwriting number, and a
                    borrower deciding where to put a balance should know. */}
                {row.liquid ? <span className="cellchip c-acc">liquid</span> : null}
              </td>
              <td className="r">
                <Input
                  aria-label={row.label}
                  inputMode="decimal"
                  disabled={disabled}
                  value={money((value[section] as Record<string, unknown>)?.[row.key])}
                  onChange={(event) => setSection(section, row.key, event.target.value)}
                />
              </td>
            </tr>
          ))}
          {footer ? (
            <tr className="pfs-total">
              <td>{footer.label}</td>
              <td className="r num">{currency(footer.amount)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="grid g14 pfs-form">
      <div className="fldgrid two">
        <Field label="Name">
          <Input
            disabled={disabled}
            value={value.applicant?.name ?? ""}
            onChange={(event) => setSection("applicant", "name", event.target.value)}
          />
        </Field>
        <Field label="Business name">
          <Input
            disabled={disabled}
            value={value.applicant?.business_name ?? ""}
            onChange={(event) => setSection("applicant", "business_name", event.target.value)}
          />
        </Field>
        <Field label="Home address">
          <Input
            disabled={disabled}
            value={value.applicant?.home_address ?? ""}
            onChange={(event) => setSection("applicant", "home_address", event.target.value)}
          />
        </Field>
        <Field label="Business phone">
          <Input
            disabled={disabled}
            value={value.applicant?.business_phone ?? ""}
            onChange={(event) => setSection("applicant", "business_phone", event.target.value)}
          />
        </Field>
        {/* The 413 prints "as of" a date. Nothing used to send one, so every
            filed sheet read "not stated"; the statement date now falls back
            to this. */}
        <Field label="As of">
          <Input
            type="date"
            disabled={disabled}
            value={value.as_of ?? ""}
            onChange={(event) => onChange({ ...value, as_of: event.target.value })}
          />
        </Field>
      </div>

      <div className="pfs-columns">
        {summary(schema.assets, "assets", "Assets", {
          label: "Total assets",
          amount: totalAssets,
        })}
        {summary(schema.liabilities, "liabilities", "Liabilities", {
          label: "Total liabilities",
          amount: totalLiabilities,
        })}
      </div>

      <div className="pfs-networth">
        <span>Net worth</span>
        <b className="num">{currency(totalAssets - totalLiabilities)}</b>
      </div>

      <div className="pfs-columns">
        {summary(schema.income, "income", "Source of income (annual)")}
        {summary(schema.contingent, "contingent", "Contingent liabilities")}
      </div>

      {schema.schedules.map((spec) => (
        <ScheduleTable
          key={spec.key}
          spec={spec}
          rows={value.schedules?.[spec.key] ?? []}
          disabled={disabled}
          onChange={(rows) => setScheduleRows(spec.key, rows)}
        />
      ))}

      <Field label="Notes">
        <Textarea
          rows={3}
          disabled={disabled}
          value={value.notes ?? ""}
          onChange={(event) => onChange({ ...value, notes: event.target.value })}
        />
      </Field>

      {!schema.collects_ssn ? (
        <div className="sub">
          This form does not ask for a Social Security Number. Where a partner requires one it
          is provided separately.
        </div>
      ) : null}
    </div>
  );
}

function ScheduleTable({
  spec,
  rows,
  onChange,
  disabled,
}: {
  spec: PfsScheduleSpec;
  rows: Record<string, string>[];
  onChange: (rows: Record<string, string>[]) => void;
  disabled: boolean;
}) {
  const fields = scheduleFields(spec);
  // A row is written back in whichever form it already uses for that column:
  // a row the worksheet stored by key stays keyed, and a row written before
  // the keys existed stays labelled, so an edit never leaves a stale twin
  // under the other name. A new row is labelled — the form every reader of
  // the stored body understands today.
  const cellName = (row: Record<string, string>, field: PfsScheduleField) =>
    field.key in row ? field.key : field.label;
  return (
    <div className="pfs-section">
      <h4>{spec.label}</h4>
      {rows.length === 0 ? (
        <div className="sub">Nothing listed.</div>
      ) : (
        <div className="tblwrap">
          <table className="tbl pfs-table">
            <thead>
              <tr>
                {fields.map((field) => (
                  <th key={field.key}>{field.label}</th>
                ))}
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                // Index-keyed deliberately: these rows have no id, and the only
                // mutations are append and remove-at-index.
                <tr key={index}>
                  {fields.map((field) => (
                    // data-col carries the heading down to the cell so a narrow
                    // viewport can stack the row and still say what each field
                    // is. Without it the only way to keep the headings attached
                    // is a horizontal scrollbar.
                    <td key={field.key} data-col={field.label}>
                      <Input
                        aria-label={`${spec.label} — ${field.label}`}
                        disabled={disabled}
                        value={scheduleCell(row, field)}
                        onChange={(event) => {
                          const next = [...rows];
                          next[index] = { ...row, [cellName(row, field)]: event.target.value };
                          onChange(next);
                        }}
                      />
                    </td>
                  ))}
                  <td data-col="">
                    <Btn
                      size="sm"
                      disabled={disabled}
                      aria-label={`Remove row ${index + 1} from ${spec.label}`}
                      onClick={() => onChange(rows.filter((_, at) => at !== index))}
                    >
                      <Icon name="x" size={12} />
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Btn
        size="sm"
        disabled={disabled}
        onClick={() =>
          onChange([...rows, Object.fromEntries(fields.map((field) => [field.label, ""]))])
        }
      >
        <Icon name="plus" size={12} /> Add row
      </Btn>
    </div>
  );
}
