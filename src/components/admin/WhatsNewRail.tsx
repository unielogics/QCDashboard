"use client";

// Super-admin "What's new" — a right-side rail (house UX standard) listing
// recent client/broker platform activity: uploads, chat messages, form fills,
// new intakes, bookings, deletion requests. Backed by
// GET /admin/ai-underwriter-leads/whats-new; "Mark all seen" advances this
// admin's feed cursor. Clicking an item deep-links into the lead.

import { useMemo } from "react";
import { Icon } from "@/components/design-system/Icon";
import { Btn, cx, Empty, IconBtn, Sub } from "@/components/ds";
import { useLeadsWhatsNew, useMarkWhatsNewSeen } from "@/hooks/useApi";
import type { WhatsNewItem } from "@/lib/types";

function timeAgo(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function actionIcon(action: string): string {
  if (action.includes("upload") || action.includes("zip")) return "upload";
  if (action.includes("chat")) return "chat";
  if (action.includes("call")) return "cal";
  if (action.includes("deletion")) return "x";
  return "sparkles";
}

export function WhatsNewButton({ onClick }: { onClick: () => void }) {
  const feed = useLeadsWhatsNew();
  const unseen = feed.data?.unseen_count ?? 0;
  return (
    <Btn onClick={onClick}>
      <Icon name="bell" size={14} />
      What&apos;s new
      {unseen > 0 ? <span className="cnt sm">{unseen > 99 ? "99+" : unseen}</span> : null}
    </Btn>
  );
}

export function WhatsNewRail({
  open,
  onClose,
  onOpenLead,
}: {
  open: boolean;
  onClose: () => void;
  onOpenLead: (intakeId: string) => void;
}) {
  const feed = useLeadsWhatsNew(open);
  const markSeen = useMarkWhatsNewSeen();
  const items = feed.data?.items ?? [];
  const seenAt = feed.data?.feed_seen_at ? new Date(feed.data.feed_seen_at).getTime() : 0;

  const groups = useMemo(() => {
    const byLead = new Map<string, { name: string; intakeId: string | null; items: WhatsNewItem[] }>();
    for (const item of items) {
      const key = item.intake_id || item.lead_name || "unknown";
      if (!byLead.has(key)) {
        byLead.set(key, { name: item.lead_name || "Unassigned room", intakeId: item.intake_id ?? null, items: [] });
      }
      byLead.get(key)!.items.push(item);
    }
    return Array.from(byLead.values());
  }, [items]);

  if (!open) return null;

  return (
    <aside
      aria-label="What's new"
      // Bespoke overlay geometry (rule 3). Neither existing word fits: `.rail`
      // is the Elara rail — position:sticky, in the flex flow beside .content —
      // and `.drawer` is a centred modal. This one is pinned to the viewport's
      // right edge and deliberately NOT modal: the list behind it stays live.
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(420px, 92vw)",
        zIndex: 60,
        background: "var(--surface)",
        borderLeft: "1px solid var(--line)",
        boxShadow: "var(--sh2)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className="panel-h">
        <div className="grow">
          {/* globals.css sizes `h2` as a PAGE title (23px). This is the heading
              of an overlay that sits beside one, so it is stepped down here. */}
          <h2 style={{ fontSize: 17 }}>What&apos;s new</h2>
          <Sub>Client &amp; broker activity, last 7 days</Sub>
        </div>
        <Btn
          size="sm"
          disabled={markSeen.isPending || (feed.data?.unseen_count ?? 0) === 0}
          onClick={() => markSeen.mutate()}
        >
          {markSeen.isPending ? "Marking…" : "Mark all seen"}
        </Btn>
        <IconBtn onClick={onClose} aria-label="Close what's new">
          <Icon name="x" size={14} />
        </IconBtn>
      </div>

      {/* Scroll + top-alignment are this element's job, not `.panel-b`'s. */}
      <div className="panel-b grid" style={{ overflowY: "auto", alignContent: "start" }}>
        {feed.isLoading ? (
          <Sub>Loading activity…</Sub>
        ) : groups.length === 0 ? (
          <Empty>No client or broker activity in the last 7 days.</Empty>
        ) : (
          groups.map((group) => (
            <section key={group.intakeId || group.name} className="disc on">
              <button
                type="button"
                className="disc-h"
                onClick={() => group.intakeId && onOpenLead(group.intakeId)}
                disabled={!group.intakeId}
              >
                <strong className="grow trunc">{group.name}</strong>
                <span className="linky">
                  {group.items.length} update{group.items.length !== 1 ? "s" : ""} {group.intakeId ? "→" : ""}
                </span>
              </button>
              <div className="disc-b">
                {group.items.slice(0, 6).map((item) => {
                  const unseen = new Date(item.created_at).getTime() > seenAt;
                  return (
                    <div key={item.event_id} className={cx("filerow", unseen && "tone-acc")}>
                      <Icon name={actionIcon(item.action)} size={13} />
                      <div className="grow">
                        <div>
                          <strong>{item.actor_name || (item.actor_role || "client").replace(/_/g, " ")}</strong>
                          <span> — {item.label}</span>
                        </div>
                        {item.detail ? <div className="sub trunc">{item.detail}</div> : null}
                      </div>
                      {/* No class owns white-space on `.sub`, and "12h ago"
                          breaking across two lines re-flows the whole row. */}
                      <span className="sub" style={{ whiteSpace: "nowrap" }}>
                        {timeAgo(item.created_at)}
                      </span>
                    </div>
                  );
                })}
                {group.items.length > 6 ? (
                  <div className="filerow sub">
                    + {group.items.length - 6} more — open the lead for the full trail
                  </div>
                ) : null}
              </div>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
