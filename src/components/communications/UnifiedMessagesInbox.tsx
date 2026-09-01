"use client";

// The inbox, grouped by PERSON.
//
// One row per contact — whoever messaged most recently sits on top. Expanding
// a contact (accordion, one open at a time) shows every conversation they
// appear in across in-system chat, email, and SMS, so an operator can refresh
// their memory of the whole relationship without hunting through sources.
//
// AI-intake conversations are deliberately absent: the client's dialogue with
// the underwriter AI is a workflow with its own screen, and mixing machine
// traffic into this list buried the messages that need a human. The backend
// enforces the exclusion; this component never sees them.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { Btn, CellChip, Input, PageHeader, Select, cx } from "@/components/ds";
import { PageActionMenu } from "@/components/ds/PageActionMenu";
import { useAuthedApi } from "@/hooks/useApi";
import type { UnifiedCommunicationThread, UnifiedContactPage } from "@/lib/communications";
import { NewMessageDrawer } from "./NewMessageDrawer";
import { UnifiedThreadConversation } from "./UnifiedThreadConversation";

const CHANNEL_OPTIONS = [
  ["", "All channels"],
  ["client", "In-system chat"],
  ["desk", "Dealer desk"],
  ["email", "Email"],
  ["sms", "SMS"],
] as const;

/** Operator-facing channel names — "client"/"desk" are both in-system chat. */
function channelLabel(channel: string) {
  return ({ client: "chat", desk: "desk", email: "email", sms: "sms" } as Record<string, string>)[channel] ?? channel;
}

function channelTone(channel: string): "acc" | "gold" | "mut" | "pet" {
  return ({ client: "acc", desk: "gold", email: "mut", sms: "pet" } as const)[channel as "client" | "desk" | "email" | "sms"] ?? "mut";
}

function sourceLabel(thread: UnifiedCommunicationThread) {
  return ({ loan: "Funding", dealer: "Audit", rep: "Rep", email: "Mailbox", sms: "SMS" } as Record<string, string>)[thread.source_kind] ?? thread.source_kind;
}

