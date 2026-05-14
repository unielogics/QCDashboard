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

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useLenderThreadEntryAudit } from "@/hooks/useApi";
import type { LenderThreadEntry, LenderThreadSendStatus } from "@/lib/types";

interface Props {
  loanId: string;
  entry: LenderThreadEntry | null;
  onClose: () => void;
}

export function LenderThreadAuditDrawer({ loanId, entry, onClose }: Props) {
  const { t } = useTheme();
  const { data, isLoading, isError, error } = useLenderThreadEntryAudit(
    entry ? loanId : null,
    entry?.id ?? null,
  );
  const [advanced, setAdvanced] = useState(false);

  if (!entry) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(11, 22, 41, 0.45)",
          zIndex: 60,
        }}
      />
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(640px, 100vw)",
          background: t.surface,
          borderLeft: `1px solid ${t.line}`,
          zIndex: 61,
          overflowY: "auto",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 14,
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
              Message details
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
              {entry.subject || entry.sender_label}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              all: "unset",
              cursor: "pointer",
              padding: 8,
              borderRadius: 8,
              border: `1px solid ${t.line}`,
              color: t.ink2,
            }}
          >
            <Icon name="close" size={12} stroke={3} />
          </button>
        </div>

        {isLoading ? (
          <Card pad={18}>
            <div style={{ fontSize: 12.5, color: t.ink3 }}>Loading audit…</div>
          </Card>
        ) : isError ? (
          <Card pad={18}>
            <div style={{ fontSize: 12.5, color: t.danger }}>
              Couldn’t load audit: {(error as Error)?.message ?? "Unknown error"}
            </div>
          </Card>
        ) : data ? (
          <>
            <FriendlyView t={t} entry={entry} />

            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              style={{
                all: "unset",
                cursor: "pointer",
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${t.line}`,
                background: t.surface2,
                fontSize: 12,
                fontWeight: 700,
                color: t.ink2,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                alignSelf: "flex-start",
              }}
            >
              <Icon name={advanced ? "chevD" : "chevR"} size={11} stroke={2.5} />
              {advanced ? "Hide" : "Show"} advanced: raw payload + DB rows
            </button>

            {advanced ? (
              <>
                <AdvancedPanel
                  t={t}
                  title="Gmail API payload"
                  hint="The exact bytes that were (or would be) handed to Gmail's users.messages.send. raw_base64 is URL-safe base64 of RFC 5322."
                  body={data.gmail_payload}
                />
                <AdvancedPanel
                  t={t}
                  title="messages row"
                  hint="Row from the messages table — what powers the thread timeline."
                  body={data.message}
                />
                <AdvancedPanel
                  t={t}
                  title="email_drafts row"
                  hint="Row from email_drafts — status='sent' means Gmail confirmed; 'approved' means saved locally only."
                  body={data.email_draft}
                />
                <AdvancedPanel
                  t={t}
                  title="activities row"
                  hint="Audit log row including the verbatim Gmail send_note."
                  body={data.activity}
                />
              </>
            ) : null}
          </>
        ) : null}
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Friendly view
// ---------------------------------------------------------------------------

function FriendlyView({
  t,
  entry,
}: {
  t: ReturnType<typeof useTheme>["t"];
  entry: LenderThreadEntry;
}) {
  return (
    <Card pad={0}>
      <div
        style={{
          padding: "14px 16px",
          display: "grid",
          gridTemplateColumns: "80px 1fr",
          gap: 8,
          fontSize: 12.5,
          color: t.ink,
        }}
      >
        <FieldLabel t={t}>From</FieldLabel>
        <div>{entry.sender_label}</div>

        {entry.to_email ? (
          <>
            <FieldLabel t={t}>To</FieldLabel>
            <div>{entry.to_email}</div>
          </>
        ) : null}

        {entry.subject ? (
          <>
            <FieldLabel t={t}>Subject</FieldLabel>
            <div>{entry.subject}</div>
          </>
        ) : null}

        <FieldLabel t={t}>Sent</FieldLabel>
        <div>{new Date(entry.sent_at).toLocaleString()}</div>

        <FieldLabel t={t}>Status</FieldLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <StatusPill t={t} status={entry.send_status ?? "n/a"} />
          {entry.sent_message_id ? (
            <span style={{ fontSize: 11, color: t.ink3 }}>
              Gmail message id: <code>{entry.sent_message_id}</code>
            </span>
          ) : null}
        </div>
        {entry.send_note ? (
          <>
            <FieldLabel t={t}>Note</FieldLabel>
            <div
              style={{
                fontSize: 12,
                color:
                  entry.send_status === "sent"
                    ? t.profit
                    : entry.send_status === "failed"
                    ? t.danger
                    : t.warn,
                lineHeight: 1.5,
              }}
            >
              {entry.send_note}
            </div>
          </>
        ) : null}
      </div>
      <div
        style={{
          padding: "12px 16px",
          borderTop: `1px solid ${t.line}`,
          fontSize: 12.5,
          color: t.ink,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          background: t.surface2,
        }}
      >
        {entry.body}
      </div>
    </Card>
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

function StatusPill({
  t,
  status,
}: {
  t: ReturnType<typeof useTheme>["t"];
  status: LenderThreadSendStatus;
}) {
  switch (status) {
    case "sent":
      return <Pill bg={t.profitBg} color={t.profit}>Delivered</Pill>;
    case "saved":
      return <Pill bg={t.warnBg} color={t.warn}>Saved only</Pill>;
    case "failed":
      return <Pill bg={t.dangerBg} color={t.danger}>Send failed</Pill>;
    default:
      return <Pill bg={t.surface2} color={t.ink3}>—</Pill>;
  }
}

// ---------------------------------------------------------------------------
// Advanced view
// ---------------------------------------------------------------------------

function AdvancedPanel({
  t,
  title,
  hint,
  body,
}: {
  t: ReturnType<typeof useTheme>["t"];
  title: string;
  hint: string;
  body: unknown;
}) {
  return (
    <Card pad={0}>
      <div
        style={{
          padding: "10px 14px",
          borderBottom: `1px solid ${t.line}`,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: t.ink2,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2, lineHeight: 1.45 }}>
          {hint}
        </div>
      </div>
      <pre
        style={{
          margin: 0,
          padding: 12,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 10.5,
          lineHeight: 1.45,
          color: t.ink,
          background: t.surface,
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
    </Card>
  );
}
