"use client";

// In-page chat view for a single AIChatThread. Renders the message
// history and accepts new sends. Used by:
//   - /messages (borrower thread list — account + per-loan threads)
//   - any other surface that wants an embedded chat for a known
//     thread id.
//
// Distinct from `AIChatPanel` (the topbar slide-in) — that one
// owns the thread sidebar; this one is just the chat surface.

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useAIChatThread, useSendAIChatMessage } from "@/hooks/useApi";

interface Props {
  threadId: string;
  // Optional caller-supplied header text. Falls back to thread.title.
  title?: string | null;
  subtitle?: string | null;
  // Empty-state copy when the thread has no messages yet.
  emptyState?: React.ReactNode;
  // Caller can pass starter prompts that auto-send on click.
  starterPrompts?: string[];
}

export function ThreadChatView({
  threadId,
  title,
  subtitle,
  emptyState,
  starterPrompts,
}: Props) {
  const { t } = useTheme();
  const threadQ = useAIChatThread(threadId);
  const sendMessage = useSendAIChatMessage();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messages = threadQ.data?.messages ?? [];

  useEffect(() => {
    if (messages.length === 0) return;
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 60);
  }, [messages.length, sendMessage.isPending]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || sendMessage.isPending) return;
    setError(null);
    try {
      await sendMessage.mutateAsync({ threadId, body: text });
      setInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI failed to respond.");
    }
  };

  const headerTitle = title ?? threadQ.data?.title ?? "Conversation";
  const headerSub = subtitle ?? (threadQ.data?.loan_deal_id
    ? `${threadQ.data.loan_deal_id}${threadQ.data.loan_address ? ` · ${threadQ.data.loan_address}` : ""}`
    : "Account-wide context");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header */}
      <div
        style={{
          flex: "0 0 auto",
          padding: "14px 18px",
          borderBottom: `1px solid ${t.line}`,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            color: t.petrol,
          }}
        >
          AI Intelligent Underwriter
        </div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: t.ink,
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {headerTitle}
        </div>
        {headerSub ? (
          <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>{headerSub}</div>
        ) : null}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {threadQ.isLoading ? (
          <div style={{ fontSize: 12.5, color: t.ink3 }}>Loading…</div>
        ) : messages.length === 0 ? (
          <>
            <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.55 }}>
              {emptyState ?? "No messages yet. Ask anything — I see the full context."}
            </div>
            {starterPrompts && starterPrompts.length > 0 ? (
              <>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: t.ink3,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    marginTop: 8,
                  }}
                >
                  Try asking
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {starterPrompts.map((p) => (
                    <button
                      key={p}
                      onClick={() => send(p)}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        padding: 12,
                        borderRadius: 12,
                        border: `1px solid ${t.line}`,
                        fontSize: 13,
                        color: t.ink2,
                        lineHeight: 1.5,
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                padding: 11,
                borderRadius: 14,
                background: m.role === "user" ? t.brandSoft : t.surface2,
                color: m.role === "user" ? t.brand : t.ink,
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}
            >
              {m.body}
            </div>
          ))
        )}
        {sendMessage.isPending ? (
          <div
            style={{
              alignSelf: "flex-start",
              padding: 11,
              borderRadius: 14,
              background: t.surface2,
              fontSize: 12,
              color: t.ink3,
            }}
          >
            Thinking…
          </div>
        ) : null}
        {error ? <Pill bg={t.dangerBg} color={t.danger}>{error}</Pill> : null}
      </div>

      {/* Input */}
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 18px",
          borderTop: `1px solid ${t.line}`,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your question…"
          disabled={sendMessage.isPending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          style={{
            flex: 1,
            padding: "11px 14px",
            borderRadius: 12,
            background: t.surface2,
            border: `1px solid ${t.line}`,
            color: t.ink,
            fontSize: 14,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || sendMessage.isPending}
          aria-label="Send"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            border: "none",
            background: input.trim() && !sendMessage.isPending ? t.petrol : t.chip,
            color: input.trim() && !sendMessage.isPending ? "#fff" : t.ink4,
            cursor: input.trim() && !sendMessage.isPending ? "pointer" : "not-allowed",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="arrowR" size={18} />
        </button>
      </div>
    </div>
  );
}
