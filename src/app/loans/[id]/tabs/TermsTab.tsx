"use client";

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn } from "@/components/design-system/buttons";
import { useRecalc } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";
import type { Loan } from "@/lib/types";

const COVENANTS = [
  { k: "rate_lock", label: "60-day rate lock" },
  { k: "prepay", label: "Prepayment penalty (3-2-1)" },
  { k: "interest", label: "Interest reserve" },
  { k: "recourse", label: "Full recourse" },
  { k: "release", label: "Partial release" },
  { k: "extension", label: "Extension option (6mo @ 25bps)" },
];

export function TermsTab({ loan }: { loan: Loan }) {
  const { t } = useTheme();
  const recalc = useRecalc();
  const [points, setPoints] = useState(loan.discount_points || 0);

  const handleRecalc = () => recalc.mutate({ loanId: loan.id, discount_points: points });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20 }}>
      <Card pad={20}>
        <SectionLabel>Buy down (HUD simulator)</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <input type="range" min={0} max={3} step={0.25} value={points} onChange={(e) => setPoints(Number(e.target.value))} style={{ flex: 1, accentColor: t.petrol }} />
          <div style={{ width: 80, textAlign: "right", fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"' }}>{points.toFixed(2)} pts</div>
          <button
            onClick={handleRecalc}
            disabled={recalc.isPending}
            style={{
              padding: "10px 14px", borderRadius: 10, background: t.brand, color: t.inverse,
              fontWeight: 700, fontSize: 13, border: "none", cursor: recalc.isPending ? "wait" : "pointer",
            }}
          >
            {recalc.isPending ? "…" : "Recalc"}
          </button>
        </div>

        <div style={{ height: 18 }} />
        <SectionLabel>Covenants & options</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          {COVENANTS.map((o) => (
            <label key={o.k} style={{
              display: "flex", alignItems: "center", gap: 10, padding: 10,
              border: `1px solid ${t.line}`, borderRadius: 9,
              fontSize: 12.5, color: t.ink, cursor: "pointer",
            }}>
              <input type="checkbox" defaultChecked={o.k === "rate_lock" || o.k === "recourse"} style={{ accentColor: t.petrol }} />
              {o.label}
            </label>
          ))}
        </div>
      </Card>

      <Card pad={16}>
        <SectionLabel>Pricing summary</SectionLabel>
        {recalc.data ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <KPI label="Final rate" value={`${(recalc.data.final_rate * 100).toFixed(3)}%`} />
            <KPI label="Monthly P&I" value={QC_FMT.usd(recalc.data.monthly_pi)} />
            <KPI label="DSCR" value={recalc.data.dscr ? recalc.data.dscr.toFixed(2) : "—"} />
            <KPI label="Cash to close (pricing)" value={QC_FMT.usd(recalc.data.cash_to_close_pricing)} />
            <KPI label="HUD total" value={QC_FMT.usd(recalc.data.hud_total)} />
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: t.ink3 }}>Move the slider and tap <strong>Recalc</strong> to preview pricing.</div>
        )}
        {recalc.data?.warnings && recalc.data.warnings.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {recalc.data.warnings.map((w) => (
              <div key={w.code} style={{
                padding: 10, borderRadius: 8,
                background: w.severity === "block" ? t.dangerBg : t.warnBg,
                color: w.severity === "block" ? t.danger : t.warn,
                fontSize: 11.5, fontWeight: 700,
              }}>
                {w.message}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button style={{ ...qcBtn(t), flex: 1, justifyContent: "center" }}><Icon name="bolt" size={13} /> Send term sheet</button>
        </div>
      </Card>
    </div>
  );
}
