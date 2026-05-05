"use client";

import { useEffect } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useClient, useRecalc } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";
import type { Loan } from "@/lib/types";

export function UnderwritingTab({ loan }: { loan: Loan }) {
  const { t } = useTheme();
  const recalc = useRecalc();
  const { data: client } = useClient(loan.client_id);

  // Auto-recalc on mount so we can show warnings
  useEffect(() => {
    if (!recalc.data && !recalc.isPending) {
      recalc.mutate({ loanId: loan.id, discount_points: loan.discount_points || 0 });
    }
  }, [loan.id]);

  const score = loan.risk_score ?? 0;
  const ringColor = score >= 80 ? t.profit : score >= 70 ? t.warn : t.danger;
  const dashFraction = score / 100;
  const C = 2 * Math.PI * 46; // circumference for r=46
  const dash = `${C * dashFraction} ${C}`;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <Card pad={16}>
        <SectionLabel>Risk model</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ position: "relative", width: 110, height: 110, flexShrink: 0 }}>
            <svg width={110} height={110}>
              <circle cx={55} cy={55} r={46} fill="none" stroke={t.line} strokeWidth={10} />
              <circle cx={55} cy={55} r={46} fill="none" stroke={ringColor} strokeWidth={10}
                strokeDasharray={dash} strokeLinecap="round" transform="rotate(-90 55 55)" />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"' }}>{loan.risk_score ?? "—"}</div>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>Risk</div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: t.ink2, lineHeight: 1.6 }}>
              {score >= 80 ? "Auto-approve eligible. Strong borrower, clean comps." :
                score >= 70 ? "Manual review required." :
                "High-touch UW required. Multiple risk factors detected."}
            </div>
          </div>
        </div>
      </Card>

      <Card pad={16}>
        <SectionLabel>Borrower financials</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <KPI label="FICO" value={client?.fico ?? "—"} />
          <KPI label="Funded total" value={client ? QC_FMT.short(Number(client.funded_total)) : "—"} />
          <KPI label="Funded count" value={client?.funded_count ?? "—"} />
          <KPI label="Tier" value={client?.tier ?? "—"} />
        </div>
      </Card>

      <Card pad={16}>
        <SectionLabel>Validation warnings</SectionLabel>
        {recalc.isPending && <div style={{ fontSize: 12.5, color: t.ink3 }}>Running…</div>}
        {recalc.data?.warnings && recalc.data.warnings.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recalc.data.warnings.map((w) => (
              <div key={w.code} style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: 10, borderRadius: 9,
                background: w.severity === "block" ? t.dangerBg : t.warnBg,
                color: w.severity === "block" ? t.danger : t.warn,
              }}>
                <Icon name="bell" size={14} stroke={2.5} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{w.message}</div>
                  <div style={{ fontSize: 10.5, marginTop: 2, fontFamily: "ui-monospace, SF Mono, monospace", opacity: 0.75 }}>{w.code} · {w.severity}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: t.ink3 }}>No validation warnings — clean against lender matrix.</div>
        )}
      </Card>

      <Card pad={16}>
        <SectionLabel>Underwriting metrics</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Row t={t} label="LTV" value={loan.ltv ? `${(loan.ltv * 100).toFixed(1)}%` : "—"} />
          {loan.ltc && <Row t={t} label="LTC" value={`${(loan.ltc * 100).toFixed(1)}%`} />}
          {loan.arv && <Row t={t} label="ARV" value={QC_FMT.usd(Number(loan.arv))} />}
          <Row t={t} label="DSCR" value={loan.dscr ? loan.dscr.toFixed(2) : "—"} />
          {loan.monthly_rent && <Row t={t} label="Monthly rent" value={QC_FMT.usd(Number(loan.monthly_rent))} />}
          <Row t={t} label="Annual taxes" value={QC_FMT.usd(Number(loan.annual_taxes))} />
          <Row t={t} label="Annual insurance" value={QC_FMT.usd(Number(loan.annual_insurance))} />
        </div>
      </Card>
    </div>
  );
}

function Row({ t, label, value }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${t.line}` }}>
      <span style={{ fontSize: 12, color: t.ink3, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: t.ink, fontFeatureSettings: '"tnum"' }}>{value}</span>
    </div>
  );
}
