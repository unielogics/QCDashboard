"use client";

import { useTheme } from "@/components/design-system/ThemeProvider";
import type { DealHealth } from "@/lib/types";

const META: Record<DealHealth, { label: string; emoji: string }> = {
  on_track: { label: "On track", emoji: "🟢" },
  at_risk: { label: "At risk", emoji: "🟡" },
  stuck: { label: "Stuck", emoji: "🔴" },
};

export function DealHealthPill({ health }: { health: DealHealth | undefined }) {
  const { t } = useTheme();
  const value = (health ?? "on_track") as DealHealth;
  const m = META[value];
  const fg = value === "stuck" ? t.danger : value === "at_risk" ? t.warn : t.profit;
  const bg = value === "stuck" ? t.dangerBg : value === "at_risk" ? t.warnBg : t.profitBg;
  return (
    <span
      title="Deal health (Living Loan File)"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "3px 9px", borderRadius: 999,
        background: bg, color: fg,
        fontSize: 11, fontWeight: 800,
        textTransform: "uppercase", letterSpacing: 0.6,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: 11 }}>{m.emoji}</span> {m.label}
    </span>
  );
}
