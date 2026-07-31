"use client";

// Shared chart/table rendering components for the underwriting intelligence
// board — extracted from dealer-ai-underwriter/page.tsx so the same DSCR
// gauge, equity/LTV chart, cash-flow bars, annual/monthly bar charts, and
// evidence/missing/risk tables can be reused by the admin Lead Cockpit and
// the broker portal, not just the public dealer intake page. Pure
// presentational components — no fetching, no theme-provider dependency (the
// dark analytic-widget palette below is intentional and self-contained, the
// same "dark cockpit tile on a light shell" pattern already used elsewhere
// in this app).

import type { CSSProperties } from "react";
import type { IntelligenceModel, IntelligenceValue } from "@/lib/intake";

// ---------------------------------------------------------------------------
// Small formatting/style helpers
// ---------------------------------------------------------------------------

export function formatMoneyCompactLocal(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
  return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function metricSourcePill(source: IntelligenceValue["source"]): CSSProperties {
  if (source === "verified") return verifiedSourcePill;
  if (source === "extracted") return extractedSourcePill;
  if (source === "estimated") return estimatedSourcePill;
  return unavailableSourcePill;
}

export function coverageStatusStyle(status: string): CSSProperties {
  const normalized = status.toLowerCase();
  if (normalized.includes("satisfied")) return completeChip;
  if (normalized.includes("partial")) return estimatedSourcePill;
  if (normalized.includes("missing")) return missingChip;
  return unavailableSourcePill;
}

export function priorityPill(priority: string): CSSProperties {
  const normalized = priority.toLowerCase();
  if (normalized.includes("high")) return missingChip;
  if (normalized.includes("low")) return completeChip;
  return estimatedSourcePill;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export function IntelligenceKpi({ metric, emphasis }: { metric: IntelligenceValue; emphasis?: boolean }) {
  return (
    <div style={emphasis ? kpiCardEmphasis : kpiCard}>
      <span>{metric.label}</span>
      <strong>{metric.value}</strong>
      <div style={kpiFooter}>
        <span style={metricSourcePill(metric.source)}>{metric.source}</span>
        {metric.detail ? <small>{metric.detail}</small> : null}
      </div>
    </div>
  );
}

export function GaugeChart({ value }: { value: number | null | undefined }) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : null;
  const clamped = numeric === null ? 0 : Math.max(0, Math.min(numeric, 3));
  const angle = -90 + (clamped / 3) * 180;
  const x = 100 + 70 * Math.cos((angle * Math.PI) / 180);
  const y = 92 + 70 * Math.sin((angle * Math.PI) / 180);
  return (
    <div style={gaugeWrap}>
      <svg viewBox="0 0 200 120" style={gaugeSvg} aria-label="DSCR gauge">
        <path d="M30 92 A70 70 0 0 1 170 92" fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="16" strokeLinecap="round" />
        <path d="M30 92 A70 70 0 0 1 73 28" fill="none" stroke="#EF4444" strokeWidth="16" strokeLinecap="round" />
        <path d="M73 28 A70 70 0 0 1 116 28" fill="none" stroke="#F59E0B" strokeWidth="16" strokeLinecap="round" />
        <path d="M116 28 A70 70 0 0 1 170 92" fill="none" stroke="#34D399" strokeWidth="16" strokeLinecap="round" />
        <line x1="100" y1="92" x2={x} y2={y} stroke="#F8FAFC" strokeWidth="4" strokeLinecap="round" />
        <circle cx="100" cy="92" r="8" fill="#F8FAFC" />
      </svg>
      <strong>{numeric === null ? "Awaiting evidence" : `${numeric.toFixed(2)}x`}</strong>
      <span>0.00x - 3.00x</span>
    </div>
  );
}

export function EquityChart({ equity, ltv }: { equity: number | null | undefined; ltv: number | null | undefined }) {
  const ltvPct = typeof ltv === "number" && Number.isFinite(ltv) ? Math.max(0, Math.min(ltv, 100)) : null;
  const equityPct = ltvPct === null ? null : Math.max(0, 100 - ltvPct);
  return (
    <div style={equityChartWrap}>
      <div style={equityTrack}>
        <div style={{ ...equityDebtFill, width: `${ltvPct ?? 0}%` }} />
        <div style={{ ...equityValueFill, width: `${equityPct ?? 0}%` }} />
      </div>
      <div style={equityLegend}>
        <span><b style={legendDebtDot} /> Debt / proposed LTV {ltvPct === null ? "—" : `${ltvPct.toFixed(1)}%`}</span>
        <span><b style={legendEquityDot} /> Equity {typeof equity === "number" ? formatMoneyCompactLocal(equity) : "Awaiting evidence"}</span>
      </div>
    </div>
  );
}

export function CashFlowBars({ bars }: { bars: IntelligenceModel["cashFlowBars"] }) {
  const max = Math.max(...bars.map((bar) => Math.abs(bar.value || 0)), 1);
  return (
    <div style={cashFlowBarList}>
      {bars.map((bar) => {
        const value = typeof bar.value === "number" && Number.isFinite(bar.value) ? bar.value : null;
        const width = value === null ? 0 : Math.max(4, Math.min(100, (Math.abs(value) / max) * 100));
        return (
          <div key={bar.label} style={cashFlowBarRow}>
            <div style={cashFlowBarLabel}>
              <span>{bar.label}</span>
              <strong>{value === null ? "Awaiting evidence" : formatMoneyCompactLocal(value)}</strong>
            </div>
            <div style={cashFlowTrack}>
              <div style={{ ...cashFlowFill, width: `${width}%`, background: value !== null && value < 0 ? "#EF4444" : "#21D3C7" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MiniBarChart({ series, emptyLabel }: { series: Array<{ label: string; value: number | null }>; emptyLabel: string }) {
  const valid = series.filter((item) => typeof item.value === "number" && Number.isFinite(item.value));
  if (!valid.length) return <div style={chartEmptyState}>{emptyLabel}</div>;
  const max = Math.max(...valid.map((item) => Math.abs(item.value || 0)), 1);
  return (
    <div style={miniChart}>
      {series.map((item) => {
        const value = typeof item.value === "number" && Number.isFinite(item.value) ? item.value : null;
        const height = value === null ? 8 : Math.max(12, Math.min(100, (Math.abs(value) / max) * 100));
        return (
          <div key={item.label} style={miniChartColumn}>
            <div style={miniChartBarWrap}>
              <div style={{ ...miniChartBar, height: `${height}%`, opacity: value === null ? 0.22 : 1 }} />
            </div>
            <span>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function EvidenceCoverageTable({ rows }: { rows: IntelligenceModel["coverage"] }) {
  if (!rows.length) return <div style={chartEmptyState}>Awaiting AI evidence map.</div>;
  return (
    <div style={intelligenceTable}>
      {rows.slice(0, 8).map((row) => (
        <div key={row.category} style={intelligenceTableRow}>
          <strong>{row.category}</strong>
          <span style={coverageStatusStyle(row.status)}>{row.status}</span>
          <small>{row.evidence || row.gap || "No evidence listed yet."}</small>
        </div>
      ))}
    </div>
  );
}

export function MissingTable({ rows }: { rows: IntelligenceModel["missing"] }) {
  if (!rows.length) return <div style={chartEmptyState}>No blocking Stage 1 items listed in the latest screen.</div>;
  return (
    <div style={intelligenceTable}>
      {rows.slice(0, 8).map((row) => (
        <div key={`${row.title}-${row.priority}`} style={intelligenceTableRow}>
          <strong>{row.title}</strong>
          <span style={priorityPill(row.priority)}>{row.priority || "open"}</span>
          <small>{row.detail}</small>
        </div>
      ))}
    </div>
  );
}

export function RiskStrengthTable({ title, rows, tone }: { title: string; rows: string[]; tone: "green" | "amber" }) {
  return (
    <div style={chartCard}>
      <div style={chartHeader}>
        <strong>{title}</strong>
        <span style={tone === "green" ? completeChip : missingChip}>{rows.length || 0}</span>
      </div>
      <div style={riskList}>
        {rows.length ? rows.slice(0, 7).map((row, index) => (
          <div key={`${title}-${index}`} style={tone === "green" ? strengthRow : riskRow}>{row}</div>
        )) : <div style={chartEmptyState}>Awaiting review extraction.</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles — dark analytic-widget palette, self-contained (not theme-driven).
// ---------------------------------------------------------------------------

export const chartGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))",
  gap: 12,
};
export const chartCard: CSSProperties = {
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 18,
  background: "rgba(255,255,255,.035)",
  padding: 16,
  display: "grid",
  gap: 12,
  minWidth: 0,
};
export const chartCardWide: CSSProperties = { ...chartCard, gridColumn: "1 / -1" };
export const chartHeader: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" };
const gaugeWrap: CSSProperties = { display: "grid", justifyItems: "center", gap: 3, color: "#D9E5F5" };
const gaugeSvg: CSSProperties = { width: "min(260px, 100%)", height: 145, display: "block" };
const equityChartWrap: CSSProperties = { display: "grid", gap: 12 };
const equityTrack: CSSProperties = {
  height: 22,
  borderRadius: 999,
  overflow: "hidden",
  background: "rgba(255,255,255,.08)",
  display: "flex",
};
const equityDebtFill: CSSProperties = { height: "100%", background: "linear-gradient(90deg,#EF4444,#F59E0B)", transition: "width .3s ease" };
const equityValueFill: CSSProperties = { height: "100%", background: "linear-gradient(90deg,#21D3C7,#34D399)", transition: "width .3s ease" };
const equityLegend: CSSProperties = { display: "grid", gap: 6, color: "#AEBBD0", fontSize: 12 };
const legendDebtDot: CSSProperties = { display: "inline-block", width: 8, height: 8, borderRadius: 99, background: "#F59E0B", marginRight: 6 };
const legendEquityDot: CSSProperties = { ...legendDebtDot, background: "#21D3C7" };
const cashFlowBarList: CSSProperties = { display: "grid", gap: 12 };
const cashFlowBarRow: CSSProperties = { display: "grid", gap: 6 };
const cashFlowBarLabel: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, color: "#D9E5F5", fontSize: 13 };
const cashFlowTrack: CSSProperties = { height: 9, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,.08)" };
const cashFlowFill: CSSProperties = { height: "100%", borderRadius: 999, transition: "width .3s ease" };
const miniChart: CSSProperties = { height: 180, display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(32px,1fr)", gap: 8, alignItems: "end" };
const miniChartColumn: CSSProperties = { height: "100%", display: "grid", gridTemplateRows: "1fr auto", gap: 8, justifyItems: "center", minWidth: 0, color: "#8FA0B8", fontSize: 11 };
const miniChartBarWrap: CSSProperties = { height: "100%", width: "100%", display: "flex", alignItems: "end", justifyContent: "center" };
const miniChartBar: CSSProperties = { width: "72%", borderRadius: "10px 10px 2px 2px", background: "linear-gradient(180deg,#21D3C7,#D4AF37)" };
export const chartEmptyState: CSSProperties = {
  border: "1px dashed rgba(255,255,255,.13)",
  borderRadius: 14,
  minHeight: 110,
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  padding: 14,
  color: "#9DABC0",
  lineHeight: 1.45,
};
export const intelligenceTables: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))", gap: 12 };
const intelligenceTable: CSSProperties = { display: "grid", gap: 8 };
const intelligenceTableRow: CSSProperties = {
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 12,
  background: "rgba(0,0,0,.14)",
  padding: 10,
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) auto",
  gap: 6,
  alignItems: "start",
};
const riskList: CSSProperties = { display: "grid", gap: 8 };
const riskRow: CSSProperties = { borderRadius: 12, padding: 10, background: "rgba(212,175,55,.08)", color: "#F6E7A6", border: "1px solid rgba(212,175,55,.18)", lineHeight: 1.35 };
const strengthRow: CSSProperties = { ...riskRow, background: "rgba(33,211,199,.08)", color: "#BFFCF7", border: "1px solid rgba(33,211,199,.18)" };

const kpiCard: CSSProperties = {
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 14,
  background: "rgba(255,255,255,.035)",
  padding: 12,
  display: "grid",
  gap: 4,
  color: "#D9E5F5",
  fontSize: 12,
};
const kpiCardEmphasis: CSSProperties = { ...kpiCard, border: "1px solid rgba(33,211,199,.35)", background: "rgba(33,211,199,.06)" };
const kpiFooter: CSSProperties = { display: "grid", gap: 5, alignContent: "end" };

const missingChip: CSSProperties = {
  border: "1px solid rgba(212,175,55,.25)",
  background: "rgba(212,175,55,.08)",
  color: "#F6E7A6",
  borderRadius: 999,
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 800,
};
const completeChip: CSSProperties = {
  ...missingChip,
  border: "1px solid rgba(33,211,199,.28)",
  background: "rgba(33,211,199,.08)",
  color: "#A7F3D0",
};
const statusPill: CSSProperties = {
  border: "1px solid rgba(33,211,199,.25)",
  background: "rgba(33,211,199,.10)",
  color: "#BFFCF7",
  borderRadius: 999,
  minHeight: 30,
  padding: "0 10px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
};
const metricPill: CSSProperties = {
  ...statusPill,
  borderColor: "rgba(255,255,255,.12)",
  background: "rgba(255,255,255,.05)",
  color: "#D9E5F5",
};
const verifiedSourcePill: CSSProperties = { ...completeChip, padding: "4px 8px", fontSize: 10, textTransform: "uppercase" };
const extractedSourcePill: CSSProperties = { ...statusPill, minHeight: 0, padding: "4px 8px", fontSize: 10, textTransform: "uppercase" };
const estimatedSourcePill: CSSProperties = { ...missingChip, padding: "4px 8px", fontSize: 10, textTransform: "uppercase" };
const unavailableSourcePill: CSSProperties = { ...metricPill, minHeight: 0, padding: "4px 8px", fontSize: 10, textTransform: "uppercase" };
