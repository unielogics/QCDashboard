"use client";
import { useState } from "react";
import { Drawer } from "@/components/ds/Drawer";
import type { OperatingPlannerIssue } from "@/lib/operatingPlannerIssues";
import styles from "./OperatingPlanIssueRail.module.css";

export function OperatingPlanIssueRail({ issues, onFix }: { issues: OperatingPlannerIssue[]; onFix: (issue: OperatingPlannerIssue) => void }) {
  const [open, setOpen] = useState(false), [expanded, setExpanded] = useState(false);
  const items = (all = false) => <div className={styles.items}>{(all || expanded ? issues : issues.slice(0, 4)).map(issue => <button key={issue.id} type="button" onClick={() => { setOpen(false); onFix(issue); }}>{issue.label}</button>)}{!all && issues.length > 4 ? <button type="button" onClick={() => setExpanded(value => !value)}>{expanded ? "Show fewer" : `Show all ${issues.length}`}</button> : null}{!issues.length ? <small>Required items complete</small> : null}</div>;
  return <>
    <aside className={`${styles.rail} ${issues.length ? styles.attention : ""}`} aria-label="To finish"><strong>To finish <span>{issues.length}</span></strong>{items()}</aside>
    <button className={`${styles.mobile} ${issues.length ? styles.attention : ""}`} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" title={`To finish: ${issues.length} required items`} aria-label={`To finish: ${issues.length} required items`}>To finish · {issues.length}</button>
    <Drawer open={open} onClose={() => setOpen(false)} title={`To finish · ${issues.length}`} ariaLabel="Required plan items" width="md">{items(true)}</Drawer>
  </>;
}
