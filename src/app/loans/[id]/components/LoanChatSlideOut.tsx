"use client";

// LoanChatSlideOut — 1/3-width slide-in panel from the right side of
// the AI Secretary tab. Renders the AI ↔ client conversation for this
// loan (DealChatThread + DealChatInput).
//
// Opens via the "Loan chat" button in the AI Secretary header. ESC or
// the close button hides it. Click outside also closes (the backdrop).
// State is owned by the parent so other affordances can open/close it
// programmatically (e.g. the AIQuestionsPopover answering a question
// jumps the operator into the chat).

import { useEffect, useRef } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { DealChatThread } from "./DealChatThread";
import { DealChatInput } from "./DealChatInput";
import type { User, WorkspaceState } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  loanId: string;
  user: User;
  workspace: WorkspaceState;
}

export function LoanChatSlideOut({ open, onClose, loanId, user, workspace }: Props) {
  const { t } = useTheme();
  const panelRef = useRef<HTMLDivElement | null>(null);

  // ESC closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        background: "rgba(0,0,0,0.18)",
        zIndex: 60,
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        style={{
          width: "min(420px, 38vw)",
          background: t.surface,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-12px 0 32px rgba(0,0,0,0.18)",
          borderLeft: `1px solid ${t.line}`,
        }}
      >
        <header style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px",
          borderBottom: `1px solid ${t.line}`,
          background: t.surface2,
        }}>
          <Icon name="chat" size={14} />
          <span style={{ fontSize: 13, fontWeight: 900, color: t.ink }}>
            Loan chat
          </span>
          <span style={{ fontSize: 11, color: t.ink3, fontWeight: 700 }}>
            AI ↔ client conversation
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close loan chat"
            style={{
              all: "unset", cursor: "pointer",
              padding: 6, borderRadius: 6,
              color: t.ink3, fontSize: 16, fontWeight: 900, lineHeight: 1,
            }}
          >
            ×
          </button>
        </header>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12 }}>
          <DealChatThread
            loanId={loanId}
            user={user}
            messages={workspace.chat_messages}
            pausedUntil={workspace.ai_paused_until}
          />
        </div>

        <div style={{ padding: 12, borderTop: `1px solid ${t.line}`, background: t.surface2 }}>
          <DealChatInput
            loanId={loanId}
            user={user}
            pausedUntil={workspace.ai_paused_until}
          />
        </div>
      </div>
    </div>
  );
}
