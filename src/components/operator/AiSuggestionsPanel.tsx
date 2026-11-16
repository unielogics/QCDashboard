"use client";

// AI suggestions waiting for a decision, answered where the work is.
//
// A room's AI proposes follow-ups (a document to ask for, something to check)
// and each one waits for a person. The Elara inbox was the only screen that
// could answer them, on a page of its own away from the files. This panel is
// that queue: on the dashboard across every file, and on a file for that
// file's own suggestions. Nothing here is sent anywhere until a person
// approves it, and a suggestion addressed to a client or a vendor can only be
// dismissed here, the same limits the inbox had.

import Link from "next/link";
import { useMemo, useState } from "react";
import { Btn, CellChip, Empty, Loading, Panel, WarnLine, type ChipTone } from "@/components/ds";
import { ConfirmDialog } from "@/components/design-system/ConfirmDialog";
import { useCurrentUser, useDecideActionItem, useProposedActionItems } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { fileHref } from "@/lib/fileRoutes";
import type { BucketAIActionItemQueueItem } from "@/lib/types";

/** Who a suggestion is addressed to, in the desk's words. */
export function routeLabel(route: string): string {
  switch (route) {
    case "admin": return "Desk";
    case "uploader": return "Client";
    case "share": return "Shared recipient";
    case "vendor": return "Vendor";
    default: return route;
  }
}

export function waitingDays(iso: string, now: number = Date.now()): number {
  const then = new Date(iso).getTime();
  return Number.isNaN(then) ? 0 : Math.max(0, Math.floor((now - then) / 86_400_000));
}

export function waitingLabel(iso: string, now: number = Date.now()): string {
  const days = waitingDays(iso, now);
  return days === 0 ? "today" : `${days}d waiting`;
}

export function waitingTone(iso: string, now: number = Date.now()): ChipTone {
  const days = waitingDays(iso, now);
  return days >= 14 ? "bad" : days >= 7 ? "warn" : "mut";
}

/** Where a suggestion's file opens: the file page when there is one, the room otherwise. */
export function suggestionHref(item: Pick<BucketAIActionItemQueueItem, "intake_id" | "href">): string {
  return item.intake_id ? fileHref(item.intake_id) : item.href;
}