function when(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function UnifiedMessagesInbox() {
  const apiCall = useAuthedApi();
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: "120" });
    if (search.trim()) params.set("q", search.trim());
    if (channel) params.set("channel", channel);
    if (unreadOnly) params.set("unread_only", "true");
    return params.toString();
  }, [search, channel, unreadOnly]);

  const contacts = useQuery({
    queryKey: ["unified-communication-contacts", query],
    queryFn: () => apiCall<UnifiedContactPage>(`/communications/contacts?${query}`),
    refetchInterval: 15000,
  });

  // Keep the selection valid as the list refreshes; default to the newest
  // contact's newest conversation so the pane is never pointlessly empty.
  useEffect(() => {
    const items = contacts.data?.items ?? [];
    if (!items.length) { setOpenKey(null); setActiveThreadId(null); return; }
    const open = items.find((c) => c.key === openKey);
    if (!open) {
      setOpenKey(items[0].key);
      setActiveThreadId(items[0].latest_thread_id);
      return;
    }
    if (!activeThreadId || !open.threads.some((t) => t.id === activeThreadId)) {
      setActiveThreadId(open.latest_thread_id);
    }
  }, [contacts.data?.items, openKey, activeThreadId]);

  const toggle = (key: string, latestThreadId: string) => {
    if (openKey === key) { setOpenKey(null); return; }
    setOpenKey(key);
    setActiveThreadId(latestThreadId);
  };

  return (
    <div className="global-messages-page">
      <PageHeader
        title="Messages"
        lede="Every person you talk to — in-system chat, email, and SMS — grouped by contact, newest first."
        actions={<div className="row"><Btn variant="pri" onClick={() => setComposeOpen(true)}><Icon name="plus" size={14} /> New message</Btn><PageActionMenu label="Message actions" items={[{ label: "Open Elara queue", href: "/ai-inbox" }, { label: "Open AI intake", href: "/admin/ai-underwriter-leads" }, { label: "Open dealer messages", href: "/admin/dealer-messages" }]} /></div>}
        meta={<div className="row"><CellChip tone="acc">{contacts.data?.total ?? 0} contacts</CellChip><CellChip tone={(contacts.data?.unread_total ?? 0) ? "warn" : "mut"}>{contacts.data?.unread_total ?? 0} unread</CellChip></div>}
      />
      <div className="global-inbox">
        <aside className="global-inbox-rail">
          <div className="global-inbox-search"><span><Icon name="search" size={14} /></span><Input aria-label="Search contacts and messages" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people, email, phone..." /></div>
          <div className="global-inbox-filters two">
            <Select aria-label="Filter by channel" value={channel} onChange={(event) => setChannel(event.target.value)}>{CHANNEL_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
            <Btn size="sm" variant={unreadOnly ? "pri" : undefined} onClick={() => setUnreadOnly((value) => !value)}>Unread</Btn>
          </div>
          <div className="global-inbox-list">
            {contacts.isLoading ? <div className="empty"><span className="spinner solo" />Loading contacts...</div> : null}
            {contacts.isError ? <div className="empty">The inbox could not be loaded.</div> : null}
            {contacts.data?.items.map((contact) => {
              const open = openKey === contact.key;
              return (
                <div key={contact.key} className={cx("contact-group", open && "open")}>
                  <button
                    type="button"
                    className={cx("global-thread-row", open && "on", contact.unread_total > 0 && "unread")}
                    aria-expanded={open}
                    onClick={() => toggle(contact.key, contact.latest_thread_id)}
                  >
                    <span className="global-thread-avatar">{contact.name.slice(0, 2).toUpperCase()}</span>
                    <span className="grow trunc">
                      <span className="global-thread-title"><b className="trunc">{contact.name}</b><time>{when(contact.latest_at)}</time></span>
                      <span className="global-thread-preview trunc">{contact.latest_snippet || "Conversation"}</span>
                      <span className="global-thread-badges">
                        {contact.channels.map((ch) => <CellChip key={ch} tone={channelTone(ch)}>{channelLabel(ch)}</CellChip>)}
                        {contact.threads.length > 1 ? <CellChip tone="mut">{contact.threads.length} conversations</CellChip> : null}
                        {contact.unread_total ? <CellChip tone="warn">{contact.unread_total} new</CellChip> : null}
                      </span>
                    </span>
                    <span className="contact-caret"><Icon name={open ? "chevU" : "chevD"} size={14} /></span>
                  </button>
                  {open ? (
                    <div className="contact-threads" role="list">
                      {contact.threads.map((thread) => (
                        <button
                          key={thread.id}
                          type="button"
                          role="listitem"
                          className={cx("contact-thread-row", activeThreadId === thread.id && "on")}
                          onClick={() => setActiveThreadId(thread.id)}
                        >
                          <CellChip tone={channelTone(thread.channel)}>{sourceLabel(thread)}</CellChip>
                          <span className="grow trunc">
                            <span className="trunc"><b>{thread.title}</b>{thread.source_ref ? <span className="sub"> · {thread.source_ref}</span> : null}</span>
                            <span className="contact-thread-snippet trunc">{thread.latest_snippet || thread.source_label || channelLabel(thread.channel)}</span>
                          </span>
                          <time>{when(thread.latest_at)}</time>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!contacts.isLoading && !contacts.data?.items.length ? <div className="empty">No contacts match these filters.</div> : null}
          </div>
        </aside>
        <section className="global-inbox-thread">
          {activeThreadId ? <UnifiedThreadConversation threadId={activeThreadId} /> : <div className="empty global-inbox-empty"><Icon name="chat" size={28} /><b>Select a contact</b><span>Expand a contact to see every conversation with them — chat, email, and SMS.</span></div>}
        </section>
      </div>
      <NewMessageDrawer
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSent={(threadId) => {
          if (threadId) {
            // Let the refreshed contact list resolve which contact owns it.
            setActiveThreadId(threadId);
            setOpenKey(null);
          }
        }}
      />
    </div>
  );
}
