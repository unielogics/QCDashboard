"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { Btn, CellChip, Input, PageHeader, Select, cx } from "@/components/ds";
import { PageActionMenu } from "@/components/ds/PageActionMenu";
import { useAuthedApi } from "@/hooks/useApi";
import type { UnifiedCommunicationThread, UnifiedCommunicationThreadPage } from "@/lib/communications";
import { UnifiedThreadConversation } from "./UnifiedThreadConversation";

const SOURCE_OPTIONS = [
  ["", "All sources"], ["loan", "Funding files"], ["intake", "AI intake"], ["dealer", "Dealer / audit"], ["rep", "Rep activity"], ["email", "Connected email"],
] as const;
const CHANNEL_OPTIONS = [
  ["", "All channels"], ["client", "Client"], ["underwriter_ai", "Underwriter AI"], ["partner", "Partner"], ["internal", "Internal"], ["desk", "Dealer desk"], ["email", "Email"], ["sms", "SMS"],
] as const;

function sourceLabel(thread: UnifiedCommunicationThread) {
  return ({ loan: "Funding", intake: "AI intake", dealer: "Audit", rep: "Rep", email: "Mailbox" } as Record<string, string>)[thread.source_kind] ?? thread.source_kind;
}

function sourceTone(thread: UnifiedCommunicationThread): "acc" | "pet" | "gold" | "warn" | "mut" {
  return ({ loan: "acc", intake: "pet", dealer: "gold", rep: "warn", email: "mut" } as const)[thread.source_kind as "loan" | "intake" | "dealer" | "rep" | "email"] ?? "mut";
}

export function UnifiedMessagesInbox() {
  const apiCall = useAuthedApi();
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [channel, setChannel] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: "150" });
    if (search.trim()) params.set("q", search.trim());
    if (source) params.set("source_kind", source);
    if (channel) params.set("channel", channel);
    if (unreadOnly) params.set("unread_only", "true");
    return params.toString();
  }, [search, source, channel, unreadOnly]);
  const threads = useQuery({
    queryKey: ["unified-communication-threads", query],
    queryFn: () => apiCall<UnifiedCommunicationThreadPage>(`/communications/threads?${query}`),
    refetchInterval: 15000,
  });
  useEffect(() => {
    const rows = threads.data?.items ?? [];
    if (!activeId || !rows.some((row) => row.id === activeId)) setActiveId(rows[0]?.id ?? null);
  }, [threads.data?.items, activeId]);
  const active = threads.data?.items.find((thread) => thread.id === activeId) ?? null;

  return (
    <div className="global-messages-page">
      <PageHeader title="Messages" lede="One inbox for every account, file, rep, client, email, and SMS activity." actions={<PageActionMenu label="Message actions" items={[{ label: "Open Elara queue", href: "/ai-inbox" }, { label: "Open AI intake", href: "/admin/ai-underwriter-leads" }, { label: "Open dealer messages", href: "/admin/dealer-messages" }]} />} meta={<div className="row"><CellChip tone="acc">{threads.data?.total ?? 0} active threads</CellChip><CellChip tone={(threads.data?.unread_total ?? 0) ? "warn" : "mut"}>{threads.data?.unread_total ?? 0} unread</CellChip></div>} />
      <div className="global-inbox">
        <aside className="global-inbox-rail">
          <div className="global-inbox-search"><span><Icon name="search" size={14} /></span><Input aria-label="Search all messages" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people, files, email..." /></div>
          <div className="global-inbox-filters">
            <Select aria-label="Filter by source" value={source} onChange={(event) => setSource(event.target.value)}>{SOURCE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
            <Select aria-label="Filter by channel" value={channel} onChange={(event) => setChannel(event.target.value)}>{CHANNEL_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
            <Btn size="sm" variant={unreadOnly ? "pri" : undefined} onClick={() => setUnreadOnly((value) => !value)}>Unread</Btn>
          </div>
          <div className="global-inbox-list">
            {threads.isLoading ? <div className="empty"><span className="spinner solo" />Loading inbox...</div> : null}
            {threads.isError ? <div className="empty">The inbox could not be loaded.</div> : null}
            {threads.data?.items.map((thread) => (
              <button key={thread.id} type="button" className={cx("global-thread-row", activeId === thread.id && "on", thread.unread_count > 0 && "unread")} onClick={() => setActiveId(thread.id)}>
                <span className="global-thread-avatar">{(thread.participant_name || thread.title).slice(0, 2).toUpperCase()}</span>
                <span className="grow trunc"><span className="global-thread-title"><b className="trunc">{thread.participant_name || thread.title}</b><time>{new Date(thread.latest_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time></span><span className="global-thread-file trunc">{thread.source_ref ? `${thread.source_ref} · ` : ""}{thread.title}</span><span className="global-thread-preview trunc">{thread.latest_snippet || thread.source_label || "Conversation"}</span><span className="global-thread-badges"><CellChip tone={sourceTone(thread)}>{sourceLabel(thread)}</CellChip><CellChip tone="mut">{thread.channel.replaceAll("_", " ")}</CellChip>{thread.transport !== "portal" ? <CellChip tone="mut">{thread.transport}</CellChip> : null}{thread.unread_count ? <CellChip tone="warn">{thread.unread_count} new</CellChip> : null}</span></span>
              </button>
            ))}
            {!threads.isLoading && !threads.data?.items.length ? <div className="empty">No conversations match these filters.</div> : null}
          </div>
        </aside>
        <section className="global-inbox-thread">
          {active ? <UnifiedThreadConversation threadId={active.id} /> : <div className="empty global-inbox-empty"><Icon name="chat" size={28} /><b>Select a conversation</b><span>Messages remain attached to their original client, intake, audit, rep, or mailbox record.</span></div>}
        </section>
      </div>
    </div>
  );
}
