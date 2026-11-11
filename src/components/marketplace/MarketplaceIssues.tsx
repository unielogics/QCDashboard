"use client";

import { Btn } from "@/components/ds";
import { marketplaceIssueHref, type MarketplaceIssue } from "@/lib/marketplaceIssues";
import styles from "./MarketplaceIssues.module.css";

export function MarketplaceIssues({ issues, onFix, listingId, busy = false, id }: { issues: MarketplaceIssue[]; onFix?: (issue: MarketplaceIssue) => void; listingId?: string; busy?: boolean; id?: string }) {
  if (!issues.length) return null;
  return <section id={id} tabIndex={-1} className={styles.summary} aria-label="Marketplace issues to resolve">
    <h3>Resolve these items</h3>
    <ul>{issues.map(issue => <li key={issue.key}><div><strong>{issue.message}</strong><p>{issue.instruction}</p></div>{issue.target && issue.actionLabel ? onFix ? <Btn size="sm" disabled={busy} onClick={() => onFix(issue)}>{issue.actionLabel}</Btn> : listingId ? <a className="btn sm" href={marketplaceIssueHref(listingId, issue)}>{issue.actionLabel}</a> : null : null}</li>)}</ul>
  </section>;
}
