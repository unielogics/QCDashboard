"use client";

// ClientLoanChatTab — the borrower's view of the loan's workspace
// chat. Sister to LoanChatTab (the broker / operator surface), but
// with a single-mode composer (mode=chat only) and no role-pill
// chooser, since CLIENT can only send normal client messages.
//
// Reads workspace chat via /loans/{id}/chat. Server-side `list_chat`
// filters to `client_visible=true` rows for CLIENT role automatically;
// we still mount the same DealChatThread component so the bubble
// styling stays consistent with what the operator sees.
//
// Phase 7.5 — fixes the production gap where desktop clients had no
// chat surface at all (CLIENT_TABS = Overview / Simulator / Documents
// / Activity, no chat tab). Operator-to-client messages were
// invisible on desktop entirely.

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { useDealChat, useDealWorkspace, useSendDealChat } from "@/hooks/useApi";
import { DealChatMode } from "@/lib/enums.generated";
import type { User } from "@/lib/types";
import { DealChatThread } from "./DealChatThread";

interface Props {
  loanId: string;
  user: User;
}

export function ClientLoanChatTab({ loanId, user }: Props) {
  const { t } = useTheme();
  const { data: workspace, isLoading } = useDealWorkspace(loanId);
  const { data: messages = [] } = useDealChat(loanId);
  const send = useSendDealChat();
  const [draft, setDraft] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  const pausedUntil = workspace?.ai_paused_until ?? null;
  const pauseRemainingMin = pausedUntil
    ? Math.max(0, Math.round((new Date(pausedUntil).getTime() - Date.now()) / 60_000))
    : 0;
  const isPaused = pauseRemainingMin > 0;

  const submit = async () => {
    const body = draft.trim();
    if (!body || send.isPending) return;
    try {
      await send.mutateAsync({ loanId, body, mode: DealChatMode.CHAT });
      setDraft("");
      // No client-side flash on send when un-paused; the AI reply will
      // appear in the thread within seconds. When paused, hint that
      // the operator is handling the conversation.
      if (isPaused) {
        setFlash("Your operator is replying directly — they'll see this within a minute.");
        setTimeout(() => setFlash(null), 4000);
      }
    } catch (e: unknown) {
      setFlash(e instanceof Error ? e.message : "Send failed");
      setTimeout(() => setFlash(null), 4000);
    }
  };

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
        <span style={{ fontSize: 13, fontWeight: 900, color: t.ink }}>Messages</span>
        <span style={{ fontSize: 11, color: t.ink3, fontWeight: 700 }}>
          {isPaused
            ? `Your operator is handling this directly (AI back in ~${pauseRemainingMin} min)`
            : "AI ↔ you about this loan"}
        </span>
      </header>

      <div style={{ minHeight: 0, overflow: "auto", padding: 12 }}>
        <DealChatThread
          loanId={loanId}
          user={user}
          messages={messages}
          pausedUntil={pausedUntil}
        />
      </div>

      <div
        style={{
          padding: 12,
          borderTop: `1px solid ${t.line}`,
          background: t.surface2,
          borderBottomLeftRadius: 14,
          borderBottomRightRadius: 14,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {flash && (
          <div
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              background: t.warnBg,
              color: t.warn,
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            {flash}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="Ask about your loan — pricing, missing docs, next steps…"
            rows={2}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 9,
              border: `1px solid ${t.line}`,
              background: t.surface,
              color: t.ink,
              fontSize: 13,
              fontFamily: "inherit",
              resize: "vertical",
              minHeight: 44,
              maxHeight: 200,
              outline: "none",
            }}
          />
          <button
            onClick={() => void submit()}
            disabled={!draft.trim() || send.isPending}
            style={{
              all: "unset",
              cursor: !draft.trim() || send.isPending ? "not-allowed" : "pointer",
              padding: "10px 16px",
              borderRadius: 9,
              background: !draft.trim() ? t.chip : t.brand,
              color: !draft.trim() ? t.ink3 : "#fff",
              fontSize: 13,
              fontWeight: 800,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              opacity: send.isPending ? 0.6 : 1,
            }}
          >
            <Icon name="send" size={13} />
            {send.isPending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
