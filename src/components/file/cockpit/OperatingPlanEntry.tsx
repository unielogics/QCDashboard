"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn, CellChip, IconBtn } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import { FinancialWorkspace } from "@/components/application/FinancialWorkspace";
import { RequestFilesDialog } from "@/components/application/RequestFilesDialog";
import { operatingLabel, operatingMoney, operatingPlanRequest, type OperatingEvaluation } from "@/lib/operatingPlan";
import styles from "./OperatingPlanEntry.module.css";

type PlanSummary = { has_plan: boolean; state?: string; expense_count: number; action_count: number; reviewed_action_count: number; missing_count: number; version_number?: number | null; updated_at?: string | null; cost_mix: Array<{ category: string; annual_amount: number | null; missing_count: number; count: number }>; evaluation?: OperatingEvaluation | null };

/** Compact entry beside coverage; editing stays in the shared financial workspace. */
export function OperatingPlanEntry({ profileId, businessName, evaluation: suppliedEvaluation, version, currentDscr, canEdit, onRefresh, onRequested }: {
  profileId: string; businessName: string; evaluation?: OperatingEvaluation | null; version?: number;
  currentDscr?: number | null;
  canEdit?: boolean; onRefresh: () => void | Promise<unknown>; onRequested: () => void;
}) {
  const [open, setOpen] = useState(false); const [request, setRequest] = useState<string | null>(null);
  const api = useAuthedApi(); const queryClient = useQueryClient();
  const summary = useQuery({ queryKey: ["operating-plan-summary", profileId], queryFn: () => api<PlanSummary>(`/application-profiles/${encodeURIComponent(profileId)}/operating-plan/summary`), staleTime: 15_000, retry: false });
  const evaluation = summary.data?.evaluation ?? suppliedEvaluation;
  const reviewed = evaluation?.totals.approved;
  const ratio = evaluation?.baseline.dscr ?? currentDscr;
  const suggested = evaluation?.recommendation?.recommended ?? (ratio != null ? ratio < 1.1 : evaluation?.baseline.earnings != null ? evaluation.baseline.earnings < 0 : null);
  const mix = (summary.data?.cost_mix ?? []).filter((row) => row.annual_amount != null && row.annual_amount > 0).sort((a, b) => b.annual_amount! - a.annual_amount!).slice(0, 4);
  const largest = Math.max(1, ...mix.map((row) => row.annual_amount!));
  const currency = evaluation?.baseline.currency;
  const money = (value: number | null | undefined) => currency ? operatingMoney(value, currency) : value == null ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ["operating-plan-summary", profileId] }); await onRefresh(); };
  return <>
    <section className="fc-card fc-wide"><div className="fc-card-h"><div><h4>Operating expenses and earnings plan</h4><div className="sub">Current costs, proposed changes and their effect on earnings and coverage.</div></div><div className="row" style={{ gap: 8, flexWrap: "wrap" }}>{summary.data?.has_plan ? <CellChip tone="mut">{summary.data.state === "published" ? `Published v${summary.data.version_number ?? version ?? "—"}` : "Working draft"}</CellChip> : summary.data ? <CellChip tone="mut">No plan yet</CellChip> : version ? <CellChip tone="mut">v{version}</CellChip> : null}<IconBtn aria-label="Open earnings plan" title="Open earnings plan" onClick={() => setOpen(true)}><Icon name="edit" size={16} /></IconBtn>{canEdit ? <Btn size="sm" onClick={() => setRequest(crypto.randomUUID())}>Request client plan</Btn> : null}</div></div>
      <div className={styles.summary}>
        <div className={styles.figures}><span>Known operating cash costs<strong>{money(evaluation?.disclosure.operating_cash_monthly)}<small>/ month</small></strong></span><span>Known COGS<strong>{money(evaluation?.disclosure.cogs_monthly)}<small>/ month</small></strong></span><span>Reviewed earnings change<strong>{money(reviewed?.annual_impact)}<small>/ year</small></strong></span></div>
        {mix.length ? <div className={styles.mix} aria-label="Largest disclosed annual costs">{mix.map((row) => <div key={row.category}><span>{operatingLabel(row.category)}{row.missing_count ? " · known" : ""}</span><span className={styles.track}><i style={{ width: `${row.annual_amount! / largest * 100}%` }} /></span><strong>{money(row.annual_amount)}</strong></div>)}</div> : <p className="sub">{summary.isLoading ? "Reading the saved plan…" : summary.error ? "Plan summary could not be refreshed. Open the plan to review its saved rows." : "Add current costs and proposed changes to build the earnings comparison."}</p>}
      </div>
      <div className={styles.status}>{evaluation && !currency ? <span>Currency unconfirmed</span> : null}<span>{summary.data?.expense_count ?? evaluation?.disclosure.active_count ?? 0} expense rows · {summary.data?.action_count ?? evaluation?.actions.length ?? 0} earnings actions · {summary.data?.reviewed_action_count ?? evaluation?.actions.filter((row) => row.included_in_approved_projection).length ?? 0} reviewed</span>{summary.data?.missing_count ? <span>{summary.data.missing_count} inputs still needed</span> : null}{suggested ? <CellChip tone="warn">Recommended · coverage below 1.10x or negative earnings</CellChip> : null}</div>
    </section>
    {open ? <FinancialWorkspace open profileId={profileId} initialKind="operating_plan" initialView="form" onClose={() => { setOpen(false); void refresh(); }} onPublished={refresh} /> : null}
    {request ? <RequestFilesDialog open profileId={profileId} prefill={operatingPlanRequest(businessName)} prefillKey={request} onClose={() => setRequest(null)} onRequested={() => { onRequested(); void refresh(); }} /> : null}
  </>;
}
