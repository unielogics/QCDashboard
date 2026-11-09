"use client";

import { useState } from "react";
import { Btn, Callout, Field, Select, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import type { ApplicationProgramReadiness, FileOwner } from "@/lib/applicationProfile";
import { requirementCreditCollection, requirementCreditScoreWords, type RequirementCreditCollection, type RequirementCreditDecision } from "@/lib/requirementCredit";
import { canReviewOwnerCredit } from "./OwnerImportReview";
import styles from "./RequirementCreditEvidence.module.css";

export function CreditRequirementReview({ profileId, requirementKey, credit, owners, programNames, onRefresh, onClose }: {
  profileId: string; requirementKey: string; credit: RequirementCreditCollection; owners: FileOwner[]; programNames: string[];
  onRefresh: () => Promise<unknown> | void; onClose: () => void;
}) {
  const api = useAuthedApi();
  const user = useCurrentUser();
  const [snapshot, setSnapshot] = useState(credit);
  const [decision, setDecision] = useState<RequirementCreditDecision>("incomplete");
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canReview = canReviewOwnerCredit(user.data?.role);
  const fingerprint = /^[a-f0-9]{64}$/i.test(snapshot.review_fingerprint || "") ? snapshot.review_fingerprint : null;
  const blockers = snapshot.review_blockers ?? snapshot.staff_review_reasons;
  async function reload() {
    setBusy(true); setError("");
    try {
      const next = await api<ApplicationProgramReadiness>(`/application-profiles/${profileId}/program-readiness`);
      const requirement = next.requirements.find((item) => item.requirement_key === requirementKey);
      const latest = requirement && requirementCreditCollection(requirement);
      if (!latest) throw new Error("The requirement changed. Close this review and refresh the checklist.");
      setSnapshot(latest); setAcknowledged(false); setDecision("incomplete"); setNotice("Latest evidence loaded. Review the current details and confirm again.");
      await onRefresh();
    } catch (problem) { setError(problem instanceof Error ? problem.message : "The current review could not be loaded."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!canReview || !fingerprint || !acknowledged || reason.trim().length < 8 || (decision === "met" && !snapshot.can_mark_met)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api<ApplicationProgramReadiness>(`/application-profiles/${profileId}/requirements/${encodeURIComponent(requirementKey)}/credit-review`, { method: "POST", body: JSON.stringify({ decision, expected_fingerprint: fingerprint, reason: reason.trim(), confirmed: true }) });
      setNotice("Credit requirement review saved.");
      try { await onRefresh(); onClose(); } catch { setError("The review was saved, but the file summary could not refresh. Reload the file to see the current checklist status."); }
    } catch (problem) { setError(problem instanceof Error ? problem.message : "The review could not be saved. Your decision and reason remain here."); }
    finally { setBusy(false); }
  }
  return <Drawer open title="Review program credit conditions" sub="Credit collection and program qualification are separate. This review does not approve or decline the whole application." width="md" closeOnBackdrop={false} onClose={() => { if (!busy) onClose(); }}
    footer={<><Btn disabled={busy} onClick={onClose}>Cancel</Btn><span className="sp" /><Btn variant="pri" disabled={busy || !canReview || !fingerprint || !acknowledged || reason.trim().length < 8 || (decision === "met" && !snapshot.can_mark_met)} onClick={() => void save()}>{busy ? "Saving…" : "Save credit review"}</Btn></>}>
    <div className="grid g12">
      <div className={styles.fact}><span>Selected program{programNames.length === 1 ? "" : "s"}</span><strong>{programNames.length ? programNames.join(" · ") : "Selected program or evidence policy"}</strong></div>
      <div className={styles.fact}><span>Required</span><strong>{snapshot.required_score_model || snapshot.owners.find((owner) => owner.required_score_model)?.required_score_model || "Score model not established"}{snapshot.required_minimum_score != null ? ` · minimum ${snapshot.required_minimum_score}` : " · minimum not established"}</strong></div>
      {snapshot.owners.map((source, index) => <div className={styles.fact} key={source.owner_id}><span>{owners.find((owner) => owner.id === source.owner_id)?.full_name || `Owner ${index + 1}`}</span><strong>{requirementCreditScoreWords(source)}</strong></div>)}
      {!snapshot.can_mark_met ? <Callout tone="warn"><strong>Program credit conditions are not established yet</strong><ul className={styles.reasons}>{blockers.length ? blockers.map((blocker, index) => <li key={index}>{blocker}</li>) : <li>Review the ownership, report model and published program minimum.</li>}</ul></Callout> : null}
      <Field label="Program credit decision"><Select aria-label="Program credit decision" disabled={busy || !canReview} value={decision} onChange={(event) => { setDecision(event.target.value as RequirementCreditDecision); setAcknowledged(false); }}><option value="incomplete">Further program review needed</option><option value="met" disabled={!snapshot.can_mark_met}>Program credit conditions met</option><option value="failed">Program credit conditions not met</option></Select></Field>
      <p className={styles.reviewNote}>{decision === "incomplete" ? "Record the separate program condition still under review. Linked single-bureau evidence remains collected; this does not send the client a request or order another pull." : decision === "failed" ? "Record why this credit requirement is not met. Other programs can still be reviewed." : "The current owner and source evidence must support every published credit condition."}</p>
      <Field label="Credit review reason"><Textarea aria-label="Credit review reason" rows={3} disabled={busy || !canReview} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="State what you reviewed and what is met, missing or not met." /></Field>
      <label className={styles.acknowledge}><input type="checkbox" checked={acknowledged} disabled={busy || !canReview} onChange={(event) => setAcknowledged(event.target.checked)} />I reviewed the current owner reports and the selected program's bureau, score model and minimum.</label>
      {notice ? <Callout tone="ok">{notice}</Callout> : null}{error ? <Callout tone="bad">{error}</Callout> : null}
      <div><Btn size="sm" disabled={busy} onClick={() => void reload()}>Reload current review</Btn></div>
    </div>
  </Drawer>;
}
