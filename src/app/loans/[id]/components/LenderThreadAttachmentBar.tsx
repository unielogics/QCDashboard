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

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill } from "@/components/design-system/primitives";
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
  const { t } = useTheme();
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
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label
          style={{
            cursor: uploading ? "wait" : "pointer",
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${t.line}`,
            fontSize: 11.5,
            fontWeight: 700,
            color: t.brand,
            background: t.surface,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            opacity: uploading ? 0.6 : 1,
          }}
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
        <button
          type="button"
          onClick={() => setDocPickerOpen(true)}
          style={{
            all: "unset",
            cursor: "pointer",
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${t.line}`,
            fontSize: 11.5,
            fontWeight: 700,
            color: t.brand,
            background: t.surface,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icon name="doc" size={11} stroke={2.5} />
          Pick from loan files
        </button>
        {attachments.length > 0 && (
          <span style={{ fontSize: 11, color: t.ink3 }}>
            {attachments.length} attachment{attachments.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {error && <div style={{ fontSize: 11.5, color: t.danger }}>{error}</div>}
      {attachments.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {attachments.map((a) => (
            <AttachmentChip
              key={a.attachment_id}
              t={t}
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
  t,
  attachment,
  onRemove,
}: {
  t: ReturnType<typeof useTheme>["t"];
  attachment: LenderAttachmentRef;
  onRemove: () => void;
}) {
  const isFromDoc = attachment.source === "system_doc_ref";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        borderRadius: 999,
        background: isFromDoc ? t.brandSoft : t.surface2,
        border: `1px solid ${t.line}`,
        fontSize: 11.5,
        color: t.ink,
        maxWidth: 280,
      }}
      title={attachment.filename}
    >
      <Icon name={isFromDoc ? "doc" : "paperclip"} size={10} stroke={2.5} />
      <span
        style={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 220,
        }}
      >
        {attachment.filename}
      </span>
      {attachment.size_bytes > 0 && (
        <span style={{ color: t.ink3, fontSize: 10 }}>
          {formatBytes(attachment.size_bytes)}
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        style={{
          all: "unset",
          cursor: "pointer",
          width: 14,
          height: 14,
          borderRadius: 7,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: t.ink3,
        }}
      >
        <Icon name="close" size={9} stroke={3} />
      </button>
    </span>
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
  const { t } = useTheme();
  const { data: docs = [], isLoading } = useDocuments(loanId);
  // Only show docs that have actually been uploaded (have s3_key).
  // Skipping is_other? No — those are legitimate files too.
  const usable = docs.filter((d) => !!d.s3_key);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11, 22, 41, 0.5)",
        zIndex: 75,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "80vh",
          overflowY: "auto",
          background: t.surface,
          borderRadius: 14,
          padding: 18,
          border: `1px solid ${t.line}`,
          boxShadow: "0 12px 40px rgba(11, 22, 41, 0.18)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: -0.2,
              color: t.ink,
            }}
          >
            Attach an existing loan file
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              all: "unset",
              cursor: "pointer",
              padding: 6,
              borderRadius: 6,
              border: `1px solid ${t.line}`,
              color: t.ink2,
            }}
          >
            <Icon name="close" size={11} stroke={3} />
          </button>
        </div>
        {isLoading ? (
          <div style={{ fontSize: 12, color: t.ink3 }}>Loading…</div>
        ) : usable.length === 0 ? (
          <div style={{ fontSize: 12, color: t.ink3 }}>
            No uploaded files on this loan yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {usable.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onPicked(d.id)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  padding: "9px 11px",
                  borderRadius: 8,
                  border: `1px solid ${t.line}`,
                  background: t.surface,
                  fontSize: 12.5,
                  color: t.ink,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    flex: 1,
                  }}
                >
                  {d.name}
                </span>
                {d.category && (
                  <Pill bg={t.surface2} color={t.ink3}>
                    {d.category}
                  </Pill>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
