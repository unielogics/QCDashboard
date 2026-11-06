"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Btn } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { DebtScheduleReviewPanel, type DebtScheduleEditorTarget } from "@/components/application/DebtScheduleReviewPanel";
import type { CockpitBankSummary, CockpitMonth, FinancialCockpit } from "@/lib/financialCockpit";
import { RecurringCard, type RecurringReviewView } from "./RecurringCard";
import { OverdraftCard } from "./OverdraftCard";
import { AccountMovementsCard } from "./AccountMovementsCard";
import { AdvancesCard } from "./AdvancesCard";
import { FinancialCalculationReview } from "./FinancialCalculationReview";
import type { MetricCorrectionDraft } from "@/lib/financialMetrics";
import styles from "./FinancialReview.module.css";

export type FinancialReviewTab = "schedule" | "statements" | "calculations" | "plan" | "risk" | "movements" | "agreements";
const TABS: Array<{ value: FinancialReviewTab; label: string }> = [
  { value: "schedule", label: "Working debt schedule" }, { value: "statements", label: "Statement payments" },
  { value: "calculations", label: "Calculation inputs" },
  { value: "plan", label: "Coverage plan" }, { value: "risk", label: "Balance risk" }, { value: "movements", label: "Account movement" },
  { value: "agreements", label: "Agreements / advances" },
];
export function FinancialReviewDrawer({ open, onClose, tab, onTab, cockpit, profileId, months, summary, accountLabel, accountKey, canEdit, canCorrectMetrics = false, onRefresh, onOpenDebt, onPreviewSource, onOpenEvidence, planContent, spendContent, planActions }: {
  open: boolean; onClose: () => void; tab: FinancialReviewTab; onTab: (tab: FinancialReviewTab) => void;
  cockpit: FinancialCockpit; profileId: string; months: CockpitMonth[]; summary: CockpitBankSummary;
  accountLabel: string; accountKey?: string; canEdit: boolean; canCorrectMetrics?: boolean; onRefresh: () => Promise<unknown> | void;
  onOpenDebt: (target: DebtScheduleEditorTarget) => void;
  onPreviewSource?: (fileId: string, page?: number) => void; onOpenEvidence?: () => void;
  planContent: ReactNode; spendContent?: ReactNode; planActions?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [statementView, setStatementView] = useState<RecurringReviewView | undefined>();
  const [metricDraft, setMetricDraft] = useState<MetricCorrectionDraft | null>(null);
  const [metricPending, setMetricPending] = useState(false);
  const activeProfile = useRef(profileId);
  activeProfile.current = profileId;
  useEffect(() => { setMetricDraft(null); setMetricPending(false); }, [profileId]);
  return <Drawer open={open} onClose={() => { if (!metricPending) onClose(); }} title="Advanced financial review" sub="One working schedule, statement evidence, and the published coverage basis." ariaLabel="Advanced financial review" width="xl" fullscreen={expanded} bodyClass={styles.drawerBody} headerActions={<>
    <Btn size="sm" disabled={metricPending} aria-label={expanded ? "Restore financial review size" : "Expand financial review"} onClick={() => setExpanded((value) => !value)}>{expanded ? "Restore" : "Expand"}</Btn>{tab === "plan" ? planActions : null}
  </>}>
    <nav className={styles.tabs} aria-label="Advanced financial review sections" role="tablist">{TABS.map((item) => <button type="button" key={item.value} role="tab" disabled={metricPending} aria-selected={tab === item.value} className={tab === item.value ? styles.selectedTab : undefined} onClick={() => onTab(item.value)}>{item.label}</button>)}</nav>
    <div className={styles.reviewBody}>
      {tab === "schedule" ? <section className={styles.section}><h3>Working debt schedule</h3><p className={styles.note}>This is the same working schedule shown in Evidence &amp; banking. Statement candidates are separate until you add them; only Save version publishes a completed schedule.</p><DebtScheduleReviewPanel profileId={profileId} compact onSaved={() => void onRefresh()} onOpenEditor={onOpenDebt} /></section> : null}
      {tab === "statements" ? <><RecurringCard profileId={profileId} cockpit={cockpit} canEdit={canEdit} onRefresh={onRefresh} accountLabel={accountKey && !["all", "counted"].includes(accountKey) ? accountLabel : null} accountScope={accountKey} onOpenDebt={(rowId) => onOpenDebt({ view: "form", rowId })} onPreviewSource={onPreviewSource} initialReviewView={statementView} onReviewView={setStatementView} compact />{spendContent}</> : null}
      {tab === "plan" ? <div className={styles.planContent}>{planContent}</div> : null}
      {tab === "calculations" ? <FinancialCalculationReview key={profileId} cockpit={cockpit} profileId={profileId} canEdit={canCorrectMetrics} draft={metricDraft} onDraft={(next) => { if (activeProfile.current === profileId) setMetricDraft(next); }} onPending={(pending) => { if (activeProfile.current === profileId) setMetricPending(pending); }} onRefresh={() => { if (activeProfile.current === profileId) return onRefresh(); }} onOpenDebt={() => onOpenDebt({ view: "form" })} onPreviewSource={onPreviewSource} /> : null}
      {tab === "risk" ? <OverdraftCard months={months} accountLabel={accountLabel} needReread={cockpit.coverage.statements_need_reread} accounts={cockpit.bank.accounts} onPreviewSource={onPreviewSource} /> : null}
      {tab === "movements" ? <AccountMovementsCard data={cockpit.bank.account_movements} accountKey={accountKey} onOpenEvidence={(fileId, page) => fileId ? onPreviewSource?.(fileId, page ?? undefined) : onOpenEvidence?.()} /> : null}
      {tab === "agreements" ? <><p className={styles.note}>Recorded agreement details are shown for reference. Use Working debt schedule to review or edit the financial rows.</p><AdvancesCard profileId={profileId} cockpit={cockpit} canEdit={false} /></> : null}
    </div>
  </Drawer>;
}
