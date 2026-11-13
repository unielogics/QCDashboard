"use client";

import { useEffect, useRef, useState } from "react";
import { Drawer } from "@/components/ds/Drawer";
import { metricAmountLabel } from "@/lib/financialMetrics";
import type { OperatingGuidance, OperatingExpenseGroup } from "@/lib/operatingGuidance";
import { operatingNumber, type OperatingPlanBody } from "@/lib/operatingPlan";
import { decideOperatingSourceGroup, restoreOperatingSourceGroup, type OperatingSourceReview } from "@/lib/operatingSourceReview";
import type { OperatingPlannerIssue } from "@/lib/operatingPlannerIssues";
import { OperatingAmountInput } from "./OperatingAmountInput";
import styles from "./OperatingPlanSourceReview.module.css";

export function OperatingPlanSourceReview({ value, onChange, guidance, review, disabled, onPreviewSource, onReviewLegacy, issues = [], request, onHandoff }: { onHandoff?: () => void; value: OperatingPlanBody; onChange: (body: OperatingPlanBody) => void; guidance?: OperatingGuidance | null; review?: OperatingSourceReview | null; disabled?: boolean; onPreviewSource?: (id: string) => void; onReviewLegacy: () => void; issues?: OperatingPlannerIssue[]; request?: { key: number; sourceGroupKey: string; field: string } }) {
  const [correction, setCorrection] = useState<{ group: OperatingExpenseGroup; reason: string; amount: string } | null>(null);
  const section = useRef<HTMLElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const correctionKey = correction?.group.key;
  useEffect(() => { if (!correctionKey) return; let frame = 0, tries = 0; const focus = () => { const target = reasonInput.current; if (!target || target.closest('[aria-hidden="true"],[inert]')) { if (++tries < 40) frame = requestAnimationFrame(focus); return; } target.focus({ preventScroll: true }); }; frame = requestAnimationFrame(focus); return () => cancelAnimationFrame(frame); }, [correctionKey]);
  const groups = guidance?.expense_groups || [];
  const correctionDraft = (group: OperatingExpenseGroup) => { const rows = value.expenses?.filter(row => row.source_group_key === group.key && !row.excluded && !row.duplicate_of) || []; const row = rows.length === 1 && rows[0].cadence === "annual" && rows[0].cost_basis !== "per_unit" ? rows[0] : null; return { group, reason: value.historical_corrections?.find(item => item.source_group_key === group.key)?.reason || "", amount: String(row?.current_amount ?? group.baseline_annual_amount ?? "") }; };
  const latest = useRef({ groups, request, correctionDraft }); latest.current = { groups, request, correctionDraft };
  useEffect(() => { const { groups, request, correctionDraft } = latest.current; if (!request) return; const group = groups.find(row => row.key === request.sourceGroupKey); if (!group) return; if (request.field.startsWith("historical_corrections.")) { setCorrection(correctionDraft(group)); return; } const row = [...(section.current?.querySelectorAll<HTMLElement>("[data-operating-source-group]") || [])].find(node => node.dataset.operatingSourceGroup === group.key); const target = row?.querySelector<HTMLButtonElement>("button"); target?.focus({ preventScroll: true }); row?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [request?.key]);
  const retained = value.expenses?.filter(row => !row.excluded && !row.duplicate_of && (!row.source_group_key || !groups.some(group => group.key === row.source_group_key))) || [];
  const decide = (group: OperatingExpenseGroup, decision: "confirmed" | "needs_correction", reason?: string, amount?: string) => { if (!review?.source_fingerprint) return; onChange(decideOperatingSourceGroup(value, group, review.source_fingerprint, decision, () => crypto.randomUUID(), reason, amount)); };
  return <section ref={section} className={styles.review} aria-label="Source cost confirmations">
    <p>Do these annual costs match your selected tax return or P&amp;L?</p>
    {groups.map(group => {
      const saved = value.source_group_confirmation_stamp === review?.source_fingerprint ? value.source_group_confirmations?.[group.key] : undefined;
      const read = review?.groups.find(row => row.key === group.key);
      const decision = saved || (!review?.stale ? read?.decision : undefined);
      const historical = value.historical_corrections?.find(row => row.source_group_key === group.key);
      const invalid = decision === "needs_correction" || issues.some(issue => issue.step === 1 && issue.sourceGroupKey === group.key);
      return <div key={group.key} className={`${styles.row} ${invalid ? styles.attention : ""}`} data-operating-source-group={group.key} data-operating-category={group.category} tabIndex={-1}>
        <div className={styles.name}><strong>{group.label}</strong><small>{group.year || "Reporting year unconfirmed"}{decision === "needs_correction" ? " · Difference noted for review" : decision === "confirmed" ? " · Confirmed" : ""}</small></div>
        <span className={styles.amount}>{metricAmountLabel(group.baseline_annual_amount, group.currency)} / year</span>
        <button type="button" aria-label={`Confirm ${group.label}`} aria-pressed={decision === "confirmed"} disabled={disabled || !review?.source_fingerprint || group.baseline_annual_amount == null || Boolean(historical)} onClick={() => decide(group, "confirmed")}>✓ <span>Confirm</span></button>
        <button type="button" aria-label={`Correct ${group.label}`} title="This source amount needs correction" disabled={disabled || !review?.source_fingerprint} onClick={() => setCorrection(correctionDraft(group))}>×</button>
        {group.source_file_ids[0] && onPreviewSource ? <button className={styles.source} type="button" onClick={() => onPreviewSource(group.source_file_ids[0])}>View source ↗</button> : null}
      </div>;
    })}
    {!groups.length ? <p>No imported cost groups are selected. <button type="button" onClick={onReviewLegacy}>Review retained current costs in Plan changes</button></p> : null}
    {review?.stale && value.source_group_confirmation_stamp !== review.source_fingerprint ? <small className={styles.warning}>The selected source changed. Confirm these amounts again.</small> : null}
    {value.historical_corrections?.some(row => row.reason.trim().length >= 3) && onHandoff ? <small>Historical differences await review. <button type="button" onClick={onHandoff}>Save for preparer review</button></small> : null}
    {retained.length ? <small>{retained.length} retained item{retained.length === 1 ? "" : "s"} entered outside this source. <button type="button" onClick={onReviewLegacy}>Review in Plan changes</button></small> : null}
    <Drawer open={Boolean(correction)} onClose={() => setCorrection(null)} title="Correct source amount" ariaLabel="Correct source amount" width="md" footer={<><button type="button" onClick={() => setCorrection(null)}>Cancel</button><button type="button" disabled={disabled || !correction || correction.reason.trim().length < 3 || operatingNumber(correction.amount) == null || (operatingNumber(correction.amount) ?? 0) < 0} onClick={() => { if (correction) decide(correction.group, "needs_correction", correction.reason, correction.amount); setCorrection(null); }}>Save correction for review</button></>}>
      {correction ? <div className={`${styles.correction} ${correction.reason.trim().length < 3 || operatingNumber(correction.amount) == null || (operatingNumber(correction.amount) ?? 0) < 0 ? styles.attention : ""}`}><strong>{correction.group.label} · {metricAmountLabel(correction.group.baseline_annual_amount, correction.group.currency)} / year</strong><label>Corrected annual amount<OperatingAmountInput label="Corrected annual amount" value={correction.amount} disabled={disabled} invalid={operatingNumber(correction.amount) == null || (operatingNumber(correction.amount) ?? 0) < 0} onCommit={amount => setCorrection({ ...correction, amount })} /></label><label>What needs correcting?<textarea ref={reasonInput} aria-label="Source correction reason" aria-required="true" aria-invalid={correction.reason.trim().length < 3 || undefined} value={correction.reason} disabled={disabled} onChange={event => setCorrection({ ...correction, reason: event.target.value })} placeholder="For example: wrong amount, wrong category, or already included elsewhere." /></label>{value.historical_corrections?.some(row => row.source_group_key === correction.group.key) ? <button type="button" disabled={disabled || !review?.source_fingerprint || restoreOperatingSourceGroup(value, correction.group, review.source_fingerprint) === value} onClick={() => { if (review?.source_fingerprint) onChange(restoreOperatingSourceGroup(value, correction.group, review.source_fingerprint)); setCorrection(null); }}>Restore original source amount</button> : null}<small>The original source stays unchanged. This difference is recorded for review and does not increase verified income.</small></div> : null}
    </Drawer>
  </section>;
}
