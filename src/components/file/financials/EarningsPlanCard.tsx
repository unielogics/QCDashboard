"use client";

// The operating expenses and earnings plan as the file page shows it: a
// thumbnail of the plan document, the headline before and after, what each
// group of changes does, and the largest costs. Editing stays in the shared
// financial workspace; this card only opens it.

import { useState } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { Btn, cx } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import { FileWorkspaceLink, useFileWorkspace } from "@/components/file/FileWorkspaceContext";
import { FinancialWorkspace } from "@/components/application/FinancialWorkspace";
import { useStaffPlanTransport } from "@/components/earnings-plan/useStaffPlanTransport";
import { RequestFilesDialog } from "@/components/application/RequestFilesDialog";
import { OperatingCoverageSummary } from "@/components/file/cockpit/OperatingCoverageSummary";
import { metricAmountLabel } from "@/lib/financialMetrics";
import { operatingFundingState } from "@/lib/operatingFundingState";
import { operatingGoalReady } from "@/lib/operatingGoal";
import { operatingPlanRequest } from "@/lib/operatingPlan";
import type { FinancialCockpit } from "@/lib/financialCockpit";
import { planCard, type PlanSummary } from "@/lib/financialsOverview";
import styles from "./FinancialsOverview.module.css";

/** The saved plan evaluated against the current file; shared by the strip and the plan card. */
export function usePlanSummary(profileId: string): UseQueryResult<PlanSummary> {
  const api = useAuthedApi();
  return useQuery({
    queryKey: ["operating-plan-summary", profileId],
    queryFn: () => api<PlanSummary>(`/application-profiles/${encodeURIComponent(profileId)}/operating-plan/summary`),
    staleTime: 15_000,
    retry: false,
  });
}

