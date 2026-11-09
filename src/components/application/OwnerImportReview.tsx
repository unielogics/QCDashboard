"use client";

import { useState } from "react";
import { Btn, Callout, Field, Input, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import type { FileOwner } from "@/lib/applicationProfile";
import { validateOwnerField, type EditableOwnerField } from "@/lib/ownerFieldValidation";
import styles from "./RequirementCreditEvidence.module.css";

const fields: Array<[EditableOwnerField, string]> = [["first_name", "First name"], ["last_name", "Last name"], ["ownership_pct", "Ownership percentage"], ["email", "Personal email"], ["phone", "Personal phone"]];
const draftOf = (owner: FileOwner) => ({ first_name: owner.first_name || "", last_name: owner.last_name || "", ownership_pct: owner.ownership_pct == null ? "" : String(owner.ownership_pct), email: owner.email || "", phone: owner.phone || "", is_guarantor: owner.is_guarantor });
export function canReviewOwnerCredit(role: string | null | undefined) { return role === "super_admin" || role === "loan_exec"; }

/** Editing an imported fact and confirming its accuracy are separate staff actions. */
export function OwnerImportReview({ profileId, owner, owners, onClose, onSaved, onViewReport }: {
  profileId: string; owner: FileOwner | null; owners: FileOwner[]; onClose: () => void;
  onSaved: () => Promise<unknown> | void; onViewReport?: (owner: FileOwner) => void;
}) {
  return owner ? <OwnerReviewContent key={`${profileId}:${owner.id}`} profileId={profileId} owner={owner} owners={owners} onClose={onClose} onSaved={onSaved} onViewReport={onViewReport} /> : null;
}

function OwnerReviewContent({ profileId, owner, owners, onClose, onSaved, onViewReport }: {
  profileId: string; owner: FileOwner; owners: FileOwner[]; onClose: () => void;
  onSaved: () => Promise<unknown> | void; onViewReport?: (owner: FileOwner) => void;
}) {
  const api = useAuthedApi();
  const user = useCurrentUser();
  const canReview = canReviewOwnerCredit(user.data?.role);
  const [current, setCurrent] = useState(owner);
  const [draft, setDraft] = useState(() => draftOf(owner));
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const initial = draftOf(current);
  const changed = fields.some(([field]) => draft[field].trim() !== initial[field].trim()) || draft.is_guarantor !== initial.is_guarantor;
  const roster = owners.map((item) => item.id === current.id ? current : item);
  const knownPercentages = roster.length > 0 && roster.every((item) => item.ownership_pct != null);
  const total = roster.reduce((sum, item) => sum + Number(item.ownership_pct ?? 0), 0);
  const rosterComplete = knownPercentages && Math.abs(total - 100) < .005;
  const fingerprint = /^[a-f0-9]{64}$/i.test(current.review_fingerprint || "") ? current.review_fingerprint : null;
  async function refreshOwner() {
    setBusy(true); setError("");
    try {
      const rows = await api<FileOwner[]>(`/application-profiles/${profileId}/owners`);
      const latest = rows.find((item) => item.id === owner.id);
      if (!latest) throw new Error("The owner record changed. Close this review and refresh the ownership list.");
      setCurrent(latest); setDraft(draftOf(latest)); setAcknowledged(false);
      await onSaved();
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Owner details could not be refreshed."); }
    finally { setBusy(false); }
  }
  async function saveChanges() {
    const patch: Record<string, unknown> = {};
    for (const [field] of fields) {
      const checked = validateOwnerField(field, draft[field]);
      if (checked.error) { setError(checked.error); return; }
      if (draft[field].trim() !== initial[field].trim()) patch[field] = checked.value;
    }
    if (draft.is_guarantor !== initial.is_guarantor) patch.is_guarantor = draft.is_guarantor;
    if (!Object.keys(patch).length) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const updated = await api<FileOwner>(`/application-profiles/${profileId}/owners/${owner.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setCurrent(updated); setDraft(draftOf(updated)); setAcknowledged(false);
      setNotice("Changes saved. Review these details, then confirm the imported owner separately.");
      try { await onSaved(); } catch { setError("Changes were saved, but the file summary could not refresh. Reload the file before continuing."); }
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Owner changes could not be saved. Your entries remain here."); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!canReview || !fingerprint || changed || !rosterComplete || reason.trim().length < 8 || !acknowledged) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const updated = await api<FileOwner>(`/application-profiles/${profileId}/owners/${owner.id}/review`, { method: "POST", body: JSON.stringify({ expected_fingerprint: fingerprint, reason: reason.trim(), confirmed: true }) });
      setCurrent(updated); setNotice("Imported owner details confirmed. Credit program requirements are reviewed separately.");
      try { await onSaved(); onClose(); } catch { setError("Owner confirmation was saved, but the file summary could not refresh. Reload the file to see its current status."); }
    } catch (problem) { setError(problem instanceof Error ? problem.message : "The owner could not be confirmed. Your review reason remains here."); }
    finally { setBusy(false); }
  }
  return <Drawer open onClose={() => { if (!busy) onClose(); }} title={`Review imported owner · ${current.full_name}`} sub="Confirm the person's identity, actual ownership and linked report. This does not approve a credit score or qualify the loan." width="md" closeOnBackdrop={false}
    footer={<><Btn disabled={busy} onClick={onClose}>Close</Btn><span className="sp" /><Btn variant="pri" disabled={busy || !canReview || !current.backfill_needs_review || changed || !rosterComplete || !fingerprint || !acknowledged || reason.trim().length < 8} onClick={() => void confirm()}>{busy ? "Saving…" : "Confirm owner details"}</Btn></>}>
    <div className="grid g12">
      <div className="fldgrid two">{fields.map(([field, label]) => <Field key={field} label={label}><Input aria-label={label} disabled={busy || !canReview} type={field === "email" ? "email" : field === "phone" ? "tel" : "text"} inputMode={field === "ownership_pct" ? "decimal" : undefined} value={draft[field]} onChange={(event) => { setDraft((value) => ({ ...value, [field]: event.target.value })); setAcknowledged(false); }} /></Field>)}</div>
      <label className={styles.acknowledge}><input type="checkbox" checked={draft.is_guarantor} disabled={busy || !canReview} onChange={(event) => { setDraft((value) => ({ ...value, is_guarantor: event.target.checked })); setAcknowledged(false); }} />Guarantor</label>
      <div className={styles.factLine}><span>Ownership on file</span><strong>{knownPercentages ? `${total.toFixed(2)}% allocated` : "Some percentages are missing"}</strong></div>
      {!rosterComplete ? <Callout tone="warn">Every owner's percentage must be known and the ownership list must total 100% before confirming this imported record. Correct this row here; use the Business ownership table to correct other owners.</Callout> : null}
      <div className={styles.factLine}><span>Credit source</span><strong>{current.credit_pull_id ? "Existing report linked" : "No report linked"}</strong></div>
      <div className={styles.factLine}><span>Primary owner on file</span><strong>{current.is_primary ? "Yes" : "No"}</strong></div>
      {current.credit_pull_id && onViewReport ? <div><Btn size="sm" onClick={() => onViewReport(current)}>View linked credit report</Btn></div> : null}
      {changed ? <div className="grid g6"><p className="sub">Save the corrected facts first. Saving does not confirm the imported record.</p><div><Btn disabled={busy || !canReview} onClick={() => void saveChanges()}>Save owner changes</Btn></div></div> : null}
      {!fingerprint ? <Callout tone="warn">Load the latest owner details to enable confirmation.</Callout> : null}
      <Field label="Owner review reason"><Textarea aria-label="Owner review reason" rows={3} disabled={busy || !canReview} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="State how you verified this person's name, ownership percentage and report association." /></Field>
      <label className={styles.acknowledge}><input type="checkbox" disabled={busy || !canReview || changed} checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />I reviewed these owner details and the report association, and confirm they are accurate.</label>
      {notice ? <Callout tone="ok">{notice}</Callout> : null}
      {error ? <Callout tone="bad">{error}</Callout> : null}
      <div><Btn size="sm" disabled={busy} onClick={() => void refreshOwner()}>Reload owner details</Btn></div>
    </div>
  </Drawer>;
}
