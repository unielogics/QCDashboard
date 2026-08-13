"use client";

// Shared dealer-channel Messages inbox, used by both sides of the same
// per-lead conversation between the internal team and a lead's dealer partner:
//   - /broker/messages  → scope "broker" (the partner's own leads)
//   - /admin/dealer-messages → scope "admin" (the team, across all leads)
// One row per AI file (lead) that has a thread, read/reply inline, click
// through to the file. Team <-> partner only — never the client.

import { useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill } from "@/components/design-system/primitives";
import { qcBtn } from "@/components/design-system/buttons";
import { Icon } from "@/components/design-system/Icon";
import { LeadNotesPanel, type LeadNote } from "@/components/broker/LeadNotesPanel";
import { useDealerChannelInbox, type DealerChannelInboxItem } from "@/hooks/useApi";
import { api } from "@/lib/api";

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function DealerChannelInboxView({
  scope,
  apiPrefix,
  fileHref,
  subtitle,
  panelSubtitle,
  panelEmptyLabel,
  selfRole,
}: {
  scope: "broker" | "admin";
  apiPrefix: string; // e.g. "/broker/ai-underwriter-leads" or "/admin/ai-underwriter-leads"
  fileHref: (intakeId: string) => string;
  subtitle: string;
  panelSubtitle: string;
  panelEmptyLabel: string;
  selfRole: "partner" | "team";
}) {
  const { t } = useTheme();
  const { getToken } = useAuth();
  const { data, isLoading, refetch } = useDealerChannelInbox(true, scope);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const items = useMemo(() => data?.items ?? [], [data]);
  const selected = items.find((it) => it.intake_id === selectedId) ?? null;

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    return api<T>(path, { ...init, authToken: token ?? undefined });
  }

  async function openThread(item: DealerChannelInboxItem) {
    setSelectedId(item.intake_id);
    setThreadLoading(true);
    setPostError(null);
    try {
      const rows = await call<LeadNote[]>(`${apiPrefix}/${item.intake_id}/notes`);
      setNotes(rows);
      await call(`${apiPrefix}/${item.intake_id}/messages/seen`, { method: "POST" });
      void refetch();
    } catch {
      setNotes([]);
    } finally {
      setThreadLoading(false);
    }
  }

  async function postMessage(content: string) {
    if (!selectedId) return;
    setPosting(true);
    setPostError(null);
    try {
      await call(`${apiPrefix}/${selectedId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const rows = await call<LeadNote[]>(`${apiPrefix}/${selectedId}/notes`);
      setNotes(rows);
      void refetch();
    } catch (error) {
      setPostError(error instanceof Error ? error.message : "Could not send the message.");
    } finally {
      setPosting(false);
    }
  }

  function authorLabel(role: string | null): string {
    if (role === "dealer_partner") return selfRole === "partner" ? "You" : "Partner";
    if (role === "super_admin" || role === "loan_exec") return selfRole === "team" ? "You" : "Team";
    return "Team";
  }

  return (
    <main style={{ padding: 24, display: "grid", gap: 16, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Icon name="chat" size={20} />
        <h1 style={{ margin: 0, fontSize: 22, color: t.ink }}>Messages</h1>
        {data && data.total_unread > 0 ? (
          <Pill bg={t.brandSoft} color={t.brand}>{data.total_unread} unread</Pill>
        ) : null}
        <span style={{ color: t.ink3, fontSize: 13 }}>{subtitle}</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 360px) minmax(0, 1fr)",
          gap: 16,
          alignItems: "stretch",
          minHeight: 0,
          height: "calc(100vh - 150px)",
        }}
      >
        <div style={{ border: `1px solid ${t.line}`, borderRadius: 14, background: t.surface, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {isLoading ? (
              <div style={{ padding: 20, color: t.ink3, fontSize: 13 }}>Loading…</div>
            ) : items.length === 0 ? (
              <div style={{ padding: 20, color: t.ink3, fontSize: 13, lineHeight: 1.5 }}>
                No conversations yet. Open a lead and start a message.
              </div>
            ) : (
              items.map((item) => {
                const active = item.intake_id === selectedId;
                return (
                  <button
                    key={item.intake_id}
                    type="button"
                    onClick={() => openThread(item)}
                    style={{
                      all: "unset",
                      boxSizing: "border-box",
                      display: "grid",
                      gap: 3,
                      width: "100%",
                      padding: "12px 14px",
                      cursor: "pointer",
                      borderBottom: `1px solid ${t.line}`,
                      borderLeft: `3px solid ${active ? t.brand : "transparent"}`,
                      background: active ? t.surface2 : "transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <strong style={{ color: t.ink, fontSize: 13, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.name}
                      </strong>
                      <span style={{ color: t.ink4, fontSize: 11, flexShrink: 0 }}>{timeAgo(item.last_message_at)}</span>
                      {item.unread_count > 0 ? (
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: t.brand, color: t.inverse, fontSize: 10.5, fontWeight: 800, flexShrink: 0 }}>
                          {item.unread_count}
                        </span>
                      ) : null}
                    </div>
                    <span style={{ color: t.ink3, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.last_message
                        ? `${authorLabel(item.last_message.author_role)}: ${item.last_message.content}`
                        : "No messages yet"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div style={{ minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {selected ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
                <strong style={{ color: t.ink, fontSize: 15, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.name}</strong>
                <Pill bg={t.surface2} color={t.ink3}>{selected.outcome_status}</Pill>
                <a
                  href={fileHref(selected.intake_id)}
                  style={{ ...qcBtn(t), marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", flexShrink: 0 }}
                >
                  <Icon name="layers" size={14} /> Open file
                </a>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                {threadLoading ? (
                  <div style={{ padding: 20, color: t.ink3, fontSize: 13 }}>Loading conversation…</div>
                ) : (
                  <LeadNotesPanel notes={notes} onPost={postMessage} posting={posting} error={postError} subtitle={panelSubtitle} emptyLabel={panelEmptyLabel} />
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "grid", placeItems: "center", textAlign: "center", color: t.ink3, fontSize: 13, border: `1px dashed ${t.line}`, borderRadius: 14, padding: 24, lineHeight: 1.5 }}>
              Select a conversation to read and reply, or open its file.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
