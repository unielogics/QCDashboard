"use client";

import { Children, cloneElement, createContext, isValidElement, useContext, useId, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { Field } from "@/components/ds";
import type { ProgramValidationIssue } from "./fundingProgramValidationModel";
import styles from "./FundingProgramEditor.module.css";

export const ProgramValidationContext = createContext<ProgramValidationIssue[]>([]);

/** Decorates only fields with an actionable issue; valid untouched fields stay neutral. */
export function ValidatedField({ target, children, ...props }: ComponentProps<typeof Field> & { target?: string }) {
  const issues = useContext(ProgramValidationContext);
  const errorId = useId();
  const controls = Children.toArray(children);
  const first = controls.find(isValidElement) as ReactElement<Record<string, unknown>> | undefined;
  const name = target || String(first?.props["aria-label"] || first?.props.label || props.label || "");
  const issue = issues.find((item) => item.target === name);
  return <div data-validation-target={name} className={issue ? styles.invalidField : undefined}>
    <Field {...props}>{controls.map((child, index) => {
      if (!isValidElement(child) || index !== 0) return child;
      const element = child as ReactElement<Record<string, unknown>>;
      return cloneElement(element, { ...(issue ? { "aria-invalid": true, "aria-describedby": [element.props["aria-describedby"], errorId].filter(Boolean).join(" ") } : {}) });
    })}{issue ? <p id={errorId} className={styles.fieldError}>{issue.message}</p> : null}</Field>
  </div>;
}

export function ValidationTarget({ target, children }: { target: string; children: ReactNode }) {
  const issues = useContext(ProgramValidationContext);
  const issue = issues.find((item) => item.target === target);
  const errorId = useId();
  return <div data-validation-target={target} tabIndex={-1} aria-label={target} aria-invalid={issue ? true : undefined} aria-describedby={issue ? errorId : undefined} className={issue ? styles.invalidSection : undefined}>{children}{issue ? <p id={errorId} className={styles.fieldError}>{issue.message}</p> : null}</div>;
}

export function ValidationSummary({ issues, onSelect }: { issues: ProgramValidationIssue[]; onSelect: (issue: ProgramValidationIssue) => void }) {
  if (!issues.length) return null;
  const labels = { details: "1 · Program details", availability: "2 · Availability", criteria: "3 · Eligibility & documents", review: "Review note" };
  return <section className={styles.validationSummary} role="alert" aria-label="Program changes needing attention"><strong>{issues.length} {issues.length === 1 ? "item needs" : "items need"} attention</strong><p>Select a field below. We’ll open its section and highlight exactly where to make the change.</p><ul>{issues.map((issue, index) => <li key={`${issue.target}:${issue.routeIndex ?? ""}:${index}`}><button type="button" onClick={() => onSelect(issue)}><span><small>{labels[issue.section || "criteria"]}</small><strong>{issue.fieldLabel || issue.target}</strong><span>{issue.message}</span></span><span className={styles.jumpLabel}>Go to field →</span></button></li>)}</ul></section>;
}

export function SectionAttention({ section, onSelect }: { section: ProgramValidationIssue["section"]; onSelect: (issue: ProgramValidationIssue) => void }) {
  const issues = useContext(ProgramValidationContext).filter((issue) => issue.section === section);
  if (!issues.length) return null;
  return <button type="button" className={styles.sectionAttention} onClick={() => onSelect(issues[0])}>{issues.length} {issues.length === 1 ? "item needs" : "items need"} attention ↓</button>;
}
