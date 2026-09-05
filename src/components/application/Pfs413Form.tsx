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

export type PfsSummaryRow = {
  key: string;
  label: string;
  liquid: boolean;
  schedule: string | null;
};

export type PfsScheduleSpec = { key: string; label: string; columns: string[] };

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

function total(rows: PfsSummaryRow[], values: Record<string, unknown> | undefined): number {
  return rows.reduce((sum, row) => {
    const raw = String(values?.[row.key] ?? "").replace(/[,$\s]/g, "");
    const parsed = Number.parseFloat(raw);
    return sum + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);
}

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
                {spec.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                // Index-keyed deliberately: these rows have no id, and the only
                // mutations are append and remove-at-index.
                <tr key={index}>
                  {spec.columns.map((column) => (
                    <td key={column}>
                      <Input
                        aria-label={`${spec.label} — ${column}`}
                        disabled={disabled}
                        value={row[column] ?? ""}
                        onChange={(event) => {
                          const next = [...rows];
                          next[index] = { ...row, [column]: event.target.value };
                          onChange(next);
                        }}
                      />
                    </td>
                  ))}
                  <td>
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
          onChange([...rows, Object.fromEntries(spec.columns.map((column) => [column, ""]))])
        }
      >
        <Icon name="plus" size={12} /> Add row
      </Btn>
    </div>
  );
}
