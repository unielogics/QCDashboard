import React from "react";
import type { ApplicationRequirement } from "@/lib/applicationProfile";
import styles from "./DocumentReviewChecks.module.css";

export function DocumentReviewChecks({ checks, verified = false }: {
  checks: ApplicationRequirement["review_checks"];
  verified?: boolean;
}) {
  if (!checks?.length) return null;
  return <details className={styles.panel}>
    <summary>Document review criteria · {checks.length} {checks.length === 1 ? "check" : "checks"}<span>{verified ? "Staff verified" : "Staff review required"}</span></summary>
    <div className={styles.body}>
      <p>Review the actual figures and periods below before verifying evidence. A readable upload alone does not confirm qualification.</p>
      <ul>{checks.map((check, index) => <li key={`${check.key}:${index}`}>
        <strong>{check.label}</strong>{check.severity === "block" ? <small>Resolve before acceptance</small> : null}
        <p>{check.instructions}</p>
      </li>)}</ul>
    </div>
  </details>;
}
