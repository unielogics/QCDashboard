"use client";

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI } from "@/components/design-system/primitives";
import { useLoans } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";

export default function ReportsPage() {
  const { t } = useTheme();
  const { data: loans = [] } = useLoans();

  const fundedYTD = loans.filter((l) => l.stage === "funded").reduce((s, l) => s + Number(l.amount), 0);
  const pipelineValue = loans.filter((l) => l.stage !== "funded").reduce((s, l) => s + Number(l.amount), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>Reports</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <KPI label="Funded YTD" value={QC_FMT.short(fundedYTD)} delta={22.4} sub="vs 2025" />
        <KPI label="Pipeline" value={QC_FMT.short(pipelineValue)} sub={`${loans.length} loans`} />
        <KPI label="Avg DSCR" value={(loans.filter((l) => l.dscr).reduce((s, l) => s + Number(l.dscr), 0) / Math.max(1, loans.filter((l) => l.dscr).length)).toFixed(2)} />
        <KPI label="Pull-Through" value="78%" delta={4} />
      </div>
      <Card pad={20}>
        <div style={{ color: t.ink3, fontSize: 13 }}>Trend charts (Recharts) coming next pass.</div>
      </Card>
    </div>
  );
}
