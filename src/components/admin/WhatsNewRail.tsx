"use client";

// Super-admin "What's new" — a right-side rail (house UX standard) listing
// recent client/broker platform activity: uploads, chat messages, form fills,
// new intakes, bookings, deletion requests. Backed by
// GET /admin/ai-underwriter-leads/whats-new; "Mark all seen" advances this
// admin's feed cursor. Clicking an item deep-links into the lead.

import { useMemo } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
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
  const { t } = useTheme();
  const feed = useLeadsWhatsNew();
  const unseen = feed.data?.unseen_count ?? 0;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        border: `1px solid ${t.line}`,
        borderRadius: 999,
        padding: "8px 14px",
        background: unseen > 0 ? t.brandSoft : t.surface2,
        color: unseen > 0 ? t.brand : t.ink2,
        fontWeight: 800,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      <Icon name="bell" size={14} />
      What&apos;s new
      {unseen > 0 ? (
        <span
          style={{
            background: t.brand,
            color: "#fff",
            borderRadius: 999,
            minWidth: 20,
            height: 20,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            padding: "0 6px",
          }}
        >
          {unseen > 99 ? "99+" : unseen}
        </span>
      ) : null}
    </button>
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
  const { t } = useTheme();
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
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(420px, 92vw)",
        zIndex: 60,
        background: t.surface,
        borderLeft: `1px solid ${t.line}`,
        boxShadow: "-18px 0 50px rgba(0,0,0,0.25)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: "16px 18px",
          borderBottom: `1px solid ${t.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div>
          <h2 style={{ margin: 0, color: t.ink, fontSize: 17 }}>What&apos;s new</h2>
          <span style={{ color: t.ink3, fontSize: 12 }}>Client & broker activity, last 7 days</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={markSeen.isPending || (feed.data?.unseen_count ?? 0) === 0}
            onClick={() => markSeen.mutate()}
            style={{
              border: `1px solid ${t.line}`,
              borderRadius: 999,
              padding: "7px 12px",
              background: t.surface2,
              color: t.ink2,
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {markSeen.isPending ? "Marking…" : "Mark all seen"}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close what's new"
            style={{
              border: `1px solid ${t.line}`,
              borderRadius: 999,
              width: 32,
              height: 32,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: t.surface2,
              color: t.ink2,
              cursor: "pointer",
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "grid", gap: 12, alignContent: "start" }}>
        {feed.isLoading ? (
          <span style={{ color: t.ink3, fontSize: 13 }}>Loading activity…</span>
        ) : groups.length === 0 ? (
          <div
            style={{
              border: `1px dashed ${t.line}`,
              borderRadius: 12,
              padding: 20,
              textAlign: "center",
              color: t.ink3,
              fontSize: 13,
            }}
          >
            No client or broker activity in the last 7 days.
          </div>
        ) : (
          groups.map((group) => (
            <section
              key={group.intakeId || group.name}
              style={{ border: `1px solid ${t.line}`, borderRadius: 12, background: t.surface2, overflow: "hidden" }}
            >
              <button
                type="button"
                onClick={() => group.intakeId && onOpenLead(group.intakeId)}
                disabled={!group.intakeId}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: 0,
                  borderBottom: `1px solid ${t.line}`,
                  padding: "10px 12px",
                  background: "transparent",
                  color: t.ink,
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: group.intakeId ? "pointer" : "default",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.name}</span>
                <span style={{ color: t.brand, fontSize: 12, flexShrink: 0 }}>
                  {group.items.length} update{group.items.length !== 1 ? "s" : ""} {group.intakeId ? "→" : ""}
                </span>
              </button>
              <div style={{ display: "grid" }}>
                {group.items.slice(0, 6).map((item) => {
                  const unseen = new Date(item.created_at).getTime() > seenAt;
                  return (
                    <div
                      key={item.event_id}
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: "8px 12px",
                        borderBottom: `1px solid ${t.line}`,
                        background: unseen ? t.brandSoft : "transparent",
                      }}
                    >
                      <span style={{ color: unseen ? t.brand : t.ink3, marginTop: 2 }}>
                        <Icon name={actionIcon(item.action)} size={13} />
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ color: t.ink, fontSize: 12.5, fontWeight: 600 }}>
                          {item.actor_name || (item.actor_role || "client").replace(/_/g, " ")}
                          <span style={{ color: t.ink2, fontWeight: 500 }}> — {item.label}</span>
                        </div>
                        {item.detail ? (
                          <div
                            style={{
                              color: t.ink3,
                              fontSize: 11.5,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.detail}
                          </div>
                        ) : null}
                      </div>
                      <span style={{ color: t.ink3, fontSize: 11, whiteSpace: "nowrap" }}>{timeAgo(item.created_at)}</span>
                    </div>
                  );
                })}
                {group.items.length > 6 ? (
                  <div style={{ padding: "6px 12px", color: t.ink3, fontSize: 11.5 }}>
                    + {group.items.length - 6} more — open the lead for the full trail
                  </div>
                ) : null}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
