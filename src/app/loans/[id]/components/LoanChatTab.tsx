"use client";

// LoanChatTab — inline version of LoanChatSlideOut, rendered as a
// full-width tab on the loan detail page. Same DealChatThread +
// DealChatInput surface, so the 4-mode broker composer (Live Chat,
// Ask AI, Suggest, Instruct) is reachable directly from the tabs
// instead of only as a slide-out.
//
// Why both: brokers explicitly asked for a TAB on desktop so the
// chat is discoverable without hunting for a slide-out trigger. The
// slide-out stays for operators who want it as a sidebar.

import { useTheme } from "@/components/design-system/ThemeProvider";
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
  const { t } = useTheme();
  const { data: workspace, isLoading } = useDealWorkspace(loanId);

  if (isLoading || !workspace) {
    return (
      <div
        style={{
          padding: 24,
          background: t.surface,
          borderRadius: 14,
          border: `1px solid ${t.line}`,
          color: t.ink3,
          fontSize: 13,
        }}
      >
        Loading conversation…
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        gap: 12,
        background: t.surface,
        borderRadius: 14,
        border: `1px solid ${t.line}`,
        boxShadow: t.shadow,
        minHeight: "60vh",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          borderBottom: `1px solid ${t.line}`,
          background: t.surface2,
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
        }}
      >
        <Icon name="chat" size={14} />
        <span style={{ fontSize: 13, fontWeight: 900, color: t.ink }}>Loan chat</span>
        <span style={{ fontSize: 11, color: t.ink3, fontWeight: 700 }}>
          AI ↔ client conversation
        </span>
      </header>

      <div style={{ minHeight: 0, overflow: "auto", padding: 12 }}>
        <DealChatThread
          loanId={loanId}
          user={user}
          messages={workspace.chat_messages}
          pausedUntil={workspace.ai_paused_until}
        />
      </div>

      <div
        style={{
          padding: 12,
          borderTop: `1px solid ${t.line}`,
          background: t.surface2,
          borderBottomLeftRadius: 14,
          borderBottomRightRadius: 14,
        }}
      >
        <DealChatInput
          loanId={loanId}
          user={user}
          pausedUntil={workspace.ai_paused_until}
        />
      </div>
    </div>
  );
}
