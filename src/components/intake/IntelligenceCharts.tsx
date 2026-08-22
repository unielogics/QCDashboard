"use client";

// Shared chart/table rendering components for the underwriting intelligence
// board — the DSCR gauge, equity/LTV chart, cash-flow bars, annual/monthly bar
// charts, and evidence/missing/risk tables used by the admin Lead Cockpit and
// the broker portal.
//
// These render on the LIGHT institutional console (the admin/broker surfaces
// consume them inside a white V.surface panel), so the palette here is
// coloured from the CSS variables in globals.css. The two PUBLIC
// dark intake cockpits (dealer-ai-underwriter, funding-review) do NOT use these
// components — they keep their own local dark-cockpit chart code and import
// only CHART_COPY from this file. So recoloring here is safe for them.

import type { CSSProperties } from "react";
import { V, type CssVars } from "@/components/design-system/cssVars";
import type { QCTokens } from "@/components/design-system/tokens";
import type { IntelligenceModel, IntelligenceValue } from "@/lib/intake";
import type { Lang } from "@/lib/intakeCopy";

// Chart-chrome copy for the small set of hardcoded strings in this file.
// Defaults to English everywhere ("en" is the type default below and every
// component's `language` prop defaults to it) -- admin/broker call sites
// (Lead Cockpit, broker portal) intentionally never pass `language`, so this
// module renders in English there regardless of the underlying lead's
// preferred_language. Only the two client-facing intake pages pass their
// live language state. Not consent-bearing, so no per-string compliance flag.
export const CHART_COPY: Record<Lang, {
  awaitingEvidence: string;
  dscrRange: string;
  debtProposedLtv: string;
  equity: string;
  awaitingEvidenceMap: string;
  noEvidenceListed: string;
  noBlockingItems: string;
  awaitingReviewExtraction: string;
}> = {
  en: {
    awaitingEvidence: "Awaiting evidence",
    dscrRange: "0.00x - 3.00x",
    debtProposedLtv: "Debt / proposed LTV",
    equity: "Equity",
    awaitingEvidenceMap: "Awaiting AI evidence map.",
    noEvidenceListed: "No evidence listed yet.",
    noBlockingItems: "No blocking Stage 1 items listed in the latest screen.",
    awaitingReviewExtraction: "Awaiting review extraction.",
  },
  es: {
    awaitingEvidence: "Esperando evidencia",
    dscrRange: "0.00x - 3.00x",
    debtProposedLtv: "Deuda / LTV propuesto",
    equity: "Capital",
    awaitingEvidenceMap: "Esperando el mapa de evidencia de la IA.",
    noEvidenceListed: "Aún no hay evidencia registrada.",
    noBlockingItems: "No hay elementos bloqueantes de la Etapa 1 en la última evaluación.",
    awaitingReviewExtraction: "Esperando la extracción de la revisión.",
  },
};

// ---------------------------------------------------------------------------
// Small formatting helpers
// ---------------------------------------------------------------------------

export function formatMoneyCompactLocal(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
  return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// ---------------------------------------------------------------------------
// Theme-driven style bundle — every colour resolves through the design tokens.
// ---------------------------------------------------------------------------

// Layout-only chrome (no colour): safe to share as plain consts, and exported
// directly for the Lead Cockpit's grid/header scaffolding.
export const chartGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))",
  gap: 12,
};
export const chartHeader: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" };
export const intelligenceTables: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))", gap: 12 };

