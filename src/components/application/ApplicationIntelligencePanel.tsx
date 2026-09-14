"use client";

import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { Callout, CellChip } from "@/components/ds";
import { useAuthedApi } from "@/hooks/useApi";
import type { ApplicationIntelligence, ApplicationProfile, ApplicationSourceKind } from "@/lib/applicationProfile";

function formatValue(value: string | number | null, unit: string | null) {
  if (value == null) return "Needs evidence";
  if (typeof value === "string") return value;
  if (unit === "USD") return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
  if (unit === "x") return `${value.toFixed(2)}x`;
  if (unit === "%") return `${value.toFixed(1)}%`;
  return new Intl.NumberFormat().format(value);
}

export function ApplicationIntelligencePanel({ sourceKind, sourceId, onAction }: { sourceKind: ApplicationSourceKind; sourceId: string; onAction?: (action: string) => void }) {
  const apiCall = useAuthedApi();
  const profile = useQuery({ queryKey: ["application-profile", sourceKind, sourceId], queryFn: () => apiCall<ApplicationProfile>("/application-profiles/resolve", { method: "POST", body: JSON.stringify({ source_kind: sourceKind, source_id: sourceId }) }) });
  const intelligence = useQuery({ queryKey: ["application-intelligence", profile.data?.id], enabled: Boolean(profile.data?.id), queryFn: () => apiCall<ApplicationIntelligence>(`/application-profiles/${profile.data?.id}/intelligence`) });
  if (intelligence.isError) return <Callout tone="bad">Live intelligence is unavailable for this file.</Callout>;
  const metrics = (intelligence.data?.metrics ?? []).filter((metric) => metric.applicable && metric.status !== "not_applicable");
  return <section className="live-intelligence" aria-label="Evidence-grounded metrics">
    <header><span className="lbl">Decision metrics</span>{intelligence.isFetching ? <span className="spinner solo" /> : <CellChip tone={metrics.some((metric) => metric.status === "needs_evidence") ? "warn" : "ok"}>{metrics.filter((metric) => metric.status === "ready").length} / {metrics.length} ready</CellChip>}</header>
    <div className="live-intelligence-grid">{metrics.map((metric) => {
      const content = <><span className="lbl">{metric.label}</span><strong className={metric.status === "ready" ? "num" : "prose"}>{formatValue(metric.value, metric.unit)}</strong>{metric.source && metric.status === "ready" ? <small>{metric.source}</small> : null}{metric.action && onAction ? <small className="metric-action">Open <Icon name="arrowR" size={11} /></small> : null}</>;
      return metric.action && onAction
        ? <button key={metric.key} type="button" className={metric.status === "needs_evidence" ? "needs" : undefined} onClick={() => onAction(metric.action!)} aria-label={`Open ${metric.label}: ${formatValue(metric.value, metric.unit)}`}>{content}</button>
        : <article key={metric.key} className={metric.status === "needs_evidence" ? "needs" : undefined}>{content}</article>;
    })}</div>
    {intelligence.data?.dscr_inputs?.bankable_ebitda ? <div className="dscr-provenance"><span>Bankable EBITDA <b>{formatValue(Number(intelligence.data.dscr_inputs.bankable_ebitda), "USD")}</b></span><span>Annual debt service <b>{formatValue(Number(intelligence.data.dscr_inputs.annual_debt_service), "USD")}</b></span><span>Target <b>{Number(intelligence.data.dscr_inputs.target).toFixed(2)}x</b></span><span>Floor <b>{Number(intelligence.data.dscr_inputs.floor).toFixed(2)}x</b></span></div> : null}
  </section>;
}
