"use client";

// "Preview before send" modal. The operator types into the composer
// and clicks Preview → this modal shows the EXACT subject/to/body
// that will be transmitted to Gmail, plus a clear Gmail-readiness
// banner. For Instruct Elara mode this is where the operator sees the
// AI's drafted body before it gets sent.
//
// Calls POST /loans/{id}/lender-thread/preview — that endpoint writes
// nothing; it just computes the EmailMessage.
//
// Restyled onto `Drawer`, which adds Escape-to-close, focus return and a
// body scroll lock the hand-rolled overlay never had.

import { useEffect } from "react";
import { Btn, Callout, Panel, StatusLine, Sub } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
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
    <Drawer
      open={open}
      onClose={onCancel}
      title="What will be sent"
      sub={`Preview ${modeLabel(mode)}`}
      width="md"
      bodyClass="grid"
      footer={
        data ? (
          <>
            <span className="grow" />
            <Btn onClick={onCancel} disabled={confirming}>Cancel</Btn>
            <Btn
              // Blue when Gmail will actually deliver; amber when the confirm
              // only writes a local record. `.btn.tone-warn` rather than a
              // bare tone chip, which `.btn:hover` would out-specify.
              variant={data.gmail_ready ? "pri" : "default"}
              className={data.gmail_ready ? undefined : "tone-warn"}
              onClick={() => onConfirm(data)}
              disabled={confirming}
            >
              {confirming
                ? "Working…"
                : data.gmail_ready
                ? `Confirm — send to ${data.to_email}`
                : "Confirm — save locally (Gmail NOT configured)"}
            </Btn>
          </>
        ) : undefined
      }
    >
      {preview.isPending ? (
        <Sub>
          Building the email…
          {mode === "instruct_ai"
            ? " (Instruct Elara runs the LLM to draft the body — give it a moment.)"
            : ""}
        </Sub>
      ) : errMsg ? (
        <StatusLine tone="bad">Preview failed: {errMsg}</StatusLine>
      ) : data ? (
        <>
          <Callout tone={data.gmail_ready ? "ok" : "warn"}>
            <div className="lbl">{data.gmail_ready ? "Gmail ready" : "Saved-only mode"}</div>
            <div>{data.gmail_status_note}</div>
          </Callout>

          <Panel noPad>
            {/* Bespoke definition list: a fixed 80px label column. */}
            <div
              className="panel-b"
              style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 8 }}
            >
              <div className="lbl">From</div>
              <div>
                {data.gmail_payload.from_email || (
                  <span style={{ color: "var(--warn)" }}>
                    (no GMAIL_DELEGATED_USER configured)
                  </span>
                )}
              </div>

              <div className="lbl">To</div>
              <div>{data.to_email}</div>

              <div className="lbl">Subject</div>
              <div>{data.subject}</div>
            </div>
            <div
              className="panel-b pretext"
              style={{ borderTop: "1px solid var(--line)", background: "var(--sunken2)" }}
            >
              {data.body}
            </div>
          </Panel>
        </>
      ) : null}
    </Drawer>
  );
}

function modeLabel(m: LenderThreadReplyMode): string {
  return m === "send_now" ? "Send" : m === "instruct_ai" ? "Instruct Elara" : "Save draft";
}
