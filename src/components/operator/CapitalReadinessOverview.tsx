"use client";

// Capital readiness across the loaded files: how many sit in each band, the
// median score, and what is blocking them. Read off the same file rows the
// dashboard already has, so it costs no request of its own. A lost or denied
// file has nothing left to prepare, so its blockers and milestones are not
// counted here.

import Link from "next/link";
import { CellChip } from "@/components/ds";
import { capitalReadinessBandLabel, capitalReadinessBandTone, listReadinessSummary } from "@/lib/capitalReadiness";
import { formatUnifiedAmount, isOpenFileRow, type UnifiedFileRow } from "@/lib/unifiedOperator";

export function CapitalReadinessOverview({ rows, locale }: { rows: UnifiedFileRow[]; locale: "en" | "es" }) {
  const byProfile = new Map<string, { row: UnifiedFileRow; summary: NonNullable<ReturnType<typeof listReadinessSummary>> }>();
  rows.forEach((row) => {
    if (!isOpenFileRow(row)) return;
    const summary = listReadinessSummary(row);
    if (!summary) return;
    const key = row.profile_id || row.id;
    if (!byProfile.has(key)) byProfile.set(key, { row, summary });
  });
  const entries = [...byProfile.values()];
  if (!entries.length) return null;
  const summaries = entries.map((entry) => entry.summary!);
  const counts = new Map<string, number>();
  const values = new Map<string, number>();
  summaries.forEach((item) => counts.set(item.band, (counts.get(item.band) ?? 0) + 1));
  entries.forEach(({ row, summary }) => values.set(summary!.band, (values.get(summary!.band) ?? 0) + Number(row.requested_amount ?? row.amount ?? 0)));
  const scores = summaries.map((item) => item.score).filter((score): score is number => score != null).sort((left, right) => left - right);
  const median = scores.length ? scores.length % 2
    ? scores[Math.floor(scores.length / 2)]
    : (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2
    : null;
  const bands = ["ready_soon", "three_to_six_months", "six_to_twelve_months", "one_plus_year"] as const;
  const es = locale === "es";
  const criticalBlockers = summaries.reduce((sum, item) => sum + Number(item.critical_blocker_count ?? 0), 0);
  const overdueMilestones = summaries.reduce((sum, item) => sum + Number(item.overdue_milestone_count ?? 0), 0);
  return (
    <section className="capital-readiness-dashboard" aria-label={es ? "Resumen de preparación de capital" : "Capital Readiness overview"}>
      <div className="dashboard-secondary-heading"><span className="lbl">{es ? "Preparación de capital" : "Capital Readiness"}</span><span className="sub">{es ? "Preparación financiera orientativa · separada de la documentación y las decisiones de crédito." : "Advisory financial preparation · separate from evidence completion and underwriting decisions."}</span></div>
      <div className="capital-readiness-dashboard-grid">
        {bands.map((band) => <Link href="/admin/ai-underwriter-leads" key={band}><CellChip tone={capitalReadinessBandTone(band)}>{capitalReadinessBandLabel(band, locale)}</CellChip><strong>{counts.get(band) ?? 0}</strong><span className="sub">{formatUnifiedAmount(values.get(band) ?? 0)} {es ? "solicitado" : "requested"}</span></Link>)}
        <div><span className="lbl">{es ? "Puntaje mediano" : "Median score"}</span><strong>{median == null ? "—" : Math.round(median)}</strong><span className="sub">{scores.length} {es ? "con puntaje" : "scored"} · {counts.get("insufficient_evidence") ?? 0} {es ? "requieren evidencia" : "need evidence"}</span></div>
        <div><span className="lbl">{es ? "Bloqueos críticos" : "Critical blockers"}</span><strong>{criticalBlockers}</strong><span className="sub">{es ? `En ${entries.length} expedientes cargados` : `Across ${entries.length} loaded files`}</span></div>
        <div><span className="lbl">{es ? "Hitos vencidos" : "Overdue milestones"}</span><strong>{overdueMilestones}</strong><span className="sub">{es ? "Solo expedientes cargados" : "Loaded files only"}</span></div>
      </div>
    </section>
  );
}
