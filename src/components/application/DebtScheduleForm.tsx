"use client";

// The business debt schedule: one card per obligation.
//
// This was four columns in a table. A real schedule states more than that — what
// the debt IS, what it started at and when, the rate, whether it is secured and
// by what, and whether it is being paid on time — and a lender asks for all of
// it. Squeezing eleven fields into a table meant horizontal scrolling, which on
// a phone means a borrower filling in a column they cannot see the heading of.
//
// So each obligation is a card with a wrapping grid. Nothing ever scrolls
// sideways: at 380px it is one field per line, at desktop three, and the labels
// stay next to their inputs at every width in between.
//
// The type of debt is a list, not a box to type in. Typed, the same obligation
// arrived as "LOC", "loc" and "Line of Credit", and nothing downstream could
// tell a merchant cash advance from a term loan. The advance is the one that
// matters: when a row says it is one, the card asks whether the funder modified
// it because sales fell — the owner's question, asked of an MCA and nothing else.
//
// Seven answers are required for a submit (lender, type, original amount,
// balance, rate, monthly payment, current or delinquent — the owner's list) and
// an advance must also answer its question. The form marks them with an asterisk
// and, once a submit has been attempted (`showProblems`), outlines what is still
// missing; drafts save with anything blank, on purpose.
//
// Notes sit behind a disclosure. They are the one field most rows do not need,
// and a dozen inputs plus a textarea on every card buries the ones that matter.
//
// The totals are shown as they type because they are what the borrower is
// really being asked to confirm, and because a number that does not look right
// is easier to spot against a running total than by re-reading nine rows.

