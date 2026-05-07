"use client";

// AI Intelligent Underwriter — borrower-facing chat panel
// (topbar slide-in shortcut). The full Messages page does the
// same job at /messages; this is the at-a-glance entry from any
// other page.
//
// Sidebar is DERIVED, not raw — exactly one Account row + one row
// per loan the user has. Threads lazy-create on first tap via
// /ai/chat/threads/find-or-create. Canonical-thread guarantees
// (alembic 0017 partial unique on (user, loan), 0018 partial
// unique on (user) WHERE loan_id IS NULL) prevent duplicates at
// the DB level no matter how the panel is poked.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useAIChatThread,
  useAIChatThreads,
  useFindOrCreateChatThread,
  useLoans,
  useSendAIChatMessage,
} from "@/hooks/useApi";
import type { AIChatThread, Loan } from "@/lib/types";

const STARTER_PROMPTS = [
  "What's the next thing I need to do?",
  "Are any of my docs overdue?",
  "What's blocking my deal from closing?",
  "Show me my current pipeline",
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AIChatPanel({ open, onClose }: Props) {
  const { t } = useTheme();
  const { data: loans = [] } = useLoans();
  const threadsQ = useAIChatThreads();
  const findOrCreate = useFindOrCreateChatThread();
  const sendMessage = useSendAIChatMessage();

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const activeThreadQ = useAIChatThread(activeThreadId);
  const messages = activeThreadQ.data?.messages ?? [];

  const accountThread = useMemo<AIChatThread | undefined>(
    () => (threadsQ.data ?? []).find((th) => !th.loan_id),
    [threadsQ.data],
  );
  const loanThreadMap = useMemo(() => {
    const map = new Map<string, AIChatThread>();
    for (const th of threadsQ.data ?? []) {
      if (th.loan_id) map.set(th.loan_id, th);
    }
    return map;
  }, [threadsQ.data]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length === 0) return;
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 60);
  }, [messages.length, sendMessage.isPending]);

  const openThread = async (loan_id: string | null) => {
    setError(null);
    const existing = loan_id == null ? accountThread : loanThreadMap.get(loan_id);
    if (existing) {
      setActiveThreadId(existing.id);
      return;
    }
    try {
      const created = await findOrCreate.mutateAsync({ loan_id });
      setActiveThreadId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the conversation.");
    }
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || sendMessage.isPending) return;
    setError(null);
    try {
      let threadId = activeThreadId;
      if (!threadId) {
        // Find-or-create the canonical Account thread (NOT plain
        // create) so we never spawn a duplicate.
        const t = await findOrCreate.mutateAsync({ loan_id: null });
        threadId = t.id;
        setActiveThreadId(threadId);
      }
      await sendMessage.mutateAsync({ threadId, body: text });
      setInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI failed to respond.");
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI Intelligent Underwriter chat"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6, 7, 11, 0.55)",
        backdropFilter: "blur(2px)",
        zIndex: 200,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(820px, 95vw)",
          background: t.bg,
          boxShadow: t.shadowLg,
          borderTopLeftRadius: 18,
          borderBottomLeftRadius: 18,
          display: "flex",
          flexDirection: "row",
        }}
      >
        {/* Conversation sidebar — derived, never raw */}
        <div
          style={{
            width: 280,
            borderRight: `1px solid ${t.line}`,
            background: t.surface2,
            display: "flex",
            flexDirection: "column",
            borderTopLeftRadius: 18,
            borderBottomLeftRadius: 18,
          }}
        >
          <div
            style={{
              flex: "0 0 auto",
              padding: "16px 16px 12px",
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
              Conversations
            </div>
            <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 4, lineHeight: 1.5 }}>
              {`1 account thread · ${loans.length} loan${loans.length === 1 ? "" : "s"}`}
            </div>
          </div>
          <div style={{ flex: "1 1 auto", overflowY: "auto", padding: 8 }}>
            <SidebarRow
              t={t}
              title="Account questions"
              subtitle={accountThread?.last_message_preview ?? "General questions about your portfolio."}
              timestamp={accountThread?.last_message_at ?? null}
              accent="petrol"
              empty={!accountThread}
              isActive={!!accountThread && activeThreadId === accountThread.id}
              onClick={() => openThread(null)}
            />

            {loans.length > 0 ? (
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: t.ink3,
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  margin: "12px 4px 6px",
                }}
              >
                Loans
              </div>
            ) : null}

            {loans.map((loan: Loan) => {
              const th = loanThreadMap.get(loan.id);
              return (
                <SidebarRow
                  key={loan.id}
                  t={t}
                  title={loan.deal_id}
                  subtitleHeader={loan.address ?? ""}
                  subtitle={th?.last_message_preview ?? "No conversation yet — tap to start."}
                  timestamp={th?.last_message_at ?? null}
                  accent="brand"
                  empty={!th}
                  isActive={!!th && activeThreadId === th.id}
                  onClick={() => openThread(loan.id)}
                />
              );
            })}

            {threadsQ.isLoading && (threadsQ.data ?? []).length === 0 ? (
              <div style={{ padding: 12, fontSize: 12, color: t.ink3 }}>Loading…</div>
            ) : null}
          </div>
        </div>

        {/* Active conversation */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              flex: "0 0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 22px",
              borderBottom: `1px solid ${t.line}`,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
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
                  fontSize: 18,
                  fontWeight: 800,
                  color: t.ink,
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {activeThreadQ.data?.title ?? "Pick a conversation"}
              </div>
              {activeThreadQ.data?.loan_deal_id ? (
                <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>
                  {activeThreadQ.data.loan_deal_id}
                  {activeThreadQ.data.loan_address ? ` · ${activeThreadQ.data.loan_address}` : ""}
                </div>
              ) : null}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                all: "unset",
                cursor: "pointer",
                width: 32,
                height: 32,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 8,
                color: t.ink2,
              }}
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          {/* Thread */}
          <div
            ref={scrollRef}
            style={{
              flex: "1 1 auto",
              overflowY: "auto",
              padding: "16px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {!activeThreadId ? (
              <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.55 }}>
                Pick a conversation on the left to start chatting. The AI sees the
                full context for whichever scope you choose — account-wide for
                general questions, loan-specific for deal-level questions.
              </div>
            ) : messages.length === 0 ? (
              <>
                <div
                  style={{
                    fontSize: 12.5,
                    color: t.ink3,
                    lineHeight: 1.55,
                    marginBottom: 6,
                  }}
                >
                  Ask about your pipeline, outstanding documents, what&apos;s next on a
                  deal, or anything else underwriting-related.
                </div>
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
                  {STARTER_PROMPTS.map((p) => (
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
              padding: "12px 22px",
              borderTop: `1px solid ${t.line}`,
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={activeThreadId ? "Type your question…" : "Pick a conversation first"}
              disabled={sendMessage.isPending || !activeThreadId}
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
                opacity: activeThreadId ? 1 : 0.6,
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || sendMessage.isPending || !activeThreadId}
              aria-label="Send"
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                border: "none",
                background: input.trim() && !sendMessage.isPending && activeThreadId ? t.petrol : t.chip,
                color: input.trim() && !sendMessage.isPending && activeThreadId ? "#fff" : t.ink4,
                cursor: input.trim() && !sendMessage.isPending && activeThreadId ? "pointer" : "not-allowed",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="arrowR" size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SidebarRowProps {
  t: ReturnType<typeof useTheme>["t"];
  title: string;
  subtitleHeader?: string;
  subtitle: string;
  timestamp: string | null;
  accent: "petrol" | "brand";
  empty: boolean;
  isActive: boolean;
  onClick: () => void;
}

function SidebarRow({
  t,
  title,
  subtitleHeader,
  subtitle,
  timestamp,
  accent,
  empty,
  isActive,
  onClick,
}: SidebarRowProps) {
  const accentColor = accent === "petrol" ? t.petrol : t.brand;
  const accentBg = accent === "petrol" ? t.petrolSoft : t.brandSoft;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "block",
        width: "100%",
        boxSizing: "border-box",
        padding: "10px 12px",
        borderRadius: 10,
        marginBottom: 4,
        background: isActive ? accentBg : "transparent",
        border: isActive ? `1px solid ${accentColor}` : "1px solid transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            color: isActive ? accentColor : t.ink,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {title}
        </div>
        {timestamp ? (
          <div style={{ fontSize: 10, color: t.ink4, flex: "0 0 auto" }}>
            {new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </div>
        ) : null}
      </div>
      {subtitleHeader ? (
        <div
          style={{
            fontSize: 10.5,
            color: t.ink3,
            marginTop: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {subtitleHeader}
        </div>
      ) : null}
      <div
        style={{
          fontSize: 11,
          color: empty ? t.ink4 : t.ink3,
          fontStyle: empty ? "italic" : "normal",
          marginTop: 4,
          lineHeight: 1.4,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {subtitle}
      </div>
    </button>
  );
}
