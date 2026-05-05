"use client";

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { useRates } from "@/hooks/useApi";
import { LoanTypeOptions } from "@/lib/enums.generated";

export default function RatesPage() {
  const { t } = useTheme();
  const { data: rates = [], isLoading } = useRates();
  const [filter, setFilter] = useState<string>("all");

  const filtered = filter === "all" ? rates : rates.filter((r) => r.loan_type === filter);

  const deltaColor = (bps: number) => bps < 0 ? t.profit : bps > 0 ? t.danger : t.ink3;
  const deltaLabel = (bps: number) => `${bps > 0 ? "+" : ""}${bps} bps`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>Rate sheet</h1>
        <Pill>{filtered.length} SKUs</Pill>
        <div style={{ flex: 1 }} />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            padding: "8px 10px", borderRadius: 8, background: t.surface, border: `1px solid ${t.line}`,
            fontSize: 12.5, color: t.ink2, fontFamily: "inherit",
          }}
        >
          <option value="all">All loan types</option>
          {LoanTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <Card pad={0}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) 110px 80px 90px 90px 90px 90px",
          padding: "12px 16px", fontSize: 11, fontWeight: 700, color: t.ink3,
          textTransform: "uppercase", letterSpacing: 1.2, borderBottom: `1px solid ${t.line}`,
        }}>
          <div>SKU</div>
          <div>Type</div>
          <div style={{ textAlign: "right" }}>Rate</div>
          <div style={{ textAlign: "right" }}>Points</div>
          <div style={{ textAlign: "right" }}>Min FICO</div>
          <div style={{ textAlign: "right" }}>Max LTV</div>
          <div style={{ textAlign: "right" }}>Δ vs y&apos;day</div>
        </div>
        {filtered.map((r) => (
          <div key={r.id} style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) 110px 80px 90px 90px 90px 90px",
            padding: "12px 16px", borderBottom: `1px solid ${t.line}`, alignItems: "center",
            fontSize: 13, color: t.ink,
          }}>
            <div>
              <div style={{ fontWeight: 700 }}>{r.label}</div>
              <div style={{ fontSize: 11, color: t.ink3, fontFamily: "ui-monospace, SF Mono, monospace" }}>{r.id}</div>
            </div>
            <div><Pill>{r.loan_type.replace(/_/g, " ")}</Pill></div>
            <div style={{ textAlign: "right", fontWeight: 800, fontFeatureSettings: '"tnum"' }}>{r.rate.toFixed(3)}%</div>
            <div style={{ textAlign: "right", fontFeatureSettings: '"tnum"' }}>{r.points.toFixed(2)}</div>
            <div style={{ textAlign: "right", fontFeatureSettings: '"tnum"' }}>{r.min_fico}</div>
            <div style={{ textAlign: "right", fontFeatureSettings: '"tnum"' }}>{(r.max_ltv * 100).toFixed(0)}%</div>
            <div style={{ textAlign: "right", fontFeatureSettings: '"tnum"', color: deltaColor(r.delta_bps), fontWeight: 700 }}>
              {deltaLabel(r.delta_bps)}
            </div>
          </div>
        ))}
        {!isLoading && filtered.length === 0 && (
          <div style={{ padding: 24, fontSize: 13, color: t.ink3 }}>No rates match this filter.</div>
        )}
        {isLoading && (
          <div style={{ padding: 24, fontSize: 13, color: t.ink3 }}>Loading rate sheet…</div>
        )}
      </Card>

      <Card pad={16}>
        <SectionLabel>How rates update</SectionLabel>
        <div style={{ fontSize: 12.5, color: t.ink2, lineHeight: 1.6 }}>
          Daily rate-sheet pull at 7:00 AM ET. Auto-publish triggers on swings under 25 bps; larger moves pause for super-admin review (configurable in Settings → Pricing).
        </div>
      </Card>
    </div>
  );
}
