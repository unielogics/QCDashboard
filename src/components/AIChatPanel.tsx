"use client";

// AI Intelligent Underwriter — borrower-facing chat panel.
// Operators already have the AIRail co-pilot in the topbar; this is
// the client-facing equivalent. Right-side panel (mirrors
// CreditPullModal / PrequalReviewModal patterns), reusable from any
// page (Dashboard, Calendar) via the topbar chat button.
//
// Local message history only — no persistence yet (Phase 8 follow-up
// will land /me/ai-chat with full history). Each open starts a fresh
// thread, which is fine for short-form questions.

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useAIChat } from "@/hooks/useApi";
import type { AIChatTurn } from "@/lib/types";

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
  const chat = useAIChat();
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<AIChatTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Reset on each open so a fresh thread doesn't show last session's turns.
  useEffect(() => {
    if (open) {
      setHistory([]);
      setInput("");
      setError(null);
    }
  }, [open]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || chat.isPending) return;
    setError(null);
    const userTurn: AIChatTurn = { role: "user", content: text };
    const next = [...history, userTurn];
    setHistory(next);
    setInput("");
    try {
      const resp = await chat.mutateAsync({
        messages: next,
        loan_id: null,
      });
      setHistory((h) => [...h, { role: "assistant", content: resp.reply }]);
      // Scroll to bottom on next tick.
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }, 80);
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
        // Click on backdrop closes; clicks inside the panel don't bubble here.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(560px, 95vw)",
          background: t.bg,
          boxShadow: t.shadowLg,
          borderTopLeftRadius: 18,
          borderBottomLeftRadius: 18,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 22px",
          borderBottom: `1px solid ${t.line}`,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: t.petrol }}>
              AI Intelligent Underwriter
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: t.ink, marginTop: 2 }}>
              How can I help?
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ all: "unset", cursor: "pointer", width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, color: t.ink2 }}
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
          {history.length === 0 ? (
            <>
              <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.55, marginBottom: 6 }}>
                Ask about your pipeline, outstanding documents, what&apos;s next on a
                deal, or anything else underwriting-related. I see your full
                account context.
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase", marginTop: 8 }}>
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
            history.map((turn, i) => (
              <div
                key={i}
                style={{
                  alignSelf: turn.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  padding: 11,
                  borderRadius: 14,
                  background: turn.role === "user" ? t.brandSoft : t.surface2,
                  color: turn.role === "user" ? t.brand : t.ink,
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                }}
              >
                {turn.content}
              </div>
            ))
          )}
          {chat.isPending ? (
            <div style={{ alignSelf: "flex-start", padding: 11, borderRadius: 14, background: t.surface2, fontSize: 12, color: t.ink3 }}>
              Thinking…
            </div>
          ) : null}
          {error ? <Pill bg={t.dangerBg} color={t.danger}>{error}</Pill> : null}
        </div>

        {/* Input */}
        <div style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 22px",
          borderTop: `1px solid ${t.line}`,
        }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question…"
            disabled={chat.isPending}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
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
            disabled={!input.trim() || chat.isPending}
            aria-label="Send"
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              border: "none",
              background: input.trim() && !chat.isPending ? t.petrol : t.chip,
              color: input.trim() && !chat.isPending ? "#fff" : t.ink4,
              cursor: input.trim() && !chat.isPending ? "pointer" : "not-allowed",
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
  );
}
