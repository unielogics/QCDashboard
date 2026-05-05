"use client";

// Two-pane Deal Workspace tab. Left: scenario simulator + HUD preview.
// Right: active instructions + chat thread + chat input.
// All four data sets come from one bundled GET /loans/{id}/workspace/state
// so the tab mounts in a single round-trip.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { useCurrentUser, useDealWorkspace, useLoan } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { LoanScenarioSimulator } from "../components/LoanScenarioSimulator";
import { HudPreview } from "../components/HudPreview";
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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.4fr 1fr",
        gap: 14,
        alignItems: "flex-start",
      }}
    >
      {/* Left pane — sim + HUD */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <LoanScenarioSimulator loan={loan} scenarios={workspace.scenarios} />
        <HudPreview loanId={loanId} lines={workspace.hud_lines} canEdit={canEditOps} />
      </div>

      {/* Right pane — instructions + chat */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          minWidth: 0,
          // Sticky chat: keep the chat input visible while the user scrolls
          // the left pane.
          position: "sticky",
          top: 0,
        }}
      >
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
    </div>
  );
}
