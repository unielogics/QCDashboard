"use client";

// Single-doc upload button — opens a hidden file picker, then uploads via
// the 2-step presigned-S3 flow in useUploadDocument.

import { useEffect, useRef, useState } from "react";
import { Btn } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useUploadDocument } from "@/hooks/useApi";

export function DocUploadButton({
  loanId,
  category,
  label,
  compact,
  fulfillDocId,
  autoOpen,
  onAutoOpenHandled,
}: {
  loanId: string;
  category?: string;
  label?: string;
  compact?: boolean;
  // When set, the upload links to that REQUESTED row instead of
  // creating a fresh one — wired by the chat's `upload_document`
  // CTA flowing through `?upload=<doc_id>` on the docs tab.
  fulfillDocId?: string | null;
  // When true, fire the file picker on mount once. Used for the
  // chat-CTA deep link so the borrower lands directly in the OS
  // file dialog instead of having to click again.
  autoOpen?: boolean;
  onAutoOpenHandled?: () => void;
}) {
  const upload = useUploadDocument();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    if (autoOpen && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      // Defer to next tick so the input is mounted.
      setTimeout(() => inputRef.current?.click(), 0);
      onAutoOpenHandled?.();
    }
  }, [autoOpen, onAutoOpenHandled]);

  const onFile = async (file: File | null) => {
    if (!file) return;
    setFeedback(null);
    try {
      const init = await upload.mutateAsync({
        loan_id: loanId,
        file,
        category,
        fulfill_document_id: fulfillDocId ?? null,
      });
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
    // Bespoke inline-flex: this button sits inside table cells and inline rows
    // across four routes, so it must stay inline-level rather than become a
    // block-level `.row`.
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <Btn
        size={compact ? "sm" : undefined}
        onClick={() => inputRef.current?.click()}
        disabled={upload.isPending}
        // In-flight cursor is state-derived; `.btn:disabled` only knows
        // "not clickable", not "working".
        style={upload.isPending ? { cursor: "wait" } : undefined}
      >
        <Icon name="upload" size={compact ? 11 : 13} />
        {upload.isPending ? "Uploading…" : label ?? "Upload"}
      </Btn>
      {feedback && <span className="sub">{feedback}</span>}
    </span>
  );
}
