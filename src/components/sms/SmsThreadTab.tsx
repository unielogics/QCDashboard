"use client";

// SMS thread — the client's text history from the sms_messages ledger.
//
// Unlike the email breadcrumb tab, bodies render here: every outbound body was
// composed by this system and every inbound one was sent TO this system's
// number, so there is no mailbox-owner isolation to respect. The one deliberate
// absence is consent-link bodies, which the backend never stored (tokened URLs).
//
// Refused sends appear too. A rep asking "why didn't the text go out" should
// find a dated "Blocked" row with the gate's reason, not an empty feed.

import { CellChip, Empty, Panel, Sub, type ChipTone } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import type { SmsMessageRow } from "@/hooks/useApi";

const STATUS_TONE: Record<SmsMessageRow["status"], ChipTone> = {
  delivered: "ok",
  sent: "acc",
  received: "pet",
  queued: "mut",
  failed: "bad",
  blocked: "bad",
};

const STATUS_LABEL: Record<SmsMessageRow["status"], string> = {
  delivered: "Delivered",
  sent: "Sent",
  received: "Received",
  queued: "Queued",
  failed: "Failed",
  blocked: "Blocked",
};

const CONTEXT_LABEL: Record<string, string> = {
  intake_link: "Intake link",
  reengagement: "Re-engagement",
  consent_link: "Consent link",
  reply: "Reply",
  manual: "Manual",
};

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function SmsThreadTab({
  rows,
  isLoading,
}: {
  rows: SmsMessageRow[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Panel>
        <Sub>Loading text messages…</Sub>
      </Panel>
    );
  }

  return (
    <Panel title={`Text messages · ${rows.length}`}>
      {rows.length === 0 ? (
        <Empty>
          No text messages yet. Texts sent from intake links, re-engagement, or
          consent delivery appear here with their delivery state — and replies
          from the client land here too.
        </Empty>
      ) : (
        rows.map((m) => {
          const outbound = m.direction === "outbound";
          const context = CONTEXT_LABEL[m.context] ?? (m.context || null);
          return (
            <div key={m.id} className="filerow">
              <Icon name="chat" size={15} />
              <div className="grow grid g4">
                <div className="row">
                  <b>{outbound ? "To" : "From"} {m.phone_e164}</b>
                  <CellChip tone={STATUS_TONE[m.status] ?? "mut"} title={m.detail || undefined}>
                    {STATUS_LABEL[m.status] ?? m.status}
                  </CellChip>
                  {context ? <CellChip tone="mut">{context}</CellChip> : null}
                </div>
                {m.body ? (
                  <span className="sub">{m.body}</span>
                ) : m.status === "blocked" || m.status === "failed" ? (
                  // The reason IS the content for a message that never went.
                  <span className="sub">{m.detail}</span>
                ) : null}
              </div>
              <span className="sub trunc" title={m.delivered_at ? `Delivered ${fmt(m.delivered_at)}` : undefined}>
                {fmt(m.created_at)}
              </span>
            </div>
          );
        })
      )}
    </Panel>
  );
}
