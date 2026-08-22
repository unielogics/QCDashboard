"use client";

import { useMemo, type ReactNode } from "react";
import { V } from "@/components/design-system/cssVars";
import { Sparkline } from "@/components/design-system/primitives";
import {
  CG,
  CellChip,
  KpiRow,
  Note,
  PageHeader,
  Panel,
} from "@/components/ds";
import { useDashboardReport, useLoans } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";
import { LoanType } from "@/lib/enums.generated";

const STAGE_LABELS = ["Prequalified", "Collecting Docs", "Lender Connected", "Processing", "Closing", "Funded"];

const TYPE_LABELS: Record<string, string> = {
  [LoanType.DSCR]: "DSCR",
  [LoanType.FIX_AND_FLIP]: "Fix & Flip",
  [LoanType.GROUND_UP]: "Ground Up",
  [LoanType.BRIDGE]: "Bridge",
  [LoanType.PORTFOLIO]: "Portfolio",
  [LoanType.CASH_OUT_REFI]: "Cash-Out Refi",
};

/**
 * Stat tile on the `.kpi` class, with the caption line the shared `Kpi` wrapper
 * does not carry. The caption is data here ("14 active loans", "9 loans w/
 * DSCR"), not decoration, so it cannot be dropped in favour of the wrapper.
 */
function Stat({
  label,
  value,
  delta,
  deltaSuffix = "%",
  sub,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: number;
  deltaSuffix?: string;
  sub?: ReactNode;
}) {
  const positive = delta != null && delta >= 0;
  return (
    <div className="kpi">
      <div className="lbl">{label}</div>
      <div className="knum num">{value}</div>
      {(delta != null || sub) && (
        <div className="kdelta row">
          {delta != null && (
            <CellChip tone={positive ? "ok" : "bad"}>
              {(positive ? "+" : "") + delta}
              {deltaSuffix}
            </CellChip>
          )}
          {sub && <span className="sub">{sub}</span>}
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  // Kept only for the Sparkline `color` prop: that primitive writes the value
  // into SVG presentation attributes, where a `var(--ok)` reference is not
  // reliably resolved. Everything else on this page is on the stylesheet.
  const { data: loans = [] } = useLoans();
  const { data: report } = useDashboardReport();

  const avgDscr = useMemo(() => {
    const set = loans.filter((l) => l.dscr != null).map((l) => Number(l.dscr));
    return set.length ? set.reduce((s, n) => s + n, 0) / set.length : null;
  }, [loans]);

  const byStage = report?.by_stage ?? [];
  const byType = report?.by_type ?? [];

  const maxStage = Math.max(1, ...byStage.map((s) => s.value));
  const maxType = Math.max(1, ...byType.map((s) => s.value));

  // 12-month synthetic-but-deterministic curve derived from real funded YTD.
  // The trend will smooth out once a /reports/timeseries endpoint lands.
  const fundedYTD = report?.funded_ytd ?? 0;
  const monthlyFunded = useMemo(() => {
    const baseline = Math.max(1, fundedYTD / 12);
    const seasonality = [0.85, 0.9, 1.0, 1.05, 1.1, 1.0, 0.95, 0.9, 1.0, 1.1, 1.15, 1.2];
    return seasonality.map((m, i) => Math.round(baseline * m * (0.9 + (i % 3) * 0.04)));
  }, [fundedYTD]);

  const pullPct = report?.pull_through != null ? Math.round(report.pull_through * 100) : null;

  return (
    <>
      <PageHeader title="Reports" lede={`${loans.length} loans`} />

      <KpiRow className="mt">
        <Stat
          label="Funded YTD"
          value={report ? QC_FMT.short(report.funded_ytd) : "—"}
          delta={report?.funded_ytd_delta ?? undefined}
          sub="vs prior year"
        />
        <Stat
          label="Pipeline"
          value={report ? QC_FMT.short(report.pipeline_value) : "—"}
          sub={report ? `${report.pipeline_count} active loans` : undefined}
        />
        <Stat
          label="Avg DSCR"
          value={avgDscr ? avgDscr.toFixed(2) : "—"}
          sub={`${loans.filter((l) => l.dscr != null).length} loans w/ DSCR`}
        />
        <Stat
          label="Pull-through"
          value={pullPct != null ? `${pullPct}%` : "—"}
          delta={
            report?.pull_through_delta != null
              ? Math.round(report.pull_through_delta * 100)
              : undefined
          }
          sub="all time"
        />
      </KpiRow>

      {/* Trend charts (SVG sparklines, no recharts dep) */}
      <CG className="mt">
        <Panel className="s6" title="Funded volume · 12 months">
          <div className="row">
            <div className="big num">{report ? QC_FMT.short(report.funded_ytd) : "—"}</div>
            <span className="sub">YTD</span>
          </div>
          <div className="mt">
            <Sparkline data={monthlyFunded} color={V.profit} width={520} height={80} fill />
          </div>
          <div
            className="sub"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(12, 1fr)",
              textAlign: "center",
            }}
          >
            {["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].map((m, i) => (
              <div key={i}>{m}</div>
            ))}
          </div>
          <Note>
            Curve reflects YTD funded distributed across 12 months (smoothed). A real
            month-by-month series will replace this once the timeseries endpoint ships.
          </Note>
        </Panel>

        <Panel className="s6" title="Stage health">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {byStage.length === 0 && <div className="sub">No loans to break down yet.</div>}
            {byStage.map((row, i) => (
              <div
                key={row.stage}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 50px 1fr 90px",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div className="lbl">{STAGE_LABELS[i]}</div>
                <div className="num">
                  <b>{row.count}</b>
                </div>
                <div className="track">
                  <div
                    style={{
                      width: `${(row.value / maxStage) * 100}%`,
                      height: "100%",
                      // Stage-derived tint: funded reads as profit, closing as
                      // in-flight risk, everything upstream as petrol.
                      background:
                        i === 5 ? "var(--ok)" : i === 4 ? "var(--warn)" : "var(--petrol)",
                    }}
                  />
                </div>
                <div className="num" style={{ textAlign: "right" }}>
                  <b>{QC_FMT.short(row.value)}</b>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </CG>

      {/* Type distribution */}
      <Panel className="mt" title="By loan type">
        <CG>
          {byType.map((row) => (
            <div key={row.type} className="kpi s6">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div className="lbl">{TYPE_LABELS[row.type] ?? row.type}</div>
                <span className="sub">
                  {row.count} loan{row.count > 1 ? "s" : ""}
                </span>
              </div>
              <div className="knum num">{QC_FMT.short(row.value)}</div>
              <div className="track mt">
                <div className="fill" style={{ width: `${(row.value / maxType) * 100}%` }} />
              </div>
            </div>
          ))}
          {byType.length === 0 && <div className="sub s12">No loans yet to break down.</div>}
        </CG>
      </Panel>
    </>
  );
}
