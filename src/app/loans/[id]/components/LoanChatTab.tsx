"use client";

// LoanChatTab — inline version of LoanChatSlideOut, rendered as a
// full-width tab on the loan detail page. Same DealChatThread +
// DealChatInput surface, so the 4-mode broker composer (Live Chat,
// Ask Elara, Suggest, Instruct) is reachable directly from the tabs
// instead of only as a slide-out.
//
// Why both: brokers explicitly asked for a TAB on desktop so the
// chat is discoverable without hunting for a slide-out trigger. The
// slide-out stays for operators who want it as a sidebar.
//
// Restyled onto `.panel`: the chrome is the design system's, and only the
// 60vh floor that keeps the composer pinned low stays inline.

import { Panel, Sub } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useDealWorkspace } from "@/hooks/useApi";
import type { User } from "@/lib/types";
import { DealChatThread } from "./DealChatThread";
import { DealChatInput } from "./DealChatInput";

interface Props {
  loanId: string;
  user: User;
}

export function LoanChatTab({ loanId, user }: Props) {
  const { data: workspace, isLoading } = useDealWorkspace(loanId);

  if (isLoading || !workspace) {
    return (
      <Panel>
        <Sub>Loading conversation…</Sub>
      </Panel>
    );
  }

  return (
    // Bespoke floor: the panel stretches to fill it so the composer sits at
    // the bottom of the viewport rather than riding up under a short thread.
    <div style={{ minHeight: "60vh", display: "grid" }}>
      <Panel
        title={
          <>
            <Icon name="chat" size={14} /> Chat
          </>
        }
        sub="AI ↔ client conversation"
        noPad
      >
        <div className="grow" style={{ minHeight: 0, overflow: "auto", padding: 12 }}>
          <DealChatThread
            loanId={loanId}
            user={user}
            messages={workspace.chat_messages}
            pausedUntil={workspace.ai_paused_until}
          />
        </div>

        <div style={{ padding: 12, borderTop: "1px solid var(--line)", background: "var(--sunken2)" }}>
          <DealChatInput
            loanId={loanId}
            user={user}
            pausedUntil={workspace.ai_paused_until}
          />
        </div>
      </Panel>
    </div>
  );
}
