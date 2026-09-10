"use client";

// What you are about to send, before you send it.
//
// These forms are long and mostly numbers, and the old flow went straight from
// the last field to "thank you" — so the first time anyone saw the whole answer
// was never. A transposed balance or a figure typed into the row above is the
// kind of mistake nobody catches while entering it and everybody catches while
// reading it back.
//
// Only what was filled in. A 413 has thirty-odd lines and most borrowers answer
// six; printing twenty-four zeros to review would bury the six. The count of
// what was left blank is stated instead, so a short list reads as "you answered
// six things" rather than "something went missing".

import type { PfsBody, PfsSchema } from "@/components/application/Pfs413Form";
import type { DebtBody, DebtRow } from "@/components/application/DebtScheduleForm";
import type { StatementBody, StatementSchema } from "@/components/application/BusinessStatementForm";

export type ReviewKind = "pfs" | "debt_schedule" | "p_and_l" | "balance_sheet";

const num = (value: unknown) => {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[,$\s%]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Entered, as opposed to zero. A blank and a typed 0 are the same answer here:
 *  neither is a figure the lender will read. */
const entered = (value: unknown) => String(value ?? "").trim() !== "" && num(value) !== 0;

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="fpr-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Blanks({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <p className="fpr-blank">
      {count} line{count === 1 ? "" : "s"} left blank. That is fine — blank means it does not apply.
    </p>
  );
}

function Section({
  title,
  children,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  empty?: string;
}) {
  return (
    <section className="fpr-section">
      <h3>{title}</h3>
      {children}
      {empty ? <p className="fpr-blank">{empty}</p> : null}
    </section>
  );
}

function PfsReview({ schema, body }: { schema: PfsSchema; body: PfsBody }) {
  const applicant = body.applicant ?? {};
  const group = (rows: PfsSchema["assets"], values: Record<string, unknown> | undefined) => {
    const filled = rows.filter((row) => entered((values ?? {})[row.key]));
    return { filled, blank: rows.length - filled.length };
  };

  const assets = group(schema.assets, body.assets);
  const liabilities = group(schema.liabilities, body.liabilities);
  const income = group(schema.income, body.income);
  const contingent = group(schema.contingent, body.contingent);

  const total = (rows: PfsSchema["assets"], values: Record<string, unknown> | undefined) =>
    rows.reduce((sum, row) => sum + num((values ?? {})[row.key]), 0);

  const totalAssets = total(schema.assets, body.assets);
  const totalLiabilities = total(schema.liabilities, body.liabilities);

  const identity = [
    ["Name", applicant.name],
    ["Business", applicant.business_name],
    ["Home address", applicant.home_address],
    ["Business phone", applicant.business_phone],
  ].filter(([, value]) => String(value ?? "").trim());

  return (
    <>
      {identity.length ? (
        <Section title="About you">
          {identity.map(([label, value]) => (
            <Line key={String(label)} label={String(label)} value={String(value)} />
          ))}
        </Section>
      ) : null}

      <Section title="Assets" empty={assets.filled.length ? undefined : "No assets entered."}>
        {assets.filled.map((row) => (
          <Line key={row.key} label={row.label} value={money(num((body.assets ?? {})[row.key]))} />
        ))}
        <Line label="Total assets" value={money(totalAssets)} />
        <Blanks count={assets.blank} />
      </Section>

      <Section
        title="Liabilities"
        empty={liabilities.filled.length ? undefined : "No liabilities entered."}
      >
        {liabilities.filled.map((row) => (
          <Line
            key={row.key}
            label={row.label}
            value={money(num((body.liabilities ?? {})[row.key]))}
          />
        ))}
        <Line label="Total liabilities" value={money(totalLiabilities)} />
        <Blanks count={liabilities.blank} />
      </Section>

      {/* The figure a lender reads first, so it is the one to check hardest. */}
      <div className="fpr-headline">
        <span>Net worth</span>
        <strong>{money(totalAssets - totalLiabilities)}</strong>
      </div>

      {income.filled.length ? (
        <Section title="Annual income">
          {income.filled.map((row) => (
            <Line key={row.key} label={row.label} value={money(num((body.income ?? {})[row.key]))} />
          ))}
          <Blanks count={income.blank} />
        </Section>
      ) : null}

      {contingent.filled.length ? (
        <Section title="Contingent liabilities">
          {contingent.filled.map((row) => (
            <Line
              key={row.key}
              label={row.label}
              value={money(num((body.contingent ?? {})[row.key]))}
            />
          ))}
        </Section>
      ) : null}

      {schema.schedules.map((spec) => {
        const rows = (body.schedules ?? {})[spec.key] ?? [];
        if (!rows.length) return null;
        return (
          <Section key={spec.key} title={spec.label}>
            {rows.map((row, index) => (
              <div key={index} className="fpr-sub">
                {spec.columns
                  .filter((column) => String(row[column] ?? "").trim())
                  .map((column) => (
                    <span key={column}>
                      <em>{column}</em> {row[column]}
                    </span>
                  ))}
              </div>
            ))}
          </Section>
        );
      })}

      {String(body.notes ?? "").trim() ? (
        <Section title="Notes">
          <p className="fpr-note">{body.notes}</p>
        </Section>
      ) : null}
    </>
  );
}

