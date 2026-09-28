import React from "react";
import type { ApplicationRequirement } from "@/lib/applicationProfile";
import styles from "./DocumentReviewChecks.module.css";

export function DocumentReviewChecks({ checks, verified = false, staffRequired = true, assessment, onPreview }: {
  checks: ApplicationRequirement["review_checks"];
  verified?: boolean;
  staffRequired?: boolean;
  assessment?: unknown;
  onPreview?: (fileId: string) => void;
}) {
  if (!checks?.length) return null;
  const review = assessment && typeof assessment === "object" ? assessment as Record<string, unknown> : null;
  const findings = Array.isArray(review?.checks) ? review.checks.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object")).slice(0, 40) : [];
  return <details className={styles.panel}>
    <summary>Document review criteria · {checks.length} {checks.length === 1 ? "check" : "checks"}<span>{verified ? !staffRequired && review?.status === "pass" ? "AI evidence verified" : staffRequired ? "Staff verified" : "Verified" : staffRequired ? "Staff review required" : "AI evidence review"}</span></summary>
    <div className={styles.body}>
      <p>{staffRequired ? "Staff must verify these requirements. AI can assist but cannot complete this staff-only step." : "Run AI analysis to check the source documents. Every condition needs grounded evidence; missing, uncertain, or adverse results remain open for review."} A readable upload alone does not confirm qualification.</p>
      {review && typeof review.reason === "string" ? <p><strong>Latest evidence review:</strong> {review.reason}</p> : null}
      <ul>{checks.map((check, index) => <li key={`${check.key}:${index}`}>
        <strong>{check.label}</strong>{check.severity === "block" ? <small>Resolve before acceptance</small> : null}
        <p>{check.instructions}</p>
      </li>)}</ul>
      {findings.length ? <details><summary>AI findings and source pages</summary><ul>{findings.map((finding, index) => <li key={index}>
        <strong>{String(finding.label || finding.key || "Document check")}</strong>
        <small>{finding.status === "pass" ? "Evidence supports check" : finding.status === "fail" ? "Concern found" : "Needs review"}</small>
        <p>{typeof finding.reason === "string" ? finding.reason : "Review the source evidence."}</p>
        {Array.isArray(finding.citations) ? finding.citations.slice(0, 30).map((value, citationIndex) => {
          if (!value || typeof value !== "object") return null;
          const citation = value as Record<string, unknown>;
          if (typeof citation.file_id !== "string" || typeof citation.page !== "number" || typeof citation.quote !== "string") return null;
          return <div key={citationIndex}><blockquote>{citation.quote}</blockquote>{onPreview ? <button type="button" className={styles.source} onClick={() => onPreview(citation.file_id as string)}>Open source · page {citation.page}</button> : <small>Source page {citation.page}</small>}</div>;
        }) : null}
      </li>)}</ul></details> : null}
    </div>
  </details>;
}
