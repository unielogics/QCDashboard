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
  const issue = issues.find((item) => item.target === name && !item.step);
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
  const issue = issues.find((item) => item.target === target && !item.step);
  const errorId = useId();
  return <div data-validation-target={target} tabIndex={-1} aria-label={target} aria-invalid={issue ? true : undefined} aria-describedby={issue ? errorId : undefined} className={issue ? styles.invalidSection : undefined}>{children}{issue ? <p id={errorId} className={styles.fieldError}>{issue.message}</p> : null}</div>;
}

export function ValidationSummary({ issues, onSelect }: { issues: ProgramValidationIssue[]; onSelect: (issue: ProgramValidationIssue) => void }) {
  if (!issues.length) return null;
  return <section className={styles.validationSummary} role="alert" aria-label="Program changes needing attention"><strong>Complete these items to continue</strong><p>Choose an item to go directly to the field or next step. Nothing has been saved or published by this check.</p><ul>{issues.map((issue, index) => <li key={`${issue.target}:${index}`}><button type="button" onClick={() => onSelect(issue)}>{issue.message}</button></li>)}</ul></section>;
}
