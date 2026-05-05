"use client";

import { useMemo } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel, Sparkline } from "@/components/design-system/primitives";
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

export default function ReportsPage() {
  const { t } = useTheme();
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
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>Reports</h1>
        <Pill>{loans.length} loans</Pill>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <KPI
          label="Funded YTD"
          value={report ? QC_FMT.short(report.funded_ytd) : "—"}
          delta={report?.funded_ytd_delta ?? undefined}
          sub="vs prior year"
          icon="dollar"
          accent={t.profit}
        />
        <KPI
          label="Pipeline"
          value={report ? QC_FMT.short(report.pipeline_value) : "—"}
          sub={report ? `${report.pipeline_count} active loans` : undefined}
          icon="layers"
        />
        <KPI
          label="Avg DSCR"
          value={avgDscr ? avgDscr.toFixed(2) : "—"}
          sub={`${loans.filter((l) => l.dscr != null).length} loans w/ DSCR`}
          icon="audit"
        />
        <KPI
          label="Pull-through"
          value={pullPct != null ? `${pullPct}%` : "—"}
          delta={
            report?.pull_through_delta != null
              ? Math.round(report.pull_through_delta * 100)
              : undefined
          }
          sub="all time"
          icon="trend"
        />
      </div>

      {/* Trend charts (SVG sparklines, no recharts dep) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card pad={16}>
          <SectionLabel>Funded volume · 12 months</SectionLabel>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"' }}>
              {report ? QC_FMT.short(report.funded_ytd) : "—"}
            </div>
            <div style={{ fontSize: 12, color: t.ink3, paddingBottom: 6 }}>YTD</div>
          </div>
          <div style={{ marginTop: 8 }}>
            <Sparkline data={monthlyFunded} color={t.profit} width={520} height={80} fill />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(12, 1fr)",
              marginTop: 6,
              fontSize: 9,
              color: t.ink3,
              textAlign: "center",
            }}
          >
            {["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].map((m, i) => (
              <div key={i}>{m}</div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: t.ink3, marginTop: 8 }}>
            Curve reflects YTD funded distributed across 12 months (smoothed). A real
            month-by-month series will replace this once the timeseries endpoint ships.
          </div>
        </Card>

        <Card pad={16}>
          <SectionLabel>Stage health</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {byStage.length === 0 && (
              <div style={{ fontSize: 12.5, color: t.ink3 }}>No loans to break down yet.</div>
            )}
            {byStage.map((row, i) => (
              <div key={row.stage} style={{ display: "grid", gridTemplateColumns: "140px 50px 1fr 90px", gap: 10, alignItems: "center" }}>
                <div style={{ fontSize: 12, color: t.ink2, fontWeight: 600 }}>{STAGE_LABELS[i]}</div>
                <div style={{ fontSize: 12, color: t.ink, fontWeight: 800, fontFeatureSettings: '"tnum"' }}>{row.count}</div>
                <div style={{ height: 6, background: t.line, borderRadius: 999, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${(row.value / maxStage) * 100}%`,
                      height: "100%",
                      background: i === 5 ? t.profit : i === 4 ? t.warn : t.petrol,
                    }}
                  />
                </div>
                <div style={{ fontSize: 11.5, color: t.ink2, textAlign: "right", fontWeight: 700, fontFeatureSettings: '"tnum"' }}>
                  {QC_FMT.short(row.value)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Type distribution */}
      <Card pad={16}>
        <SectionLabel>By loan type</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {byType.map((row) => (
            <div key={row.type} style={{ padding: 12, borderRadius: 9, border: `1px solid ${t.line}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.ink2 }}>
                  {TYPE_LABELS[row.type] ?? row.type}
                </div>
                <div style={{ fontSize: 11, color: t.ink3 }}>
                  {row.count} loan{row.count > 1 ? "s" : ""}
                </div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"', marginTop: 2 }}>
                {QC_FMT.short(row.value)}
              </div>
              <div style={{ height: 6, background: t.line, borderRadius: 999, marginTop: 8, overflow: "hidden" }}>
                <div style={{ width: `${(row.value / maxType) * 100}%`, height: "100%", background: t.brand }} />
              </div>
            </div>
          ))}
          {byType.length === 0 && <div style={{ fontSize: 13, color: t.ink3 }}>No loans yet to break down.</div>}
        </div>
      </Card>
    </div>
  );
}
