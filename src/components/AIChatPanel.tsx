"use client";

// AI Intelligent Underwriter — borrower-facing chat panel.
// Operators already have the AIRail co-pilot in the topbar; this is
// the client-facing equivalent.
//
// Phase 8: every conversation persists to the DB. Users can resume
// previous threads, rename them, or delete them. The panel has a
// thread sidebar (left) and the active conversation (right).

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useAIChatThreads,
  useAIChatThread,
  useCreateAIChatThread,
  useSendAIChatMessage,
  useRenameAIChatThread,
  useDeleteAIChatThread,
} from "@/hooks/useApi";

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
  const threadsQ = useAIChatThreads();
  const createThread = useCreateAIChatThread();
  const sendMessage = useSendAIChatMessage();
  const renameThread = useRenameAIChatThread();
  const deleteThread = useDeleteAIChatThread();

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const activeThreadQ = useAIChatThread(activeThreadId);
  const messages = activeThreadQ.data?.messages ?? [];

  // On open: pick the most recent thread (or none → starter screen).
  useEffect(() => {
    if (!open) return;
    if (activeThreadId == null && threadsQ.data && threadsQ.data.length > 0) {
      setActiveThreadId(threadsQ.data[0].id);
    }
  }, [open, threadsQ.data, activeThreadId]);

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

  const startNewThread = () => {
    setActiveThreadId(null);
    setInput("");
    setError(null);
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || sendMessage.isPending) return;
    setError(null);
    try {
      let threadId = activeThreadId;
      if (!threadId) {
        const created = await createThread.mutateAsync({});
        threadId = created.id;
        setActiveThreadId(threadId);
      }
      await sendMessage.mutateAsync({ threadId, body: text });
      setInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI failed to respond.");
    }
  };

  const renamePrompt = async (threadId: string, currentTitle: string) => {
    const next = window.prompt("Rename conversation", currentTitle);
    if (next == null || next.trim() === "" || next.trim() === currentTitle) return;
    try {
      await renameThread.mutateAsync({ threadId, title: next.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed");
    }
  };

  const confirmDelete = async (threadId: string) => {
    if (!window.confirm("Delete this conversation? This cannot be undone.")) return;
    try {
      await deleteThread.mutateAsync(threadId);
      if (activeThreadId === threadId) setActiveThreadId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const sortedThreads = useMemo(() => {
    return [...(threadsQ.data ?? [])];
  }, [threadsQ.data]);

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
        {/* Thread sidebar */}
        <div
          style={{
            width: 260,
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
                marginBottom: 4,
              }}
            >
              Conversations
            </div>
            <button
              onClick={startNewThread}
              style={{
                all: "unset",
                cursor: "pointer",
                width: "100%",
                padding: "8px 10px",
                marginTop: 6,
                borderRadius: 10,
                border: `1px solid ${t.line}`,
                background: t.bg,
                color: t.ink,
                fontSize: 12.5,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <Icon name="plus" size={12} stroke={3} /> New conversation
            </button>
          </div>
          <div style={{ flex: "1 1 auto", overflowY: "auto", padding: 8 }}>
            {threadsQ.isLoading ? (
              <div style={{ padding: 12, fontSize: 12, color: t.ink3 }}>Loading…</div>
            ) : sortedThreads.length === 0 ? (
              <div style={{ padding: 12, fontSize: 12, color: t.ink3, lineHeight: 1.5 }}>
                No conversations yet. Start one to see your history here.
              </div>
            ) : (
              sortedThreads.map((tr) => {
                const isActive = tr.id === activeThreadId;
                return (
                  <div
                    key={tr.id}
                    onClick={() => setActiveThreadId(tr.id)}
                    style={{
                      padding: "10px 10px",
                      borderRadius: 10,
                      marginBottom: 4,
                      cursor: "pointer",
                      background: isActive ? t.brandSoft : "transparent",
                      border: isActive ? `1px solid ${t.petrol}` : "1px solid transparent",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: isActive ? t.brand : t.ink,
                        marginBottom: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tr.title}
                    </div>
                    {tr.last_message_preview ? (
                      <div
                        style={{
                          fontSize: 11,
                          color: t.ink3,
                          lineHeight: 1.4,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {tr.last_message_preview}
                      </div>
                    ) : null}
                    {isActive ? (
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            renamePrompt(tr.id, tr.title);
                          }}
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            fontSize: 10.5,
                            color: t.ink2,
                            textDecoration: "underline",
                          }}
                        >
                          Rename
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmDelete(tr.id);
                          }}
                          style={{
                            all: "unset",
                            cursor: "pointer",
                            fontSize: 10.5,
                            color: t.danger,
                            textDecoration: "underline",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
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
            <div>
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
                  maxWidth: 480,
                }}
              >
                {activeThreadQ.data?.title ?? "How can I help?"}
              </div>
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
            {!activeThreadId || messages.length === 0 ? (
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
                  deal, or anything else underwriting-related. I see your full
                  account context.
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
      </div>
    </div>
  );
}
