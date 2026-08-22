"use client";

// UploadOnBehalfModal — operator picks which checklist slot the file
// they're about to upload satisfies, THEN picks the file. Solves the
// "I uploaded but the system doesn't know what it is" pain that a bare
// upload button has — every file goes straight into the right slot.
//
// Surfaces (top → bottom):
//   1. Banner explaining AI scans every upload (sets expectations).
//   2. Open slots list — every requested / pending / flagged doc on
//      the loan, with the AI status of each. Click selects the slot
//      and opens the OS file picker.
//   3. "Upload as new — not on checklist" fallback for one-off files
//      the operator wants to attach without matching a slot. Lands as
//      a Document with is_other=true; the scanner still runs and
//      proposes a slot via the chat routing flow.
//
// Restyled onto the plain-CSS design system. The hand-rolled overlay
// became `Drawer`, which adds Escape-to-close, focus return and a body
// scroll lock; the JS mouseenter/mouseleave hover swap on each slot row
// is now `.pick:hover`.

import { useRef, useState } from "react";
import { Btn, Callout, CellChip, StatusLine, Sub, type ChipTone } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { useUploadDocument } from "@/hooks/useApi";
import type { Document } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  loanId: string;
  docs: Document[];
}

export function UploadOnBehalfModal({ open, onClose, loanId, docs }: Props) {
  const upload = useUploadDocument();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Document we're currently uploading TO. null = "upload as new".
  const [pendingFulfillId, setPendingFulfillId] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Slots that are NOT already received — these are the ones an
  // operator-uploaded file should fulfill.
  const openSlots = docs.filter((d) => d.status === "requested" || d.status === "pending" || d.status === "flagged");

  const triggerPicker = (fulfillId: string | null) => {
    setPendingFulfillId(fulfillId);
    setFeedback(null);
    // defer to next tick so the input element is mounted before .click()
    setTimeout(() => fileInputRef.current?.click(), 0);
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const res = await upload.mutateAsync({
        loan_id: loanId,
        file,
        fulfill_document_id: pendingFulfillId ?? null,
      });
      const matched = pendingFulfillId
        ? docs.find((d) => d.id === pendingFulfillId)
        : null;
      setFeedback({
        kind: "ok",
        text: matched
          ? `Uploaded ${file.name} → "${matched.name}". AI scan queued.`
          : `Uploaded ${file.name} as a new item. AI will scan + propose a slot.`,
      });
      // Reset the input so the same file can be re-picked.
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Allow caller to re-render with the new doc; we leave the modal
      // open so the operator can upload another for a different slot.
      void res;
    } catch (e) {
      setFeedback({ kind: "err", text: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      setBusy(false);
      setPendingFulfillId(undefined);
    }
  };

  if (!open) return null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Upload on behalf of the client"
      width="md"
      bodyClass="grid"
    >
      <Callout tone="acc" icon={<Icon name="ai" size={13} stroke={2.2} />}>
        <strong>AI analyzes every upload.</strong> Whichever slot you pick (or &quot;upload as new&quot;),
        the scanner verifies the file matches the expected content + posts notes to the loan chat.
      </Callout>

      <div>
        <div className="lbl">Pick a slot to fulfill</div>
        {openSlots.length === 0 ? (
          <div className="hintbox mt">
            <div className="grow">
              No open slots — every requested document has been received. Use &quot;Upload as new&quot; below.
            </div>
          </div>
        ) : (
          <div className="picklist mt">
            {openSlots.map((d) => (
              <SlotRow
                key={d.id}
                doc={d}
                disabled={busy}
                onPick={() => triggerPicker(d.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div style={{ paddingTop: 14, borderTop: "1px solid var(--line)" }}>
        <div className="lbl mb">Off-checklist</div>
        <Btn
          className="ctrl-block"
          disabled={busy}
          onClick={() => triggerPicker(null)}
        >
          <Icon name="plus" size={14} />
          <span className="grow" style={{ textAlign: "left" }}>Upload as new (not on checklist)</span>
          <Sub>AI will propose a slot</Sub>
        </Btn>
      </div>

      {feedback ? (
        <StatusLine tone={feedback.kind === "ok" ? "ok" : "bad"}>{feedback.text}</StatusLine>
      ) : null}
      {busy ? <Sub>Uploading…</Sub> : null}

      <input
        ref={fileInputRef}
        type="file"
        // Functional, not decorative: the picker is opened programmatically
        // and the control itself must never be laid out.
        style={{ display: "none" }}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </Drawer>
  );
}


function SlotRow({
  doc, disabled, onPick,
}: {
  doc: Document;
  disabled: boolean;
  onPick: () => void;
}) {
  const scanLabel = scanBadge(doc.ai_scan_status);
  return (
    <button
      type="button"
      className="pick"
      onClick={onPick}
      disabled={disabled}
      // State-derived, and deliberately overrides `.pick`'s pointer: an
      // upload is in flight and this row cannot be picked right now.
      style={disabled ? { cursor: "wait" } : undefined}
    >
      <Icon name="doc" size={14} />
      <div className="grow">
        <div className="trunc" style={{ fontWeight: 700 }}>{doc.name}</div>
        <div className="sub">
          {doc.category ?? "uncategorized"}
          {doc.checklist_key ? ` · ${doc.checklist_key}` : doc.is_other ? " · custom" : ""}
        </div>
      </div>
      {scanLabel ? (
        <CellChip className="caps" tone={scanLabel.tone}>{scanLabel.label}</CellChip>
      ) : null}
      <CellChip className="caps" tone={statusTone(doc.status)}>{doc.status}</CellChip>
      <Icon name="arrowR" size={12} />
    </button>
  );
}


function scanBadge(status: string | undefined | null): { label: string; tone: ChipTone } | null {
  if (!status || status === "unscanned") return null;
  switch (status) {
    case "queued":
    case "scanning":
      return { label: "AI scanning", tone: "acc" };
    case "verified":
      return { label: "AI verified", tone: "ok" };
    case "flagged":
      return { label: "AI flagged", tone: "bad" };
    case "failed":
      return { label: "Elara failed", tone: "warn" };
    default:
      return null;
  }
}

function statusTone(s: string): ChipTone {
  if (s === "verified") return "ok";
  if (s === "received") return "acc";
  if (s === "flagged") return "bad";
  return "warn";
}
