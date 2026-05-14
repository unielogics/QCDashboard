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

import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Avatar, Pill } from "@/components/design-system/primitives";
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
  const { t } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const role = entry.sender_role;
  const avatarLabel = useMemo(() => initialsOf(entry.sender_label), [entry.sender_label]);
  const avatarColor = roleAvatarColor(t, role);
  const status = entry.send_status ?? "n/a";

  return (
    <div
      style={{
        borderBottom: `1px solid ${t.line}`,
        background: expanded ? t.surface2 : t.surface,
        transition: "background 120ms ease",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontWeight: 700, color: t.ink, fontSize: 13 }}>
              {entry.sender_label}
            </span>
            <DirectionPill t={t} entry={entry} />
            <StatusPill t={t} status={status} note={entry.send_note ?? undefined} />
          </div>
          {entry.subject ? (
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: t.ink,
                marginTop: 2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {entry.subject}
            </div>
          ) : null}
          {entry.to_email ? (
            <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
              to {entry.to_email}
            </div>
          ) : null}
          <div
            style={{
              fontSize: 12,
              color: t.ink3,
              marginTop: 4,
              lineHeight: 1.5,
              whiteSpace: expanded ? "pre-wrap" : "nowrap",
              overflow: expanded ? "visible" : "hidden",
              textOverflow: expanded ? "clip" : "ellipsis",
              maxWidth: "100%",
              ...(expanded
                ? {}
                : {
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical" as const,
                    whiteSpace: "normal",
                  }),
            }}
          >
            {entry.body}
          </div>
        </div>

        <div
          style={{
            fontSize: 11,
            color: t.ink3,
            whiteSpace: "nowrap",
            textAlign: "right",
          }}
          title={new Date(entry.sent_at).toLocaleString()}
        >
          {formatGmailTime(new Date(entry.sent_at))}
        </div>
      </button>

      {expanded ? (
        <div
          style={{
            padding: "0 14px 12px 58px",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShowDetails(entry);
            }}
            style={{
              all: "unset",
              cursor: "pointer",
              padding: "6px 10px",
              borderRadius: 8,
              border: `1px solid ${t.line}`,
              background: t.surface,
              fontSize: 11,
              fontWeight: 700,
              color: t.brand,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="search" size={11} stroke={2.5} /> Show details
          </button>
          {entry.sent_message_id ? (
            <span style={{ fontSize: 11, color: t.ink3, padding: "6px 4px" }}>
              Gmail msg id: <code>{entry.sent_message_id}</code>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status / direction pills
// ---------------------------------------------------------------------------

function StatusPill({
  t,
  status,
  note,
}: {
  t: ReturnType<typeof useTheme>["t"];
  status: LenderThreadSendStatus;
  note?: string;
}) {
  const cfg = useMemo(() => {
    switch (status) {
      case "sent":
        return { bg: t.profitBg, fg: t.profit, label: "Delivered" };
      case "saved":
        return { bg: t.warnBg, fg: t.warn, label: "Saved only" };
      case "failed":
        return { bg: t.dangerBg, fg: t.danger, label: "Send failed" };
      default:
        return null;
    }
  }, [t, status]);
  if (!cfg) return null;
  return (
    <span title={note ?? cfg.label}>
      <Pill bg={cfg.bg} color={cfg.fg}>
        {cfg.label}
      </Pill>
    </span>
  );
}

function DirectionPill({
  t,
  entry,
}: {
  t: ReturnType<typeof useTheme>["t"];
  entry: LenderThreadEntry;
}) {
  switch (entry.kind) {
    case "inbound":
      return <Pill bg={t.brandSoft} color={t.brand}>Inbound</Pill>;
    case "outbound":
      return <Pill bg={t.surface2} color={t.ink2}>Outbound</Pill>;
    case "ai_outbound":
      return <Pill bg={t.petrolSoft} color={t.petrol}>AI</Pill>;
    case "pending_draft":
      return <Pill bg={t.warnBg} color={t.warn}>Draft</Pill>;
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

function roleAvatarColor(
  t: ReturnType<typeof useTheme>["t"],
  role: LenderThreadEntry["sender_role"],
): string {
  switch (role) {
    case "lender":
      return t.warn;
    case "broker":
      return t.brand;
    case "ai":
      return t.petrol;
    case "system":
      return t.ink3;
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
