"use client";

// Active advances as the client describes them, recorded by the desk and
// reconciled against what the AI reads. A contract PDF is welcome, but a
// client often gives the terms out loud first: who funded it, what was
// approved, what is left, how often it debits and how much. Each row shows
// the monthly equivalent (the intake's own cadence table) and, beside it,
// what the statements show going to that funder and what the contract said,
// so a mismatch is visible before anything is underwritten.

import { useEffect, useMemo, useState } from "react";
import { Btn, CellChip, Input, Select, StatusLine, cx } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { errorMessage } from "@/components/marketplace/shared";
import { useAdvances, useSaveAdvances } from "@/hooks/useApi";
import { formatLoanOriginationDate, formatLoanPaidDown, formatLoanPaidDownPct, loanPaidDownDescription } from "@/lib/loanProgress";
import {
  cadenceLabel,
  money,
  monthlyEquivalent,
  reconciliationLabel,
  type AdvanceFrequency,
  type AdvanceIn,
  type AdvanceRead,
  type FinancialCockpit as Cockpit,
  type RecurringPayee,
} from "@/lib/financialCockpit";

type Draft = {
  key: string;
  id: string | null;
  lender: string;
  original_amount: string;
  balance: string;
  payment_amount: string;
  payment_frequency: AdvanceFrequency;
  factor_rate: string;
  payoff_amount: string;
  maturity_on: string;
  notes: string;
  count_in_dscr: boolean;
  editable: boolean;
  source: string;
  payee_key: string | null;
};

const FREQUENCIES: Array<{ value: AdvanceFrequency; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every two weeks" },
  { value: "monthly", label: "Monthly" },
];
const SOURCE_LABEL: Record<string, string> = { desk: "Desk", client: "Client typed", ai: "AI draft" };

let counter = 0;
const nextKey = () => `draft-${++counter}`;

function fromRead(row: AdvanceRead): Draft {
  return {
    key: row.id,
    id: row.id,
    lender: row.lender,
    original_amount: row.original_amount == null ? "" : String(row.original_amount),
    balance: row.balance == null ? "" : String(row.balance),
    payment_amount: row.payment_amount == null ? "" : String(row.payment_amount),
    payment_frequency: row.payment_frequency ?? "daily",
    factor_rate: row.factor_rate == null ? "" : String(row.factor_rate),
    payoff_amount: row.payoff_amount == null ? "" : String(row.payoff_amount),
    maturity_on: row.maturity_on ?? "",
    notes: row.notes ?? "",
    count_in_dscr: row.count_in_dscr,
    editable: row.editable,
    source: row.source,
    payee_key: row.payee_key ?? null,
  };
}

function blank(partial: Partial<Draft> = {}): Draft {
  return {
    key: nextKey(),
    id: null,
    lender: "",
    original_amount: "",
    balance: "",
    payment_amount: "",
    payment_frequency: "daily",
    factor_rate: "",
    payoff_amount: "",
    maturity_on: "",
    notes: "",
    count_in_dscr: true,
    editable: true,
    source: "desk",
    payee_key: null,
    ...partial,
  };
}

