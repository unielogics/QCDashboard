"use client";

// Internal admin <-> dealer-partner notes thread for a single AI Underwriter
// lead. Reused by both the admin Lead Cockpit and the broker portal — both
// read/write the same BucketNote rows (visibility="admin") via their own
// scoped endpoints, so posting here from either side shows up for the other.
// Never visible to the client.

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { qcBtnPrimary } from "@/components/design-system/buttons";

export type LeadNote = {
  id: string;
  author_name: string;
  author_role: string;
  content: string;
  created_at: string;
};

export function LeadNotesPanel({
  notes,
  onPost,
  posting,
  error,
  title = "Messages",
  subtitle = "Private channel with the underwriting team — never visible to the client.",
  emptyLabel = "No messages yet. Start the conversation with the underwriting team about this lead.",
  placeholder = "Write a message…  (Enter to send, Shift+Enter for a new line)",
  submitLabel = "Send",
}: {
  notes: LeadNote[];
  onPost: (content: string) => Promise<void> | void;
  posting: boolean;
  error?: string | null;
  title?: string;
  subtitle?: string;
  emptyLabel?: string;
  placeholder?: string;
  submitLabel?: string;
}) {
  const { t } = useTheme();
  const [draft, setDraft] = useState("");

  async function submit() {
    const content = draft.trim();
    if (!content || posting) return;
    await onPost(content);
    setDraft("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%", border: `1px solid ${t.line}`, borderRadius: 14, background: t.surface2, overflow: "hidden" }}>
      <div style={{ padding: "11px 14px", borderBottom: `1px solid ${t.line}` }}>
        <strong style={{ color: t.ink, fontSize: 13 }}>{title}</strong>
        <span style={{ display: "block", color: t.ink3, fontSize: 11, marginTop: 2 }}>
          {subtitle}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {notes.length === 0 ? (
          <div style={{ color: t.ink3, fontSize: 12.5, textAlign: "center", margin: "auto", maxWidth: 260, lineHeight: 1.5 }}>
            {emptyLabel}
          </div>
        ) : (
          notes.map((note) => (
            <div key={note.id} style={{ border: `1px solid ${t.line}`, borderRadius: 10, padding: "8px 10px", background: t.surface }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, color: t.ink3 }}>
                <strong style={{ color: t.ink2 }}>{note.author_name || note.author_role}</strong>
                <span>{formatNoteDate(note.created_at)}</span>
              </div>
              <p style={{ margin: "4px 0 0", color: t.ink2, fontSize: 12.5, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{note.content}</p>
            </div>
          ))
        )}
      </div>

      <div style={{ padding: "10px 14px", borderTop: `1px solid ${t.line}`, display: "flex", flexDirection: "column", gap: 8 }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder={placeholder}
          style={{ padding: "9px 11px", borderRadius: 10, border: `1px solid ${t.line}`, background: t.surface, color: t.ink, fontSize: 12.5, outline: "none", resize: "vertical", minHeight: 40, fontFamily: "inherit", lineHeight: 1.4 }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={submit}
            disabled={posting || !draft.trim()}
            style={{ ...qcBtnPrimary(t), opacity: posting || !draft.trim() ? 0.6 : 1 }}
          >
            {posting ? "Sending…" : submitLabel}
          </button>
        </div>
        {error ? <div style={{ color: t.danger, fontSize: 11.5 }}>{error}</div> : null}
      </div>
    </div>
  );
}

function formatNoteDate(value: string): string {
  try {
    return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return value;
  }
}
