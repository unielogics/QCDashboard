"use client";

// Emails breadcrumb tab — a body-LESS feed of tracked email on a loan or client.
//
// ISOLATION (Phase 4/5 hard requirement): the shared loan/client surfaces show
// ONLY email metadata — sender, subject, direction, time — sourced from the
// `email.tracked` Activity breadcrumb. The message BODY lives solely in the
// mailbox owner's inbox and is NEVER rendered here. This component deliberately
// reads `payload.from` / `payload.subject` / `payload.received_at` and nothing
// that could carry body text.

import Link from "next/link";
import { CellChip, Panel, Sub } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";

export type BreadcrumbRow = {
  id: string;
  kind: string;
  summary: string;
  payload: Record<string, unknown> | null;
  occurredAt: string; // ISO
};

const TRACKED_KIND = "email.tracked";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function EmailsBreadcrumbTab({
  rows,
  isLoading,
  showInboxHint = true,
}: {
  rows: BreadcrumbRow[];
  isLoading: boolean;
  showInboxHint?: boolean;
}) {
  const emails = rows.filter((r) => r.kind === TRACKED_KIND);

  if (isLoading) {
    return (
      <Panel>
        <Sub>Loading emails…</Sub>
      </Panel>
    );
  }

  return (
    <Panel
      title={`Tracked email · ${emails.length}`}
      actions={
        showInboxHint ? (
          <Link className="btn sm" href="/inbox">
            <Icon name="mail" size={13} /> Open Inbox
          </Link>
        ) : undefined
      }
    >
      {emails.length === 0 ? (
        <Sub>
          No tracked email yet. When a client or party emails your connected Workspace
          mailbox, it appears here as a private breadcrumb — sender, subject, and time
          only. The full message stays in your inbox.
        </Sub>
      ) : (
        emails.map((e) => {
          const p = e.payload ?? {};
          const from = str(p["from"]) ?? "unknown sender";
          const subject = str(p["subject"]) ?? "(no subject)";
          const direction = str(p["direction"]) ?? "inbound";
          const role = str(p["party_role"]);
          const received = str(p["received_at"]) ?? e.occurredAt;
          const outbound = direction === "outbound";
          return (
            // `.filerow` is the divided list row: hairline between rows, none
            // after the last one, which is what the hand-rolled version was
            // computing with an index comparison.
            <div key={e.id} className="filerow">
              <Icon name="mail" size={15} />
              <div className="grow grid g4">
                <div className="row">
                  <b>{subject}</b>
                  <CellChip tone={outbound ? "pet" : "mut"}>{outbound ? "Sent" : "Received"}</CellChip>
                  {role ? <CellChip tone="mut">{role}</CellChip> : null}
                </div>
                <span className="sub">
                  {outbound ? "to " : "from "}{from}
                </span>
              </div>
              <span className="sub trunc">{fmt(received)}</span>
            </div>
          );
        })
      )}
    </Panel>
  );
}
