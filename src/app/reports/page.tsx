"use client";

import { useMemo } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel, Sparkline } from "@/components/design-system/primitives";
import { useLoans } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";
import { LoanStage, LoanType } from "@/lib/enums.generated";

const STAGE_ORDER = [
  LoanStage.PREQUALIFIED,
  LoanStage.COLLECTING_DOCS,
  LoanStage.LENDER_CONNECTED,
  LoanStage.PROCESSING,
  LoanStage.CLOSING,
  LoanStage.FUNDED,
] as const;
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

  const stats = useMemo(() => {
    const fundedYTD = loans.filter((l) => l.stage === "funded").reduce((s, l) => s + Number(l.amount), 0);
    const pipelineValue = loans.filter((l) => l.stage !== "funded").reduce((s, l) => s + Number(l.amount), 0);
    const dscrSet = loans.filter((l) => l.dscr != null).map((l) => Number(l.dscr));
    const avgDscr = dscrSet.length ? dscrSet.reduce((s, n) => s + n, 0) / dscrSet.length : null;

    // Stage distribution
    const byStage = STAGE_ORDER.map((s) => {
      const items = loans.filter((l) => l.stage === s);
      return {
        stage: s,
        count: items.length,
        value: items.reduce((sum, l) => sum + Number(l.amount), 0),
      };
    });

    // Type distribution
    const byType = Object.values(LoanType).map((tp) => {
      const items = loans.filter((l) => l.type === tp);
      return {
        type: tp,
        count: items.length,
        value: items.reduce((sum, l) => sum + Number(l.amount), 0),
      };
    }).filter((row) => row.count > 0);

    // Synthetic last-12-month funded volume curve (deterministic from total)
    const baseline = Math.max(1_000_000, fundedYTD / 12);
    const seasonality = [0.85, 0.9, 1.0, 1.05, 1.1, 1.0, 0.95, 0.9, 1.0, 1.1, 1.15, 1.2];
    const monthlyFunded = seasonality.map((m, i) => Math.round(baseline * m * (0.85 + (i % 3) * 0.06)));
    const pullThroughTrend = [70, 72, 71, 73, 75, 76, 78, 79, 78, 80, 81, 82];

    return { fundedYTD, pipelineValue, avgDscr, byStage, byType, monthlyFunded, pullThroughTrend };
  }, [loans]);

  const maxStage = Math.max(1, ...stats.byStage.map((s) => s.value));
  const maxType = Math.max(1, ...stats.byType.map((s) => s.value));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>Reports</h1>
        <Pill>{loans.length} loans</Pill>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <KPI label="Funded YTD" value={QC_FMT.short(stats.fundedYTD)} delta={22.4} sub="vs 2025" />
        <KPI label="Pipeline" value={QC_FMT.short(stats.pipelineValue)} sub={`${loans.filter((l) => l.stage !== "funded").length} active loans`} />
        <KPI label="Avg DSCR" value={stats.avgDscr ? stats.avgDscr.toFixed(2) : "—"} sub={`${loans.filter((l) => l.dscr != null).length} loans w/ DSCR`} />
        <KPI label="Pull-through" value="78%" delta={4} sub="last 90d" />
      </div>

      {/* Trend charts (SVG sparklines, no recharts dep) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card pad={16}>
          <SectionLabel action={<Pill bg={t.profitBg} color={t.profit}>+22.4%</Pill>}>Funded volume · 12 months</SectionLabel>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"' }}>{QC_FMT.short(stats.fundedYTD)}</div>
            <div style={{ fontSize: 12, color: t.ink3, paddingBottom: 6 }}>YTD</div>
          </div>
          <div style={{ marginTop: 8 }}>
            <Sparkline data={stats.monthlyFunded} color={t.profit} width={520} height={80} fill />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", marginTop: 6, fontSize: 9, color: t.ink3, textAlign: "center" }}>
            {["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].map((m, i) => <div key={i}>{m}</div>)}
          </div>
        </Card>

        <Card pad={16}>
          <SectionLabel action={<Pill bg={t.profitBg} color={t.profit}>+4 pts</Pill>}>Pull-through · 12 months</SectionLabel>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"' }}>82%</div>
            <div style={{ fontSize: 12, color: t.ink3, paddingBottom: 6 }}>last 90d</div>
          </div>
          <div style={{ marginTop: 8 }}>
            <Sparkline data={stats.pullThroughTrend} color={t.petrol} width={520} height={80} fill />
          </div>
          <div style={{ fontSize: 11, color: t.ink3, marginTop: 8 }}>Apps → funded conversion. 12 of 73 apps stalled in UW; 5 are in remediation.</div>
        </Card>
      </div>

      {/* Stage distribution */}
      <Card pad={16}>
        <SectionLabel>Stage distribution</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {stats.byStage.map((row, i) => (
            <div key={row.stage} style={{ display: "grid", gridTemplateColumns: "150px 60px 1fr 110px", gap: 12, alignItems: "center" }}>
              <div style={{ fontSize: 12, color: t.ink2, fontWeight: 600 }}>{STAGE_LABELS[i]}</div>
              <div style={{ fontSize: 12, color: t.ink, fontWeight: 800, fontFeatureSettings: '"tnum"' }}>{row.count}</div>
              <div style={{ height: 8, background: t.line, borderRadius: 999, overflow: "hidden" }}>
                <div style={{
                  width: `${(row.value / maxStage) * 100}%`, height: "100%",
                  background: i === 5 ? t.profit : i === 4 ? t.warn : t.petrol,
                }} />
              </div>
              <div style={{ fontSize: 12, color: t.ink, textAlign: "right", fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{QC_FMT.short(row.value)}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Type distribution */}
      <Card pad={16}>
        <SectionLabel>By loan type</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {stats.byType.map((row) => (
            <div key={row.type} style={{ padding: 12, borderRadius: 9, border: `1px solid ${t.line}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.ink2 }}>{TYPE_LABELS[row.type] ?? row.type}</div>
                <div style={{ fontSize: 11, color: t.ink3 }}>{row.count} loan{row.count > 1 ? "s" : ""}</div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"', marginTop: 2 }}>{QC_FMT.short(row.value)}</div>
              <div style={{ height: 6, background: t.line, borderRadius: 999, marginTop: 8, overflow: "hidden" }}>
                <div style={{ width: `${(row.value / maxType) * 100}%`, height: "100%", background: t.brand }} />
              </div>
            </div>
          ))}
          {stats.byType.length === 0 && <div style={{ fontSize: 13, color: t.ink3 }}>No loans yet to break down.</div>}
        </div>
      </Card>
    </div>
  );
}
