"use client";

import { Btn } from "@/components/ds";
import { useMarketplaceMembershipPolicy } from "@/hooks/useMarketplaceMembershipPolicy";
import type { MarketplaceMembershipPolicy } from "@/lib/marketplaceMembership";
import styles from "./MarketplaceMembershipPolicy.module.css";

export function MarketplaceMembershipPolicySummary({ policy, showMemberLink = false, compact = false }: { policy: MarketplaceMembershipPolicy; showMemberLink?: boolean; compact?: boolean }) {
  const rules = <><ul>{policy.requirements.map(item => <li key={item.key}><strong>{item.label}</strong><span>{item.detail}</span></li>)}</ul>{policy.limitations.length ? <div className={styles.limitations}>{policy.limitations.map((limitation, index) => <p key={index}>{limitation}</p>)}</div> : null}</>;
  return <section className={styles.root} aria-label="Investor membership policy">
    <header><h3>{policy.label}</h3><p>{policy.summary}</p></header>
    <p>Issuer default waiting period: <strong>{policy.waiting_period_days} days</strong>. Review each member’s relationship date, waiting-period end and Gate in Members.</p>
    {compact ? <details className={styles.rules}><summary>View membership requirements</summary><div>{rules}</div></details> : rules}
    {showMemberLink ? <a className="btn btn-sm" href="/admin/marketplace/members?tab=members" target="_blank" rel="noopener noreferrer">Manage members and eligibility <span className="sub">· opens a new tab</span></a> : <p>Use the Members tab to open a member’s questionnaire and Gate, record the relationship and waiting period, and make a staff review decision.</p>}
  </section>;
}

export function MarketplaceMembershipPolicyPanel() {
  const query = useMarketplaceMembershipPolicy();
  if (!query.allowed) return null;
  if (query.isError) return <section className={styles.root} aria-label="Investor membership policy"><h3>Membership policy could not be loaded</h3><p>Current eligibility requirements are unavailable. Individual member reviews remain separate.</p><div><Btn size="sm" onClick={() => void query.refetch()}>Retry membership policy</Btn></div></section>;
  if (!query.data) return <section className={styles.root} aria-label="Investor membership policy"><p role="status">Loading membership policy…</p></section>;
  return <MarketplaceMembershipPolicySummary policy={query.data} />;
}
