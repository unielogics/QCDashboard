"use client";

import { useEffect, useRef, useState } from "react";
import { Btn, Callout, Field, Input, Select, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { ApiError } from "@/lib/api";
import { canCorrectFundingRequest, fundingRequestDraft, fundingRequestPreview, fundingRequestSave, type FundingRequest, type FundingRequestDraft, type FundingRequestSave } from "@/lib/fundingRequest";
import { USE_OF_FUNDS_CATEGORIES, type UseOfFundsCategory, type UseOfFundsRow } from "@/lib/useOfFunds";
import styles from "./UseOfFundsEditor.module.css";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/** Saves one current request and its budget on the existing application. */
export function FundingRequestEditor({ open, role, request, loadRequest, saveRequest, onSaved, onClose }: {
  open: boolean;
  role: string | null | undefined;
  request: FundingRequest;
  loadRequest: () => Promise<FundingRequest>;
  saveRequest: (input: FundingRequestSave) => Promise<FundingRequest>;
  onSaved: (request: FundingRequest) => Promise<unknown> | void;
  onClose: () => void;
}) {
  const [base, setBase] = useState(request);
  const [draft, setDraft] = useState<FundingRequestDraft>(() => fundingRequestDraft(request));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [conflict, setConflict] = useState(false);
  const [closing, setClosing] = useState(false);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const message = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error || saved) message.current?.scrollIntoView({ block: "nearest" }); }, [error, saved]);
  useEffect(() => {
    if (!open) return;
    setBase(request); setDraft(fundingRequestDraft(request)); setDirty(false); setError(""); setSaved(""); setConflict(false); setClosing(false); retry.current = null;
    // A refreshed query must not replace entries in an already-open editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request.profile_id]);
  const allowed = canCorrectFundingRequest(role, request) && base.can_edit;
  const preview = fundingRequestPreview(draft);
  const update = (patch: Partial<FundingRequestDraft>) => { setDraft((value) => ({ ...value, ...patch })); setDirty(true); setSaved(""); setClosing(false); };
  const updateRow = (id: string, patch: Partial<UseOfFundsRow>) => update({ rows: draft.rows.map((row) => row.id === id ? { ...row, ...patch } : row) });
  function close() { if (!busy) { if (dirty) setClosing(true); else onClose(); } }
  async function reload() {
    setBusy(true); setError("");
    try { const next = await loadRequest(); setBase(next); setDraft(fundingRequestDraft(next)); setDirty(false); setConflict(false); retry.current = null; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not reload the current request."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!allowed || !preview.valid || busy || conflict || !dirty) return;
    const fingerprint = JSON.stringify({ draft, revision: base.revision, budgetRevision: base.use_of_funds_revision });
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    const input = fundingRequestSave(base, draft, retry.current.key);
    setBusy(true); setError(""); setSaved("");
    try {
      const next = await saveRequest(input);
      setBase(next); setDraft(fundingRequestDraft(next)); setDirty(false); retry.current = null;
      setSaved("Current request and use of funds saved to this application. The client room now uses the same request.");
      try { await onSaved(next); } catch { setSaved("Current request saved. Refresh the file to see the latest underwriting results."); }
    } catch (reason) {
      const stale = reason instanceof ApiError && reason.status === 409;
      setConflict(stale);
      setError(stale ? "The request or its budget changed in another session. Your entries remain here. Reload the saved request before editing again." : reason instanceof Error ? reason.message : "Could not save the request. Your entries are retained; you can retry.");
    } finally { setBusy(false); }
  }
  return <Drawer open={open} onClose={close} title="Edit current funding request" sub="Update the requested amount and its uses together on this file." width="lg" closeOnBackdrop={false}
    footer={<><Btn onClick={close} disabled={busy}>{dirty ? "Cancel" : "Close"}</Btn><span className="sp" />{allowed ? <Btn variant="pri" disabled={busy || !dirty || !preview.valid || conflict} onClick={() => void save()}>{busy ? "Saving…" : "Save request and uses"}</Btn> : null}</>}>
    <div className={styles.layout}>
      {!allowed ? <Callout tone="warn">Only a Super Admin or Underwriter can change a submitted request. You can review its saved uses here.</Callout> : null}
      {closing ? <Callout tone="warn"><span>Discard your unsaved request changes?</span><Btn disabled={busy} onClick={onClose}>Discard changes and close</Btn><Btn onClick={() => setClosing(false)}>Keep editing</Btn></Callout> : null}
      <div ref={message}>
        {error ? <Callout tone="warn"><span role="alert">{error}</span>{conflict ? <Btn disabled={busy} onClick={() => void reload()}>Discard edits and reload saved request</Btn> : null}</Callout> : null}
        {saved ? <Callout tone="ok"><span role="status">{saved}</span></Callout> : null}
      </div>
      <fieldset className={styles.fields} disabled={busy || !allowed || conflict}>
        <Field label="Requested amount ($)" hint="Use the current client request. Allocate every dollar below."><Input aria-label="Current requested amount" inputMode="decimal" value={draft.requestedAmount} aria-invalid={Boolean(preview.errors.requestedAmount)} onChange={(event) => update({ requestedAmount: event.target.value })} /></Field>
        {preview.errors.requestedAmount ? <p className={styles.error}>{preview.errors.requestedAmount}</p> : null}
        <div className={styles.summary} aria-live="polite"><span><small>Allocated</small><strong>{money(preview.total)}</strong></span><span><small>{preview.remaining != null && preview.remaining < 0 ? "Over allocated" : "Remaining"}</small><strong>{preview.remaining == null ? "Enter requested amount" : money(Math.abs(preview.remaining))}</strong></span></div>
        <h3>Primary use of funds</h3>
        {draft.rows.map((row, index) => <div key={row.id}>
          <div className={styles.row}>
            <Field label={`Use ${index + 1}`}><Select aria-label={`Request use ${index + 1}`} value={row.category} onChange={(event) => updateRow(row.id, { category: event.target.value as UseOfFundsCategory })}>{USE_OF_FUNDS_CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field>
            <Field label="Description"><Input aria-label={`Request description ${index + 1}`} maxLength={160} value={row.label} onChange={(event) => updateRow(row.id, { label: event.target.value })} /></Field>
            <Field label="Amount ($)"><Input aria-label={`Request amount ${index + 1}`} inputMode="decimal" value={row.amount} aria-invalid={Boolean(preview.errors[row.id])} onChange={(event) => updateRow(row.id, { amount: event.target.value })} /></Field>
            {allowed ? <Btn aria-label={`Remove request use ${index + 1}`} onClick={() => update({ rows: draft.rows.filter((item) => item.id !== row.id) })}><Icon name="x" size={16} /></Btn> : <span />}
          </div>
          {preview.errors[row.id] ? <p className={styles.error}>{preview.errors[row.id]}</p> : null}
        </div>)}
        {preview.errors.total ? <p className={styles.error} role="status">{preview.errors.total}</p> : null}
        {allowed ? <div><Btn disabled={draft.rows.length >= 50} onClick={() => update({ rows: [...draft.rows, { id: crypto.randomUUID(), category: "working_capital", label: "", amount: "" }] })}><Icon name="plus" size={14} />Add a use</Btn></div> : null}
        <label className="pick"><input type="checkbox" aria-label="Consider a payoff-only alternative" checked={draft.payoffOnlyAlternative} onChange={(event) => update({ payoffOnlyAlternative: event.target.checked })} />Consider a payoff-only alternative</label>
        <p className={styles.hint}>The alternative is recorded separately. It does not add another allocation or confirm which debts qualify for payoff.</p>
        {allowed ? <><Field label="Reason for change" hint="Record what changed and the client's current instructions."><Textarea aria-label="Reason for request change" rows={3} maxLength={2000} value={draft.reason} onChange={(event) => update({ reason: event.target.value })} /></Field>{dirty && preview.errors.reason ? <p className={styles.error}>{preview.errors.reason}</p> : null}</> : null}
      </fieldset>
      {base.updated_at ? <p className={styles.hint}>Last saved {new Date(base.updated_at).toLocaleString()}{base.reason ? ` · ${base.reason}` : ""}</p> : null}
    </div>
  </Drawer>;
}
