"use client";

import type { ProgramLogicAction, ProgramLogicWarning } from "./fundingProgramConsistencyModel";
import styles from "./FundingProgramLogicWarnings.module.css";

export function FundingProgramLogicWarnings({ warnings, onSelect }: { warnings: ProgramLogicWarning[]; onSelect?: (action: ProgramLogicAction) => void }) {
  if (!warnings.length) return null;
  return <section className={styles.panel} aria-label="Program logic review">
    <header><strong>Logic review · {warnings.length} {warnings.length === 1 ? "item" : "items"}</strong><p>Review how these settings work together. Warnings do not change your policy or prevent saving; red items indicate a likely conflict.</p></header>
    <ul>{warnings.map((warning) => <li key={warning.id} className={styles[warning.kind]}><strong>{warning.title}</strong><p>{warning.message}</p>{onSelect ? <div>{warning.actions.map((action) => <button key={`${action.programKey || ""}:${action.target}`} type="button" onClick={() => onSelect(action)}>{action.label} →</button>)}</div> : null}</li>)}</ul>
  </section>;
}
