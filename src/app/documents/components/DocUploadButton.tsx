"use client";

// Single-doc upload button — opens a hidden file picker, then uploads via
// the 2-step presigned-S3 flow in useUploadDocument.

import { useRef, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { useUploadDocument } from "@/hooks/useApi";

export function DocUploadButton({
  loanId,
  category,
  label,
  compact,
}: {
  loanId: string;
  category?: string;
  label?: string;
  compact?: boolean;
}) {
  const { t } = useTheme();
  const upload = useUploadDocument();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const onFile = async (file: File | null) => {
    if (!file) return;
    setFeedback(null);
    try {
      const init = await upload.mutateAsync({ loan_id: loanId, file, category });
      if (init.upload_url) {
        setFeedback("Uploaded.");
      } else {
        setFeedback("Doc row created (S3 not configured in dev).");
      }
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      // reset input so selecting the same file again refires
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <input
        ref={inputRef}
        type="file"
        style={{ display: "none" }}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={upload.isPending}
        style={{
          padding: compact ? "5px 9px" : "8px 12px",
          borderRadius: 8,
          background: t.surface2,
          color: t.ink,
          border: `1px solid ${t.line}`,
          fontSize: compact ? 11 : 12,
          fontWeight: 700,
          cursor: upload.isPending ? "wait" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <Icon name="upload" size={compact ? 11 : 13} />
        {upload.isPending ? "Uploading…" : label ?? "Upload"}
      </button>
      {feedback && <span style={{ fontSize: 11, color: t.ink3 }}>{feedback}</span>}
    </div>
  );
}
