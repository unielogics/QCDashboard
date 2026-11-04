"use client";

import { useEffect, useState } from "react";
import { Btn, CellChip, Input, Select } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
import { errorMessage } from "@/components/marketplace/shared";
import { usePatchDebtRow, type DebtRowPatch } from "@/hooks/useApi";
import { money } from "@/lib/financialCockpit";
import type { Obligation, RecurringPayee } from "@/lib/financialCockpit";
import { DEBT_TYPES } from "@/lib/debtTypes";


function MoneyCell({ value, label, disabled, onSave }: { value: number | null; label: string; disabled: boolean; onSave: (next: number | null) => void }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => { setText(value == null ? "" : String(value)); }, [value]);
  const commit = () => {
    const next = text.trim() === "" ? null : Number(text);
    if (next != null && !Number.isFinite(next)) return;
    if ((next ?? null) !== (value ?? null)) onSave(next);
  };
  return <Input aria-label={label} className="fc-cell-input" type="number" inputMode="decimal" min={0} step="any" placeholder="—" value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
}

/** The editable cells of a schedule row on the coverage card: per month, balance and payoff, type, the
 *  statement payee it is linked to, whether it counts, and removal. Each change saves on its own. */
export function useObligationEditor(profileId: string) {
  const patch = usePatchDebtRow(profileId);
  const confirmAction = useConfirmAction();
  const [error, setError] = useState<string | null>(null);
  const save = async (rowId: string, body: DebtRowPatch) => {
    setError(null);
    try { await patch.mutateAsync({ rowId, patch: body }); } catch (e) { setError(errorMessage(e, "The row could not be saved.")); }
  };
  const remove = async (rowId: string, lender: string) => {
    const confirmed = await confirmAction({ title: `Remove ${lender} from the schedule?`, body: "The row is dismissed, not deleted: it leaves the schedule, the coverage and the plan, and the desk can enter it again.", confirmLabel: "Remove the row", tone: "danger", reversible: true });
    if (!confirmed) return;
    await save(rowId, { status: "dismissed" });
  };
  return { save, remove, error, pending: patch.isPending };
}

export function rowIdOf(o: Obligation): string | null {
  return o.kind === "row" && o.id.startsWith("row:") ? o.id.slice(4) : null;
}

export function ObligationEditableRow({ o, canEdit, editor, payees, on, onToggleRetire }: { o: Obligation; canEdit: boolean; editor: ReturnType<typeof useObligationEditor>; payees: RecurringPayee[]; on: boolean; onToggleRetire: () => void }) {
  const rowId = rowIdOf(o);
  const editable = Boolean(rowId && canEdit);
  const linkable = payees.filter((p) => p.is_debt || p.is_card);
  return (
    <tr className={[!o.in_debt_service ? "is-muted" : "", on ? "is-on" : ""].join(" ").trim() || undefined}>
      <td><input type="checkbox" checked={on} disabled={!canEdit} aria-label={`Pay off ${o.lender} with the new loan`} onChange={onToggleRetire} /></td>
      <td>
        <strong>{o.lender}</strong>
        <div className="fc-chips" style={{ marginTop: 2, alignItems: "center" }}>
          {editable && rowId ? (
            <Select aria-label={`Type of ${o.lender}`} className="fc-cell-select" value={DEBT_TYPES.some((t) => t.value === o.category) ? o.category : o.category || "other"} disabled={editor.pending} onChange={(e) => void editor.save(rowId, { category: e.target.value })}>
              {!DEBT_TYPES.some((t) => t.value === o.category) && o.category ? <option value={o.category}>{o.category === "loan" ? "Loan (type not stated)" : o.category.replace(/_/g, " ")}</option> : null}
              {DEBT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          ) : <CellChip tone="mut">{o.is_mca ? "Merchant cash advance" : o.category.replace(/_/g, " ")}</CellChip>}
          <CellChip tone="mut">{o.kind === "row" ? (o.origin === "admin" ? "Recorded by the desk" : o.origin === "borrower" || o.origin === "client" ? "Typed by the client" : "On the schedule") : o.kind === "document" ? "Advance terms" : o.kind === "schedule_document" ? "Read off the uploaded schedule" : "Seen in statements"}</CellChip>
          {editable && rowId ? <button type="button" className="linklike fc-row-remove" aria-label={`Remove ${o.lender} from the schedule`} onClick={() => void editor.remove(rowId, o.lender)} disabled={editor.pending}>Remove</button> : null}
        </div>
      </td>
      <td className="r num">
        {editable && rowId ? <MoneyCell value={o.monthly ?? null} label={`Per month for ${o.lender}`} disabled={editor.pending} onSave={(next) => void editor.save(rowId, { monthly_payment: next })} /> : money(o.monthly)}
        {o.cadence && !editable ? <small className="sub" style={{ display: "block" }}>{o.cadence}</small> : null}
      </td>
      <td className="r num">
        {editable && rowId ? (
          <div className="fc-cell-pair">
            <MoneyCell value={o.balance ?? null} label={`Balance for ${o.lender}`} disabled={editor.pending} onSave={(next) => void editor.save(rowId, { balance: next })} />
            <MoneyCell value={o.payoff != null && o.payoff !== o.balance ? o.payoff : null} label={`Payoff for ${o.lender}`} disabled={editor.pending} onSave={(next) => void editor.save(rowId, { payoff_amount: next })} />
          </div>
        ) : o.payoff != null ? money(o.payoff) : o.balance != null ? money(o.balance) : <span className="sub">unknown</span>}
      </td>
      <td>
        {o.linked_payee ? <span className="sub">{o.linked_payee} · {money(o.observed_monthly)} / mo{editable && rowId ? <> · <button type="button" className="linklike" onClick={() => void editor.save(rowId, { vendor_key: "" })}>unlink</button></> : null}</span>
          : editable && rowId && linkable.length ? (
            <Select aria-label={`Statement payee for ${o.lender}`} className="fc-cell-select" value="" disabled={editor.pending} onChange={(e) => { if (e.target.value) void editor.save(rowId, { vendor_key: e.target.value }); }}>
              <option value="">Link to a payee…</option>
              {linkable.map((p) => <option key={p.key} value={p.key}>{p.payee} · {money(p.monthly_average)} / mo</option>)}
            </Select>
          ) : <span className="sub">{linkable.length ? "not seen" : "no payees read"}</span>}
      </td>
      <td>
        {editable && rowId ? (
          <label className="fc-cell-check"><input type="checkbox" checked={o.count_in_dscr} disabled={editor.pending} aria-label={`${o.lender} counts in the debt service`} onChange={(e) => void editor.save(rowId, { count_in_dscr: e.target.checked })} /><span>{o.in_debt_service ? "Yes" : o.count_in_dscr ? "Counts once it has a monthly figure" : "No"}</span></label>
        ) : o.in_debt_service ? <CellChip tone="ok">Yes</CellChip> : <CellChip tone="mut">No</CellChip>}
      </td>
    </tr>
  );
}

export function ReadPayeesHint({ onReread, pending }: { onReread: () => void; pending: boolean }) {
  return (
    <div className="fc-payees-hint">
      <span className="sub">The statements have not been read for payees yet, so no lender can be matched to what the bank shows.</span>
      <Btn size="sm" onClick={onReread} disabled={pending}><Icon name="refresh" size={14} />{pending ? "Queued…" : "Re-read the statements"}</Btn>
    </div>
  );
}
