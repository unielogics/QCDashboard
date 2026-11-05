"use client";

import { useCallback, useEffect, useState } from "react";
import { Btn, Callout, CellChip, Panel, Select } from "@/components/ds";
import { useAuthedApi } from "@/hooks/useApi";
import { linkDebtPayee, readDebtPayees, type DebtPayeeInventory } from "@/lib/debtPayeesApi";

const monthly = (value: number | null) => value == null ? "" : `${value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })}/month`;

/** Bank-payee reconciliation belongs with evidence; a link does not edit a financial obligation. */
export function ApplicationDebtPayees({ profileId, refreshKey, onChanged }: { profileId: string; refreshKey?: number; onChanged?: () => void | Promise<void> }) {
  const api = useAuthedApi();
  const [inventory, setInventory] = useState<DebtPayeeInventory | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const accept = useCallback((next: DebtPayeeInventory) => { setInventory(next); setChoices(Object.fromEntries(next.obligations.map((row) => [row.id, row.vendor_key ?? ""]))); }, []);
  const load = useCallback(async () => { accept(await readDebtPayees(api, profileId)); }, [accept, api, profileId]);
  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Bank payees could not be loaded.")); }, [load, refreshKey]);
  async function save(rowId: string) {
    setBusy(rowId); setError(""); setNotice("");
    try { accept(await linkDebtPayee(api, profileId, rowId, choices[rowId] || null)); setNotice("Bank payee association saved."); await onChanged?.(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "This bank payee could not be linked."); }
    finally { setBusy(""); }
  }
  return <Panel title="Link loans to bank payees" sub="Match each obligation with the payee shown in bank transactions to review its payment evidence." actions={<Btn size="sm" disabled={Boolean(busy)} onClick={() => { setError(""); void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Bank payees could not be refreshed.")); }}>Refresh payees</Btn>} bodyClass="grid g10">
    {error ? <Callout tone="bad">{error}</Callout> : null}
    {notice ? <Callout tone="ok">{notice}</Callout> : null}
    {inventory?.schedule_complete ? <CellChip tone="ok">Saved debt schedule complete</CellChip> : null}
    {!inventory ? <p className="sub">Loading loans and bank payees…</p> : !inventory.obligations.length ? <p className="sub">There are no active obligations to match.</p> : <div className="table-scroll"><table className="tbl"><thead><tr><th>Loan / lender</th><th>Bank payee</th><th /></tr></thead><tbody>{inventory.obligations.map((row) => <tr key={row.id}><td><strong>{row.lender || "Unnamed obligation"}</strong></td><td><Select aria-label={`Bank payee for ${row.lender || "obligation"}`} value={choices[row.id] ?? ""} disabled={Boolean(busy)} onChange={(event) => setChoices((current) => ({ ...current, [row.id]: event.target.value }))}><option value="">No bank payee linked</option>{row.vendor_key && !inventory.payees.some((payee) => payee.vendor_key === row.vendor_key) ? <option value={row.vendor_key}>{row.vendor_key} · linked</option> : null}{inventory.payees.map((payee) => <option key={payee.vendor_key} value={payee.vendor_key}>{payee.label}{payee.monthly_average != null ? ` · ${monthly(payee.monthly_average)}` : ""}{payee.months ? ` · ${payee.months} statement months` : ""}</option>)}</Select></td><td><Btn size="sm" disabled={Boolean(busy) || (choices[row.id] ?? "") === (row.vendor_key ?? "")} onClick={() => void save(row.id)}>{busy === row.id ? "Saving…" : choices[row.id] ? "Link payee" : "Remove link"}</Btn></td></tr>)}</tbody></table></div>}
    {inventory?.available === false ? <p className="sub">Bank payee matching is not available for this file's banking source.</p> : inventory && !inventory.payees.length ? <p className="sub">Bank transaction payees will appear after bank statements or connected accounts have been analyzed.</p> : null}
  </Panel>;
}