const DEBT_FIELDS: [keyof DebtRow, string][] = [
  ["debt_type", "Type"],
  ["original_amount", "Original"],
  ["rate", "Rate"],
  ["originated_on", "Originated"],
  ["maturity_on", "Matures"],
  ["secured", "Secured"],
  ["payment_status", "Status"],
  ["collateral", "Collateral"],
];

function DebtReview({ body }: { body: DebtBody }) {
  const rows = (body.debts ?? []).filter(
    (row) => String(row.lender ?? "").trim() || num(row.balance) || num(row.monthly_payment),
  );
  const totalBalance = rows.reduce((sum, row) => sum + num(row.balance), 0);
  const totalMonthly = rows.reduce((sum, row) => sum + num(row.monthly_payment), 0);

  if (!rows.length) {
    return (
      <Section title="Obligations" empty="No obligations listed. You are telling us the business carries none." >
        <></>
      </Section>
    );
  }

  return (
    <>
      {body.business_name ? (
        <Section title="Business">
          <Line label="Name" value={body.business_name} />
        </Section>
      ) : null}

      {rows.map((row, index) => (
        <Section key={index} title={String(row.lender ?? "").trim() || `Obligation ${index + 1}`}>
          <Line label="Current balance" value={money(num(row.balance))} />
          <Line label="Monthly payment" value={money(num(row.monthly_payment))} />
          <div className="fpr-sub">
            {DEBT_FIELDS.filter(([key]) => String(row[key] ?? "").trim()).map(([key, label]) => (
              <span key={String(key)}>
                <em>{label}</em> {String(row[key])}
                {key === "rate" ? "%" : ""}
              </span>
            ))}
          </div>
          {String(row.notes ?? "").trim() ? <p className="fpr-note">{row.notes}</p> : null}
        </Section>
      ))}

      <div className="fpr-headline">
        <span>
          {rows.length} obligation{rows.length === 1 ? "" : "s"}
        </span>
        <strong>
          {money(totalMonthly)} a month · {money(totalBalance)} outstanding
        </strong>
      </div>
    </>
  );
}

function StatementReview({ schema, body }: { schema: StatementSchema; body: StatementBody }) {
  // Values are nested by section, the shape the form writes and the server reads.
  const header = body.header ?? {};
  const sections = body.sections ?? {};
  const headerLines = schema.header.filter((field) => String(header[field.key] ?? "").trim());

  return (
    <>
      {headerLines.length ? (
        <Section title="Period">
          {headerLines.map((field) => (
            <Line key={field.key} label={field.label} value={String(header[field.key])} />
          ))}
        </Section>
      ) : null}

      {schema.sections.map((section) => {
        const values = sections[section.key] ?? {};
        const filled = section.rows.filter((row) => entered(values[row.key]));
        if (!filled.length) return null;
        const subtotal = section.rows.reduce((sum, row) => sum + num(values[row.key]), 0);
        return (
          <Section key={section.key} title={section.label}>
            {filled.map((row) => (
              <Line key={row.key} label={row.label} value={money(num(values[row.key]))} />
            ))}
            <Line label={section.subtotal.label} value={money(subtotal)} />
            <Blanks count={section.rows.length - filled.length} />
          </Section>
        );
      })}

      {String(body.notes ?? "").trim() ? (
        <Section title="Notes">
          <p className="fpr-note">{body.notes}</p>
        </Section>
      ) : null}
    </>
  );
}

export function FormReview(props: {
  kind: ReviewKind;
  schema: PfsSchema | StatementSchema;
  body: PfsBody & DebtBody & StatementBody;
}) {
  const { kind, schema, body } = props;
  if (kind === "debt_schedule") return <DebtReview body={body} />;
  if (kind === "pfs") return <PfsReview schema={schema as PfsSchema} body={body} />;
  return <StatementReview schema={schema as StatementSchema} body={body} />;
}