const num = (value: string): number | null => {
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

function toPayload(draft: Draft): AdvanceIn {
  return {
    id: draft.id,
    lender: draft.lender.trim(),
    original_amount: num(draft.original_amount),
    balance: num(draft.balance),
    payment_amount: num(draft.payment_amount),
    payment_frequency: draft.payment_frequency,
    factor_rate: num(draft.factor_rate),
    payoff_amount: num(draft.payoff_amount),
    maturity_on: draft.maturity_on || null,
    notes: draft.notes.trim() || null,
    count_in_dscr: draft.count_in_dscr,
    payee_key: draft.payee_key,
  };
}

export function AdvancesCard({ profileId, cockpit, canEdit }: { profileId: string; cockpit: Cockpit; canEdit: boolean }) {
  const advances = useAdvances(profileId);
  const save = useSaveAdvances(profileId);
  const [rows, setRows] = useState<Draft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (advances.data && !dirty) setRows(advances.data.rows.map(fromRead));
  }, [advances.data, dirty]);

  const reconciliation = cockpit.debt.reconciliation;
  const recordedById = useMemo(() => new Map((advances.data?.rows ?? []).map((row) => [row.id, row])), [advances.data]);
  const byRowId = useMemo(() => new Map(reconciliation.rows.map((r) => [r.row_id, r])), [reconciliation.rows]);
  const suggestions: RecurringPayee[] = reconciliation.unmatched_observed;

  const update = (key: string, patch: Partial<Draft>) => {
    setDirty(true);
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };
  const remove = (key: string) => {
    setDirty(true);
    setRows((current) => current.filter((row) => row.key !== key));
  };
  const addFrom = (payee?: RecurringPayee) => {
    setDirty(true);
    setRows((current) => [
      ...current,
      blank(
        payee
          ? {
              lender: payee.payee,
              payment_amount: payee.average_amount == null ? "" : String(payee.average_amount),
              payment_frequency: (["daily", "weekly", "biweekly", "monthly"].includes(payee.cadence ?? "") ? (payee.cadence as AdvanceFrequency) : "daily"),
              notes: `Seen in the statements: ${payee.occurrences} debits, ${money(payee.monthly_average)} a month.`,
              payee_key: payee.key,
            }
          : {},
      ),
    ]);
  };
  const submit = async () => {
    setError(null);
    setSaved(null);
    const editable = rows.filter((row) => row.editable);
    if (editable.some((row) => !row.lender.trim())) {
      setError("Every advance needs a funder name.");
      return;
    }
    try {
      const result = await save.mutateAsync(editable.map(toPayload));
      setRows(result.rows.map(fromRead));
      setDirty(false);
      setSaved(`Saved ${editable.length} advance${editable.length === 1 ? "" : "s"}. The cockpit's debt service and DSCR use them now.`);
    } catch (e) {
      setError(errorMessage(e, "The advances could not be saved."));
    }
  };

  const inDscr = rows.filter((row) => row.count_in_dscr);
  const monthlyTotal = inDscr.reduce((sum, row) => sum + (monthlyEquivalent(num(row.payment_amount), row.payment_frequency) ?? 0), 0);
  const balanceTotal = rows.reduce((sum, row) => sum + (num(row.balance) ?? 0), 0);

  return (
    <section className="fc-card fc-wide fc-adv">
      <div className="fc-card-h">
        <div>
          <h4>Active advances</h4>
          <div className="sub">
            Record each advance as the client describes it, PDF or not: who funded it, what was approved, what is left, how often it debits and how much. The monthly equivalent uses the same cadence table as the client's typed terms, and each row is checked against the statements and any contract the AI read.
          </div>
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {reconciliation.months_read ? <CellChip tone="mut">Statements read for payees: {reconciliation.months_read} mo</CellChip> : <CellChip tone="warn">Payees not read from statements yet</CellChip>}
          {canEdit ? (
            <Btn size="sm" onClick={() => addFrom()}>
              <Icon name="plus" size={13} /> Add advance
            </Btn>
          ) : null}
        </div>
      </div>
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
      {saved && !dirty ? <StatusLine tone="ok">{saved}</StatusLine> : null}
      {advances.isLoading && !advances.data ? <div className="sub">Loading advances…</div> : null}
      {rows.length ? (
        <div className="tbl-wrap">
          <table className="tbl fc-adv-table">
            <thead>
              <tr>
                <th>Funder</th>
                <th>Origination date</th>
                <th className="r">Approved</th>
                <th className="r">Balance</th>
                <th className="r">Paid down</th>
                <th className="r">Payment</th>
                <th>Cadence</th>
                <th className="r">Per month</th>
                <th>Statements and contract</th>
                <th>In DSCR</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const monthly = monthlyEquivalent(num(row.payment_amount), row.payment_frequency);
                const rec = row.id ? byRowId.get(row.id) : undefined;
                const label = rec ? reconciliationLabel(rec) : null;
                const locked = !row.editable || !canEdit;
                const recorded = row.id ? recordedById.get(row.id) : undefined;
                return (
                  <tr key={row.key} className={cx(!row.count_in_dscr && "is-muted")}>
                    <td>
                      {locked ? (
                        <>
                          <strong>{row.lender}</strong>
                          <small className="sub" style={{ display: "block" }}>{SOURCE_LABEL[row.source] ?? row.source}</small>
                        </>
                      ) : (
                        <Input aria-label="Funder" placeholder="Funder" value={row.lender} onChange={(e) => update(row.key, { lender: e.target.value })} />
                      )}
                    </td>
                    <td>{formatLoanOriginationDate(recorded?.originated_on)}</td>
                    <td className="r num">{locked ? money(num(row.original_amount)) : <Input aria-label="Approved amount" inputMode="decimal" placeholder="Approved" value={row.original_amount} onChange={(e) => update(row.key, { original_amount: e.target.value })} />}</td>
                    <td className="r num">{locked ? money(num(row.balance)) : <Input aria-label="Current balance" inputMode="decimal" placeholder="Balance" value={row.balance} onChange={(e) => update(row.key, { balance: e.target.value })} />}</td>
                    <td className="r num" title={loanPaidDownDescription(locked && recorded && Object.hasOwn(recorded, "paid_down_pct") && recorded.paid_down_pct == null ? null : row.original_amount, row.balance)}>{locked && recorded && Object.hasOwn(recorded, "paid_down_pct") ? formatLoanPaidDownPct(recorded.paid_down_pct) : formatLoanPaidDown(row.original_amount, row.balance)}</td>
                    <td className="r num">{locked ? money(num(row.payment_amount)) : <Input aria-label="Payment amount" inputMode="decimal" placeholder="Payment" value={row.payment_amount} onChange={(e) => update(row.key, { payment_amount: e.target.value })} />}</td>
                    <td>
                      {locked ? (
                        cadenceLabel(row.payment_frequency)
                      ) : (
                        <Select aria-label="Payment cadence" value={row.payment_frequency} onChange={(e) => update(row.key, { payment_frequency: e.target.value as AdvanceFrequency })}>
                          {FREQUENCIES.map((f) => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </Select>
                      )}
                    </td>
                    <td className="r num"><strong>{money(monthly)}</strong></td>
                    <td>
                      {label ? <CellChip tone={label.tone}>{label.label}</CellChip> : row.id ? <CellChip tone="mut">Checked after save</CellChip> : <CellChip tone="mut">Save to check</CellChip>}
                      {rec?.documented ? <small className="sub" style={{ display: "block" }}>Contract: {money(rec.documented.balance)} balance · {money(rec.documented.monthly_payment)} / mo</small> : null}
                    </td>
                    <td>
                      <input type="checkbox" aria-label="Count in DSCR" checked={row.count_in_dscr} disabled={locked} onChange={(e) => update(row.key, { count_in_dscr: e.target.checked })} />
                    </td>
                    <td>{locked ? null : <button type="button" className="fc-adv-remove" aria-label={`Remove ${row.lender || "advance"}`} onClick={() => remove(row.key)}><Icon name="x" size={13} /></button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="fc-empty">No advances recorded yet. Add what the client told you, or pick one of the funders the statements show below.</div>
      )}
      {rows.length ? (
        <div className="fc-stat-list">
          <div className="fc-stat"><span>Advances counted in DSCR</span><strong>{inDscr.length} of {rows.length} · {money(monthlyTotal)} / mo</strong></div>
          <div className="fc-stat"><span>Balances recorded</span><strong>{money(balanceTotal)}</strong></div>
        </div>
      ) : null}
      {suggestions.length ? (
        <div className="grid g6">
          <span className="lbl">Seen in the statements, not recorded</span>
          <div className="fc-chips">
            {suggestions.map((payee) => (
              <Btn key={payee.key} size="sm" onClick={() => addFrom(payee)} disabled={!canEdit}>
                <Icon name="plus" size={12} /> {payee.payee} · {money(payee.monthly_average)} / mo · {cadenceLabel(payee.cadence)}
              </Btn>
            ))}
          </div>
        </div>
      ) : null}
      {reconciliation.unmatched_documented.length ? (
        <div className="sub">
          On a contract but not recorded: {reconciliation.unmatched_documented.map((d) => `${d.lender} (${money(d.monthly_payment)} / mo)`).join(", ")}.
        </div>
      ) : null}
      {canEdit ? (
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <Btn variant="pri" size="sm" onClick={() => void submit()} disabled={save.isPending || !dirty}>
            {save.isPending ? "Saving…" : "Save advances"}
          </Btn>
          {dirty ? <span className="sub">Unsaved changes.</span> : null}
        </div>
      ) : null}
    </section>
  );
}
