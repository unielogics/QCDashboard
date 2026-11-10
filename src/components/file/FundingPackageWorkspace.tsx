"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Btn, Callout, Panel } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { money, multiple, type FinancialCockpit } from "@/lib/financialCockpit";
import type { PackageGenerationOptions } from "./leadFile";
import styles from "./FundingPackageWorkspace.module.css";

export type FundingPackageTab = "summary" | "marketplace" | "delivery" | "package";

export function FundingPackageWorkspace({ profileId, cockpit, activeTab, onTab, busy, generated, current, error, onGenerate, packageContent, marketplaceContent, deliveryContent, historyContent }: {
  profileId: string;
  cockpit: FinancialCockpit;
  activeTab: FundingPackageTab;
  onTab: (tab: FundingPackageTab) => void;
  busy: boolean;
  generated: boolean;
  current: boolean;
  error?: string | null;
  onGenerate: (options: PackageGenerationOptions) => void;
  packageContent: ReactNode;
  marketplaceContent: ReactNode;
  deliveryContent: ReactNode;
  historyContent: ReactNode;
}) {
  const dscr = cockpit.dscr.headline?.value ?? null;
  const earnings = cockpit.dscr.headline?.numerator ?? cockpit.ebitda?.headline?.annualized_value ?? cockpit.ebitda?.headline?.value ?? null;
  const negativeEarnings = earnings != null && Number.isFinite(earnings) && earnings < 0;
  const belowThreshold = dscr != null && Number.isFinite(dscr) && dscr < 1.1;
  const recommended = negativeEarnings || belowThreshold;
  const [includePlan, setIncludePlan] = useState(recommended || Boolean(cockpit.operating_plan?.available));
  const [includeWorkingPlan, setIncludeWorkingPlan] = useState(false);
  // A refresh must not undo the desk's explicit selection. A different file
  // gets its own component key and defaults.
  useEffect(() => { setIncludePlan(recommended || Boolean(cockpit.operating_plan?.available)); setIncludeWorkingPlan(false); }, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps
  const tabs: Array<[FundingPackageTab, string]> = [["summary", "Package & presentation"], ["marketplace", "Marketplace listing"], ["delivery", "Delivery"], ["package", "Version history"]];
  const impact = cockpit.plan?.impact;
  const amount = impact?.loan?.amount ?? cockpit.requested_amount;
  return <Panel id="package-readiness" className={`fc-wide ${styles.workspace}`} title="Investor package & capital partners" sub="Build and review the presentation and supporting PDFs, then prepare a marketplace listing or send the package."
    actions={<Btn variant="pri" disabled={busy} onClick={() => onGenerate({ include_operating_plan: includePlan, include_working_operating_plan: includePlan && includeWorkingPlan })}><Icon name="reports" size={14} />{busy ? "Building package…" : generated ? "Refresh package + preview" : "Generate package + preview"}</Btn>}>
    <nav className={styles.tabs} role="tablist" aria-label="Investor package workflow">{tabs.map(([key, label], index) => <button key={key} type="button" role="tab" id={`funding-tab-${key}`} aria-selected={activeTab === key} aria-controls={`funding-panel-${key}`} className={activeTab === key ? styles.active : undefined} onClick={() => onTab(key)}><span>{index + 1}</span>{label}</button>)}</nav>
    {error ? <Callout tone="bad">{error} Your prior package remains available. Retry generation after correcting the issue.</Callout> : null}
    <section role="tabpanel" id="funding-panel-summary" aria-labelledby="funding-tab-summary" hidden={activeTab !== "summary"}>
      <div className={styles.metrics} aria-label="Package financial context"><div><span>Requested / planned financing</span><strong>{money(amount)}</strong><small>{impact?.loan?.amount != null ? "Saved refinance scenario" : "Current request · proposed terms may still be missing"}</small></div><div><span>Current DSCR</span><strong>{multiple(dscr)}</strong><small>{cockpit.dscr.headline?.label ?? "Evidence needed"}</small></div><div><span>DSCR with refinance plan</span><strong>{multiple(impact?.active ? impact.dscr.after : null)}</strong><small>{impact?.active ? "Saved scenario · verify terms and payoffs" : "Save a loan scenario to show its effect"}</small></div></div>
      <div className={styles.options}>
        <label><input type="checkbox" checked={includePlan} onChange={event => setIncludePlan(event.target.checked)} />Include operating expenses and earnings plan</label>
        <small>{recommended ? belowThreshold ? `Recommended: current DSCR ${multiple(dscr)} is below 1.10x${negativeEarnings || dscr! < 0 ? " and earnings are negative" : ""}.` : "Recommended: current earnings are negative. Confirm the source and debt-service inputs before relying on coverage." : "The desk can include an earnings plan for any file. The 1.10x planning trigger does not replace program underwriting requirements."}</small>
        {includePlan ? <label><input type="checkbox" checked={includeWorkingPlan} onChange={event => setIncludeWorkingPlan(event.target.checked)} />Include the current working plan as an unreviewed draft</label> : null}
        {includePlan ? <small>{includeWorkingPlan ? "Draft actions, assumptions and missing inputs will be identified separately from reviewed projections." : "Uses the latest published plan. Select the working-draft option to include edits awaiting Save version."}</small> : null}
      </div>
      {packageContent}
      <div className={styles.next}><span>{current ? "Package ready for review. Continue to the marketplace or delivery when you choose." : "Generate a current package before creating a marketplace listing."}</span><Btn size="sm" onClick={() => onTab("marketplace")} disabled={!generated}>Continue to marketplace <Icon name="arrowR" size={13} /></Btn></div>
    </section>
    <section role="tabpanel" id="funding-panel-marketplace" aria-labelledby="funding-tab-marketplace" hidden={activeTab !== "marketplace"}>
      {!current ? <Callout tone="warn">Generate or refresh the package first. You can review offering terms here; a new listing starts from a current package.</Callout> : null}
      {marketplaceContent}
    </section>
    <section role="tabpanel" id="funding-panel-delivery" aria-labelledby="funding-tab-delivery" hidden={activeTab !== "delivery"}>{deliveryContent}</section>
    <section role="tabpanel" id="funding-panel-package" aria-labelledby="funding-tab-package" hidden={activeTab !== "package"}>{historyContent}</section>
  </Panel>;
}
