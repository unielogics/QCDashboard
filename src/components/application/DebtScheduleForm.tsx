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
// Notes sit behind a disclosure. They are the one field most rows do not need,
// and eleven inputs plus a textarea on every card buries the ones that matter.
//
// The totals are shown as they type because they are what the borrower is
// really being asked to confirm, and because a number that does not look right
// is easier to spot against a running total than by re-reading nine rows.

import { useState } from "react";
import { Icon } from "@/components/design-system/Icon";

export type DebtRow = {
  /** The stored row this line came from. Sent back so a save updates the
   *  row in place instead of re-creating it — the re-creation was what
   *  doubled the schedule. Absent on a line added on this page. */
  id?: string;
  /** False when another source owns the row (the desk, an AI draft) and this
   *  form's save will leave it alone. Shown for context, not for editing. */
  editable?: boolean;
  /** Which source owns the row (admin, client_form, ai_draft, field_desk), so a
   *  locked row can say who to ask — from whichever side is reading it. */
  owner?: string;
  lender?: string;
  debt_type?: string;
  original_amount?: string;
  balance?: string;
  rate?: string;
  monthly_payment?: string;
  originated_on?: string;
  maturity_on?: string;
  secured?: string;
  payment_status?: string;
  collateral?: string;
  notes?: string;
};

export type DebtBody = { business_name?: string; debts?: DebtRow[] };

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
  if (money(row.balance)) parts.push(`${currency(money(row.balance))} owed`);
  if (money(row.monthly_payment)) parts.push(`${currency(money(row.monthly_payment))}/mo`);
  return parts.join(" · ");
}

export function DebtScheduleForm({
  value,
  onChange,
  disabled = false,
}: {
  value: DebtBody;
  onChange: (next: DebtBody) => void;
  disabled?: boolean;
}) {
  const rows = value.debts ?? [];
  const setRows = (next: DebtRow[]) => onChange({ ...value, debts: next });
  // Which cards have their notes open. Index-keyed like the rows themselves.
  const [openNotes, setOpenNotes] = useState<number[]>([]);

  const patch = (index: number, changes: Partial<DebtRow>) => {
    const next = [...rows];
    next[index] = { ...next[index], ...changes };
    setRows(next);
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
      <div className="fp-field">
        <label htmlFor="fp-business-name">Business name</label>
        <input
          id="fp-business-name"
          disabled={disabled}
          value={value.business_name ?? ""}
          onChange={(event) => onChange({ ...value, business_name: event.target.value })}
          placeholder="The business these obligations belong to"
        />
      </div>

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

      {rows.map((row, index) => {
        const notesOpen = openNotes.includes(index);
        const hasNote = Boolean((row.notes ?? "").trim());
        // A row another source owns — the desk's, an AI draft's — is shown so
        // the schedule reads whole, but this form's save will leave it alone.
        // Every control on the card is disabled, but the note stays readable:
        // a locked row's note is still information the reader is owed.
        const locked = disabled || row.editable === false;
        return (
          // Keyed by the stored row's id when it has one; a line added on this
          // page has none yet and falls back to its position.
          <section key={row.id ?? index} className={locked ? "fp-row is-locked" : "fp-row"} aria-label={rowTitle(row, index)}>
            <header className="fp-row-head">
              <span className="fp-row-num">{index + 1}</span>
              <div className="fp-row-title">
                <strong>{rowTitle(row, index)}</strong>
                {rowAside(row) ? <span>{rowAside(row)}</span> : null}
                {row.editable === false ? (
                  <span className="fp-row-locked">
                    Entered by {ownerLabel(row.owner)}. It can only be changed from there.
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="fp-icon-btn"
                disabled={locked}
                aria-label={`Remove ${rowTitle(row, index)}`}
                onClick={() => remove(index)}
              >
                <Icon name="x" size={14} />
              </button>
            </header>

            <div className="fp-grid">
              <div className="fp-field">
                <label htmlFor={`lender-${index}`}>Lender name</label>
                <input
                  id={`lender-${index}`}
                  disabled={locked}
                  value={row.lender ?? ""}
                  onChange={(event) => patch(index, { lender: event.target.value })}
                />
              </div>
              <div className="fp-field">
                <label htmlFor={`type-${index}`}>Type of debt</label>
                <input
                  id={`type-${index}`}
                  disabled={locked}
                  placeholder="Term loan, LOC, equipment…"
                  value={row.debt_type ?? ""}
                  onChange={(event) => patch(index, { debt_type: event.target.value })}
                />
              </div>
              <div className="fp-field">
                <label htmlFor={`original-${index}`}>Original amount</label>
                <input
                  id={`original-${index}`}
                  inputMode="decimal"
                  disabled={locked}
                  value={row.original_amount ?? ""}
                  onChange={(event) => patch(index, { original_amount: event.target.value })}
                />
              </div>
              <div className="fp-field">
                <label htmlFor={`balance-${index}`}>Current balance</label>
                <input
                  id={`balance-${index}`}
                  inputMode="decimal"
                  disabled={locked}
                  value={row.balance ?? ""}
                  onChange={(event) => patch(index, { balance: event.target.value })}
                />
              </div>
              <div className="fp-field">
                <label htmlFor={`rate-${index}`}>Interest rate (%)</label>
                <input
                  id={`rate-${index}`}
                  inputMode="decimal"
                  disabled={locked}
                  value={row.rate ?? ""}
                  onChange={(event) => patch(index, { rate: event.target.value })}
                />
              </div>
              <div className="fp-field">
                <label htmlFor={`monthly-${index}`}>Monthly payment</label>
                <input
                  id={`monthly-${index}`}
                  inputMode="decimal"
                  disabled={locked}
                  value={row.monthly_payment ?? ""}
                  onChange={(event) => patch(index, { monthly_payment: event.target.value })}
                />
              </div>
              <div className="fp-field">
                <label htmlFor={`origin-${index}`}>Origin date</label>
                <input
                  id={`origin-${index}`}
                  type="date"
                  disabled={locked}
                  value={row.originated_on ?? ""}
                  onChange={(event) => patch(index, { originated_on: event.target.value })}
                />
              </div>
              <div className="fp-field">
                <label htmlFor={`maturity-${index}`}>Maturity date</label>
                <input
                  id={`maturity-${index}`}
                  type="date"
                  disabled={locked}
                  value={row.maturity_on ?? ""}
                  onChange={(event) => patch(index, { maturity_on: event.target.value })}
                />
              </div>
              <div className="fp-field">
                <label htmlFor={`secured-${index}`}>Secured or unsecured</label>
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
              </div>
              <div className="fp-field">
                <label htmlFor={`status-${index}`}>Current or delinquent</label>
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
              </div>
              <div className="fp-field">
                <label htmlFor={`collateral-${index}`}>Type of collateral</label>
                <input
                  id={`collateral-${index}`}
                  disabled={locked}
                  placeholder="Inventory, equipment, property…"
                  value={row.collateral ?? ""}
                  onChange={(event) => patch(index, { collateral: event.target.value })}
                />
              </div>
            </div>

            {/* Notes behind a disclosure. Most rows do not need one, and a
                textarea on every card buries the eleven fields that matter. */}
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

      <button
        type="button"
        className="fp-add"
        disabled={disabled}
        onClick={() => setRows([...rows, {}])}
      >
        <Icon name="plus" size={14} /> Add an obligation
      </button>

      {rows.length > 0 ? (
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