export function EarningsPlanCard({ cockpit, summary, profileId, businessName, canEdit, onRefresh, onRequested }: {
  cockpit: FinancialCockpit;
  summary: UseQueryResult<PlanSummary>;
  profileId: string;
  businessName: string;
  canEdit?: boolean;
  onRefresh: () => void | Promise<unknown>;
  onRequested: () => void;
}) {
  const fileWorkspace = useFileWorkspace();
  const linked = Boolean(fileWorkspace && !fileWorkspace.pageMode);
  const queryClient = useQueryClient();
  const transport = useStaffPlanTransport(profileId);
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState("");
  const supplied = cockpit.operating_plan?.evaluation;
  const evaluation = summary.data?.evaluation ?? supplied;
  const model = planCard(cockpit, summary.data, supplied);
  const funding = operatingFundingState(evaluation?.cash_bridge, evaluation?.released_cash_flow);
  const coverage = cockpit.plan?.evaluation;
  const versionId = summary.data?.version_id ?? null;
  const hasPdf = Boolean(summary.data?.pdf_file_id && versionId && transport);
  const openPlan = () => setOpen(true);
  // The saved version's own PDF, in a new tab; the plan is not opened for it.
  const openPdf = () => {
    if (!transport || !versionId) return;
    setPdfError("");
    transport.openPdf({ id: versionId, version_number: summary.data?.version_number ?? 0, created_at: summary.data?.updated_at ?? "" })
      .catch((error: unknown) => setPdfError(error instanceof Error && error.message ? error.message : "The plan PDF could not be opened. Try again."));
  };
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["operating-plan-summary", profileId] });
    await onRefresh();
  };
  const empty = summary.isLoading ? "Reading the saved plan…" : summary.error && !evaluation ? "The plan summary could not be refreshed. Open the plan to review its saved rows." : model.empty;

  return (
    <>
      <section className={cx(styles.card, styles.plan)} aria-label="Operating expenses and earnings plan">
        <div className={styles.planHead}>
          <div>
            <h2>Operating expenses and earnings plan</h2>
            <p>Current costs, proposed changes and their effect on earnings and coverage.</p>
          </div>
          <div className={styles.cardActions}>
            <span className={cx(styles.tag, styles[`tag_${model.chip.tone}`])}>{model.chip.label}</span>
            {canEdit ? (
              operatingGoalReady(summary.data?.goal) ? (
                <Btn size="sm" onClick={() => setRequest(crypto.randomUUID())}>Request client plan</Btn>
              ) : linked ? (
                <FileWorkspaceLink tool="operating-plan" className="btn sm">Set annual NOI goal</FileWorkspaceLink>
              ) : (
                <Btn size="sm" disabled={summary.isLoading} onClick={openPlan}>Set annual NOI goal</Btn>
              )
            ) : null}
            {hasPdf ? <Btn size="sm" onClick={openPdf}>Latest plan PDF</Btn> : null}
            {linked ? (
              <FileWorkspaceLink tool="operating-plan" className="btn sm pri">Open earnings plan</FileWorkspaceLink>
            ) : (
              <Btn size="sm" variant="pri" onClick={openPlan}><Icon name="pencil" size={14} aria-hidden="true" />Open earnings plan</Btn>
            )}
          </div>
        </div>

        {funding.required ? (
          <div className={styles.funding} role="status">
            <div>
              <strong>{funding.complete ? "Plan funding allocated" : "Review the funding choices"}</strong>
              <p>The current plan has {metricAmountLabel(funding.capacity, funding.currency)} per month in funding. {funding.complete ? "Unused funding stays as cash; reinvesting is optional." : "Review the saved funding choices in the earnings plan."}</p>
            </div>
            {linked ? (
              <FileWorkspaceLink tool="operating-plan" className="btn sm">{canEdit ? "Review cash choices" : "View cash choices"}</FileWorkspaceLink>
            ) : (
              <Btn size="sm" onClick={openPlan}>{canEdit ? "Review cash choices" : "View cash choices"}</Btn>
            )}
          </div>
        ) : null}

        <div className={styles.planBody}>
          <button type="button" className={styles.thumb} onClick={hasPdf ? openPdf : openPlan} aria-label={hasPdf ? "Open latest plan PDF" : "Open current plan summary"}>
            <span className={styles.page} aria-hidden="true">
              <span className={styles.pageBrand}>Qualified Commercial</span>
              <span className={styles.pageTitle}>Operating Expenses and Earnings Plan</span>
              <span className={styles.pageSub}>{businessName}{summary.data?.version_number ? ` · v${summary.data.version_number}` : ""}</span>
              <span className={cx(styles.pageMetrics, styles.num)}>
                {model.metrics.flatMap((row) => [<span key={`${row.key}-l`}>{row.label}</span>, <span key={`${row.key}-b`}>{row.before}</span>, <b key={`${row.key}-a`}>{row.after}</b>])}
              </span>
              <span className={styles.pageBars}>
                {model.bars.map((bar, index) => <span key={index}><i className={styles[`bar_${bar.tone}`]} style={{ left: `${bar.left}%`, right: `${bar.right}%` }} /></span>)}
              </span>
            </span>
            <span className={cx(styles.thumbCaption, styles.num)}>{model.pdfCaption}</span>
          </button>

          <div className={styles.planMain}>
            <div className={cx(styles.planStats, styles.num)}>
              <div><span>EBITDA · baseline → plan</span><strong>{model.earnings.before} → {model.earnings.after}</strong></div>
              <div><span>DSCR · baseline → plan</span><strong>{model.coverage.before} → {model.coverage.after}</strong></div>
              <div><span>Still to find for 1.25x</span><strong className={model.gap.met ? styles.met : styles.gap}>{model.gap.value}</strong></div>
            </div>
            {model.rows.length ? (
              <div className={styles.tableWrap} style={{ marginTop: 0 }}>
                <table className={styles.table} aria-label="Changes in the plan">
                  <thead><tr><th scope="col">Change in the plan</th><th scope="col" className={styles.end}>EBITDA / yr</th><th scope="col" className={styles.end}>DSCR</th></tr></thead>
                  <tbody>
                    {model.rows.map((row) => (
                      <tr key={row.key}>
                        <td>{row.label}</td>
                        <td className={cx(styles.end, row.muted ? styles.tone_mut : row.ebitdaTone ? styles[`tone_${row.ebitdaTone}`] : undefined)}>{row.ebitda}</td>
                        <td className={styles.end}>{row.dscr}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {empty ? <p className={styles.note} style={{ margin: 0 }}>{empty}</p> : null}
            {pdfError ? <p className={cx(styles.note, styles.tone_bad)} style={{ margin: 0 }} role="alert">{pdfError}</p> : null}
            {model.footer.length ? <div className={styles.planFoot}>{model.footer.map((line) => <span key={line}>{line}</span>)}</div> : null}
          </div>

          <div className={styles.planSide}>
            <span>{model.costsTitle}</span>
            {model.costs.length ? (
              <div className={cx(styles.costs, styles.num)} aria-label={model.costsTitle}>
                {model.costs.flatMap((row) => [
                  <span key={`${row.key}-l`} title={row.label}>{row.label}</span>,
                  <span key={`${row.key}-t`}><i style={{ width: `${row.share}%` }} /></span>,
                  <b key={`${row.key}-a`}>{row.amount}</b>,
                ])}
              </div>
            ) : (
              <p className={styles.note} style={{ margin: 0 }}>Confirm current costs in the plan to compare the largest expense lines.</p>
            )}
            {model.facts.length ? (
              <div className={cx(styles.facts, styles.num)}>
                {model.facts.flatMap((row) => [<span key={`${row.label}-l`}>{row.label}</span>, <span key={`${row.label}-v`}>{row.value}</span>])}
              </div>
            ) : null}
          </div>
        </div>

        {coverage?.operating_plan && coverage.operating_plan.status !== "none" ? (
          <OperatingCoverageSummary coverage={coverage.operating_plan} currentDscr={cockpit.dscr?.headline?.value ?? null} projectedDscr={coverage.headline_after} currency={evaluation?.baseline?.currency} onReview={linked ? undefined : openPlan} />
        ) : null}
      </section>
      {open ? <FinancialWorkspace open profileId={profileId} businessName={businessName} initialKind="operating_plan" onClose={() => { setOpen(false); void refresh(); }} onPublished={refresh} /> : null}
      {request ? <RequestFilesDialog open profileId={profileId} prefill={operatingPlanRequest(businessName)} prefillKey={request} onClose={() => setRequest(null)} onRequested={() => { onRequested(); void refresh(); }} /> : null}
    </>
  );
}
