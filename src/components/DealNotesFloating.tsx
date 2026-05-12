"use client";

// Floating Notes widget mounted on /deals/[id]. Two pieces:
//
//   1. A fixed bottom-right button that opens the panel.
//   2. A right-side drawer rendered as a portal-style fixed panel
//      with timestamped note entries. New entries append to
//      Deal.notes_entries (a JSONB array) — newest-first display.
//
// Notes are agent-private — the handoff visibility filter excludes
// them from the funding baseline at promote time.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { useUI } from "@/store/ui";
import { useDeal, useUpdateDealById } from "@/hooks/useApi";
import type { DealNoteEntry } from "@/lib/types";

function newEntryId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function DealNotesFloatingButton({ dealId }: { dealId: string }) {
  const { t } = useTheme();
  const openNotes = useUI((s) => s.openNotes);
  const notesOpen = useUI((s) => s.notesOpen);
  const notesDealId = useUI((s) => s.notesDealId);
  const isMine = notesOpen && notesDealId === dealId;
  if (isMine) return null;
  return (
    <button
      onClick={() => openNotes(dealId)}
      title="Open notes"
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 90,
        width: 52,
        height: 52,
        borderRadius: 999,
        border: "none",
        background: t.brand,
        color: t.inverse,
        boxShadow: "0 6px 16px rgba(0,0,0,0.18)",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name="chat" size={20} stroke={2.2} />
    </button>
  );
}

export function DealNotesPanel() {
  const { t } = useTheme();
  const notesOpen = useUI((s) => s.notesOpen);
  const notesDealId = useUI((s) => s.notesDealId);
  const closeNotes = useUI((s) => s.closeNotes);

  const { data: deal } = useDeal(notesOpen ? notesDealId : null);
  const update = useUpdateDealById();
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const entries: DealNoteEntry[] = useMemo(() => {
    const raw = deal?.notes_entries ?? [];
    return [...raw].sort((a, b) => b.at.localeCompare(a.at));
  }, [deal?.notes_entries]);

  // Show legacy notes_text as a single read-only pinned entry at the
  // bottom of the list when the old field is set but no entries exist.
  const legacyText = !deal?.notes_entries?.length ? deal?.notes_text ?? null : null;

  useEffect(() => {
    if (notesOpen && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [notesOpen, entries.length]);

  async function appendNote() {
    if (!deal || !draft.trim()) return;
    setErr(null);
    const entry: DealNoteEntry = {
      id: newEntryId(),
      at: new Date().toISOString(),
      body: draft.trim(),
    };
    const next = [...(deal.notes_entries ?? []), entry];
    try {
      await update.mutateAsync({
        clientId: deal.client_id,
        dealId: deal.id,
        body: { notes_entries: next },
      });
      setDraft("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save note");
    }
  }

  async function deleteEntry(entryId: string) {
    if (!deal) return;
    const next = (deal.notes_entries ?? []).filter((e) => e.id !== entryId);
    try {
      await update.mutateAsync({
        clientId: deal.client_id,
        dealId: deal.id,
        body: { notes_entries: next },
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't delete");
    }
  }

  if (!notesOpen) return null;

  return (
    <>
      {/* Backdrop — click to dismiss */}
      <button
        onClick={closeNotes}
        aria-label="Close notes"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.18)",
          zIndex: 95,
          border: "none",
          cursor: "pointer",
        }}
      />
      <aside
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          width: 420,
          zIndex: 96,
          background: t.surface,
          borderLeft: `1px solid ${t.line}`,
          boxShadow: "-8px 0 24px rgba(0,0,0,0.12)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "14px 16px",
            borderBottom: `1px solid ${t.line}`,
          }}
        >
          <Icon name="chat" size={15} stroke={2.2} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: t.ink }}>Private notes</div>
            <div style={{ fontSize: 11, color: t.ink3 }}>
              {deal?.title ?? "Loading…"}
            </div>
          </div>
          <button
            onClick={closeNotes}
            style={{
              background: "transparent",
              border: "none",
              padding: 4,
              cursor: "pointer",
              color: t.ink3,
            }}
            title="Close"
          >
            <Icon name="x" size={16} stroke={2} />
          </button>
        </header>

        {/* Compose */}
        <div style={{ padding: 14, borderBottom: `1px solid ${t.line}` }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                appendNote();
              }
            }}
            rows={3}
            placeholder='Quick note… ⌘ + Enter to save'
            style={{
              width: "100%",
              padding: 10,
              fontSize: 13,
              fontFamily: "inherit",
              borderRadius: 6,
              border: `1px solid ${t.line}`,
              background: t.surface,
              color: t.ink,
              resize: "vertical",
              lineHeight: 1.4,
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 11, color: t.ink3, flex: 1 }}>
              Agent-only · never shared with funding
            </span>
            {err ? <span style={{ fontSize: 11, color: t.danger }}>{err}</span> : null}
            <button
              onClick={appendNote}
              disabled={!draft.trim() || update.isPending}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 6,
                border: "none",
                background: t.brand,
                color: t.inverse,
                cursor: "pointer",
                opacity: !draft.trim() || update.isPending ? 0.5 : 1,
              }}
            >
              {update.isPending ? "Saving…" : "Save note"}
            </button>
          </div>
        </div>

        {/* Entries */}
        <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          {entries.length === 0 && !legacyText ? (
            <div style={{ fontSize: 13, color: t.ink3, padding: "16px 0", textAlign: "center" }}>
              No notes yet. Drop a quick thought above — they&apos;re timestamped automatically.
            </div>
          ) : null}
          {entries.map((entry) => (
            <NoteCard key={entry.id} entry={entry} onDelete={() => deleteEntry(entry.id)} />
          ))}
          {legacyText ? (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 6,
                background: t.surface2,
                border: `1px dashed ${t.line}`,
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  color: t.ink3,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Legacy note
              </div>
              <div style={{ fontSize: 13, color: t.ink2, whiteSpace: "pre-wrap" }}>{legacyText}</div>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function NoteCard({ entry, onDelete }: { entry: DealNoteEntry; onDelete: () => void }) {
  const { t } = useTheme();
  const when = new Date(entry.at);
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        background: t.surface2,
        border: `1px solid ${t.line}`,
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 10.5, color: t.ink3, fontWeight: 700, letterSpacing: 0.4 }}>
          {when.toLocaleDateString()} · {when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </span>
        <button
          onClick={() => {
            if (confirm("Delete this note?")) onDelete();
          }}
          title="Delete"
          style={{
            marginLeft: "auto",
            background: "transparent",
            border: "none",
            color: t.ink3,
            cursor: "pointer",
            padding: 2,
          }}
        >
          <Icon name="x" size={11} stroke={2} />
        </button>
      </div>
      <div style={{ fontSize: 13, color: t.ink, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
        {entry.body}
      </div>
    </div>
  );
}
