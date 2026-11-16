"use client";

// What an Elara task would do, readable before anyone approves it.
//
// Moved here from the retired Elara inbox page: the rail's Tasks tab is where
// those tasks are approved now, and approving a drafted message is only a
// human decision if the human can read the draft. Common payload shapes
// (follow-up, email draft, message draft, document request) render as a
// preview: title up top, supporting fields as labelled rows, dates formatted,
// internal ids hidden. Anything else is behind the raw-payload disclosure.

import { CellChip, Note, type ChipTone } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";

const HIDDEN_KEYS = new Set(["loan_id", "deal_id", "client_id", "borrower_id", "relative_days"]);

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function formatDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function humanLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function priorityTone(priority: string): ChipTone {
  return priority === "high" ? "bad" : priority === "medium" ? "warn" : "mut";
}

export function DraftedArtifactView({ payload, action }: { payload: Record<string, unknown> | null; action: string }) {
  if (!payload) {
    return (
      <Note>
        <div>
          No drafted content for action <code className="tag">{action}</code>.
        </div>
      </Note>
    );
  }

  const title = (payload.title as string | undefined) ?? (payload.subject as string | undefined);
  const body = (payload.body as string | undefined) ?? (payload.message as string | undefined) ?? (payload.summary as string | undefined);
  const dueAt = formatDate(payload.due_at) ?? formatDate(payload.starts_at) ?? formatDate(payload.scheduled_at);
  const kind = payload.kind as string | undefined;
  const owner = payload.owner as string | undefined;
  const priority = payload.priority as string | undefined;
  const channel = payload.channel as string | undefined;
  const to = payload.to as string | undefined;
  const cta = payload.cta as string | undefined;

  const consumed = new Set([
    "title", "subject", "body", "message", "summary", "due_at", "starts_at", "scheduled_at",
    "kind", "owner", "priority", "channel", "to", "cta",
  ]);
  const extras = Object.entries(payload).filter(
    ([key, value]) => !consumed.has(key) && !HIDDEN_KEYS.has(key) && !isEmptyValue(value),
  );

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {title && <b style={{ overflowWrap: "anywhere" }}>{title}</b>}

      {(kind || owner || priority || channel) && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          {kind && <CellChip tone="mut">{humanLabel(kind)}</CellChip>}
          {owner && (
            <CellChip tone="pet">
              <Icon name="user" size={9} stroke={2.4} /> {humanLabel(owner)}
            </CellChip>
          )}
          {priority && <CellChip tone={priorityTone(priority)}>{humanLabel(priority)} priority</CellChip>}
          {channel && <CellChip tone="acc">via {channel}</CellChip>}
        </div>
      )}

      {to && (
        <div style={{ overflowWrap: "anywhere" }}>
          <span className="lbl">TO:</span> {to}
        </div>
      )}

      {body && <div className="msg-b" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{body}</div>}

      {dueAt && (
        <div className="row">
          <Icon name="cal" size={13} />
          <span className="lbl">Due</span>
          {dueAt}
        </div>
      )}

      {cta && (
        <div className="row">
          <Icon name="arrowR" size={13} />
          <span className="lbl">Action</span>
          {cta}
        </div>
      )}

      {extras.length > 0 && (
        <div>
          {extras.map(([key, value]) => (
            <div className="kv" key={key}>
              <span>{humanLabel(key)}</span>
              <b style={{ overflowWrap: "anywhere" }}>{typeof value === "object" ? JSON.stringify(value) : String(value)}</b>
            </div>
          ))}
        </div>
      )}

      <details>
        <summary className="linky">View raw payload</summary>
        <pre className="msg-b mt" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(payload, null, 2)}</pre>
      </details>
    </div>
  );
}
