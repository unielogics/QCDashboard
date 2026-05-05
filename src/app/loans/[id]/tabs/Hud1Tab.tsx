"use client";

// HUD-1 read-only view backed by the latest /loans/{id}/recalc HUD total.
// Full editable line items are queued on a separate /loans/{id}/hud endpoint
// per the plan; this tab gives operators today's snapshot.

import { useEffect } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, SectionLabel } from "@/components/design-system/primitives";
import { useRecalc } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";
import type { Loan } from "@/lib/types";

export function Hud1Tab({ loan }: { loan: Loan }) {
  const { t } = useTheme();
  const recalc = useRecalc();

  // Fetch a fresh snapshot when the tab mounts.
  useEffect(() => {
    if (!recalc.data && !recalc.isPending) {
      recalc.mutate({ loanId: loan.id, discount_points: loan.discount_points || 0 });
    }
  }, [loan.id]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
      <Card pad={0}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}`, fontSize: 13, fontWeight: 700, color: t.ink }}>
          HUD-1 Settlement Statement (Draft)
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
            Loan details
          </div>
          <Row t={t} label="Sale / project value" value={loan.ltv ? QC_FMT.usd(Math.round(Number(loan.amount) / Number(loan.ltv))) : "—"} />
          <Row t={t} label="Loan amount" value={QC_FMT.usd(Number(loan.amount))} bold />
          <Row t={t} label="Discount points" value={`${loan.discount_points} pts`} />
          <Row t={t} label="Origination" value={`${(loan.origination_pct * 100).toFixed(2)}%`} />

          <div style={{ height: 14 }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
            Pricing
          </div>
          <Row t={t} label="Base rate" value={loan.base_rate ? `${(loan.base_rate * 100).toFixed(3)}%` : "—"} />
          <Row t={t} label="Final rate" value={loan.final_rate ? `${(loan.final_rate * 100).toFixed(3)}%` : "—"} />
          <Row t={t} label="Term" value={loan.term_months ? `${loan.term_months} mo` : "—"} />

          <div style={{ height: 14 }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
            Holding costs (annual)
          </div>
          <Row t={t} label="Property taxes" value={QC_FMT.usd(Number(loan.annual_taxes))} />
          <Row t={t} label="Insurance" value={QC_FMT.usd(Number(loan.annual_insurance))} />
          <Row t={t} label="HOA (monthly)" value={QC_FMT.usd(Number(loan.monthly_hoa))} />

          <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: t.surface2 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4 }}>
              Estimated total fees + reserves
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"' }}>
              {recalc.data ? QC_FMT.usd(recalc.data.hud_total) : recalc.isPending ? "…" : "Tap Refresh to load"}
            </div>
          </div>
        </div>
      </Card>

      <Card pad={16}>
        <SectionLabel>Settlement summary</SectionLabel>
        {recalc.data ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <KPI label="Loan amount" value={QC_FMT.usd(Number(loan.amount))} />
            <KPI label="Total fees + reserves" value={QC_FMT.usd(recalc.data.hud_total)} />
            <KPI label="Final rate" value={`${(recalc.data.final_rate * 100).toFixed(3)}%`} />
            <KPI label="Cash to close (pricing)" value={QC_FMT.usd(recalc.data.cash_to_close_pricing)} />
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: t.ink3 }}>{recalc.isPending ? "Loading HUD draft…" : "No HUD draft yet."}</div>
        )}
        <button
          onClick={() => recalc.mutate({ loanId: loan.id, discount_points: loan.discount_points || 0 })}
          disabled={recalc.isPending}
          style={{
            marginTop: 14, width: "100%", padding: "10px 14px", borderRadius: 10,
            background: t.surface2, color: t.ink, border: `1px solid ${t.line}`,
            fontSize: 13, fontWeight: 700, cursor: recalc.isPending ? "wait" : "pointer",
          }}
        >
          {recalc.isPending ? "Refreshing…" : "Refresh HUD draft"}
        </button>
      </Card>
    </div>
  );
}

function Row({ t, label, value, bold }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${t.line}` }}>
      <span style={{ fontSize: 12.5, color: t.ink2, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: bold ? 16 : 13, fontWeight: bold ? 800 : 600, color: t.ink, fontFeatureSettings: '"tnum"' }}>{value}</span>
    </div>
  );
}
