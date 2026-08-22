"use client";

// Living Loan Profile — renders the structured 4-section output produced by
// the "Elara" summarizer (qcbackend/app/services/ai/summarizer.py).
// Falls back to the legacy plain-text status_summary for loans that haven't
// been refreshed since the upgrade.
//
// Restyled onto `.panel`. The only values left inline are the two accents
// that are chosen from the data: the market-warning tone and the tint that
// marks an action list as the AI's or the broker's.

import { Btn, CellChip, Panel, StatusLine, Sub, type ChipTone } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useRefreshLoanSummary } from "@/hooks/useApi";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import type { Loan, LivingLoanProfile, MarketWarning } from "@/lib/types";
import { DealHealthPill } from "./DealHealthPill";

export function LoanSummaryCard({ loan }: { loan: Loan }) {
  const profile = useActiveProfile();
  const refresh = useRefreshLoanSummary();
  const canRefresh = profile.role !== Role.CLIENT;
  const live = loan.living_profile ?? null;

  return (
    <Panel
      title="Living Loan Profile"
      actions={
        canRefresh ? (
          <Btn
            size="sm"
            onClick={() => refresh.mutate({ loanId: loan.id })}
            disabled={refresh.isPending}
            title="Re-run the 'Elara' summarizer"
          >
            <Icon name="ai" size={11} />
            {refresh.isPending ? "Refreshing…" : "Refresh"}
          </Btn>
        ) : undefined
      }
      bodyClass="grid g10"
    >
      <div className="row">
        <DealHealthPill health={loan.deal_health} />
        {live?.market_context.warning && <MarketWarningPill warning={live.market_context.warning} />}
        {refresh.data?.used_stub && (
          <Sub>(stub — set ANTHROPIC_API_KEY for AI-generated profile)</Sub>
        )}
      </div>

      {live ? (
        <ProfileSections profile={live} />
      ) : loan.status_summary ? (
        <div>{loan.status_summary}</div>
      ) : (
        <Sub>
          No profile yet. Click <strong>Refresh</strong> to have the &quot;Elara&quot; generate one from
          the most recent activity and live FRED rates.
        </Sub>
      )}

      {refresh.error && (
        <StatusLine tone="bad">
          {refresh.error instanceof Error ? refresh.error.message : "Refresh failed."}
        </StatusLine>
      )}

      {/* AI disclosure microcopy — Disclosure §2 ("AI can make mistakes")
          requires this near AI-generated underwriting observations. */}
      <div
        className="sub"
        style={{ paddingTop: 10, borderTop: "1px solid var(--line)", fontStyle: "italic" }}
      >
        AI can make mistakes. Review before relying on these figures — final
        underwriting and lender decisions are made independently.
      </div>
    </Panel>
  );
}

function ProfileSections({ profile }: { profile: LivingLoanProfile }) {
  return (
    <div className="grid">
      <Section
        label="Current status"
        icon="audit"
        body={<div style={{ fontWeight: 600 }}>{profile.current_status}</div>}
      />

      <Section
        label="Market context"
        icon="trend"
        body={
          <div>
            {profile.market_context.narrative || (
              <Sub>No FRED data tied to this product yet.</Sub>
            )}
          </div>
        }
      />

      <Section
        label="Bottlenecks"
        icon="alert"
        body={
          profile.bottlenecks.length > 0 ? (
            // Bespoke list geometry; nothing in the sheet owns a <ul>.
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
              {profile.bottlenecks.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          ) : (
            <Sub>None — deal is unblocked.</Sub>
          )
        }
      />

      <Section
        label="Next actions"
        icon="bolt"
        body={
          <div className="fldgrid two">
            <ActionList
              title="AI"
              accent="var(--petrol)"
              items={profile.next_actions.ai}
              emptyLabel="Nothing queued."
            />
            <ActionList
              title="Broker"
              accent="var(--accent)"
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
  label,
  icon,
  body,
}: {
  label: string;
  icon: string;
  body: React.ReactNode;
}) {
  return (
    <div>
      <div className="lbl row mb">
        <Icon name={icon} size={11} stroke={2.2} />
        {label}
      </div>
      {body}
    </div>
  );
}

function ActionList({
  title,
  accent,
  items,
  emptyLabel,
}: {
  title: string;
  accent: string;
  items: string[];
  emptyLabel: string;
}) {
  return (
    <div
      className="itemrow top"
      // Data-derived: the rail colour says whose list this is (Elara's
      // petrol vs. the broker's accent). `.itemrow` owns everything else.
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="grow">
        {/* Data-derived, same accent as the rail: `.lbl` owns the colour,
            and this is the documented exception. */}
        <div className="lbl" style={{ color: accent }}>
          [{title} action]
        </div>
        {items.length === 0 ? (
          <Sub>{emptyLabel}</Sub>
        ) : (
          <ul style={{ margin: "4px 0 0", paddingLeft: 16, lineHeight: 1.55 }}>
            {items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const WARNING_TONE: Record<MarketWarning, { tone: ChipTone; icon: string }> = {
  "Rate Pressure": { tone: "bad", icon: "trend" },
  "Rate Easing": { tone: "ok", icon: "trendDn" },
  "Rate Stability": { tone: "mut", icon: "audit" },
};

function MarketWarningPill({ warning }: { warning: MarketWarning }) {
  const { tone, icon } = WARNING_TONE[warning];
  return (
    <CellChip tone={tone}>
      <Icon name={icon} size={10} stroke={2.4} />
      {warning}
    </CellChip>
  );
}
