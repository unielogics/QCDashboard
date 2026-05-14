"use client";

// Multi-party Deal Workspace chat thread. Bubbles styled by from_role.
// AI bubbles get a thumbs/comment row + (super-admin only) an AI Modify
// pencil that opens an inline correction textarea.

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { useAttachAIModifyCorrection, useResumeAI } from "@/hooks/useApi";
import { DealChatRole, FeedbackOutputType, Role } from "@/lib/enums.generated";
import type { LoanChatMessage, User } from "@/lib/types";

interface Props {
  loanId: string;
  user: User;
  messages: LoanChatMessage[];
  pausedUntil: string | null;
}

export function DealChatThread({ loanId, user, messages, pausedUntil }: Props) {
  const { t } = useTheme();
  const resume = useResumeAI();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new message arrivals.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const isSuperAdmin = user.role === Role.SUPER_ADMIN;
  const pauseRemaining = remainingMinutes(pausedUntil);
  const isPaused = pauseRemaining > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0, flex: 1 }}>
      {isPaused && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 9,
            background: t.warnBg,
            border: `1px solid ${t.warn}40`,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Icon name="pause" size={14} style={{ color: t.warn }} />
          <div style={{ flex: 1, fontSize: 12, color: t.ink2 }}>
            <strong style={{ color: t.warn }}>AI paused</strong> after operator override —
            resumes in ~{pauseRemaining} min.
          </div>
          {isSuperAdmin && (
            <button
              onClick={() => resume.mutate({ loanId })}
              style={{
                all: "unset",
                cursor: "pointer",
                padding: "5px 10px",
                borderRadius: 7,
                background: t.surface,
                border: `1px solid ${t.line}`,
                fontSize: 12,
                fontWeight: 700,
                color: t.ink2,
              }}
            >
              Resume AI now
            </button>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 240,
          maxHeight: 520,
          overflowY: "auto",
          padding: "8px 4px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.length === 0 && (
          <div style={{ fontSize: 12.5, color: t.ink3, textAlign: "center", padding: 24 }}>
            No conversation yet. Send a message below to start the AI thread for this loan.
          </div>
        )}
        {messages.map((m) => (
          <Bubble
            key={m.id}
            t={t}
            message={m}
            loanId={loanId}
            canCorrect={isSuperAdmin && m.from_role === DealChatRole.AI}
          />
        ))}
      </div>
    </div>
  );
}

function Bubble({
  t,
  message,
  loanId,
  canCorrect,
}: {
  t: ReturnType<typeof useTheme>["t"];
  message: LoanChatMessage;
  loanId: string;
  canCorrect: boolean;
}) {
  const isAI = message.from_role === DealChatRole.AI;
  const isInternal = !message.client_visible;
  const align: "flex-start" | "flex-end" = isAI ? "flex-start" : "flex-end";

  const bubbleColor = isAI ? t.surface : t.brandSoft;
  const labelColor = (() => {
    switch (message.from_role) {
      case DealChatRole.AI: return t.petrol;
      case DealChatRole.SUPER_ADMIN: return t.brand;
      case DealChatRole.BROKER: return t.gold;
      case DealChatRole.BROKER_INTERNAL: return t.gold;
      case DealChatRole.CLIENT: return t.ink2;
      default: return t.ink3;
    }
  })();
  const labelText = (() => {
    switch (message.from_role) {
      case DealChatRole.AI: return "AI";
      case DealChatRole.SUPER_ADMIN: return "Operator";
      case DealChatRole.BROKER: return "Broker (Live Chat)";
      case DealChatRole.BROKER_INTERNAL: return "Broker (internal)";
      case DealChatRole.CLIENT: return "Borrower";
      default: return String(message.from_role);
    }
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align, gap: 4 }}>
      <div
        style={{
          maxWidth: "82%",
          padding: "10px 12px",
          borderRadius: 12,
          background: bubbleColor,
          border: `1px solid ${t.line}`,
          ...(isInternal ? { borderStyle: "dashed", borderColor: `${t.gold}66` } : {}),
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 4,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: "uppercase",
          }}
        >
          <span style={{ color: labelColor }}>{labelText}</span>
          {isInternal && <Pill bg={t.goldSoft} color={t.gold}>Internal</Pill>}
          <span style={{ color: t.ink4, fontSize: 10, fontWeight: 600 }}>
            {new Date(message.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </span>
        </div>
        <div style={{ fontSize: 13, color: t.ink, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
          {message.body}
        </div>
      </div>
      {isAI && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 4 }}>
          <FeedbackWidget
            outputType={FeedbackOutputType.CHAT_REPLY}
            outputId={message.id}
            loanId={loanId}
            compact
          />
          {canCorrect && <CorrectionButton t={t} loanId={loanId} messageId={message.id} />}
        </div>
      )}
    </div>
  );
}

function CorrectionButton({
  t,
  loanId,
  messageId,
}: {
  t: ReturnType<typeof useTheme>["t"];
  loanId: string;
  messageId: string;
}) {
  const attach = useAttachAIModifyCorrection();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const submit = async () => {
    if (!text.trim()) return;
    await attach.mutateAsync({ loanId, messageId, correction: text.trim() });
    setText("");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="AI Modify"
        style={{
          all: "unset",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 7px",
          borderRadius: 6,
          fontSize: 11,
          color: t.ink3,
        }}
      >
        <Icon name="pencil" size={11} /> AI Modify
      </button>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="What should the AI have said? Future replies on this loan will respect this note."
        style={{
          width: "100%",
          padding: "6px 10px",
          borderRadius: 7,
          background: t.surface2,
          border: `1px solid ${t.line}`,
          color: t.ink,
          fontSize: 12,
          fontFamily: "inherit",
          outline: "none",
          resize: "vertical",
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
        <button
          onClick={() => { setOpen(false); setText(""); }}
          style={{ all: "unset", cursor: "pointer", padding: "4px 10px", borderRadius: 6, fontSize: 11, color: t.ink3 }}
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!text.trim() || attach.isPending}
          style={{
            all: "unset",
            cursor: "pointer",
            padding: "4px 10px",
            borderRadius: 6,
            background: t.ink,
            color: t.inverse,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {attach.isPending ? "Saving…" : "Save correction"}
        </button>
      </div>
    </div>
  );
}

function remainingMinutes(iso: string | null): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.max(1, Math.round(ms / 60000));
}
