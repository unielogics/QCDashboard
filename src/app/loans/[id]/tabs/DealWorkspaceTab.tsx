"use client";

// AI Workspace tab — the loan-scoped AI surface.
//
// What used to live here (Scenario Simulator + HUD-1 preview) moved out:
//   • LoanScenarioSimulator → TermsTab.tsx (Criteria tab — that's where
//     loan financial modeling logically belongs).
//   • HudPreview → its own "HUD-1" tab (Hud1Tab.tsx was already coded;
//     just needed an entry in INTERNAL_TABS to be reachable).
//
// What remains here is the AI's working surface for this loan:
// active instructions strip + the loan chat thread + chat input.
// Phase 2 of the Deal Secretary plan will layer the Outreach Mode
// strip, State chip, and DealSecretaryPicker on top of this — for
// now we keep the chat as the sole occupant so the tab is clean.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { useCurrentUser, useDealWorkspace, useLoan } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { InstructionStrip } from "../components/InstructionStrip";
import { DealChatThread } from "../components/DealChatThread";
import { DealChatInput } from "../components/DealChatInput";

export function DealWorkspaceTab({ loanId }: { loanId: string }) {
  const { t } = useTheme();
  const { data: user } = useCurrentUser();
  const { data: loan } = useLoan(loanId);
  const { data: workspace, isLoading } = useDealWorkspace(loanId);

  if (!user || !loan) {
    return <div style={{ padding: 16, color: t.ink3, fontSize: 13 }}>Loading workspace…</div>;
  }
  if (isLoading || !workspace) {
    return <div style={{ padding: 16, color: t.ink3, fontSize: 13 }}>Loading workspace state…</div>;
  }

  const canEditOps = user.role !== Role.CLIENT;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
      <InstructionStrip
        loanId={loanId}
        instructions={workspace.instructions}
        canEdit={canEditOps}
      />
      <Card pad={14}>
        <SectionLabel>Loan chat</SectionLabel>
        <DealChatThread
          loanId={loanId}
          user={user}
          messages={workspace.chat_messages}
          pausedUntil={workspace.ai_paused_until}
        />
        <div style={{ height: 10 }} />
        <DealChatInput
          loanId={loanId}
          user={user}
          pausedUntil={workspace.ai_paused_until}
        />
      </Card>
    </div>
  );
}
