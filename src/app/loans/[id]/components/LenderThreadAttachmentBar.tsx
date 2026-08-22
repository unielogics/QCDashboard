"use client";

// Compact attachment UI for the LenderThread composer.
//
// Two ways to add an attachment:
//   1. Browser file picker → presigned S3 PUT → upload-complete
//      (useUploadLenderAttachment handles all three calls).
//   2. Modal listing the loan's existing Documents → /from-doc
//      creates a system_doc_ref attachment row (no S3 copy).
//
// Selected attachments render as chips above the composer textarea
// with an "x" to remove. On submit, the parent passes the chip IDs
// into the reply payload so the backend can MIME-attach them.
//
// Restyled onto the plain-CSS design system; the document picker moved onto
// `Drawer`, which brings Escape-to-close, focus return and a scroll lock.

import { useState } from "react";
import { Btn, CellChip, Empty, StatusLine, Sub } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import {
  useDocuments,
  useLenderAttachmentFromDoc,
  useUploadLenderAttachment,
} from "@/hooks/useApi";
import type { LenderAttachmentRef } from "@/lib/types";

interface Props {
  loanId: string;
  attachments: LenderAttachmentRef[];
  onChange: (next: LenderAttachmentRef[]) => void;
}

export function LenderThreadAttachmentBar({ loanId, attachments, onChange }: Props) {
  const upload = useUploadLenderAttachment(loanId);
  const fromDoc = useLenderAttachmentFromDoc();
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const next: LenderAttachmentRef[] = [...attachments];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Hard cap mirrors backend (18 MB). Catch in the UI so the
        // operator gets a clean error rather than an S3 PUT failure.
        if (file.size > 18 * 1024 * 1024) {
          throw new Error(`${file.name} exceeds the 18 MB limit.`);
        }
        const ref = await upload(file);
        next.push(ref);
      }
      onChange(next);
    } catch (err) {
      setError((err as Error).message ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const removeAt = (id: string) => {
    onChange(attachments.filter((a) => a.attachment_id !== id));
  };

  return (
    <div className="grid g8">
      <div className="row">
        {/* A <label> wrapping a hidden file input, wearing `.btn`. Kept as a
            label rather than promoted to a button because the click path is
            the browser's own; see the note in `problems` about the fact that
            neither the label nor the display:none input is reachable by
            keyboard — that is pre-existing and untouched here. */}
        <label
          className="btn sm"
          // State-derived: an upload is in flight, so `.btn`'s pointer is wrong.
          style={uploading ? { cursor: "wait", opacity: 0.6 } : undefined}
        >
          <Icon name="paperclip" size={11} stroke={2.5} />
          {uploading ? "Uploading…" : "Upload from computer"}
          <input
            type="file"
            multiple
            disabled={uploading}
            onChange={(e) => {
              handleFiles(e.target.files).then(() => {
                e.target.value = "";
              });
            }}
            style={{ display: "none" }}
          />
        </label>
        <Btn size="sm" onClick={() => setDocPickerOpen(true)}>
          <Icon name="doc" size={11} stroke={2.5} />
          Pick from loan files
        </Btn>
        {attachments.length > 0 && (
          <Sub>
            {attachments.length} attachment{attachments.length === 1 ? "" : "s"}
          </Sub>
        )}
      </div>
      {error && <StatusLine tone="bad">{error}</StatusLine>}
      {attachments.length > 0 && (
        <div className="row">
          {attachments.map((a) => (
            <AttachmentChip
              key={a.attachment_id}
              attachment={a}
              onRemove={() => removeAt(a.attachment_id)}
            />
          ))}
        </div>
      )}

      <DocPickerModal
        open={docPickerOpen}
        loanId={loanId}
        onClose={() => setDocPickerOpen(false)}
        onPicked={async (documentId) => {
          setError(null);
          try {
            const ref = await fromDoc.mutateAsync({ loanId, documentId });
            onChange([...attachments, ref]);
            setDocPickerOpen(false);
          } catch (err) {
            setError((err as Error).message ?? "Failed to attach loan document.");
          }
        }}
      />
    </div>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: LenderAttachmentRef;
  onRemove: () => void;
}) {
  const isFromDoc = attachment.source === "system_doc_ref";
  return (
    <CellChip
      // Tone says where the file came from: a loan document, or an upload.
      tone={isFromDoc ? "acc" : "mut"}
      title={attachment.filename}
    >
      <Icon name={isFromDoc ? "doc" : "paperclip"} size={10} stroke={2.5} />
      {/* Bespoke measure — a filename chip must not push the composer wide. */}
      <span className="trunc" style={{ maxWidth: 220 }}>{attachment.filename}</span>
      {attachment.size_bytes > 0 && <span>{formatBytes(attachment.size_bytes)}</span>}
      <button
        type="button"
        className="linky"
        aria-label={`Remove ${attachment.filename}`}
        onClick={onRemove}
      >
        <Icon name="close" size={9} stroke={3} />
      </button>
    </CellChip>
  );
}

function DocPickerModal({
  open,
  loanId,
  onClose,
  onPicked,
}: {
  open: boolean;
  loanId: string;
  onClose: () => void;
  onPicked: (documentId: string) => Promise<void> | void;
}) {
  const { data: docs = [], isLoading } = useDocuments(loanId);
  // Only show docs that have actually been uploaded (have s3_key).
  // Skipping is_other? No — those are legitimate files too.
  const usable = docs.filter((d) => !!d.s3_key);

  if (!open) return null;
  return (
    <Drawer open={open} onClose={onClose} title="Attach an existing loan file" width="md">
      {isLoading ? (
        <Sub>Loading…</Sub>
      ) : usable.length === 0 ? (
        <Empty>
          No uploaded files on this loan yet.
        </Empty>
      ) : (
        <div className="picklist">
          {usable.map((d) => (
            <button key={d.id} type="button" className="pick" onClick={() => onPicked(d.id)}>
              <span className="grow trunc">{d.name}</span>
              {d.category && <CellChip>{d.category}</CellChip>}
            </button>
          ))}
        </div>
      )}
    </Drawer>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