export function AiSuggestionsPanel({
  bucketId,
  pageSize = 5,
  className,
  id,
  hideWhenEmpty = false,
}: {
  /** Only this room's suggestions: the file's own view. */
  bucketId?: string | null;
  pageSize?: number;
  className?: string;
  id?: string;
  /** On a file, a queue with nothing in it is not worth a panel. */
  hideWhenEmpty?: boolean;
}) {
  const { data: me } = useCurrentUser();
  const isDesk = me?.role === Role.SUPER_ADMIN || me?.role === Role.LOAN_EXEC;
  // The API lets underwriting read the queue and a super admin decide it.
  const canDecide = me?.role === Role.SUPER_ADMIN;
  const queue = useProposedActionItems(isDesk, "proposed", bucketId);
  const decide = useDecideActionItem();
  const [shown, setShown] = useState(pageSize);
  const [open, setOpen] = useState<string | null>(null);
  const [pending, setPending] = useState<{ item: BucketAIActionItemQueueItem; status: "approved" | "rejected" } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const items = useMemo(
    () => (queue.data ?? []).filter((item) => !bucketId || item.bucket_id === bucketId),
    [queue.data, bucketId],
  );

  async function confirm() {
    if (!pending) return;
    setFailure(null);
    try {
      await decide.mutateAsync({ bucketId: pending.item.bucket_id, itemId: pending.item.id, status: pending.status });
      setNotice(pending.status === "approved" ? `Approved “${pending.item.title}”.` : `Dismissed “${pending.item.title}”.`);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "The suggestion could not be updated.");
    } finally {
      setPending(null);
    }
  }

  if (!isDesk) return null;
  if (hideWhenEmpty && !queue.isLoading && !queue.isError && items.length === 0 && !notice) return null;

  return (
    <>
      <Panel
        id={id}
        className={className}
        title="AI suggestions"
        sub={items.length ? `${items.length} waiting for a decision` : undefined}
      >
        {queue.isLoading ? <Loading>Loading suggestions…</Loading> : null}
        {queue.isError ? (
          <WarnLine>
            Suggestions could not be loaded.{" "}
            <button type="button" className="linky" onClick={() => void queue.refetch()}>Try again</button>
          </WarnLine>
        ) : null}
        {notice ? <div className="sub mb" role="status">{notice}</div> : null}
        {failure ? <WarnLine>{failure}</WarnLine> : null}
        {!queue.isLoading && !queue.isError && items.length === 0 ? (
          <Empty icon="check" title="Nothing is waiting">
            {bucketId
              ? "When this file's AI proposes a follow-up, it waits here for a decision."
              : "When a file's AI proposes a follow-up, it waits here for a decision. Nothing is sent without one."}
          </Empty>
        ) : null}
        {items.slice(0, shown).map((item) => {
          const expanded = open === item.id;
          return (
            <div key={item.id} className="filerow" style={{ alignItems: "flex-start" }}>
              <div className="grow grid g4" style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <CellChip tone={waitingTone(item.created_at)}>{waitingLabel(item.created_at)}</CellChip>
                  <CellChip tone="mut">{routeLabel(item.route)} acts</CellChip>
                  {!bucketId ? (
                    <Link href={suggestionHref(item)} className="cellchip c-acc" title="Open the file this suggestion belongs to">
                      {item.client_name || item.bucket_name}
                    </Link>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="linky"
                  style={{ textAlign: "left", fontWeight: 700, overflowWrap: "anywhere" }}
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : item.id)}
                >
                  {item.title}
                </button>
                {expanded ? (
                  <>
                    <span className="sub" style={{ overflowWrap: "anywhere" }}>{item.instructions}</span>
                    {item.rationale ? <span className="sub" style={{ overflowWrap: "anywhere" }}><b>Why:</b> {item.rationale}</span> : null}
                    {!item.approvable_here ? (
                      <span className="sub">
                        Addressed to a {routeLabel(item.route).toLowerCase()}, so it cannot be approved from here. Dismiss it, or ask for what it describes from the file&apos;s checklist.
                      </span>
                    ) : null}
                    {!canDecide ? <span className="sub">A super admin approves or dismisses suggestions.</span> : null}
                  </>
                ) : null}
                {canDecide ? (
                  <div className="row" style={{ gap: 6 }}>
                    {item.approvable_here ? (
                      <Btn size="sm" variant="pri" disabled={decide.isPending} onClick={() => setPending({ item, status: "approved" })}>Approve</Btn>
                    ) : null}
                    <Btn size="sm" disabled={decide.isPending} onClick={() => setPending({ item, status: "rejected" })}>Dismiss</Btn>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        {items.length > shown ? (
          <div className="row mt" style={{ justifyContent: "center" }}>
            <Btn size="sm" onClick={() => setShown((count) => count + Math.max(pageSize, 10))}>
              Show more ({items.length - shown} left)
            </Btn>
          </div>
        ) : null}
      </Panel>
      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.status === "approved" ? `Approve “${pending.item.title}”?` : `Dismiss “${pending?.item.title ?? ""}”?`}
        body={
          pending?.status === "approved"
            ? "The room records your approval and keeps the task on its list. Nothing is sent to the client by approving it."
            : "The suggestion is marked rejected and leaves the queue. It stays on the room's record."
        }
        confirmLabel={pending?.status === "approved" ? "Approve" : "Dismiss"}
        tone={pending?.status === "approved" ? "default" : "danger"}
        busy={decide.isPending}
        onConfirm={() => void confirm()}
      />
    </>
  );
}
