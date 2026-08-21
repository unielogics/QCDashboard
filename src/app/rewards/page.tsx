"use client";

import { useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { useBrokerLeaderboard } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";
import {
  CG,
  Card,
  CellChip,
  Panel,
  Seg,
  Table,
  Tag,
  Td,
  Tr,
  type ChipTone,
  type Col,
} from "@/components/ds";

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

// The three-way tier distinction the old Pill carried (gold / platinum / rest),
// expressed in the chip tones instead of hand-mixed token pairs.
function tierTone(tier: string): ChipTone {
  return tier === "gold" ? "gold" : tier === "platinum" ? "acc" : "mut";
}

const LB_COLS: Col[] = [
  { label: "#", width: 72 },
  { label: "Broker" },
  { label: "Tier" },
  { label: "Funded", align: "r" },
  { label: "Points", align: "r" },
];

export default function RewardsPage() {
  const { data: leaderboard = [] } = useBrokerLeaderboard();
  const [tab, setTab] = useState<TabId>("leaderboard");

  return (
    <>
      <div className="hd">
        <h2>Rewards</h2>
        <Tag>Admin</Tag>
      </div>

      {/* Tabs */}
      <div className="pagebar">
        <Seg<TabId>
          value={tab}
          onChange={setTab}
          ariaLabel="Rewards sections"
          options={TABS.map((tabDef) => ({ value: tabDef.id, label: tabDef.label }))}
        />
      </div>

      {tab === "leaderboard" && (
        <>
          <Panel className="mt" noPad>
            <Table cols={LB_COLS} caption="Broker leaderboard">
              {leaderboard.map((b, i) => (
                <Tr key={b.id}>
                  <Td>
                    <CellChip tone={i < 3 ? "gold" : "mut"}>#{i + 1}</CellChip>
                  </Td>
                  <Td>
                    <b>{b.display_name}</b>
                  </Td>
                  <Td>
                    <CellChip tone={tierTone(b.tier)}>{b.tier}</CellChip>
                  </Td>
                  <Td align="r">
                    <b className="num">{QC_FMT.short(Number(b.funded_total))}</b>
                  </Td>
                  <Td align="r">
                    <span className="num">{QC_FMT.num(b.lifetime_points)}</span>
                  </Td>
                </Tr>
              ))}
              {leaderboard.length === 0 && (
                <Tr>
                  <Td colSpan={5}>
                    <span className="sub">No brokers yet.</span>
                  </Td>
                </Tr>
              )}
            </Table>
          </Panel>

          <CG className="mt">
            <div className="lbl s12">Tier benefits</div>
            {TIER_THRESHOLDS.map((tier) => (
              <Card key={tier.name} className="s3" style={{ display: "grid", gap: 5, alignContent: "start" }}>
                <div className="lbl" style={{ color: tier.color }}>{tier.name}</div>
                <b className="num">
                  {tier.max === Infinity ? `${QC_FMT.short(tier.min)}+` : `${QC_FMT.short(tier.min)} – ${QC_FMT.short(tier.max)}`}
                </b>
                <div className="sub">
                  {tier.name === "Bronze" && "Standard pricing, monthly digest."}
                  {tier.name === "Silver" && "+25 bps preferred pricing, priority underwriting queue."}
                  {tier.name === "Gold" && "+50 bps, dedicated AE, quarterly co-marketing budget."}
                  {tier.name === "Platinum" && "+75 bps, named UW, conference invites, custom rate sheet."}
                </div>
              </Card>
            ))}
          </CG>
        </>
      )}

      {tab === "referrals" && <Stub icon="user" message="Referral approval queue & per-broker breakdown — coming soon." note="Backend referral model not yet finalized; the UI lands once /referrals ships." />}

      {tab === "redeem" && <Stub icon="rewards" message="Points redemption catalog — coming soon." note="Catalog (rate concessions, conference passes, co-marketing credits) ships once the backend catalog API is built." />}

      {tab === "rules" && (
        <Panel className="mt" title="Program rules">
          <CG>
            <RulesBlock title="Earning" body="1 point per $1 of FUNDED loan amount. Points award when the loan transitions to FUNDED stage and the wire confirms. Cancellations/rescissions claw back the same points." />
            <RulesBlock title="Tier review" body="Tiers reset at the start of each calendar year using lifetime points from the prior 12 months. Manual overrides require super-admin approval." />
            <RulesBlock title="Referrals" body="Referrals received via a broker invite link auto-link to that broker. Self-signups citing a broker by name go to the super-admin queue for manual approval." />
            <RulesBlock title="Redemption" body="Approved redemptions deduct from balance_points immediately. Lifetime_points is never reduced — that's how tier eligibility is preserved across redemptions." />
          </CG>
        </Panel>
      )}
    </>
  );
}

function Stub({ icon, message, note }: { icon: string; message: string; note: string }) {
  return (
    <Card className="mt">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center", padding: "22px 0" }}>
        <div style={{ width: 48, height: 48, borderRadius: 24, background: "var(--sunken)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
          <Icon name={icon} size={22} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{message}</div>
        <div className="sub" style={{ maxWidth: 540 }}>{note}</div>
      </div>
    </Card>
  );
}

function RulesBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="s6">
      <CellChip tone="pet">{title}</CellChip>
      <div style={{ marginTop: 6 }}>{body}</div>
    </div>
  );
}
