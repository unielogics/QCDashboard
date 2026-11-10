"use client";

import { useEffect, useId, useState } from "react";
import { Icon } from "./Icon";
import styles from "./PreparationProgress.module.css";

export type PreparationStep = {
  label: string;
  status: "pending" | "active" | "complete";
};

export type PreparationState = "loading" | "complete" | "error";

/** An indeterminate bar until the operation actually returns; no timed percentages. */
export function PreparationProgress({ title, description, state = "loading", steps, compact = false, className = "" }: {
  title: string;
  description?: string;
  state?: PreparationState;
  steps?: PreparationStep[];
  compact?: boolean;
  className?: string;
}) {
  const titleId = useId();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (state !== "loading") return;
    setElapsed(0);
    const started = Date.now();
    const interval = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, [state]);
  const status = state === "complete" ? "Ready" : state === "error" ? "Needs attention" : "In progress";
  const duration = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  return <section className={`${styles.card} ${compact ? styles.compact : ""} ${className}`} data-state={state} aria-labelledby={titleId}>
    <div className={styles.header}>
      <span className={styles.symbol} aria-hidden="true"><Icon name={state === "complete" ? "docCheck" : state === "error" ? "x" : "file"} size={21} /></span>
      <div className={styles.copy}>
        <div className={styles.headline} role="status" aria-live="polite" aria-atomic="true"><strong id={titleId}>{title}</strong><span className={styles.status}>{status}</span></div>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {state === "loading" ? <span className={styles.elapsed} aria-hidden="true">{duration}<small>elapsed</small></span> : null}
    </div>
    <div className={styles.track} role="progressbar" aria-busy={state === "loading"} aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={state === "complete" ? 100 : undefined} aria-valuetext={status}>
      <span className={styles.fill} />
    </div>
    {steps?.length ? <ol className={styles.steps} aria-label="Preparation steps">{steps.map((step, index) => <li key={`${index}:${step.label}`} data-status={step.status} aria-current={step.status === "active" ? "step" : undefined}>
      <span className={styles.stepSymbol} aria-hidden="true">{step.status === "complete" ? <Icon name="check" size={12} /> : index + 1}</span><span>{step.label}</span>
    </li>)}</ol> : null}
    {state === "loading" && elapsed >= 45 ? <p className={styles.wait}>Still preparing. Larger files can take a little longer.</p> : null}
  </section>;
}
