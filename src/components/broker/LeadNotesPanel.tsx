"use client";

// Internal admin <-> dealer-partner notes thread for a single AI Underwriter
// lead. Reused by both the admin Lead Cockpit and the broker portal — both
// read/write the same BucketNote rows (visibility="admin") via their own
// scoped endpoints, so posting here from either side shows up for the other.
// Never visible to the client.

import { useState } from "react";
import { Btn, StatusLine, Textarea } from "@/components/ds";
import { InlineImageChips, InlineImageStrip, useInlineImages } from "@/components/InlineImages";
import type { InlineImage } from "@/lib/inlineImages";

export type LeadNote = {
  id: string;
  author_name: string;
  author_role: string;
  content: string;
  created_at: string;
  images?: InlineImage[];
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
  onPost: (content: string, imageIds: string[]) => Promise<void> | void;
  posting: boolean;
  error?: string | null;
  title?: string;
  subtitle?: string;
  emptyLabel?: string;
  placeholder?: string;
  submitLabel?: string;
}) {
  const [draft, setDraft] = useState("");
  const pasted = useInlineImages("bucket_note");

  async function submit() {
    const content = draft.trim();
    if ((!content && !pasted.images.length) || posting) return;
    await onPost(content, pasted.ids);
    setDraft("");
    // The images belong to the note now, not to the composer.
    pasted.reset();
  }

  return (
    // `.panel` is already a flex column that clips its own corners; the only
    // thing it cannot know is that this one fills the height its parent hands
    // it (a modal pane, or the 360px slide-over on the Lead Cockpit) and
    // scrolls the message list rather than the page.
    <div className="panel" style={{ height: "100%" }}>
      {/* Hand-rolled `.panel-h` rather than <Panel title sub>: the subtitle
          belongs UNDER the title here, not beside it — it is a sentence about
          who can read the thread, and a flex row wraps it into the actions. */}
      <div className="panel-h">
        <div className="grow grid g4">
          <strong>{title}</strong>
          <span className="sub">{subtitle}</span>
        </div>
      </div>

      {/* Flex and not `.grid g10`, deliberately: this box is taller than its
          contents, and auto grid rows STRETCH to fill it — two messages in a
          tall pane would sit half a pane apart. `.thr` is the right shape but
          caps itself at 56vh, which is correct inside a page and wrong inside
          a pane that already has a height; this one takes what is left over.
          `margin: auto` on the empty state still centres in a flex column. */}
      <div className="panel-b" style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, overflowY: "auto" }}>
        {notes.length === 0 ? (
          <div className="thr-empty" style={{ textAlign: "center", margin: "auto", maxWidth: 260 }}>
            {emptyLabel}
          </div>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="msg">
              <div className="msg-h">
                <span className="msg-who">{note.author_name || note.author_role}</span>
                <span className="grow" />
                <span className="msg-when">{formatNoteDate(note.created_at)}</span>
              </div>
              <div className="msg-b">{note.content}</div>
              <InlineImageStrip images={note.images} />
            </div>
          ))
        )}
      </div>

      {/* Bespoke gutter: `.composer` owns the rule, the stack and the spacing
          above it, but not the horizontal inset of the panel it sits in. */}
      <div style={{ padding: "0 16px 14px" }}>
        <div className="composer">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            onPaste={pasted.onPaste}
            rows={2}
            placeholder={placeholder}
          />
          <InlineImageChips images={pasted.images} onRemove={pasted.remove} busy={pasted.busy} />
          {pasted.error ? <StatusLine tone="bad">{pasted.error}</StatusLine> : null}
          {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
          <div className="composer-row">
            <span className="grow" />
            <Btn variant="pri" onClick={submit} disabled={posting || (!draft.trim() && !pasted.images.length)}>
              {posting ? "Sending…" : submitLabel}
            </Btn>
          </div>
        </div>
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
