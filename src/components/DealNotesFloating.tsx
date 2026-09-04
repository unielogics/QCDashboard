"use client";

// Floating Notes widget mounted on /deals/[id]. Two pieces:
//
//   1. A fixed bottom-right button that opens the panel.
//   2. The notes dialog itself, now the shared `Drawer` — the design system's
//      one dialog shape, which supersedes the hand-rolled right-side panel
//      this used to be. That swap is what buys Escape-to-close, focus return
//      to the button that opened it, and the body-scroll lock; the backdrop
//      click and the close button behave as they did.
//
// The entry list is the shared thread vocabulary (`.thr` / `.msg`): a note IS
// a message, the list scrolls inside its own box (which is what keeps the
// scroll-to-newest behaviour working), and the legacy blob is `.msg.internal`
// — dashed, because it is the one entry nobody wrote in this UI.
//
// Notes are agent-private — the handoff visibility filter excludes
// them from the funding baseline at promote time.

import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, IconBtn, StatusLine, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
import { useUI } from "@/store/ui";
import { InlineImageChips, InlineImageStrip, useInlineImages } from "@/components/InlineImages";
import { useDeal, useUpdateDealById } from "@/hooks/useApi";
import type { DealNoteEntry } from "@/lib/types";

function newEntryId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function DealNotesFloatingButton({ dealId }: { dealId: string }) {
  const openNotes = useUI((s) => s.openNotes);
  const notesOpen = useUI((s) => s.notesOpen);
  const notesDealId = useUI((s) => s.notesDealId);
  const isMine = notesOpen && notesDealId === dealId;
  if (isMine) return null;
  return (
    <button
      onClick={() => openNotes(dealId)}
      title="Open notes"
      // Bespoke geometry, deliberately inline: this is a floating action
      // button pinned to the viewport, and nothing in the class vocabulary is
      // one. `.btn` is an in-flow control — its 10px radius and 8/14 padding
      // would every one of them have to be overridden here, which is exactly
      // the class-vs-inline ambiguity the migration is removing. Colours are
      // stylesheet variables rather than theme tokens so the palette still
      // lives in one place.
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 90,
        width: 52,
        height: 52,
        borderRadius: 999,
        border: "none",
        background: "var(--accent)",
        color: "#fff",
        boxShadow: "var(--sh2)",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name="pencil" size={20} stroke={2.2} />
    </button>
  );
}

export function DealNotesPanel() {
  const notesOpen = useUI((s) => s.notesOpen);
  const notesDealId = useUI((s) => s.notesDealId);
  const closeNotes = useUI((s) => s.closeNotes);

  const { data: deal } = useDeal(notesOpen ? notesDealId : null);
  const update = useUpdateDealById();
  const [draft, setDraft] = useState("");
  const pasted = useInlineImages("deal_note");
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
    if (!deal || (!draft.trim() && !pasted.images.length)) return;
    setErr(null);
    const entry: DealNoteEntry = {
      id: newEntryId(),
      at: new Date().toISOString(),
      body: draft.trim(),
      // The server binds these to this entry id on the write; the read hands
      // back signed urls under `images`.
      image_ids: pasted.ids,
    };
    const next = [...(deal.notes_entries ?? []), entry];
    try {
      await update.mutateAsync({
        clientId: deal.client_id,
        dealId: deal.id,
        body: { notes_entries: next },
      });
      setDraft("");
      pasted.reset();
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
    <Drawer
      open={notesOpen}
      onClose={closeNotes}
      width="md"
      title="Private notes"
      sub={deal?.title ?? "Loading…"}
      bodyClass="grid"
    >
      {/* Compose stays at the top, where it was: the entry list is
          newest-first and scrolls itself, so a composer under it would be
          below the fold on any file with real history. */}
      <div className="grid g8">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              appendNote();
            }
          }}
          onPaste={pasted.onPaste}
          rows={3}
          placeholder="Quick note… paste a screenshot to attach it. ⌘ + Enter to save"
          aria-label="New private note"
        />
        <InlineImageChips images={pasted.images} onRemove={pasted.remove} busy={pasted.busy} />
        {pasted.error ? <StatusLine tone="bad">{pasted.error}</StatusLine> : null}
        {err ? <StatusLine tone="bad">{err}</StatusLine> : null}
        <div className="row">
          <span className="sub grow">Agent-only · never shared with funding</span>
          <Btn
            variant="pri"
            onClick={appendNote}
            disabled={(!draft.trim() && !pasted.images.length) || update.isPending}
          >
            {update.isPending ? "Saving…" : "Save note"}
          </Btn>
        </div>
      </div>

      {/* Entries. `.thr` is the scroll box the scroll-to-top effect targets. */}
      <div ref={listRef} className="thr">
        {entries.length === 0 && !legacyText ? (
          <div className="thr-empty">
            No notes yet. Drop a quick thought above — they&apos;re timestamped automatically.
          </div>
        ) : null}
        {entries.map((entry) => (
          <NoteCard key={entry.id} entry={entry} onDelete={() => deleteEntry(entry.id)} />
        ))}
        {legacyText ? (
          <div className="msg internal">
            <div className="msg-h">
              <span className="msg-role">Legacy note</span>
            </div>
            <div className="msg-b">{legacyText}</div>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}

function NoteCard({ entry, onDelete }: { entry: DealNoteEntry; onDelete: () => void }) {
  const confirmAction = useConfirmAction();
  const when = new Date(entry.at);
  return (
    <div className="msg">
      <div className="msg-h">
        <span className="msg-when">
          {when.toLocaleDateString()} ·{" "}
          {when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </span>
        <span className="grow" />
        <IconBtn
          onClick={async () => {
            const confirmed = await confirmAction({
              title: "Delete private note",
              body: "This note will be removed from the file history.",
              confirmLabel: "Delete note",
              tone: "danger",
              reversible: false,
            });
            if (confirmed) onDelete();
          }}
          title="Delete"
          aria-label="Delete note"
        >
          <Icon name="x" size={11} stroke={2} />
        </IconBtn>
      </div>
      <div className="msg-b">{entry.body}</div>
      <InlineImageStrip images={entry.images} />
    </div>
  );
}
