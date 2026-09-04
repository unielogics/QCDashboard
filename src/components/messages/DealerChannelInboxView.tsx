"use client";

// Shared dealer-channel Messages inbox, used by both sides of the same
// per-lead conversation between the internal team and a lead's dealer partner:
//   - /broker/messages  → scope "broker" (the partner's own leads)
//   - /admin/dealer-messages → scope "admin" (the team, across all leads)
// One row per AI file (lead) that has a thread, read/reply inline, click
// through to the file. Team <-> partner only — never the client.

import { useMemo, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { Btn, BtnLink, CellChip, Panel, cx } from "@/components/ds";
import { LeadNotesPanel, type LeadNote } from "@/components/broker/LeadNotesPanel";
import { useDealerChannelInbox, type DealerChannelInboxItem } from "@/hooks/useApi";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import { DealerChannelComposeDialog } from "@/components/messages/DealerChannelComposeDialog";

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
  const authedFetch = useAuthedFetch();
  const { data, isLoading, refetch } = useDealerChannelInbox(true, scope);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const items = useMemo(() => data?.items ?? [], [data]);
  const selected = items.find((it) => it.intake_id === selectedId) ?? null;

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    return authedFetch<T>(path, init);
  }

  async function openThread(item: DealerChannelInboxItem) {
    await openById(item.intake_id);
  }

  async function openById(intakeId: string) {
    setSelectedId(intakeId);
    setThreadLoading(true);
    setPostError(null);
    try {
      const rows = await call<LeadNote[]>(`${apiPrefix}/${intakeId}/notes`);
      setNotes(rows);
      await call(`${apiPrefix}/${intakeId}/messages/seen`, { method: "POST" });
      void refetch();
    } catch {
      setNotes([]);
    } finally {
      setThreadLoading(false);
    }
  }

  async function postMessage(content: string, imageIds: string[] = []) {
    if (!selectedId) return;
    setPosting(true);
    setPostError(null);
    try {
      await call(`${apiPrefix}/${selectedId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, image_ids: imageIds }),
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
    // Was a second <main> with its own 24px padding, nested inside the shell's
    // `main.content` — two landmarks and two gutters. The shell owns both.
    <div className="grid">
      {/* `.hd` rather than <PageHeader>: the unread count belongs on the title
          baseline, and PageHeader takes only a title, a lede and actions. */}
      <div className="hd">
        <Icon name="chat" size={18} />
        <h1>Messages</h1>
        {data && data.total_unread > 0 ? (
          <CellChip tone="acc">{data.total_unread} unread</CellChip>
        ) : null}
        <span className="lede">{subtitle}</span>
        {scope === "admin" ? (
          <>
            <span className="grow" />
            <Btn variant="pri" onClick={() => setComposeOpen(true)}>
              <Icon name="plus" size={13} /> New message
            </Btn>
          </>
        ) : null}
      </div>

      {composeOpen ? (
        <DealerChannelComposeDialog
          apiPrefix={apiPrefix}
          onClose={() => setComposeOpen(false)}
          onSent={(intakeId) => {
            setComposeOpen(false);
            void refetch();
            void openById(intakeId);
          }}
        />
      ) : null}

      {/* Bespoke two-pane track: a 360px conversation list beside the thread,
          both pinned to the viewport so each scrolls on its own. `.cg` is the
          twelve-column page grid and `.withrail` is a sticky rail — neither
          describes a fixed-height master/detail split. */}
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
        <Panel noPad>
          {/* The list scrolls inside the panel; `.pick + .pick` owns row spacing. */}
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: 10 }}>
            {isLoading ? (
              <div className="sub">Loading…</div>
            ) : items.length === 0 ? (
              <div className="sub">No conversations yet. Open a lead and start a message.</div>
            ) : (
              items.map((item) => {
                const active = item.intake_id === selectedId;
                return (
                  <button
                    key={item.intake_id}
                    type="button"
                    onClick={() => openThread(item)}
                    className={cx("pick", active && "on")}
                  >
                    <span className="grow grid g4">
                      <span className="row">
                        <strong className="grow trunc">{item.name}</strong>
                        <span className="sub">{timeAgo(item.last_message_at)}</span>
                        {item.unread_count > 0 ? (
                          <span className="cnt sm">{item.unread_count}</span>
                        ) : null}
                      </span>
                      <span className="sub trunc">
                        {item.last_message
                          ? `${authorLabel(item.last_message.author_role)}: ${item.last_message.content}`
                          : "No messages yet"}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </Panel>

        {/* Bespoke: header row over a thread that takes the remaining height. */}
        <div style={{ minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {selected ? (
            <>
              <div className="row">
                <strong className="trunc">{selected.name}</strong>
                <CellChip>{selected.outcome_status}</CellChip>
                <span className="grow" />
                <BtnLink href={fileHref(selected.intake_id)}>
                  <Icon name="layers" size={14} /> Open file
                </BtnLink>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                {threadLoading ? (
                  <div className="sub">Loading conversation…</div>
                ) : (
                  <LeadNotesPanel
                    notes={notes}
                    onPost={postMessage}
                    posting={posting}
                    error={postError}
                    subtitle={panelSubtitle}
                    emptyLabel={panelEmptyLabel}
                  />
                )}
              </div>
            </>
          ) : (
            // `.hintbox` is the dashed "what will be here" surface; it fills the
            // pane so the two columns stay the same height.
            <div className="hintbox" style={{ flex: 1 }}>
              <span className="hintbox-i">
                <Icon name="chat" size={16} />
              </span>
              <div className="sub">Select a conversation to read and reply, or open its file.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
