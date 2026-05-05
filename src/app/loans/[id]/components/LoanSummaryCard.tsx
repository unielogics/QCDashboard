"use client";

// Living Loan File summary — pulls loan.status_summary off the Loan record
// and renders the AI's executive summary with a refresh button.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useRefreshLoanSummary } from "@/hooks/useApi";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import type { Loan } from "@/lib/types";
import { DealHealthPill } from "./DealHealthPill";

export function LoanSummaryCard({ loan }: { loan: Loan }) {
  const { t } = useTheme();
  const profile = useActiveProfile();
  const refresh = useRefreshLoanSummary();
  const canRefresh = profile.role !== Role.CLIENT;

  return (
    <Card pad={16}>
      <SectionLabel
        action={canRefresh && (
          <button
            onClick={() => refresh.mutate({ loanId: loan.id })}
            disabled={refresh.isPending}
            style={{
              padding: "5px 10px", borderRadius: 7, background: t.surface2,
              border: `1px solid ${t.line}`, color: t.ink2, fontSize: 11.5, fontWeight: 700,
              cursor: refresh.isPending ? "wait" : "pointer",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}
            title="Re-run the AI summarizer"
          >
            <Icon name="ai" size={11} /> {refresh.isPending ? "Refreshing…" : "Refresh"}
          </button>
        )}
      >
        Living Loan File
      </SectionLabel>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <DealHealthPill health={loan.deal_health} />
        {refresh.data?.used_stub && (
          <span style={{ fontSize: 10.5, color: t.ink3, fontStyle: "italic" }}>
            (stub — set ANTHROPIC_API_KEY for AI-generated summary)
          </span>
        )}
      </div>

      <div style={{ fontSize: 13.5, color: t.ink, lineHeight: 1.55 }}>
        {loan.status_summary ?? (
          <span style={{ color: t.ink3 }}>
            No summary yet. Click <strong>Refresh</strong> to generate one from the most recent activity.
          </span>
        )}
      </div>

      {refresh.error && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: t.danger, fontWeight: 700 }}>
          {refresh.error instanceof Error ? refresh.error.message : "Refresh failed."}
        </div>
      )}
    </Card>
  );
}
