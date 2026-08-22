"use client";

// Renders the structured AI extract from the lender thread.
//
// Two modes via prop:
//   * "operator" — full extract (internal + external items + status changes)
//                  Used for super_admin / loan_exec
//   * "external" — externals-only view used by broker / client AI chats.
//                  In practice this component receives whatever the
//                  backend returned (the backend filters server-side
//                  based on the viewer role), so we just render what
//                  we got.
//
// Restyled onto the plain-CSS design system. Every colour pair that used to
// be two theme reads is now a chip tone.

import { CellChip, Callout, Lbl, Sub, type ChipTone } from "@/components/ds";
import type { LenderActionItem, LenderExtract } from "@/lib/types";

interface Props {
  extract: LenderExtract | null | undefined;
}

export function LenderActionItemsPanel({ extract }: Props) {
  const items = extract?.action_items ?? [];
  const statusChanges = extract?.status_changes ?? [];

  if (!extract) {
    return (
      <Sub>
        AI extract not generated yet. It appears automatically after the
        next inbound or outbound lender message.
      </Sub>
    );
  }

  return (
    <div className="grid g10">
      {extract.current_situation ? (
        <Callout tone="acc">{extract.current_situation}</Callout>
      ) : null}

      {items.length === 0 ? (
        <Sub>No outstanding action items detected.</Sub>
      ) : (
        <div className="grid g8">
          {items.map((i) => (
            <ActionItemRow key={i.id} item={i} />
          ))}
        </div>
      )}

      {statusChanges.length > 0 ? (
        <div>
          <Lbl>Status changes</Lbl>
          <div className="grid g4 mt">
            {statusChanges.map((s, i) => (
              <div key={i} className="row">
                <KindChip kind={s.kind} />
                <span className="grow">{s.summary}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {extract.generated_at ? (
        <Sub>updated {timeAgo(extract.generated_at)}</Sub>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ActionItemRow({ item }: { item: LenderActionItem }) {
  const owner = ownerChip(item.owner);
  const isInternal = item.sensitivity === "internal";
  return (
    // `.itemrow.top`: the summary wraps to two lines, so the chips must not
    // drift to the middle of it. `.tone-warn` marks an item nobody outside
    // the desk is meant to see — the same warning the "Internal" chip says
    // in words, so the row is scannable without reading every one.
    <div className={isInternal ? "itemrow top tone-warn" : "itemrow top"}>
      <div className="grow grid g6">
        <div className="row">
          <CellChip tone={owner.tone}>{owner.label}</CellChip>
          <PriorityChip priority={item.priority} />
          {isInternal ? (
            <CellChip tone="warn">Internal</CellChip>
          ) : (
            <CellChip tone="ok">External</CellChip>
          )}
          {item.due_date ? <Sub>due {item.due_date}</Sub> : null}
        </div>
        <div>{item.summary}</div>
        {(item.requested_documents?.length || item.amounts?.length) ? (
          <div className="row">
            {item.requested_documents && item.requested_documents.length > 0 ? (
              <Sub>📎 {item.requested_documents.join(", ")}</Sub>
            ) : null}
            {item.amounts && item.amounts.length > 0 ? (
              <Sub>💵 {item.amounts.join(", ")}</Sub>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ownerChip(owner: string): { tone: ChipTone; label: string } {
  switch (owner) {
    case "client":
      return { tone: "pet", label: "Borrower" };
    case "broker":
      return { tone: "acc", label: "Broker" };
    case "lender":
      return { tone: "warn", label: "Lender" };
    case "super_admin":
      return { tone: "mut", label: "Super Admin" };
    default:
      return { tone: "mut", label: owner };
  }
}

function PriorityChip({ priority }: { priority: string }) {
  if (priority === "high") return <CellChip tone="bad">High</CellChip>;
  if (priority === "low") return <CellChip>Low</CellChip>;
  return <CellChip tone="acc">Med</CellChip>;
}

function KindChip({ kind }: { kind: string }) {
  const good = ["approved", "rate_locked"].includes(kind);
  const bad = ["declined"].includes(kind);
  const tone: ChipTone = good ? "ok" : bad ? "bad" : "acc";
  return <CellChip tone={tone}>{kind.replace("_", " ")}</CellChip>;
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
