"use client";

import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { Callout, CellChip } from "@/components/ds";
import { useAuthedApi } from "@/hooks/useApi";
import type { ApplicationIntelligence, ApplicationProfile, ApplicationSourceKind } from "@/lib/applicationProfile";
import { noiGovernancePresentation } from "@/lib/noiGovernance";

function formatValue(value: string | number | null, unit: string | null) {
  if (value == null) return "Needs evidence";
  if (typeof value === "string") return value;
  if (unit && /^[A-Z]{3}$/.test(unit)) {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: unit, maximumFractionDigits: 0 }).format(value); }
    catch { return `${value.toLocaleString()} ${unit}`; }
  }
  if (unit === "x") return `${value.toFixed(2)}x`;
  if (unit === "%") return `${value.toFixed(1)}%`;
  return new Intl.NumberFormat().format(value);
}

export function IntelligenceMetricContent({ metric, actionable }: { metric: ApplicationIntelligence["metrics"][number]; actionable: boolean }) {
  const noi = metric.key === "noi";
  const governance = noiGovernancePresentation({ status: metric.calculation_status, review_needed: metric.review_needed, status_reason: metric.status_reason ?? undefined });
  return <><span className="lbl">{metric.label}</span><strong className={metric.value == null ? "prose" : "num"}>{formatValue(metric.value, metric.unit)}</strong>{metric.source && (metric.status === "ready" || noi) ? <small>{metric.source}</small> : null}{noi ? <><small>{[metric.period, metric.unit].filter(Boolean).join(" · ")}</small><CellChip tone={governance.tone}>{governance.label}</CellChip><small>{governance.reason}</small></> : null}{metric.action && actionable ? <small className="metric-action">{metric.action === "review_noi" ? "Review NOI" : "Open"} <Icon name="arrowR" size={11} /></small> : noi && metric.review_needed ? <small>Ask an authorized file team member to review NOI.</small> : null}</>;
}

export function ApplicationIntelligencePanel({ sourceKind, sourceId, onAction, canReviewNoi = true }: { sourceKind: ApplicationSourceKind; sourceId: string; onAction?: (action: string) => void; canReviewNoi?: boolean }) {
  const apiCall = useAuthedApi();
  const profile = useQuery({ queryKey: ["application-profile", sourceKind, sourceId], queryFn: () => apiCall<ApplicationProfile>("/application-profiles/resolve", { method: "POST", body: JSON.stringify({ source_kind: sourceKind, source_id: sourceId }) }) });
  const intelligence = useQuery({ queryKey: ["application-intelligence", profile.data?.id], enabled: Boolean(profile.data?.id), queryFn: () => apiCall<ApplicationIntelligence>(`/application-profiles/${profile.data?.id}/intelligence`) });
  if (intelligence.isError) return <Callout tone="bad">Live intelligence is unavailable for this file.</Callout>;
  const metrics = (intelligence.data?.metrics ?? []).filter((metric) => metric.applicable && metric.status !== "not_applicable");
  return <section className="live-intelligence" aria-label="Evidence-grounded metrics">
    <header><span className="lbl">Decision metrics</span>{intelligence.isFetching ? <span className="spinner solo" /> : <CellChip tone={metrics.some((metric) => metric.status === "needs_evidence") ? "warn" : "ok"}>{metrics.filter((metric) => metric.status === "ready").length} / {metrics.length} ready</CellChip>}</header>
    <div className="live-intelligence-grid">{metrics.map((metric) => {
      const actionable = Boolean(onAction && (metric.action !== "review_noi" || canReviewNoi));
      const content = <IntelligenceMetricContent metric={metric} actionable={actionable} />;
      return metric.action && actionable
        ? <button key={metric.key} type="button" className={metric.status === "needs_evidence" ? "needs" : undefined} onClick={() => onAction?.(metric.action!)} aria-label={`Open ${metric.label}: ${formatValue(metric.value, metric.unit)}`}>{content}</button>
        : <article key={metric.key} className={metric.status === "needs_evidence" ? "needs" : undefined}>{content}</article>;
    })}</div>
    {intelligence.data?.dscr_inputs?.bankable_ebitda ? <div className="dscr-provenance"><span>Bankable EBITDA <b>{formatValue(Number(intelligence.data.dscr_inputs.bankable_ebitda), "USD")}</b></span><span>Annual debt service <b>{formatValue(Number(intelligence.data.dscr_inputs.annual_debt_service), "USD")}</b></span><span>Target <b>{Number(intelligence.data.dscr_inputs.target).toFixed(2)}x</b></span><span>Floor <b>{Number(intelligence.data.dscr_inputs.floor).toFixed(2)}x</b></span></div> : null}
  </section>;
}
