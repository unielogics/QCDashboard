"use client";

// Multi-party Deal Workspace chat thread. Bubbles styled by from_role.
// AI bubbles get a thumbs/comment row + (super-admin only) an AI Modify
// pencil that opens an inline correction textarea.
//
// Restyled onto the design system's message vocabulary (`.msg`, `.msg-h`,
// `.msg-b`, `.msg.mine` / `.ai` / `.internal`). Two things stay inline
// because they are derived from the message rather than from a class: the
// side a bubble sits on, and the tint on the speaker's name.

import { useEffect, useRef, useState } from "react";
import { Btn, Linky, Textarea, cx } from "@/components/ds";
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
    <div className="grid g8" style={{ minHeight: 0 }}>
      {isPaused && (
        <div className="warnline row">
          <Icon name="pause" size={14} />
          <div className="grow">
            <strong>Elara paused</strong> after operator override — resumes in ~{pauseRemaining} min.
          </div>
          {isSuperAdmin && (
            <Btn size="sm" onClick={() => resume.mutate({ loanId })}>
              Resume AI now
            </Btn>
          )}
        </div>
      )}

      {/* `.thr` is the sheet's thread scroller (56vh cap); the floor keeps a
          one-message thread from collapsing to nothing. */}
      <div ref={scrollRef} className="thr" style={{ minHeight: 240 }}>
        {messages.length === 0 && (
          <div className="thr-empty">
            No conversation yet. Send a message below to start the AI thread for this loan.
          </div>
        )}
        {messages.map((m) => (
          <Bubble
            key={m.id}
            message={m}
            loanId={loanId}
            canCorrect={isSuperAdmin && m.from_role === DealChatRole.AI}
          />
        ))}
      </div>
    </div>
  );
}

/** Role → the tint on the speaker's name. Data, not chrome. */
function roleInk(role: LoanChatMessage["from_role"]): string {
  switch (role) {
    case DealChatRole.AI: return "var(--petrol)";
    case DealChatRole.SUPER_ADMIN: return "var(--accent)";
    case DealChatRole.BROKER: return "var(--gold)";
    case DealChatRole.BROKER_INTERNAL: return "var(--gold)";
    case DealChatRole.CLIENT: return "var(--ink2)";
    default: return "var(--muted)";
  }
}

function Bubble({
  message,
  loanId,
  canCorrect,
}: {
  message: LoanChatMessage;
  loanId: string;
  canCorrect: boolean;
}) {
  const isAI = message.from_role === DealChatRole.AI;
  const isInternal = !message.client_visible;
  const align: "flex-start" | "flex-end" = isAI ? "flex-start" : "flex-end";

  const labelText = (() => {
    if (message.from_role === DealChatRole.AI) return "Elara";
    const roleWord = (() => {
      switch (message.from_role) {
        case DealChatRole.SUPER_ADMIN: return "Operator";
        case DealChatRole.BROKER: return "Agent";
        case DealChatRole.BROKER_INTERNAL: return "Agent (internal)";
        case DealChatRole.CLIENT: return "Borrower";
        default: return String(message.from_role);
      }
    })();
    const nm = (message as { from_name?: string | null }).from_name;
    return nm ? `${nm} (${roleWord})` : roleWord;
  })();

  return (
    <div
      className={cx("msg", isAI ? "ai" : "mine", isInternal && "internal")}
      // Data-derived: Elara speaks from the left, everyone else from the right.
      style={{ alignItems: align }}
    >
      <div className="msg-h">
        {/* Data-derived: the speaker's tint is chosen from their role. */}
        <span className="msg-who" style={{ color: roleInk(message.from_role) }}>
          {labelText}
        </span>
        {isInternal && <span className="msg-role">Internal</span>}
        <span className="msg-when">
          {new Date(message.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
      </div>
      {/* Bespoke bubble measure — a chat bubble never spans the full column. */}
      <div className="msg-b" style={{ maxWidth: "82%" }}>
        {message.body}
      </div>
      {isAI && (
        <div className="row">
          <FeedbackWidget
            outputType={FeedbackOutputType.CHAT_REPLY}
            outputId={message.id}
            loanId={loanId}
            compact
          />
          {canCorrect && <CorrectionButton loanId={loanId} messageId={message.id} />}
        </div>
      )}
    </div>
  );
}

function CorrectionButton({
  loanId,
  messageId,
}: {
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
      <Linky onClick={() => setOpen(true)} aria-label="AI Modify">
        <Icon name="pencil" size={11} /> AI Modify
      </Linky>
    );
  }
  return (
    <div className="grid g6 grow">
      <Textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="What should the AI have said? Future replies on this loan will respect this note."
      />
      <div className="row end">
        <Btn size="sm" onClick={() => { setOpen(false); setText(""); }}>
          Cancel
        </Btn>
        <Btn size="sm" variant="pri" onClick={submit} disabled={!text.trim() || attach.isPending}>
          {attach.isPending ? "Saving…" : "Save correction"}
        </Btn>
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
