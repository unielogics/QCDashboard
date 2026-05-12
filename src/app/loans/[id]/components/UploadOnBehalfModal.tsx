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

import { useRef, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
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
  const { t } = useTheme();
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
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(0,0,0,0.32)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "min(620px, 96vw)",
        maxHeight: "86vh",
        background: t.surface,
        borderRadius: 14,
        border: `1px solid ${t.line}`,
        boxShadow: "0 24px 48px rgba(0,0,0,0.22)",
        display: "flex",
        flexDirection: "column",
      }}>
        <header style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 18px",
          borderBottom: `1px solid ${t.line}`,
        }}>
          <Icon name="doc" size={14} />
          <span style={{ fontSize: 14, fontWeight: 900, color: t.ink }}>
            Upload on behalf of the client
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              all: "unset", cursor: "pointer",
              padding: 6, borderRadius: 6,
              color: t.ink3, fontSize: 18, fontWeight: 900, lineHeight: 1,
            }}
          >×</button>
        </header>

        <div style={{
          padding: "10px 18px",
          background: t.brandSoft,
          color: t.brand,
          fontSize: 12, fontWeight: 700, lineHeight: 1.5,
          borderBottom: `1px solid ${t.line}`,
          display: "flex", alignItems: "flex-start", gap: 8,
        }}>
          <Icon name="ai" size={13} stroke={2.2} style={{ marginTop: 1 }} />
          <span>
            <strong>AI analyzes every upload.</strong> Whichever slot you pick (or "upload as new"),
            the scanner verifies the file matches the expected content + posts notes to the loan chat.
          </span>
        </div>

        <div style={{ overflow: "auto", padding: 18, flex: 1, minHeight: 0 }}>
          <SectionLabel>Pick a slot to fulfill</SectionLabel>
          {openSlots.length === 0 ? (
            <div style={{
              padding: 14, borderRadius: 9,
              background: t.surface2, color: t.ink3,
              fontSize: 12.5, fontWeight: 700,
              border: `1px dashed ${t.line}`,
              textAlign: "center",
            }}>
              No open slots — every requested document has been received. Use "Upload as new" below.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
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

          <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${t.line}` }}>
            <SectionLabel>Off-checklist</SectionLabel>
            <button
              type="button"
              disabled={busy}
              onClick={() => triggerPicker(null)}
              style={{
                marginTop: 8,
                width: "100%",
                display: "flex", alignItems: "center", gap: 10,
                padding: 12, borderRadius: 10,
                background: t.surface,
                border: `1px dashed ${t.lineStrong}`,
                color: t.ink,
                fontSize: 13, fontWeight: 800,
                cursor: busy ? "wait" : "pointer",
                textAlign: "left",
                fontFamily: "inherit",
              }}
            >
              <Icon name="plus" size={14} />
              <span style={{ flex: 1 }}>Upload as new (not on checklist)</span>
              <span style={{ fontSize: 11, color: t.ink3, fontWeight: 700 }}>
                AI will propose a slot
              </span>
            </button>
          </div>

          {feedback ? (
            <div style={{
              marginTop: 14,
              padding: 10, borderRadius: 9,
              background: feedback.kind === "ok" ? t.profitBg : t.dangerBg,
              color: feedback.kind === "ok" ? t.profit : t.danger,
              fontSize: 12, fontWeight: 800,
            }}>
              {feedback.text}
            </div>
          ) : null}
          {busy ? (
            <div style={{ marginTop: 12, fontSize: 12, color: t.ink3, fontWeight: 700, textAlign: "center" }}>
              Uploading…
            </div>
          ) : null}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  );
}


function SlotRow({
  doc, disabled, onPick,
}: {
  doc: Document;
  disabled: boolean;
  onPick: () => void;
}) {
  const { t } = useTheme();
  const scanLabel = scanBadge(doc.ai_scan_status);
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      style={{
        all: "unset",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 10,
        border: `1px solid ${t.line}`,
        background: t.surface,
        cursor: disabled ? "wait" : "pointer",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = t.surface2; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = t.surface; }}
    >
      <Icon name="doc" size={14} style={{ color: t.ink3 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {doc.name}
        </div>
        <div style={{ fontSize: 11, color: t.ink3 }}>
          {doc.category ?? "uncategorized"}
          {doc.checklist_key ? ` · ${doc.checklist_key}` : doc.is_other ? " · custom" : ""}
        </div>
      </div>
      {scanLabel ? (
        <span style={{
          fontSize: 9.5, fontWeight: 900,
          padding: "2px 6px", borderRadius: 4,
          background: scanLabel.bg(t), color: scanLabel.fg(t),
          letterSpacing: 0.3, textTransform: "uppercase",
        }}>
          {scanLabel.label}
        </span>
      ) : null}
      <span style={{
        fontSize: 11, fontWeight: 800,
        padding: "3px 8px", borderRadius: 6,
        background: statusBg(doc.status, t), color: statusFg(doc.status, t),
        textTransform: "uppercase", letterSpacing: 0.3,
      }}>
        {doc.status}
      </span>
      <Icon name="arrowR" size={12} style={{ color: t.ink3 }} />
    </button>
  );
}


function SectionLabel({ children }: { children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 900, letterSpacing: 1.0,
      textTransform: "uppercase", color: t.ink3,
    }}>
      {children}
    </div>
  );
}


function scanBadge(status: string | undefined | null): { label: string; bg: (t: ReturnType<typeof useTheme>["t"]) => string; fg: (t: ReturnType<typeof useTheme>["t"]) => string } | null {
  if (!status || status === "unscanned") return null;
  switch (status) {
    case "queued":
    case "scanning":
      return { label: "AI scanning", bg: (t) => t.brandSoft, fg: (t) => t.brand };
    case "verified":
      return { label: "AI verified", bg: (t) => t.profitBg, fg: (t) => t.profit };
    case "flagged":
      return { label: "AI flagged", bg: (t) => t.dangerBg, fg: (t) => t.danger };
    case "failed":
      return { label: "AI failed", bg: (t) => t.warnBg, fg: (t) => t.warn };
    default:
      return null;
  }
}

function statusBg(s: string, t: ReturnType<typeof useTheme>["t"]) {
  if (s === "verified") return t.profitBg;
  if (s === "received") return t.brandSoft;
  if (s === "flagged") return t.dangerBg;
  return t.warnBg;
}
function statusFg(s: string, t: ReturnType<typeof useTheme>["t"]) {
  if (s === "verified") return t.profit;
  if (s === "received") return t.brand;
  if (s === "flagged") return t.danger;
  return t.warn;
}
