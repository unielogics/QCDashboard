"use client";

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useBrokerLeaderboard } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";

const TABS = [
  { id: "leaderboard", label: "Leaderboard" },
  { id: "referrals", label: "Referrals" },
  { id: "redeem", label: "Redeem" },
  { id: "rules", label: "Rules" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const TIER_THRESHOLDS = [
  { name: "Bronze", min: 0, max: 5_000_000, color: "#A86A12" },
  { name: "Silver", min: 5_000_000, max: 15_000_000, color: "#92A1B5" },
  { name: "Gold", min: 15_000_000, max: 35_000_000, color: "#B98A2E" },
  { name: "Platinum", min: 35_000_000, max: Infinity, color: "#7B5BD9" },
];

export default function RewardsPage() {
  const { t } = useTheme();
  const { data: leaderboard = [] } = useBrokerLeaderboard();
  const [tab, setTab] = useState<TabId>("leaderboard");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>Rewards</h1>
        <Pill>Admin</Pill>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${t.line}` }}>
        {TABS.map((tabDef) => (
          <button
            key={tabDef.id}
            onClick={() => setTab(tabDef.id)}
            style={{
              padding: "10px 16px",
              borderBottom: `2px solid ${tab === tabDef.id ? t.brand : "transparent"}`,
              color: tab === tabDef.id ? t.ink : t.ink3,
              fontSize: 13, fontWeight: 700,
              background: "transparent", border: "none", cursor: "pointer",
            }}
          >
            {tabDef.label}
          </button>
        ))}
      </div>

      {tab === "leaderboard" && (
        <>
          <Card pad={0}>
            <div style={{
              display: "grid", gridTemplateColumns: "60px minmax(0, 2fr) 110px 130px 110px",
              padding: "12px 16px", fontSize: 11, fontWeight: 700, color: t.ink3,
              textTransform: "uppercase", letterSpacing: 1.2, borderBottom: `1px solid ${t.line}`,
            }}>
              <div>#</div><div>Broker</div><div>Tier</div><div>Funded</div><div>Points</div>
            </div>
            {leaderboard.map((b, i) => (
              <div key={b.id} style={{
                display: "grid", gridTemplateColumns: "60px minmax(0, 2fr) 110px 130px 110px",
                padding: "12px 16px", borderBottom: `1px solid ${t.line}`, fontSize: 13, alignItems: "center",
              }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: i < 3 ? t.gold : t.ink3 }}>#{i + 1}</div>
                <div style={{ fontWeight: 700, color: t.ink }}>{b.display_name}</div>
                <div><Pill bg={b.tier === "gold" ? t.goldSoft : b.tier === "platinum" ? t.brandSoft : t.chip} color={b.tier === "gold" ? t.gold : t.ink2}>{b.tier}</Pill></div>
                <div style={{ fontFeatureSettings: '"tnum"', fontWeight: 700, color: t.ink }}>{QC_FMT.short(Number(b.funded_total))}</div>
                <div style={{ fontFeatureSettings: '"tnum"', color: t.ink }}>{QC_FMT.num(b.lifetime_points)}</div>
              </div>
            ))}
            {leaderboard.length === 0 && (
              <div style={{ padding: 24, fontSize: 13, color: t.ink3 }}>No brokers yet.</div>
            )}
          </Card>

          <Card pad={16}>
            <SectionLabel>Tier benefits</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {TIER_THRESHOLDS.map((tier) => (
                <div key={tier.name} style={{ padding: 12, borderRadius: 10, border: `1px solid ${t.line}`, background: t.surface2 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: tier.color, letterSpacing: 1.2, textTransform: "uppercase" }}>{tier.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, marginTop: 4 }}>
                    {tier.max === Infinity ? `${QC_FMT.short(tier.min)}+` : `${QC_FMT.short(tier.min)} – ${QC_FMT.short(tier.max)}`}
                  </div>
                  <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 6, lineHeight: 1.5 }}>
                    {tier.name === "Bronze" && "Standard pricing, monthly digest."}
                    {tier.name === "Silver" && "+25 bps preferred pricing, priority underwriting queue."}
                    {tier.name === "Gold" && "+50 bps, dedicated AE, quarterly co-marketing budget."}
                    {tier.name === "Platinum" && "+75 bps, named UW, conference invites, custom rate sheet."}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {tab === "referrals" && <Stub t={t} icon="user" message="Referral approval queue & per-broker breakdown — coming soon." note="Backend referral model not yet finalized; the UI lands once /referrals ships." />}

      {tab === "redeem" && <Stub t={t} icon="rewards" message="Points redemption catalog — coming soon." note="Catalog (rate concessions, conference passes, co-marketing credits) ships once the backend catalog API is built." />}

      {tab === "rules" && (
        <Card pad={20}>
          <SectionLabel>Program rules</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
            <RulesBlock t={t} title="Earning" body="1 point per $1 of FUNDED loan amount. Points award when the loan transitions to FUNDED stage and the wire confirms. Cancellations/rescissions claw back the same points." />
            <RulesBlock t={t} title="Tier review" body="Tiers reset at the start of each calendar year using lifetime points from the prior 12 months. Manual overrides require super-admin approval." />
            <RulesBlock t={t} title="Referrals" body="Referrals received via a broker invite link auto-link to that broker. Self-signups citing a broker by name go to the super-admin queue for manual approval." />
            <RulesBlock t={t} title="Redemption" body="Approved redemptions deduct from balance_points immediately. Lifetime_points is never reduced — that's how tier eligibility is preserved across redemptions." />
          </div>
        </Card>
      )}
    </div>
  );
}

function Stub({ t, icon, message, note }: { t: ReturnType<typeof useTheme>["t"]; icon: string; message: string; note: string }) {
  return (
    <Card pad={32}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: 24, background: t.chip, display: "inline-flex", alignItems: "center", justifyContent: "center", color: t.ink3 }}>
          <Icon name={icon} size={22} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: t.ink }}>{message}</div>
        <div style={{ fontSize: 12, color: t.ink3, maxWidth: 540, lineHeight: 1.5 }}>{note}</div>
      </div>
    </Card>
  );
}

function RulesBlock({ t, title, body }: { t: ReturnType<typeof useTheme>["t"]; title: string; body: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: t.petrol, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: t.ink, lineHeight: 1.55 }}>{body}</div>
    </div>
  );
}
