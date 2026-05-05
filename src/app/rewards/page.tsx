"use client";

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { useBrokerLeaderboard } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";

export default function RewardsPage() {
  const { t } = useTheme();
  const { data: leaderboard = [] } = useBrokerLeaderboard();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>Rewards</h1>
        <Pill>Admin</Pill>
      </div>
      <Card pad={0}>
        <div style={{
          display: "grid", gridTemplateColumns: "60px minmax(0, 2fr) 100px 130px 100px",
          padding: "12px 16px", fontSize: 11, fontWeight: 700, color: t.ink3,
          textTransform: "uppercase", letterSpacing: 1.2, borderBottom: `1px solid ${t.line}`,
        }}>
          <div>#</div><div>Broker</div><div>Tier</div><div>Funded</div><div>Points</div>
        </div>
        {leaderboard.map((b: any) => (
          <div key={b.broker_id} style={{
            display: "grid", gridTemplateColumns: "60px minmax(0, 2fr) 100px 130px 100px",
            padding: "12px 16px", borderBottom: `1px solid ${t.line}`, fontSize: 13, alignItems: "center",
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: b.rank <= 3 ? t.gold : t.ink3 }}>#{b.rank}</div>
            <div style={{ fontWeight: 700 }}>{b.display_name}</div>
            <div><Pill bg={b.tier === "gold" ? t.goldSoft : b.tier === "platinum" ? t.brandSoft : t.chip} color={b.tier === "gold" ? t.gold : t.ink2}>{b.tier}</Pill></div>
            <div style={{ fontFeatureSettings: '"tnum"', fontWeight: 700 }}>{QC_FMT.short(Number(b.funded_total))}</div>
            <div style={{ fontFeatureSettings: '"tnum"' }}>{QC_FMT.num(b.lifetime_points)}</div>
          </div>
        ))}
      </Card>
      <Card pad={16}>
        <div style={{ fontSize: 12, color: t.ink3 }}>
          1 point per $1 of FUNDED loan amount (only when wired). Award/clawback rules pending business clarification — schema is in place.
        </div>
      </Card>
    </div>
  );
}
