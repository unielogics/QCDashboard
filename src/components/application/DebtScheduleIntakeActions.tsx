"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Btn, Callout, CellChip } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import { useEmailDebtScheduleLink } from "@/hooks/useDebtScheduleReview";
import { applyDebtIntake, canDraftDebtIntake, debtIntakeValue, hasPendingDebtIntakeReview, proposeDebtIntake, type DebtIntakeMode, type DebtIntakeReview } from "@/lib/financialDebtIntake";
import { isFinancialDraftConflict, type FinancialWorkspaceSnapshot } from "@/lib/financialWorkspaceApi";
import styles from "./DebtScheduleReadback.module.css";

/** Both entry points review the same evidence before changing the shared draft. */
export function DebtScheduleIntakeActions({ profileId, workspace, onApplied, beforeRead, onReload, onEdit }: {
  profileId: string; workspace: FinancialWorkspaceSnapshot;
  onApplied: (workspace: FinancialWorkspaceSnapshot) => void | Promise<void>;
  beforeRead?: () => Promise<FinancialWorkspaceSnapshot>;
  onReload?: () => void | Promise<unknown>; onEdit?: () => void;
}) {
  const api = useAuthedApi();
  const queryClient = useQueryClient();
  const email = useEmailDebtScheduleLink(profileId);
  const [review, setReview] = useState<DebtIntakeReview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const attempt = useRef<string | null>(null);
  const canDraft = canDraftDebtIntake(workspace);
  const pendingReview = hasPendingDebtIntakeReview(workspace);
  if (!canDraft && !pendingReview) return null;
  const preview = async (mode: DebtIntakeMode) => {
    setBusy(true); setError(""); setNotice(""); setConflict(false);
    try {
      const current = beforeRead ? await beforeRead() : workspace;
      const next = await proposeDebtIntake(api, profileId, current, mode);
      setReview(next); setSelected([]); attempt.current = null;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The evidence could not be reviewed.");
      setConflict(isFinancialDraftConflict(reason));
    } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!review || !selected.length) return;
    setBusy(true); setError("");
    attempt.current ??= crypto.randomUUID();
    try {
      const next = await applyDebtIntake(api, profileId, review, selected, attempt.current);
      queryClient.setQueryData(["financial-workspace-summary", profileId], next);
      for (const key of ["financial-debt-review", "financial-cockpit", "application-evidence-workspace"]) void queryClient.invalidateQueries({ queryKey: [key, profileId] });
      await onApplied(next); setReview(null); setSelected([]); attempt.current = null;
      setNotice("Selected obligations added to the working schedule. Review missing answers, then Save version to publish its PDF and financial figures.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The selected obligations could not be added.");
      setConflict(isFinancialDraftConflict(reason));
    } finally { setBusy(false); }
  };
  const send = async () => {
    setError(""); setNotice("");
    try {
      const receipt = await email.mutateAsync();
      if (receipt.provider_accepted) setNotice(`Form link emailed to ${receipt.recipient_masked || "the client"}.`);
      else setError(`The form request is saved, but email delivery failed${receipt.detail ? `: ${receipt.detail}` : "."} Use Email client to fill form to retry delivery.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The form link could not be emailed."); }
  };
  const disabled = busy || email.isPending;
  return <section className={styles.intake} aria-label="Start debt schedule">
    <div><strong>{pendingReview ? "Review the AI draft" : "Build the debt schedule"}</strong><p className={styles.note}>{pendingReview ? "These obligations were drafted from existing evidence. Check the amounts, business association, and linked files before Save version. You can also ask the client to complete the form." : "Review a draft from uploaded contracts, payoff letters, or bank payments, or ask the client to fill in the form."}</p></div>
    <div className={styles.actions}>
      {canDraft ? <><Btn size="sm" disabled={disabled} onClick={() => void preview("documents")}><Icon name="sparkles" size={13} />Draft with AI from files</Btn>
      <Btn size="sm" disabled={disabled} onClick={() => void preview("banking")}>Draft from banking</Btn></> : null}
      <Btn size="sm" disabled={disabled} onClick={() => void send()}><Icon name="mail" size={13} />{email.isPending ? "Sending…" : "Email client to fill form"}</Btn>
      {pendingReview && onEdit ? <Btn size="sm" disabled={disabled} onClick={onEdit}>Review AI draft</Btn> : null}
    </div>
    {busy ? <p className={styles.note} role="status">Reviewing evidence…</p> : null}
    {error ? <Callout tone="warn">{error}{conflict && onReload ? <div><Btn size="sm" onClick={() => { setReview(null); setConflict(false); attempt.current = null; void onReload(); }}>Reload the working schedule</Btn></div> : null}</Callout> : null}
    {notice ? <p className={styles.guidance} role="status">{notice}</p> : null}
    {review ? <div className={styles.intakeReview}>
      <div className={styles.header}><strong>{review.mode === "documents" ? "From uploaded files" : "From recurring bank payments"}</strong><Btn size="sm" disabled={disabled} onClick={() => setReview(null)}>Close draft review</Btn></div>
      <p className={styles.note}>{review.source_count} source files checked. Select only obligations that belong to this business. Nothing is published during this review.</p>
      {review.blocked_reason ? <Callout tone="warn">{review.blocked_reason}</Callout> : null}
      {review.warnings.map((warning, index) => <p key={index} className={styles.note}>{warning}</p>)}
      {!review.proposals.length ? <p className={styles.guidance}>No eligible obligations were found. Upload contracts or payoff letters, try banking, or ask the client to fill the form.</p> : <ul className={styles.proposals}>{review.proposals.map((proposal) => <li key={proposal.id}>
        <label className={styles.proposalChoice}><input type="checkbox" aria-label={`Add ${proposal.lender} to working schedule`} checked={selected.includes(proposal.id)} disabled={disabled || !proposal.eligible || Boolean(review.blocked_reason) || conflict} onChange={(event) => { setSelected((current) => event.target.checked ? [...current, proposal.id] : current.filter((id) => id !== proposal.id)); attempt.current = null; }} /><strong>{proposal.lender || "Lender not identified"}</strong><CellChip tone={proposal.eligible ? "acc" : "mut"}>{proposal.eligible ? "Review" : "Unavailable"}</CellChip></label>
        <p className={styles.note}>{proposal.reason}</p><p className={styles.note}>{proposal.file_names.join(" · ") || "Source document not identified"}</p>
        <p className={styles.note}>Balance: {debtIntakeValue(proposal.body.balance)} · Monthly payment: {debtIntakeValue(proposal.body.monthly_payment)}</p>
        {proposal.warnings.map((warning, index) => <p key={index} className={styles.note}>{warning}</p>)}
      </li>)}</ul>}
      <div className={styles.actions}><Btn variant="pri" size="sm" disabled={disabled || !selected.length || Boolean(review.blocked_reason) || conflict} onClick={() => void apply()}>Add {selected.length || "selected"} to working schedule</Btn><span className={styles.note}>Save version remains a separate step.</span></div>
    </div> : null}
  </section>;
}
