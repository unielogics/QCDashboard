"use client";

// Living Loan Profile — renders the structured 4-section output produced by
// "The Associate" summarizer (qcbackend/app/services/ai/summarizer.py).
// Falls back to the legacy plain-text status_summary for loans that haven't
// been refreshed since the upgrade.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useRefreshLoanSummary } from "@/hooks/useApi";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import type { Loan, LivingLoanProfile, MarketWarning } from "@/lib/types";
import { DealHealthPill } from "./DealHealthPill";

export function LoanSummaryCard({ loan }: { loan: Loan }) {
  const { t } = useTheme();
  const profile = useActiveProfile();
  const refresh = useRefreshLoanSummary();
  const canRefresh = profile.role !== Role.CLIENT;
  const live = loan.living_profile ?? null;

  return (
    <Card pad={16}>
      <SectionLabel
        action={
          canRefresh && (
            <button
              onClick={() => refresh.mutate({ loanId: loan.id })}
              disabled={refresh.isPending}
              style={{
                padding: "5px 10px",
                borderRadius: 7,
                background: t.surface2,
                border: `1px solid ${t.line}`,
                color: t.ink2,
                fontSize: 11.5,
                fontWeight: 700,
                cursor: refresh.isPending ? "wait" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
              title="Re-run 'The Associate' summarizer"
            >
              <Icon name="ai" size={11} />
              {refresh.isPending ? "Refreshing…" : "Refresh"}
            </button>
          )
        }
      >
        Living Loan Profile
      </SectionLabel>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <DealHealthPill health={loan.deal_health} />
        {live?.market_context.warning && (
          <MarketWarningPill t={t} warning={live.market_context.warning} />
        )}
        {refresh.data?.used_stub && (
          <span style={{ fontSize: 10.5, color: t.ink3, fontStyle: "italic" }}>
            (stub — set ANTHROPIC_API_KEY for AI-generated profile)
          </span>
        )}
      </div>

      {live ? (
        <ProfileSections t={t} profile={live} />
      ) : loan.status_summary ? (
        <div style={{ fontSize: 13.5, color: t.ink, lineHeight: 1.55 }}>{loan.status_summary}</div>
      ) : (
        <div style={{ fontSize: 13.5, color: t.ink3 }}>
          No profile yet. Click <strong>Refresh</strong> to have &quot;The Associate&quot; generate one from
          the most recent activity and live FRED rates.
        </div>
      )}

      {refresh.error && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: t.danger, fontWeight: 700 }}>
          {refresh.error instanceof Error ? refresh.error.message : "Refresh failed."}
        </div>
      )}
    </Card>
  );
}

function ProfileSections({
  t,
  profile,
}: {
  t: ReturnType<typeof useTheme>["t"];
  profile: LivingLoanProfile;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Section
        t={t}
        label="Current status"
        icon="audit"
        body={<div style={{ fontSize: 13.5, color: t.ink, lineHeight: 1.55, fontWeight: 600 }}>{profile.current_status}</div>}
      />

      <Section
        t={t}
        label="Market context"
        icon="trend"
        body={
          <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.55 }}>
            {profile.market_context.narrative || (
              <span style={{ color: t.ink3 }}>No FRED data tied to this product yet.</span>
            )}
          </div>
        }
      />

      <Section
        t={t}
        label="Bottlenecks"
        icon="alert"
        body={
          profile.bottlenecks.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: t.ink2, lineHeight: 1.6 }}>
              {profile.bottlenecks.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          ) : (
            <div style={{ fontSize: 12.5, color: t.ink3 }}>None — deal is unblocked.</div>
          )
        }
      />

      <Section
        t={t}
        label="Next actions"
        icon="bolt"
        body={
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <ActionList
              t={t}
              title="AI"
              accent={t.petrol}
              items={profile.next_actions.ai}
              emptyLabel="Nothing queued."
            />
            <ActionList
              t={t}
              title="Broker"
              accent={t.brand}
              items={profile.next_actions.broker}
              emptyLabel="No broker action required."
            />
          </div>
        }
      />
    </div>
  );
}

function Section({
  t,
  label,
  icon,
  body,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  icon: string;
  body: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: t.ink3,
          marginBottom: 6,
        }}
      >
        <Icon name={icon} size={11} stroke={2.2} />
        {label}
      </div>
      {body}
    </div>
  );
}

function ActionList({
  t,
  title,
  accent,
  items,
  emptyLabel,
}: {
  t: ReturnType<typeof useTheme>["t"];
  title: string;
  accent: string;
  items: string[];
  emptyLabel: string;
}) {
  return (
    <div
      style={{
        background: t.surface2,
        border: `1px solid ${t.line}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 8,
        padding: 10,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: accent,
          marginBottom: 4,
        }}
      >
        [{title} action]
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: t.ink3 }}>{emptyLabel}</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: t.ink2, lineHeight: 1.55 }}>
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MarketWarningPill({
  t,
  warning,
}: {
  t: ReturnType<typeof useTheme>["t"];
  warning: MarketWarning;
}) {
  const map: Record<MarketWarning, { bg: string; color: string; icon: string }> = {
    "Rate Pressure": { bg: t.dangerBg, color: t.danger, icon: "trend" },
    "Rate Easing": { bg: t.profitBg, color: t.profit, icon: "trendDn" },
    "Rate Stability": { bg: t.chip, color: t.ink2, icon: "audit" },
  };
  const { bg, color, icon } = map[warning];
  return (
    <Pill bg={bg} color={color}>
      <Icon name={icon} size={10} stroke={2.4} />
      {warning}
    </Pill>
  );
}
