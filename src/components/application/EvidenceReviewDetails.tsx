import { Btn } from "@/components/ds";
import type { ApplicationRequirementEvidence } from "@/lib/applicationProfile";
import { evidenceReviewPresentation } from "@/lib/evidenceReviewPresentation";
import styles from "./EvidenceReviewDetails.module.css";

export function EvidenceReviewDetails({ file, requirementLabel, isDebtSchedule = false, expanded = false, onPreview, onLoanFiles }: {
  file: ApplicationRequirementEvidence; requirementLabel: string; isDebtSchedule?: boolean;
  expanded?: boolean; onPreview?: () => void; onLoanFiles?: () => void;
}) {
  const detail = evidenceReviewPresentation(file, requirementLabel, isDebtSchedule);
  return <details className={styles.details} open={expanded || undefined}>
    <summary>{detail.requiresReview ? "Why this needs review" : "Document details and next step"}<span>{detail.role}</span></summary>
    <div className={styles.body}>
      <strong>{detail.headline}</strong>
      <p>{detail.explanation}</p>
      <dl><div><dt>Attached to</dt><dd>{requirementLabel}</dd></div><div><dt>Detected document</dt><dd>{detail.classification || "Type not established"}{detail.confidence ? ` · ${detail.confidence} confidence in the document reading` : ""}</dd></div>{detail.entities.length ? <div><dt>Business named in evidence</dt><dd>{detail.entities.join("; ")}</dd></div> : null}</dl>
      {file.ai_explanation && file.ai_explanation !== detail.explanation ? <p className={styles.recorded}><b>Recorded requirement review:</b> {file.ai_explanation} This concerns whether the file satisfies this checklist item.</p> : null}
      <p><b>Next step:</b> {detail.next}</p>
      {onPreview || onLoanFiles ? <div className={styles.actions}>{onPreview ? <Btn size="sm" onClick={onPreview}>Preview source</Btn> : null}{onLoanFiles && detail.role === "Loan supporting document" ? <Btn size="sm" onClick={onLoanFiles}>Link to an obligation</Btn> : null}</div> : null}
    </div>
  </details>;
}
