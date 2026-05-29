"use client";

// /admin/token-usage — super-admin AI token-spend report. Reads the
// ai_token_usage ledger via /lending-admin/token-usage/*. Spend per
// activity / file / AI agent / broker / model, over a date range.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, SectionLabel } from "@/components/design-system/primitives";
import { useCurrentUser } from "@/hooks/useApi";
import {
  useTokenUsageBreakdown,
  useTokenUsageSummary,
  useTokenUsageTimeseries,
  type TokenUsageDimension,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";

const DIMENSIONS: { key: TokenUsageDimension; label: string }[] = [
  { key: "activity", label: "By activity" },
  { key: "file", label: "By file" },
  { key: "agent", label: "By AI agent" },
  { key: "broker", label: "By broker" },
  { key: "model", label: "By model" },
];

const RANGES: { key: string; label: string; days: number }[] = [
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
];

function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}
function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function TokenUsagePage() {
  const { t } = useTheme();
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useCurrentUser();

  const [rangeDays, setRangeDays] = useState(30);
  const [dimension, setDimension] = useState<TokenUsageDimension>("activity");
  const from = useMemo(() => isoDaysAgo(rangeDays), [rangeDays]);

  const summary = useTokenUsageSummary(from);
  const breakdown = useTokenUsageBreakdown(dimension, from);
  const series = useTokenUsageTimeseries(from);

  useEffect(() => {
    if (!meLoading && me && me.role !== Role.SUPER_ADMIN && me.role !== Role.LOAN_EXEC) {
      router.replace("/");
    }
  }, [meLoading, me, router]);
  if (meLoading) {
    return (
      <Card pad={20}>
        <span style={{ color: t.ink3, fontSize: 13 }}>Loading…</span>
      </Card>
    );
  }
  if (me && me.role !== Role.SUPER_ADMIN && me.role !== Role.LOAN_EXEC) return null;

  const s = summary.data;
  const rows = breakdown.data ?? [];
  const points = series.data ?? [];
  const maxCost = Math.max(1, ...points.map((p) => p.cost_usd));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: t.ink }}>
            AI token usage
          </h1>
          <p style={{ fontSize: 13, color: t.ink3, margin: "6px 0 0", maxWidth: 620 }}>
            Every AI call is logged with what it cost and what it was for.
            Track spend per activity, file, AI agent, broker, and model.
          </p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRangeDays(r.days)}
              style={{
                padding: "7px 12px",
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                border: `1px solid ${rangeDays === r.days ? t.ink : t.lineStrong}`,
                background: rangeDays === r.days ? t.ink : t.surface,
                color: rangeDays === r.days ? t.inverse : t.ink2,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <KPI label="Est. cost" value={s ? fmtUsd(s.cost_usd) : "—"} />
        <KPI label="Total tokens" value={s ? fmtInt(s.total_tokens) : "—"} />
        <KPI label="Cache-hit %" value={s ? `${s.cache_hit_pct}%` : "—"} />
        <KPI label="AI calls" value={s ? fmtInt(s.calls) : "—"} />
      </div>

      {/* Daily spend bar */}
      <Card pad={18}>
        <SectionLabel>Daily spend</SectionLabel>
        {points.length === 0 ? (
          <div style={{ fontSize: 13, color: t.ink3, marginTop: 10 }}>
            No usage logged in this window yet.
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120, marginTop: 14 }}>
            {points.map((p) => (
              <div
                key={p.day}
                title={`${p.day}: ${fmtUsd(p.cost_usd)} · ${fmtInt(p.tokens)} tok`}
                style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 4 }}
              >
                <div
                  style={{
                    width: "100%",
                    maxWidth: 28,
                    height: `${Math.max(3, (p.cost_usd / maxCost) * 100)}%`,
                    background: t.petrol ?? t.ink,
                    borderRadius: 4,
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Breakdown */}
      <Card pad={18}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {DIMENSIONS.map((d) => (
            <button
              key={d.key}
              onClick={() => setDimension(d.key)}
              style={{
                padding: "7px 12px",
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                border: `1px solid ${dimension === d.key ? t.ink : t.lineStrong}`,
                background: dimension === d.key ? t.ink : t.surface,
                color: dimension === d.key ? t.inverse : t.ink2,
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <div style={{ fontSize: 13, color: t.ink3 }}>Nothing in this window.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: t.ink3, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
                <th style={{ padding: "6px 8px" }}>{DIMENSIONS.find((d) => d.key === dimension)?.label.replace("By ", "")}</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Calls</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Tokens</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} style={{ borderTop: `1px solid ${t.line}` }}>
                  <td style={{ padding: "8px", color: t.ink, fontWeight: 600 }}>
                    {r.label.replace(/_/g, " ")}
                  </td>
                  <td style={{ padding: "8px", textAlign: "right", color: t.ink3 }}>{fmtInt(r.calls)}</td>
                  <td style={{ padding: "8px", textAlign: "right", color: t.ink3 }}>{fmtInt(r.tokens)}</td>
                  <td style={{ padding: "8px", textAlign: "right", color: t.ink, fontWeight: 700 }}>{fmtUsd(r.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
