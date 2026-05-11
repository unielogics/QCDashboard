"use client";

// AIQuestionsPopover — a small floating panel that appears when the AI
// has pending clarifying questions for the operator. Replaces the
// previous "AI questions" tab in the merged Loan-Chat container.
//
// Renders as a docked popover anchored to the AI Secretary header.
// When closed it collapses to a single button showing the count. The
// pulse animation only runs when there are unanswered questions so the
// affordance is impossible to miss without being obnoxious.

import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import type { DSAIQuestion } from "@/hooks/useApi";

interface Props {
  questions: DSAIQuestion[];
  onAnswer: (questionId: string, answer: string) => Promise<void>;
  /** When set, AI Secretary header renders a badge with the count. */
  open: boolean;
  onClose: () => void;
}

export function AIQuestionsPopover({ questions, onAnswer, open, onClose }: Props) {
  const { t } = useTheme();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (id: string) => {
    const value = (drafts[id] ?? "").trim();
    if (!value) return;
    setSending(id);
    setError(null);
    try {
      await onAnswer(id, value);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save answer.");
    } finally {
      setSending(null);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 65,
        background: "rgba(0,0,0,0.18)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-end",
        padding: "60px 24px 24px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "min(440px, 92vw)",
        maxHeight: "70vh",
        background: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: 12,
        boxShadow: "0 18px 36px rgba(0,0,0,0.22)",
        display: "flex",
        flexDirection: "column",
      }}>
        <header style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "12px 14px",
          borderBottom: `1px solid ${t.line}`,
          background: t.warnBg,
        }}>
          <Icon name="alert" size={13} />
          <span style={{ fontSize: 13, fontWeight: 900, color: t.warn }}>
            AI needs answers
          </span>
          <span style={{ fontSize: 11, color: t.warn, fontWeight: 700 }}>
            {questions.length} pending
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              all: "unset", cursor: "pointer",
              padding: 4, borderRadius: 4,
              color: t.warn, fontSize: 16, fontWeight: 900, lineHeight: 1,
            }}
          >
            ×
          </button>
        </header>

        <div style={{ overflow: "auto", padding: 12, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {questions.length === 0 ? (
            <div style={{ fontSize: 13, color: t.ink3, textAlign: "center", padding: "20px 12px" }}>
              No open questions. The AI will pop a question here when it needs context before engaging the borrower.
            </div>
          ) : null}
          {questions.map((q) => (
            <div key={q.id} style={{
              border: `1px solid ${t.line}`,
              borderRadius: 10,
              background: t.surface2,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}>
              <div style={{ fontSize: 12.5, color: t.ink, fontWeight: 700, lineHeight: 1.4 }}>
                {q.question}
              </div>
              {q.context ? (
                <div style={{ fontSize: 11, color: t.ink3, lineHeight: 1.4 }}>
                  {q.context}
                </div>
              ) : null}
              <textarea
                value={drafts[q.id] ?? ""}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                placeholder="Type your answer…"
                rows={2}
                style={{
                  padding: "8px 10px", borderRadius: 8,
                  border: `1px solid ${t.line}`, background: t.surface, color: t.ink,
                  fontFamily: "inherit", fontSize: 12, resize: "vertical", outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => submit(q.id)}
                  disabled={!((drafts[q.id] ?? "").trim()) || sending === q.id}
                  style={{
                    padding: "6px 12px", borderRadius: 8,
                    border: "none",
                    background: t.brand, color: t.inverse,
                    fontSize: 11.5, fontWeight: 900,
                    cursor: sending === q.id || !((drafts[q.id] ?? "").trim()) ? "not-allowed" : "pointer",
                    opacity: sending === q.id || !((drafts[q.id] ?? "").trim()) ? 0.55 : 1,
                    fontFamily: "inherit",
                  }}
                >
                  {sending === q.id ? "Saving…" : "Answer"}
                </button>
                <span style={{ fontSize: 10.5, color: t.ink3, fontWeight: 700 }}>
                  asked {new Date(q.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
          {error ? (
            <div style={{ fontSize: 11.5, color: t.danger, fontWeight: 700 }}>{error}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
