"use client";

// "Preview before send" modal. The operator types into the composer
// and clicks Preview → this modal shows the EXACT subject/to/body
// that will be transmitted to Gmail, plus a clear Gmail-readiness
// banner. For Instruct AI mode this is where the operator sees the
// AI's drafted body before it gets sent.
//
// Calls POST /loans/{id}/lender-thread/preview — that endpoint writes
// nothing; it just computes the EmailMessage.

import { useEffect } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import type {
  LenderThreadPreviewResponse,
  LenderThreadReplyMode,
} from "@/lib/types";
import { useLenderThreadPreview } from "@/hooks/useApi";

interface Props {
  open: boolean;
  loanId: string;
  mode: LenderThreadReplyMode;
  text: string;
  onCancel: () => void;
  onConfirm: (preview: LenderThreadPreviewResponse) => void;
  confirming: boolean;
}

export function LenderThreadPreviewModal({
  open,
  loanId,
  mode,
  text,
  onCancel,
  onConfirm,
  confirming,
}: Props) {
  const { t } = useTheme();
  const preview = useLenderThreadPreview();

  useEffect(() => {
    if (open && text.trim()) {
      preview.mutate({ loanId, payload: { mode, text } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loanId, mode, text]);

  if (!open) return null;

  const data = preview.data;
  const errMsg =
    preview.error instanceof Error ? preview.error.message : null;

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11, 22, 41, 0.5)",
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          background: t.surface,
          borderRadius: 14,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          border: `1px solid ${t.line}`,
          boxShadow: "0 12px 40px rgba(11, 22, 41, 0.18)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 1.6,
                textTransform: "uppercase",
                color: t.petrol,
              }}
            >
              Preview {modeLabel(mode)}
            </div>
            <h2
              style={{
                margin: "2px 0 0",
                fontSize: 18,
                fontWeight: 800,
                color: t.ink,
                letterSpacing: -0.4,
              }}
            >
              What will be sent
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            style={{
              all: "unset",
              cursor: confirming ? "wait" : "pointer",
              padding: 8,
              borderRadius: 8,
              border: `1px solid ${t.line}`,
              color: t.ink2,
            }}
          >
            <Icon name="close" size={12} stroke={3} />
          </button>
        </div>

        {preview.isPending ? (
          <Card pad={18}>
            <div style={{ fontSize: 12.5, color: t.ink3 }}>
              Building the email…
              {mode === "instruct_ai"
                ? " (Instruct AI runs the LLM to draft the body — give it a moment.)"
                : ""}
            </div>
          </Card>
        ) : errMsg ? (
          <Card pad={18}>
            <div style={{ fontSize: 12.5, color: t.danger }}>
              Preview failed: {errMsg}
            </div>
          </Card>
        ) : data ? (
          <>
            <GmailReadinessBanner t={t} data={data} />

            <Card pad={0}>
              <div
                style={{
                  padding: "12px 16px",
                  display: "grid",
                  gridTemplateColumns: "80px 1fr",
                  gap: 8,
                  fontSize: 12.5,
                  color: t.ink,
                }}
              >
                <FieldLabel t={t}>From</FieldLabel>
                <div style={{ color: t.ink2 }}>
                  {data.gmail_payload.from_email || (
                    <span style={{ color: t.warn }}>
                      (no GMAIL_DELEGATED_USER configured)
                    </span>
                  )}
                </div>

                <FieldLabel t={t}>To</FieldLabel>
                <div>{data.to_email}</div>

                <FieldLabel t={t}>Subject</FieldLabel>
                <div>{data.subject}</div>
              </div>
              <div
                style={{
                  padding: "12px 16px",
                  borderTop: `1px solid ${t.line}`,
                  background: t.surface2,
                  fontSize: 12.5,
                  color: t.ink,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                }}
              >
                {data.body}
              </div>
            </Card>

            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 6,
              }}
            >
              <button
                type="button"
                onClick={onCancel}
                disabled={confirming}
                style={{
                  all: "unset",
                  cursor: confirming ? "wait" : "pointer",
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: `1px solid ${t.line}`,
                  fontSize: 13,
                  color: t.ink2,
                  background: t.surface,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onConfirm(data)}
                disabled={confirming}
                style={{
                  all: "unset",
                  cursor: confirming ? "wait" : "pointer",
                  padding: "10px 18px",
                  borderRadius: 10,
                  background: data.gmail_ready ? t.petrol : t.warn,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  opacity: confirming ? 0.6 : 1,
                }}
              >
                {confirming
                  ? "Working…"
                  : data.gmail_ready
                  ? `Confirm — send to ${data.to_email}`
                  : "Confirm — save locally (Gmail NOT configured)"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function GmailReadinessBanner({
  t,
  data,
}: {
  t: ReturnType<typeof useTheme>["t"];
  data: LenderThreadPreviewResponse;
}) {
  const bg = data.gmail_ready ? t.profitBg : t.warnBg;
  const fg = data.gmail_ready ? t.profit : t.warn;
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        background: bg,
        border: `1px solid ${fg}33`,
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <Pill bg={bg} color={fg}>
        {data.gmail_ready ? "Gmail ready" : "Saved-only mode"}
      </Pill>
      <div style={{ fontSize: 12, color: fg, lineHeight: 1.5 }}>
        {data.gmail_status_note}
      </div>
    </div>
  );
}

function FieldLabel({
  t,
  children,
}: {
  t: ReturnType<typeof useTheme>["t"];
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: t.ink3,
        paddingTop: 2,
      }}
    >
      {children}
    </div>
  );
}

function modeLabel(m: LenderThreadReplyMode): string {
  return m === "send_now" ? "Send" : m === "instruct_ai" ? "Instruct AI" : "Save draft";
}