import { cloneElement, isValidElement, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { DEBT_MONTHLY_FACTORS, debtMonthlyEquivalent, updateDebtPaymentTerms, type DebtPaymentFrequency } from "@/lib/debtPaymentTerms";
import { Icon } from "@/components/design-system/Icon";
import { formatLoanPaidDown, loanPaidDownDescription } from "@/lib/loanProgress";
import {
  DEBT_TYPES,
  debtRowProblems,
  debtTypeLabel,
  isAdvanceType,
  isUnstatedType,
  missingFieldKeys,
  type DebtRowFields,
} from "@/lib/debtTypes";

export type DebtRow = DebtRowFields & {
  factor_rate?: string;
  payment_amount?: string;
  payment_frequency?: DebtPaymentFrequency | "";
  monthly_payment_source?: "native_terms" | "stated" | null;
  /** The stored row this line came from. Sent back so a save updates the
   *  row in place instead of re-creating it — the re-creation was what
   *  doubled the schedule. Absent on a line added on this page. */
  id?: string;
  /** Provenance stays visible; server-issued editable controls this form's access. */
  owner?: string;
};

export type DebtBody = { business_name?: string; debts?: DebtRow[]; no_debt?: boolean };

/** Who a locked row belongs to, in words either reader understands. */
const OWNER_LABELS: Record<string, string> = {
  admin: "the desk",
  client_form: "the borrower",
  ai_draft: "a document we read",
  field_desk: "the field desk",
};
const ownerLabel = (owner?: string) => (owner && OWNER_LABELS[owner]) || "another source";

const money = (value: string | undefined) => {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[,$\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const currency = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** The one line that says which obligation this card is, once it is collapsed
 *  in the reader's head. Falls back to the ordinal so an empty card is still
 *  addressable. */
function rowTitle(row: DebtRow, index: number): string {
  const lender = (row.lender ?? "").trim();
  return lender || `Obligation ${index + 1}`;
}

function rowAside(row: DebtRow): string {
  const parts: string[] = [];
  const type = debtTypeLabel(row.debt_type);
  if (type) parts.push(type);
  if (money(row.balance)) parts.push(`${currency(money(row.balance))} owed`);
  if (money(row.monthly_payment)) parts.push(`${currency(money(row.monthly_payment))}/mo`);
  return parts.join(" · ");
}

/** One labelled input. `required` puts the asterisk on; `invalid` outlines it
 *  and says so, once a submit has been tried — the control itself is marked
 *  aria-invalid and described by the message, and the page-level error does
 *  the announcing, so a dozen gaps are not a dozen alerts. */
function Field({
  id,
  label,
  required = false,
  invalid = false,
  children,
  source,
}: {
  id: string;
  label: string;
  required?: boolean;
  invalid?: boolean;
  children: ReactNode;
  source?: ReactNode;
}) {
  const problemId = `${id}-problem`;
  const control =
    invalid && isValidElement(children)
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          "aria-invalid": true,
          "aria-describedby": problemId,
        })
      : children;
  return (
    <div className={invalid ? "fp-field is-invalid" : "fp-field"}>
      <label htmlFor={id}>
        {label}
        {required ? (
          <em className="fp-req" aria-hidden="true">
            *
          </em>
        ) : null}
      </label>
      {control}
      {source}
      {invalid ? (
        <span className="fp-field-problem" id={problemId}>
          Required
        </span>
      ) : null}
    </div>
  );
}

export function DebtScheduleForm({
  value,
  onChange,
  disabled = false,
  showProblems = false,
  singleRow = false,
  scheduleCompletion = false,
  renderFieldSource,
  rowEntry = false,
}: {
  value: DebtBody;
  onChange: (next: DebtBody) => void;
  disabled?: boolean;
  /** True once a submit has been attempted: required answers still missing are
   *  outlined on the card. Off while drafting, so a half-typed row is not shouted at. */
  showProblems?: boolean;
  singleRow?: boolean;
  /** Use the current shared schedule's lender/balance/payment completion rule. */
  scheduleCompletion?: boolean;
  renderFieldSource?: (row: DebtRow, field: keyof DebtRow) => ReactNode;
  rowEntry?: boolean;
}) {
  const rows = useMemo(() => value.debts ?? [], [value.debts]);
  const setRows = (next: DebtRow[]) => onChange({ ...value, debts: next, ...(next.length ? { no_debt: false } : {}) });
  // Which cards have their notes open. Index-keyed like the rows themselves.
  const [openNotes, setOpenNotes] = useState<number[]>([]);

  const missing = useMemo(
    () => (showProblems ? missingFieldKeys(debtRowProblems(rows, scheduleCompletion)) : new Set<string>()),
    [rows, scheduleCompletion, showProblems],
  );
  const invalid = (index: number, field: string) => missing.has(`${index}.${field}`);

  const patch = (index: number, changes: Partial<DebtRow>) => {
    const next = [...rows];
    next[index] = updateDebtPaymentTerms(next[index], changes);
    setRows(next);
  };

  /** Choosing a type. Leaving the advance list clears its question — an answer
   *  left on a row that is no longer an advance is an answer nobody asked for. */
  const chooseType = (index: number, debtType: string) => {
    const changes: Partial<DebtRow> = { debt_type: debtType };
    if (!isAdvanceType(debtType)) {
      changes.mca_modified = "";
      changes.mca_modification_note = "";
    }
    patch(index, changes);
  };

  const remove = (index: number) => {
    setRows(rows.filter((_, at) => at !== index));
    setOpenNotes((open) =>
      open.filter((at) => at !== index).map((at) => (at > index ? at - 1 : at)),
    );
  };

  const totalBalance = rows.reduce((sum, row) => sum + money(row.balance), 0);
  const totalMonthly = rows.reduce((sum, row) => sum + money(row.monthly_payment), 0);

  return (
    <div className="fp-stack">
      {!rowEntry ? <div className="fp-field">
        <label htmlFor="fp-business-name">Business name</label>
        <input
          id="fp-business-name"
          disabled={disabled}
          value={value.business_name ?? ""}
          onChange={(event) => onChange({ ...value, business_name: event.target.value })}
          placeholder="The business these obligations belong to"
        />
      </div> : null}

      <p className="fp-legend">
        <em className="fp-req" aria-hidden="true">
          *
        </em>{" "}
        {singleRow || scheduleCompletion ? "Lender, current balance and monthly payment complete a saved schedule. Payment amount and frequency can calculate the monthly payment." : "What a lender needs on every obligation. Dates, collateral and notes can stay blank."}
      </p>

      {rows.length === 0 ? (
        <div className="fp-empty">
          <Icon name="doc" size={20} />
          <p>
            <strong>Nothing listed yet.</strong>
            <br />
            Add a row for each loan, line of credit, card, lease or advance the business is
            currently paying.
          </p>
        </div>
      ) : null}

      {!singleRow && rows.length === 0 ? <label className="checkline"><input type="checkbox" checked={value.no_debt === true} disabled={disabled} onChange={(event) => onChange({ ...value, no_debt: event.target.checked })} />I confirm this business has no outstanding debt.</label> : null}

      {rows.map((row, index) => {
        const notesOpen = openNotes.includes(index);
        const hasNote = Boolean((row.notes ?? "").trim());
        // Source origin is provenance. The scoped server permission decides
        // whether this reader may correct the form's working copy.
        const locked = disabled || row.editable === false;
        const advance = isAdvanceType(row.debt_type);
        const typed = (row.debt_type ?? "").trim();
        // A value typed before the list existed, and not one of ours: shown as
        // itself so it is not silently dropped, until somebody picks from the
        // list. "loan" is the column's old default, not an answer, so it is blank.
        const legacyType =
          typed && !isUnstatedType(typed) && !DEBT_TYPES.some((option) => option.value === typed) ? typed : "";
        return (
          // Keyed by the stored row's id when it has one; a line added on this
          // page has none yet and falls back to its position.
          <section key={row.id ?? index} className={locked ? "fp-row is-locked" : "fp-row"} aria-label={rowTitle(row, index)}>
            <header className="fp-row-head">
              <span className="fp-row-num">{index + 1}</span>
              <div className="fp-row-title">
                <strong>{rowTitle(row, index)}</strong>
                {rowAside(row) ? <span>{rowAside(row)}</span> : null}
                {row.owner ? (
                  <span className="fp-row-locked">
                    {row.owner === "ai_draft" ? "Imported from a document. " : `Entered by ${ownerLabel(row.owner)}. `}
                    {row.editable === false ? "Read-only in this form." : "Review and correct these answers; the original source is preserved."}
                  </span>
                ) : null}
              </div>
              {!rowEntry ? <button
                type="button"
                className="fp-icon-btn"
                disabled={locked}
                aria-label={`Remove ${rowTitle(row, index)}`}
                onClick={() => remove(index)}
              >
                <Icon name="x" size={14} />
              </button> : null}
            </header>

            <div className="fp-grid">
              <Field id={`lender-${index}`} label="Lender name" required invalid={invalid(index, "lender")} source={renderFieldSource?.(row, "lender")}>
                <input
                  id={`lender-${index}`}
                  disabled={locked}
                  value={row.lender ?? ""}
                  onChange={(event) => patch(index, { lender: event.target.value })}
                />
              </Field>
              <Field id={`type-${index}`} label="Type of debt" required={!singleRow && !scheduleCompletion} invalid={invalid(index, "debt_type")} source={renderFieldSource?.(row, "debt_type")}>
                <select
                  id={`type-${index}`}
                  disabled={locked}
                  value={isUnstatedType(row.debt_type) ? "" : (row.debt_type ?? "")}
                  onChange={(event) => chooseType(index, event.target.value)}
                >
                  <option value="">Choose one…</option>
                  {legacyType ? <option value={legacyType}>{legacyType} (as typed)</option> : null}
                  {DEBT_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id={`original-${index}`} label="Original amount" required={!singleRow && !scheduleCompletion} invalid={invalid(index, "original_amount")} source={renderFieldSource?.(row, "original_amount")}>
                <input
                  id={`original-${index}`}
                  inputMode="decimal"
                  disabled={locked}
                  value={row.original_amount ?? ""}
                  onChange={(event) => patch(index, { original_amount: event.target.value })}
                />
              </Field>
              <Field id={`balance-${index}`} label="Current balance" required invalid={invalid(index, "balance")} source={renderFieldSource?.(row, "balance")}>
                <input
                  id={`balance-${index}`}
                  inputMode="decimal"
                  disabled={locked}
                  value={row.balance ?? ""}
                  onChange={(event) => patch(index, { balance: event.target.value })}
                />
              </Field>
              <Field id={`paid-down-${index}`} label="Paid down">
                <output id={`paid-down-${index}`} htmlFor={`original-${index} balance-${index}`} title={loanPaidDownDescription(row.original_amount, row.balance)}>{formatLoanPaidDown(row.original_amount, row.balance)}</output>
              </Field>
              <Field id={`rate-${index}`} label="Annual interest rate (%)" required={!singleRow && !scheduleCompletion} invalid={invalid(index, "rate")} source={renderFieldSource?.(row, "rate")}>
                <input
                  id={`rate-${index}`}
                  inputMode="decimal"
                  disabled={locked}
                  // A factor rate is not a percentage: the column, the PDF and
                  // the review all print this as "%", so an advance is asked
                  // for its cost as a rate, not for "1.25".
                  placeholder={advance ? "The APR or effective annual rate, not the factor" : undefined}
                  value={row.rate ?? ""}
                  onChange={(event) => patch(index, { rate: event.target.value })}
                />
              </Field>
              <Field id={`factor-${index}`} label="Factor rate (×)" source={renderFieldSource?.(row, "factor_rate")}>
                <input id={`factor-${index}`} inputMode="decimal" disabled={locked} value={row.factor_rate ?? ""} placeholder="1.35" onChange={(event) => patch(index, { factor_rate: event.target.value })} />
              </Field>
              <Field id={`payment-amount-${index}`} label="Payment amount" source={renderFieldSource?.(row, "payment_amount")}>
                <input id={`payment-amount-${index}`} inputMode="decimal" disabled={locked} value={row.payment_amount ?? ""} onChange={(event) => patch(index, { payment_amount: event.target.value })} />
              </Field>
              <Field id={`payment-frequency-${index}`} label="Payment frequency" source={renderFieldSource?.(row, "payment_frequency")}>
                <select id={`payment-frequency-${index}`} disabled={locked} value={row.payment_frequency ?? ""} onChange={(event) => patch(index, { payment_frequency: event.target.value as DebtPaymentFrequency | "" })}>
                  <option value="">Choose frequency</option>{Object.keys(DEBT_MONTHLY_FACTORS).map((frequency) => <option key={frequency} value={frequency}>{frequency === "biweekly" ? "Every two weeks" : frequency.charAt(0).toUpperCase() + frequency.slice(1)}</option>)}
                </select>
              </Field>
              <Field id={`monthly-${index}`} label="Monthly payment" required invalid={invalid(index, "monthly_payment")} source={<>{row.monthly_payment_source === "native_terms" && debtMonthlyEquivalent(row.payment_amount, row.payment_frequency) != null ? <span className="sub">≈ Monthly: payment amount × {DEBT_MONTHLY_FACTORS[row.payment_frequency as DebtPaymentFrequency]}.</span> : null}{renderFieldSource?.(row, "monthly_payment")}</>}>
                <input
                  id={`monthly-${index}`}
                  inputMode="decimal"
                  disabled={locked}
                  placeholder={advance ? "Daily or weekly remittances, as a month" : undefined}
                  value={row.monthly_payment ?? ""}
                  onChange={(event) => patch(index, { monthly_payment: event.target.value })}
                />
              </Field>
              <Field id={`origin-${index}`} label="Origination date" source={renderFieldSource?.(row, "originated_on")}>
                <input
                  id={`origin-${index}`}
                  type="date"
                  disabled={locked}
                  value={row.originated_on ?? ""}
                  onChange={(event) => patch(index, { originated_on: event.target.value })}
                />
              </Field>
              <Field id={`maturity-${index}`} label="Maturity date" source={renderFieldSource?.(row, "maturity_on")}>
                <input
                  id={`maturity-${index}`}
                  type="date"
                  disabled={locked}
                  value={row.maturity_on ?? ""}
                  onChange={(event) => patch(index, { maturity_on: event.target.value })}
                />
              </Field>
              <Field id={`secured-${index}`} label="Secured or unsecured" source={renderFieldSource?.(row, "secured")}>
                <select
                  id={`secured-${index}`}
                  disabled={locked}
                  value={row.secured ?? ""}
                  onChange={(event) => patch(index, { secured: event.target.value })}
                >
                  <option value="">—</option>
                  <option value="secured">Secured</option>
                  <option value="unsecured">Unsecured</option>
                </select>
              </Field>
              <Field id={`status-${index}`} label="Current or delinquent" required={!singleRow && !scheduleCompletion} invalid={invalid(index, "payment_status")} source={renderFieldSource?.(row, "payment_status")}>
                <select
                  id={`status-${index}`}
                  disabled={locked}
                  value={row.payment_status ?? ""}
                  onChange={(event) => patch(index, { payment_status: event.target.value })}
                >
                  <option value="">—</option>
                  <option value="current">Current</option>
                  <option value="delinquent">Delinquent</option>
                </select>
              </Field>
              <Field id={`collateral-${index}`} label="Type of collateral" source={renderFieldSource?.(row, "collateral")}>
                <input
                  id={`collateral-${index}`}
                  disabled={locked}
                  placeholder="Inventory, equipment, property…"
                  value={row.collateral ?? ""}
                  onChange={(event) => patch(index, { collateral: event.target.value })}
                />
              </Field>

              {advance ? (
                // The owner's question, asked of a merchant cash advance and
                // nothing else. A funder that lowered the remittance because
                // sales fell has changed what this row reports.
                <div className="fp-mca" role="group" aria-labelledby={`mca-q-${index}`}>
                  <p id={`mca-q-${index}`}>
                    <strong>This is an advance against future sales.</strong> Has the funder modified
                    its terms — for example, a reduced daily or weekly pull, a pause, a reconciliation,
                    or a changed repayment schedule?
                  </p>
                  <Field id={`mca-${index}`} label="MCA modified?" required={!singleRow && !scheduleCompletion} invalid={invalid(index, "mca_modified")} source={renderFieldSource?.(row, "mca_modified")}>
                    <select
                      id={`mca-${index}`}
                      disabled={locked}
                      value={row.mca_modified ?? ""}
                      onChange={(event) => patch(index, { mca_modified: event.target.value })}
                    >
                      <option value="">Not confirmed</option>
                      <option value="yes">Modified</option>
                      <option value="no">No modification</option>
                    </select>
                  </Field>
                  {row.mca_modified === "yes" ? (
                    <Field id={`mca-note-${index}`} label="What changed" source={renderFieldSource?.(row, "mca_modification_note")}>
                      <input
                        id={`mca-note-${index}`}
                        disabled={locked}
                        placeholder="e.g. daily pull cut from $500 to $300 in June"
                        value={row.mca_modification_note ?? ""}
                        onChange={(event) => patch(index, { mca_modification_note: event.target.value })}
                      />
                    </Field>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Notes behind a disclosure. Most rows do not need one, and a
                textarea on every card buries the fields that matter. */}
            <button
              type="button"
              className="fp-disclosure"
              aria-expanded={notesOpen}
              aria-controls={`notes-${index}`}
              onClick={() =>
                setOpenNotes((open) =>
                  open.includes(index) ? open.filter((at) => at !== index) : [...open, index],
                )
              }
            >
              <span className={notesOpen ? "fp-caret is-open" : "fp-caret"} aria-hidden="true" />
              {hasNote ? "Note" : "Add a note"}
              {hasNote && !notesOpen ? <em className="fp-dot" aria-label="has a note" /> : null}
            </button>
            {notesOpen ? (
              <div className="fp-disclosure-body" id={`notes-${index}`}>
                <textarea
                  rows={3}
                  disabled={disabled}
                  readOnly={locked && !disabled}
                  placeholder="Anything the lender should know — a balloon payment, a personal guarantee, a payoff already scheduled."
                  value={row.notes ?? ""}
                  onChange={(event) => patch(index, { notes: event.target.value })}
                />
              </div>
            ) : null}
          </section>
        );
      })}

      {!singleRow ? <button
        type="button"
        className="fp-add"
        disabled={disabled}
        onClick={() => setRows([...rows, {}])}
      >
        <Icon name="plus" size={14} /> Add an obligation
      </button> : null}

      {!singleRow && rows.length > 0 ? (
        <div className="fp-totals">
          <div>
            <span>Obligations</span>
            <strong>{rows.length}</strong>
          </div>
          <div>
            <span>Total monthly</span>
            <strong>{currency(totalMonthly)}</strong>
          </div>
          <div>
            <span>Total outstanding</span>
            <strong>{currency(totalBalance)}</strong>
          </div>
        </div>
      ) : null}
    </div>
  );
}
