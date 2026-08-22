"use client";

// Right-side drawer that shows EXACTLY what we sent (or would send) to
// Gmail for a single thread entry. Two layers:
//
// 1. Friendly view (default): From / To / Subject / Sent / Status +
//    Body. Reads like a Gmail message detail.
// 2. Advanced (collapsed by default, expands on click): raw DB rows —
//    Message, EmailDraft, Activity — plus the base64 RFC 5322 message
//    that hits the Gmail API. Used to debug "did this actually go
//    out and if not, why?"
//
// Powered by GET /loans/{id}/lender-thread/entry/{entry_id}/audit.
//
// Restyled onto the shared `RightPanel` — the same edge-anchored sheet this
// was hand-rolling, plus an Escape handler it never had.

import { useState } from "react";
import { Btn, CellChip, Panel, StatusLine, Sub } from "@/components/ds";
import { RightPanel } from "@/components/design-system/RightPanel";
import { Icon } from "@/components/design-system/Icon";
import { useLenderThreadEntryAudit } from "@/hooks/useApi";
import type { LenderThreadEntry, LenderThreadSendStatus } from "@/lib/types";

interface Props {
  loanId: string;
  entry: LenderThreadEntry | null;
  onClose: () => void;
}

export function LenderThreadAuditDrawer({ loanId, entry, onClose }: Props) {
  const { data, isLoading, isError, error } = useLenderThreadEntryAudit(
    entry ? loanId : null,
    entry?.id ?? null,
  );
  const [advanced, setAdvanced] = useState(false);

  if (!entry) return null;

  return (
    <RightPanel
      open
      onClose={onClose}
      eyebrow="Message details"
      title={entry.subject || entry.sender_label}
      // The visible title is the message's subject, not the name of the
      // dialog — say what the dialog is.
      ariaLabel="Message details"
      width="min(640px, 100vw)"
    >
      {isLoading ? (
        <Sub>Loading audit…</Sub>
      ) : isError ? (
        <StatusLine tone="bad">
          Couldn&rsquo;t load audit: {(error as Error)?.message ?? "Unknown error"}
        </StatusLine>
      ) : data ? (
        <>
          <FriendlyView entry={entry} />

          <Btn onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced}>
            <Icon name={advanced ? "chevD" : "chevR"} size={11} stroke={2.5} />
            {advanced ? "Hide" : "Show"} advanced: raw payload + DB rows
          </Btn>

          {advanced ? (
            <>
              <AdvancedPanel
                title="Gmail API payload"
                hint="The exact bytes that were (or would be) handed to Gmail's users.messages.send. raw_base64 is URL-safe base64 of RFC 5322."
                body={data.gmail_payload}
              />
              <AdvancedPanel
                title="messages row"
                hint="Row from the messages table — what powers the thread timeline."
                body={data.message}
              />
              <AdvancedPanel
                title="email_drafts row"
                hint="Row from email_drafts — status='sent' means Gmail confirmed; 'approved' means saved locally only."
                body={data.email_draft}
              />
              <AdvancedPanel
                title="activities row"
                hint="Audit log row including the verbatim Gmail send_note."
                body={data.activity}
              />
            </>
          ) : null}
        </>
      ) : null}
    </RightPanel>
  );
}

// ---------------------------------------------------------------------------
// Friendly view
// ---------------------------------------------------------------------------

/** Sent / saved / failed → the tone and the word the operator reads. */
function statusChip(status: LenderThreadSendStatus) {
  switch (status) {
    case "sent":
      return <CellChip tone="ok">Delivered</CellChip>;
    case "saved":
      return <CellChip tone="warn">Saved only</CellChip>;
    case "failed":
      return <CellChip tone="bad">Send failed</CellChip>;
    default:
      return <CellChip>—</CellChip>;
  }
}

/** The note under a send status is coloured by the outcome. */
function noteInk(status: LenderThreadSendStatus | null | undefined): string {
  if (status === "sent") return "var(--ok)";
  if (status === "failed") return "var(--danger)";
  return "var(--warn)";
}

function FriendlyView({ entry }: { entry: LenderThreadEntry }) {
  return (
    <Panel noPad>
      {/* Bespoke definition list: a fixed 80px label column beside the value. */}
      <div
        className="panel-b"
        style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 8 }}
      >
        <div className="lbl">From</div>
        <div>{entry.sender_label}</div>

        {entry.to_email ? (
          <>
            <div className="lbl">To</div>
            <div>{entry.to_email}</div>
          </>
        ) : null}

        {entry.subject ? (
          <>
            <div className="lbl">Subject</div>
            <div>{entry.subject}</div>
          </>
        ) : null}

        <div className="lbl">Sent</div>
        <div>{new Date(entry.sent_at).toLocaleString()}</div>

        <div className="lbl">Status</div>
        <div className="row">
          {statusChip(entry.send_status ?? "n/a")}
          {entry.sent_message_id ? (
            <Sub>
              Gmail message id: <code className="mono">{entry.sent_message_id}</code>
            </Sub>
          ) : null}
        </div>
        {entry.send_note ? (
          <>
            <div className="lbl">Note</div>
            {/* Data-derived: the note is tinted by the send outcome. */}
            <div style={{ color: noteInk(entry.send_status) }}>{entry.send_note}</div>
          </>
        ) : null}
      </div>
      <div
        className="panel-b pretext"
        style={{ borderTop: "1px solid var(--line)", background: "var(--sunken2)" }}
      >
        {entry.body}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Advanced view
// ---------------------------------------------------------------------------

function AdvancedPanel({
  title,
  hint,
  body,
}: {
  title: string;
  hint: string;
  body: unknown;
}) {
  return (
    <Panel title={title} sub={hint} noPad>
      <pre
        className="mono"
        // A raw payload dump: bounded, and allowed to break inside a base64
        // run. `.mono` owns the face; the rest is this block's own.
        style={{
          margin: 0,
          padding: 12,
          fontSize: 10.5,
          lineHeight: 1.45,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          maxHeight: 320,
          overflow: "auto",
        }}
      >
        {body === null || body === undefined
          ? "(no matching row)"
          : JSON.stringify(body, null, 2)}
      </pre>
    </Panel>
  );
}
