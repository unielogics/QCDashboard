"use client";

// Gmail-style mailbox row for the lender thread.
//
// Collapsed (default): avatar | sender + status pill | subject | body
// preview (2 lines) | timestamp. Click to expand → full body + audit
// affordance.
//
// Status pill is the load-bearing piece — it's what tells the operator
// whether Gmail actually delivered the message. Round-1 surfaced
// "outbound" identically regardless of the delivery outcome, and the
// user was sending messages that never reached the lender. The pill
// is now derived from EmailDraft.status + sent_message_id on the
// backend; see app/services/lender_thread.py:_derive_send_status.
//
// Restyled onto the plain-CSS design system. What stays inline is the row's
// own three-track geometry, the two-line clamp on the collapsed preview, and
// the avatar tint — all of them derived from the entry rather than owned by
// a class.

import { useMemo, useState } from "react";
import { CellChip } from "@/components/ds";
import { Avatar } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import type {
  LenderThreadEntry,
  LenderThreadSendStatus,
} from "@/lib/types";

interface Props {
  entry: LenderThreadEntry;
  onShowDetails: (entry: LenderThreadEntry) => void;
}

export function LenderThreadMessageRow({ entry, onShowDetails }: Props) {
  const [expanded, setExpanded] = useState(false);

  const role = entry.sender_role;
  const avatarLabel = useMemo(() => initialsOf(entry.sender_label), [entry.sender_label]);
  const avatarColor = roleAvatarColor(role);
  const status = entry.send_status ?? "n/a";

  return (
    <div
      style={{
        borderBottom: "1px solid var(--line)",
        // State-derived: the open row lifts off the mailbox ground.
        background: expanded ? "var(--sunken2)" : "var(--surface)",
        transition: "background 120ms ease",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        // Bespoke mailbox row: avatar / body / timestamp. Also the button
        // reset — this row has to stay Enter-activatable.
        style={{
          all: "unset",
          display: "grid",
          gridTemplateColumns: "32px 1fr auto",
          gap: 12,
          alignItems: "start",
          width: "100%",
          padding: "12px 14px",
          cursor: "pointer",
          boxSizing: "border-box",
        }}
      >
        <Avatar label={avatarLabel} color={avatarColor} size={32} />

        <div style={{ minWidth: 0 }}>
          <div className="row">
            <span style={{ fontWeight: 700 }}>{entry.sender_label}</span>
            <DirectionChip kind={entry.kind} />
            <StatusChip status={status} note={entry.send_note ?? undefined} />
          </div>
          {entry.subject ? (
            <div className="trunc" style={{ fontWeight: 600, marginTop: 2 }}>
              {entry.subject}
            </div>
          ) : null}
          {entry.to_email ? <div className="sub">to {entry.to_email}</div> : null}
          <div
            className="sub"
            // State-derived: collapsed, the preview is clamped to two lines;
            // expanded, it is the whole message.
            style={
              expanded
                ? { marginTop: 4, whiteSpace: "pre-wrap" }
                : {
                    marginTop: 4,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical" as const,
                    overflow: "hidden",
                  }
            }
          >
            {entry.body}
          </div>
        </div>

        <div className="sub" style={{ whiteSpace: "nowrap", textAlign: "right" }}
             title={new Date(entry.sent_at).toLocaleString()}>
          {formatGmailTime(new Date(entry.sent_at))}
        </div>
      </button>

      {expanded ? (
        // Indented to line up under the row body, past the avatar column.
        <div className="grid g8" style={{ padding: "0 14px 12px 58px" }}>
          {entry.attachments && entry.attachments.length > 0 && (
            <div className="row">
              {entry.attachments.map((a) => (
                <a
                  key={a.id}
                  className="chip"
                  href={a.download_url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    if (!a.download_url) {
                      e.preventDefault();
                    }
                    e.stopPropagation();
                  }}
                  // Data-derived: an attachment with a signed URL reads as a
                  // link; one without is inert and must not.
                  style={{ color: a.download_url ? "var(--accent)" : "var(--muted)" }}
                  title={a.filename}
                >
                  <Icon name="paperclip" size={10} stroke={2.5} />
                  {/* Bespoke measure — a filename must not widen the row. */}
                  <span className="trunc" style={{ maxWidth: 220 }}>{a.filename}</span>
                  {a.size_bytes > 0 && <span className="sub">{formatBytes(a.size_bytes)}</span>}
                </a>
              ))}
            </div>
          )}
          <div className="row">
            <button
              type="button"
              className="btn sm"
              onClick={(e) => {
                e.stopPropagation();
                onShowDetails(entry);
              }}
            >
              <Icon name="search" size={11} stroke={2.5} /> Show details
            </button>
            {entry.sent_message_id ? (
              <span className="sub">
                Gmail msg id: <code className="mono">{entry.sent_message_id}</code>
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status / direction chips
// ---------------------------------------------------------------------------

function StatusChip({
  status,
  note,
}: {
  status: LenderThreadSendStatus;
  note?: string;
}) {
  const cfg = useMemo(() => {
    switch (status) {
      case "sent":
        return { tone: "ok" as const, label: "Delivered" };
      case "saved":
        return { tone: "warn" as const, label: "Saved only" };
      case "failed":
        return { tone: "bad" as const, label: "Send failed" };
      default:
        return null;
    }
  }, [status]);
  if (!cfg) return null;
  // `title` is CellChip's own hover explanation — the send note is the
  // sentence behind the one-word status.
  return <CellChip tone={cfg.tone} title={note ?? cfg.label}>{cfg.label}</CellChip>;
}

function DirectionChip({ kind }: { kind: LenderThreadEntry["kind"] }) {
  switch (kind) {
    case "inbound":
      return <CellChip tone="acc">Inbound</CellChip>;
    case "outbound":
      return <CellChip>Outbound</CellChip>;
    case "ai_outbound":
      return <CellChip tone="pet">AI</CellChip>;
    case "pending_draft":
      return <CellChip tone="warn">Draft</CellChip>;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Role → avatar tint. Data-derived, and `Avatar` takes it as a prop. */
function roleAvatarColor(role: LenderThreadEntry["sender_role"]): string {
  switch (role) {
    case "lender":
      return "var(--warn)";
    case "broker":
      return "var(--accent)";
    case "ai":
      return "var(--petrol)";
    case "system":
      return "var(--muted)";
  }
}

function formatGmailTime(d: Date): string {
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