function chartStyles() {
  const card: CSSProperties = { border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface2, padding: 16, display: "grid", gap: 12, minWidth: 0, color: V.ink2 };
  const missing: CSSProperties = { border: `1px solid ${V.line}`, background: V.warnBg, color: V.warn, borderRadius: 999, padding: "7px 10px", fontSize: 12, fontWeight: 800 };
  const complete: CSSProperties = { ...missing, background: V.profitBg, color: V.profit };
  const status: CSSProperties = { border: `1px solid ${V.line}`, background: V.petrolSoft, color: V.petrol, borderRadius: 999, minHeight: 30, padding: "0 10px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" };
  const metric: CSSProperties = { ...status, background: V.surface2, color: V.ink2 };
  return {
    chartCard: card,
    chartCardWide: { ...card, gridColumn: "1 / -1" } as CSSProperties,
    chartEmptyState: { border: `1px dashed ${V.line}`, borderRadius: 14, minHeight: 110, display: "grid", placeItems: "center", textAlign: "center", padding: 14, color: V.ink3, lineHeight: 1.45 } as CSSProperties,
    intelligenceTable: { display: "grid", gap: 8 } as CSSProperties,
    intelligenceTableRow: { border: `1px solid ${V.line}`, borderRadius: 12, background: V.surface, padding: 10, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 6, alignItems: "start", color: V.ink2 } as CSSProperties,
    gaugeWrap: { display: "grid", justifyItems: "center", gap: 3, color: V.ink } as CSSProperties,
    gaugeSvg: { width: "min(260px, 100%)", height: 145, display: "block" } as CSSProperties,
    gaugeTrackStroke: V.line,
    gaugeNeedle: V.ink,
    equityChartWrap: { display: "grid", gap: 12 } as CSSProperties,
    equityTrack: { height: 22, borderRadius: 999, overflow: "hidden", background: V.line, display: "flex" } as CSSProperties,
    equityDebtFill: { height: "100%", background: `linear-gradient(90deg,${V.danger},${V.warn})`, transition: "width .3s ease" } as CSSProperties,
    equityValueFill: { height: "100%", background: `linear-gradient(90deg,${V.petrol},${V.profit})`, transition: "width .3s ease" } as CSSProperties,
    equityLegend: { display: "grid", gap: 6, color: V.ink3, fontSize: 12 } as CSSProperties,
    legendDebtDot: { display: "inline-block", width: 8, height: 8, borderRadius: 99, background: V.warn, marginRight: 6 } as CSSProperties,
    legendEquityDot: { display: "inline-block", width: 8, height: 8, borderRadius: 99, background: V.petrol, marginRight: 6 } as CSSProperties,
    cashFlowBarList: { display: "grid", gap: 12 } as CSSProperties,
    cashFlowBarRow: { display: "grid", gap: 6 } as CSSProperties,
    cashFlowBarLabel: { display: "flex", justifyContent: "space-between", gap: 12, color: V.ink2, fontSize: 13 } as CSSProperties,
    cashFlowTrack: { height: 9, borderRadius: 999, overflow: "hidden", background: V.line } as CSSProperties,
    cashFlowFill: { height: "100%", borderRadius: 999, transition: "width .3s ease" } as CSSProperties,
    cashFlowPos: V.petrol,
    cashFlowNeg: V.danger,
    miniChart: { height: 180, display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(32px,1fr)", gap: 8, alignItems: "end" } as CSSProperties,
    miniChartColumn: { height: "100%", display: "grid", gridTemplateRows: "1fr auto", gap: 8, justifyItems: "center", minWidth: 0, color: V.ink3, fontSize: 11 } as CSSProperties,
    miniChartBarWrap: { height: "100%", width: "100%", display: "flex", alignItems: "end", justifyContent: "center" } as CSSProperties,
    miniChartBar: { width: "72%", borderRadius: "10px 10px 2px 2px", background: `linear-gradient(180deg,${V.petrol},${V.gold})` } as CSSProperties,
    riskList: { display: "grid", gap: 8 } as CSSProperties,
    riskRow: { borderRadius: 12, padding: 10, background: V.warnBg, color: V.warn, border: `1px solid ${V.line}`, lineHeight: 1.35 } as CSSProperties,
    strengthRow: { borderRadius: 12, padding: 10, background: V.profitBg, color: V.profit, border: `1px solid ${V.line}`, lineHeight: 1.35 } as CSSProperties,
    kpiCard: { border: `1px solid ${V.line}`, borderRadius: 12, background: V.surface2, padding: 12, display: "grid", gap: 4, color: V.ink3, fontSize: 12 } as CSSProperties,
    kpiCardEmphasis: { border: `1px solid ${V.petrol}`, borderRadius: 12, background: V.petrolSoft, padding: 12, display: "grid", gap: 4, color: V.ink3, fontSize: 12 } as CSSProperties,
    kpiValue: { color: V.ink, fontSize: 15, fontWeight: 800 } as CSSProperties,
    kpiFooter: { display: "grid", gap: 5, alignContent: "end" } as CSSProperties,
    missingChip: missing,
    completeChip: complete,
    statusPill: status,
    metricPill: metric,
    verifiedSourcePill: { ...complete, padding: "4px 8px", fontSize: 10, textTransform: "uppercase" } as CSSProperties,
    extractedSourcePill: { ...status, minHeight: 0, padding: "4px 8px", fontSize: 10, textTransform: "uppercase" } as CSSProperties,
    estimatedSourcePill: { ...missing, padding: "4px 8px", fontSize: 10, textTransform: "uppercase" } as CSSProperties,
    unavailableSourcePill: { ...metric, minHeight: 0, padding: "4px 8px", fontSize: 10, textTransform: "uppercase" } as CSSProperties,
  };
}

type ChartStyles = ReturnType<typeof chartStyles>;

function sourcePill(s: ChartStyles, source: IntelligenceValue["source"]): CSSProperties {
  if (source === "verified") return s.verifiedSourcePill;
  if (source === "extracted") return s.extractedSourcePill;
  if (source === "estimated") return s.estimatedSourcePill;
  return s.unavailableSourcePill;
}

function coverageStyle(s: ChartStyles, status: string): CSSProperties {
  const normalized = status.toLowerCase();
  if (normalized.includes("satisfied")) return s.completeChip;
  if (normalized.includes("partial")) return s.estimatedSourcePill;
  if (normalized.includes("missing")) return s.missingChip;
  return s.unavailableSourcePill;
}

function priorityStyle(s: ChartStyles, priority: string): CSSProperties {
  const normalized = priority.toLowerCase();
  if (normalized.includes("high")) return s.missingChip;
  if (normalized.includes("low")) return s.completeChip;
  return s.estimatedSourcePill;
}

// Exported colour-bearing scaffolding for the Lead Cockpit (needs `t`).
export const chartCard = (): CSSProperties => chartStyles().chartCard;
export const chartCardWide = (): CSSProperties => chartStyles().chartCardWide;
export const chartEmptyState = (): CSSProperties => chartStyles().chartEmptyState;

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export function IntelligenceKpi({ metric, emphasis }: { metric: IntelligenceValue; emphasis?: boolean }) {
  const s = chartStyles();
  return (
    <div style={emphasis ? s.kpiCardEmphasis : s.kpiCard}>
      <span>{metric.label}</span>
      <strong style={s.kpiValue}>{metric.value}</strong>
      <div style={s.kpiFooter}>
        <span style={sourcePill(s, metric.source)}>{metric.source}</span>
        {metric.detail ? <small>{metric.detail}</small> : null}
      </div>
    </div>
  );
}

export function GaugeChart({ value, language = "en" }: { value: number | null | undefined; language?: Lang }) {
  const s = chartStyles();
  const cc = CHART_COPY[language];
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : null;
  const clamped = numeric === null ? 0 : Math.max(0, Math.min(numeric, 3));
  const angle = -90 + (clamped / 3) * 180;
  const x = 100 + 70 * Math.cos((angle * Math.PI) / 180);
  const y = 92 + 70 * Math.sin((angle * Math.PI) / 180);
  return (
    <div style={s.gaugeWrap}>
      <svg viewBox="0 0 200 120" style={s.gaugeSvg} aria-label="DSCR gauge">
        <path d="M30 92 A70 70 0 0 1 170 92" fill="none" stroke={s.gaugeTrackStroke} strokeWidth="16" strokeLinecap="round" />
        <path d="M30 92 A70 70 0 0 1 73 28" fill="none" stroke="var(--danger)" strokeWidth="16" strokeLinecap="round" />
        <path d="M73 28 A70 70 0 0 1 116 28" fill="none" stroke="var(--warn)" strokeWidth="16" strokeLinecap="round" />
        <path d="M116 28 A70 70 0 0 1 170 92" fill="none" stroke="var(--ok)" strokeWidth="16" strokeLinecap="round" />
        <line x1="100" y1="92" x2={x} y2={y} stroke={s.gaugeNeedle} strokeWidth="4" strokeLinecap="round" />
        <circle cx="100" cy="92" r="8" fill={s.gaugeNeedle} />
      </svg>
      <strong>{numeric === null ? cc.awaitingEvidence : `${numeric.toFixed(2)}x`}</strong>
      <span>{cc.dscrRange}</span>
    </div>
  );
}

export function EquityChart({ equity, ltv, language = "en" }: { equity: number | null | undefined; ltv: number | null | undefined; language?: Lang }) {
  const s = chartStyles();
  const cc = CHART_COPY[language];
  const ltvPct = typeof ltv === "number" && Number.isFinite(ltv) ? Math.max(0, Math.min(ltv, 100)) : null;
  const equityPct = ltvPct === null ? null : Math.max(0, 100 - ltvPct);
  return (
    <div style={s.equityChartWrap}>
      <div style={s.equityTrack}>
        {/* Widths are the data. */}
        <div style={{ ...s.equityDebtFill, width: `${ltvPct ?? 0}%` }} />
        <div style={{ ...s.equityValueFill, width: `${equityPct ?? 0}%` }} />
      </div>
      <div style={s.equityLegend}>
        <span><b style={s.legendDebtDot} /> {cc.debtProposedLtv} {ltvPct === null ? "—" : `${ltvPct.toFixed(1)}%`}</span>
        <span><b style={s.legendEquityDot} /> {cc.equity} {typeof equity === "number" ? formatMoneyCompactLocal(equity) : cc.awaitingEvidence}</span>
      </div>
    </div>
  );
}

export function CashFlowBars({ bars, language = "en" }: { bars: IntelligenceModel["cashFlowBars"]; language?: Lang }) {
  const s = chartStyles();
  const cc = CHART_COPY[language];
  const max = Math.max(...bars.map((bar) => Math.abs(bar.value || 0)), 1);
  return (
    <div style={s.cashFlowBarList}>
      {bars.map((bar) => {
        const value = typeof bar.value === "number" && Number.isFinite(bar.value) ? bar.value : null;
        const width = value === null ? 0 : Math.max(4, Math.min(100, (Math.abs(value) / max) * 100));
        return (
          <div key={bar.label} style={s.cashFlowBarRow}>
            <div style={s.cashFlowBarLabel}>
              <span>{bar.label}</span>
              <strong>{value === null ? cc.awaitingEvidence : formatMoneyCompactLocal(value)}</strong>
            </div>
            <div style={s.cashFlowTrack}>
              {/* Width and tone are both derived from the bar's value. */}
              <div style={{ ...s.cashFlowFill, width: `${width}%`, background: value !== null && value < 0 ? s.cashFlowNeg : s.cashFlowPos }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MiniBarChart({ series, emptyLabel }: { series: Array<{ label: string; value: number | null }>; emptyLabel: string }) {
  const s = chartStyles();
  const valid = series.filter((item) => typeof item.value === "number" && Number.isFinite(item.value));
  if (!valid.length) return <div style={s.chartEmptyState}>{emptyLabel}</div>;
  const max = Math.max(...valid.map((item) => Math.abs(item.value || 0)), 1);
  return (
    <div style={s.miniChart}>
      {series.map((item) => {
        const value = typeof item.value === "number" && Number.isFinite(item.value) ? item.value : null;
        const height = value === null ? 8 : Math.max(12, Math.min(100, (Math.abs(value) / max) * 100));
        return (
          <div key={item.label} style={s.miniChartColumn}>
            <div style={s.miniChartBarWrap}>
              {/* Height is the data; the dim marks "no value at all". */}
              <div style={{ ...s.miniChartBar, height: `${height}%`, opacity: value === null ? 0.22 : 1 }} />
            </div>
            <span>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function EvidenceCoverageTable({ rows, language = "en" }: { rows: IntelligenceModel["coverage"]; language?: Lang }) {
  const s = chartStyles();
  const cc = CHART_COPY[language];
  if (!rows.length) return <div style={s.chartEmptyState}>{cc.awaitingEvidenceMap}</div>;
  return (
    <div style={s.intelligenceTable}>
      {rows.slice(0, 8).map((row) => (
        <div key={row.category} style={s.intelligenceTableRow}>
          <strong>{row.category}</strong>
          <span style={coverageStyle(s, row.status)}>{row.status}</span>
          <small>{row.evidence || row.gap || cc.noEvidenceListed}</small>
        </div>
      ))}
    </div>
  );
}

export function MissingTable({ rows, language = "en" }: { rows: IntelligenceModel["missing"]; language?: Lang }) {
  const s = chartStyles();
  const cc = CHART_COPY[language];
  if (!rows.length) return <div style={s.chartEmptyState}>{cc.noBlockingItems}</div>;
  return (
    <div style={s.intelligenceTable}>
      {rows.slice(0, 8).map((row) => (
        <div key={`${row.title}-${row.priority}`} style={s.intelligenceTableRow}>
          <strong>{row.title}</strong>
          <span style={priorityStyle(s, row.priority)}>{row.priority || "open"}</span>
          <small>{row.detail}</small>
        </div>
      ))}
    </div>
  );
}

export function RiskStrengthTable({ title, rows, tone, language = "en" }: { title: string; rows: string[]; tone: "green" | "amber"; language?: Lang }) {
  const s = chartStyles();
  const cc = CHART_COPY[language];
  return (
    <div style={s.chartCard}>
      <div style={chartHeader}>
        <strong>{title}</strong>
        <span style={tone === "green" ? s.completeChip : s.missingChip}>{rows.length || 0}</span>
      </div>
      <div style={s.riskList}>
        {rows.length ? rows.slice(0, 7).map((row, index) => (
          <div key={`${title}-${index}`} style={tone === "green" ? s.strengthRow : s.riskRow}>{row}</div>
        )) : <div style={s.chartEmptyState}>{cc.awaitingReviewExtraction}</div>}
      </div>
    </div>
  );
}
