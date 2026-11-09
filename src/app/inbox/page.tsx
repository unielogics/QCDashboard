"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast, Toast } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { apiErrorMessage } from "@/components/email/EmailComposer";
import { Btn, Callout, CellChip, IconBtn, Input, Lbl, PageHeader, Panel, Textarea, cx } from "@/components/ds";
import {
  useCurrentUser,
  useGoogleConnection,
  useInboxThreads,
  useInboxThread,
  useInboxSearch,
  useInboxReply,
  useMarkThreadRead,
  useStarMessage,
  type InboxThreadSummary,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { useVisibleMessageReceipts } from "@/components/communications/useVisibleMessageReceipts";
import { MessageImagePicker, useMessageImages } from "@/components/communications/MessageImages";
import { InlineImageStrip } from "@/components/InlineImages";
import { outgoingDeliveryWarning } from "@/lib/messageImages";

type InboxFilter = "all" | "unread" | "starred";

// Labels are written out rather than text-transform:capitalize'd, because the
// segmented control in the design system does not carry a transform.
const FILTERS: { value: InboxFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "starred", label: "Starred" },
];

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function initialsOf(email: string | null): string {
  if (!email) return "?";
  const name = email.split("@")[0].replace(/[._-]+/g, " ").trim();
  const parts = name.split(" ").filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function InboxPage() {
  const router = useRouter();
  const route = useSearchParams();
  const requestedThread = route.get("thread")?.trim() || null;
  const unifiedTarget = requestedThread && /^(?:sms|rep|loan|dealer|intake|email):/.test(requestedThread) ? requestedThread : null;
  const toast = useToast();
  const { data: user } = useCurrentUser();
  const { data: conn, isLoading: connLoading } = useGoogleConnection();

  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [replyBody, setReplyBody] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [deliveryWarning, setDeliveryWarning] = useState("");
  const images = useMessageImages(`gmail:${selectedThread || ""}`);
  const messageTimelineRef = useRef<HTMLDivElement | null>(null);

  const searching = search.trim().length >= 2;
  const threadsQ = useInboxThreads({
    unreadOnly: filter === "unread",
    starredOnly: filter === "starred",
  });
  const searchQ = useInboxSearch(search);
  const list = searching ? searchQ.data : threadsQ.data;
  const listLoading = searching ? searchQ.isLoading : threadsQ.isLoading;

  const threadQ = useInboxThread(selectedThread);
  const reply = useInboxReply();
  const markRead = useMarkThreadRead();
  const star = useStarMessage();
  const readReceipt = useVisibleMessageReceipts(messageTimelineRef, { unifiedThreadId: `email:${selectedThread ?? ""}` }, (threadQ.data?.messages ?? []).filter((message) => message.direction === "inbound").map((message) => message.id), !unifiedTarget && Boolean(selectedThread && threadQ.data && !threadQ.isError));

  useEffect(() => {
    if (unifiedTarget) {
      const query = new URLSearchParams({ thread: unifiedTarget });
      const channel = route.get("channel");
      if (channel === "sms" || channel === "email") query.set("channel", channel);
      router.replace(`/messages?${query}`);
    } else if (requestedThread) setSelectedThread(requestedThread);
  }, [requestedThread, route, router, unifiedTarget]);

  // Owner gate: only a user with a connected Gmail mailbox sees the inbox.
  // Clients never reach it. Backend enforces owner-scoping regardless; this is UX.
  const isClient = user?.role === Role.CLIENT;
  useEffect(() => {
    if (isClient) router.replace("/");
  }, [isClient, router]);

  useEffect(() => { setReplyBody(""); }, [selectedThread]);

  const threads: InboxThreadSummary[] = list?.threads ?? [];

  const activeSummary = useMemo(
    () => threads.find((th) => th.thread_id === selectedThread) ?? null,
    [threads, selectedThread],
  );
  const latestThreadMessageId = threadQ.data?.messages.at(-1)?.id ?? null;

  useLayoutEffect(() => {
    const timeline = messageTimelineRef.current;
    if (timeline) timeline.scrollTop = timeline.scrollHeight;
  }, [selectedThread, latestThreadMessageId]);

  if (isClient) return null;
  if (unifiedTarget) return <div className="empty" role="status">Opening the requested conversation…</div>;

  if (!connLoading && !conn?.gmail_connected) {
    return (
      <div style={{ maxWidth: 560, margin: "48px auto" }}>
        <div className="card">
          <Icon name="mail" size={28} />
          {/* h1, matching PageHeader: this branch IS the whole page, so it
              must still contribute a top-level heading to the outline. */}
          <div className="hd" style={{ marginTop: 10 }}>
            <h1>Connect your inbox</h1>
          </div>
          <p className="sub mt">
            The Workspace inbox surfaces email from your clients and parties, matched to loans and
            clients — privately, in your own mailbox. Connect Gmail in Settings to turn it on.
          </p>
          <div className="mt">
            <Link href="/settings" className="btn pri">
              Go to Settings
            </Link>
          </div>
        </div>
      </div>
    );
  }

  async function doReply() {
    if (!selectedThread) return;
    if (!replyBody.trim() && !images.images.length) {
      toast.show("Write a reply or attach an image first");
      return;
    }
    setReplyBusy(true);
    try {
      const image_ids = await images.flush();
      const res = await reply.mutateAsync({ threadId: selectedThread, body: replyBody, image_ids });
      if (res.ok) {
        const warning = outgoingDeliveryWarning(res);
        toast.show(warning || "Reply sent"); setDeliveryWarning(warning || "");
        setReplyBody("");
        images.reset();
      } else {
        toast.show(res.detail ? `Send failed: ${res.detail}` : "Send failed — check status");
      }
    } catch (error) {
      toast.show(apiErrorMessage(error, "Send failed"));
    } finally {
      setReplyBusy(false);
    }
  }

  return (
    // Full-height master/detail: the thread list and the open thread each scroll
    // inside themselves so the composer never leaves the viewport. Deliberately
    // not .cg — that grid sizes to content and would drop the composer below the
    // fold, and the 38/62 split is a reading decision, not a 12-column one.
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
      <PageHeader
        title="Inbox"
        lede={
          conn?.google_email ? (
            <CellChip tone="acc">
              <Icon name="mail" size={12} /> {conn.google_email}
            </CellChip>
          ) : undefined
        }
        actions={
          <>
            <div className="row" style={{ minWidth: 220 }}>
              <Icon name="search" size={14} />
              <Input
                grow
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subject or sender…"
              />
            </div>
            {/* Hand-rolled `.seg` rather than <Seg> because these narrow while
                a search is running — a real `disabled` attribute, not a
                dimmed-but-clickable one, and <Seg> takes no disabled.
                role=group + aria-pressed, NOT tablist: this filters the list
                below, it does not switch which view you are looking at, and a
                filter announced as a tab tells a screen-reader user the page is
                about to change when it is not. The dimming is now
                `.seg button:disabled` in app-extras. */}
            <div className="seg" role="group" aria-label="Filter threads">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={filter === f.value}
                  className={filter === f.value ? "on" : ""}
                  disabled={searching}
                  onClick={() => setFilter(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </>
        }
      />

      {list?.truncated && (
        <div className="sub">
          Showing your most recent mail — narrow with search to see older threads.
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 38fr) minmax(0, 62fr)",
          gap: 14,
          alignItems: "start",
          minHeight: 0,
          flex: 1,
        }}
      >
        {/* Thread list */}
        <Panel title={searching ? "Search results" : "Threads"} noPad>
          <div className="panel-b" style={{ maxHeight: "72vh", overflowY: "auto" }}>
            {listLoading && <div className="sub">Loading…</div>}
            {!listLoading && threads.length === 0 && (
              <div className="sub">
                {searching ? "No matches." : "No email yet. Matched client and party mail will appear here."}
              </div>
            )}
            {threads.map((th) => {
              const active = th.thread_id === selectedThread;
              const unread = th.unread_count > 0;
              return (
                <button
                  key={th.thread_id}
                  type="button"
                  onClick={() => setSelectedThread(th.thread_id)}
                  className={cx("pick", "btnreset", active && "on")}
                  aria-current={active}
                >
                  <span className="grow">
                    {/* Bespoke: sender, flags and time on ONE line that must not
                        wrap — `.row` wraps, which would drop the timestamp
                        under the name on a narrow list. */}
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {/* Data-derived: an unread thread is marked in the accent. */}
                      {unread && <span className="repdot" style={{ background: "var(--accent)" }} />}
                      <span
                        className="trunc"
                        // Weight and ink are read state, not design state.
                        style={{
                          fontWeight: unread ? 800 : 600,
                          color: unread ? "var(--ink)" : "var(--ink2)",
                          flex: 1,
                        }}
                      >
                        {th.last_from ?? "(unknown)"}
                      </span>
                      {th.is_starred && (
                        // A bare glyph, not a `.cellchip` — a chip here would
                        // put a tinted pill around a single star.
                        <span title="Starred" style={{ color: "var(--warn)" }}>
                          ★
                        </span>
                      )}
                      {th.has_attachments && <Icon name="paperclip" size={12} />}
                      <span className="msg-when">{fmtTime(th.last_received_at)}</span>
                    </span>
                    <span
                      className="trunc"
                      // `.trunc` owns the ellipsis; display and weight are the
                      // block break and the read state.
                      style={{ display: "block", marginTop: 3, fontWeight: unread ? 700 : 500 }}
                    >
                      {th.subject || "(no subject)"}
                      {th.message_count > 1 && (
                        <span className="sub" style={{ fontWeight: 600 }}> · {th.message_count}</span>
                      )}
                    </span>
                    {th.preview && (
                      <span className="sub trunc" style={{ display: "block", marginTop: 2 }}>
                        {th.preview}
                      </span>
                    )}
                    <span className="row" style={{ marginTop: 6 }}>
                      {th.loan_id && (
                        <CellChip tone="pet">
                          <Icon name="layers" size={10} /> Loan
                        </CellChip>
                      )}
                      {th.client_id && (
                        <CellChip tone="acc">
                          <Icon name="clients" size={10} /> Client
                        </CellChip>
                      )}
                      {th.matched_party_role && <CellChip tone="mut">{th.matched_party_role}</CellChip>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>

        {/* Open thread */}
        <div className="panel" style={{ minHeight: 0 }}>
          {!selectedThread && (
            <div className="panel-b" style={{ textAlign: "center" }}>
              <span className="sub">Select a thread to read it.</span>
            </div>
          )}
          {selectedThread && threadQ.isLoading && (
            <div className="panel-b">
              <span className="sub">Loading thread…</span>
            </div>
          )}
          {selectedThread && threadQ.isError ? <Callout tone="bad">The requested email could not be loaded. <Btn size="sm" onClick={() => void threadQ.refetch()}>Retry requested email</Btn></Callout> : null}
          {selectedThread && !threadQ.isError && threadQ.data && (
            <>
              {/* thread header */}
              <div className="panel-h">
                <div className="grow">
                  <h3>{threadQ.data.subject || "(no subject)"}</h3>
                  <div className="row" style={{ marginTop: 6 }}>
                    {threadQ.data.loan_id && (
                      <Link href={`/loans/${threadQ.data.loan_id}`} style={{ textDecoration: "none" }}>
                        <CellChip tone="pet">
                          <Icon name="layers" size={11} /> Open loan
                        </CellChip>
                      </Link>
                    )}
                    {threadQ.data.client_id && (
                      <Link href={`/clients/${threadQ.data.client_id}`} style={{ textDecoration: "none" }}>
                        <CellChip tone="acc">
                          <Icon name="clients" size={11} /> Open client
                        </CellChip>
                      </Link>
                    )}
                    {threadQ.data.matched_party_role && (
                      <CellChip tone="mut">{threadQ.data.matched_party_role}</CellChip>
                    )}
                  </div>
                </div>
                <IconBtn
                  title={activeSummary?.is_starred ? "Unstar" : "Star"}
                  aria-pressed={!!activeSummary?.is_starred}
                  onClick={() => {
                    const last = threadQ.data!.messages[threadQ.data!.messages.length - 1];
                    if (last)
                      star.mutate({
                        messageId: last.id,
                        isStarred: !activeSummary?.is_starred,
                        threadId: selectedThread!,
                      });
                  }}
                >
                  <span
                    style={{
                      fontSize: 16,
                      lineHeight: 1,
                      color: activeSummary?.is_starred ? "var(--warn)" : "var(--muted)",
                    }}
                  >
                    {activeSummary?.is_starred ? "★" : "☆"}
                  </span>
                </IconBtn>
              </div>

              {/* messages — .msg.mine carries the outbound channel, matching the
                  "Sent" chip and the petrol avatar, so a message read out of
                  context still says which side of the mailbox it came from. */}
              {/* `.panel-b` supplies the gutters. `.thr` owns its own padding
                  shorthand, so overriding one side of it inline would leave two
                  owners for the same property. */}
              <div ref={messageTimelineRef} className="panel-b" style={{ minHeight: 0, overflowY: "auto" }}>
                <div className="thr">
                {threadQ.data.messages.map((m) => {
                  const outbound = m.direction === "outbound";
                  return (
                    <div key={m.id} data-communication-message-id={!outbound ? m.id : undefined} className="row top">
                      {/* Data-derived: petrol marks mail you sent, accent marks
                          mail you received — the same pairing as the Sent chip. */}
                      <span
                        className="avatar"
                        style={{ background: outbound ? "var(--petrol)" : "var(--accent)" }}
                      >
                        {initialsOf(m.from_email)}
                      </span>
                      <div className={cx("msg", "grow", outbound && "mine")}>
                        <div className="msg-h">
                          <span className="msg-who">
                            {m.from_email || (outbound ? "You" : "(unknown)")}
                          </span>
                          {outbound && <CellChip tone="pet">Sent</CellChip>}
                          <span className="msg-when">{fmtTime(m.received_at)}</span>
                        </div>
                        <div className="sub trunc">
                          to {(m.to_emails ?? []).join(", ") || "—"}
                        </div>
                        <div className="msg-b">
                          {m.body_text || (
                            <span className="sub" style={{ fontStyle: "italic" }}>
                              (no readable text body)
                            </span>
                          )}
                        </div>
                        <InlineImageStrip images={m.images} />
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>

              {/* reply */}
              {readReceipt.error ? <Callout tone="bad">Messages loaded, but read status could not be saved. <Btn size="sm" onClick={readReceipt.retry}>Retry read status</Btn></Callout> : null}
              <div className="composer" style={{ paddingLeft: 16, paddingRight: 16, paddingBottom: 14 }}>
                {deliveryWarning ? <Callout tone="warn">{deliveryWarning}</Callout> : null}
                <Lbl>Reply from your Gmail</Lbl>
                <Textarea
                  value={replyBody}
                  disabled={replyBusy}
                  onPaste={images.onPaste}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Write a reply…"
                  rows={4}
                />
                <MessageImagePicker draft={images} disabled={replyBusy} />
                <div className="composer-row">
                  <Btn variant="pri" disabled={replyBusy} onClick={doReply}>
                    {replyBusy ? "Sending…" : "Send reply"}
                  </Btn>
                  {/* Data-derived: dimmed while the mutation is in flight. NOTE
                      this is not `disabled` — the button stays clickable, which
                      is how it shipped. */}
                  <Btn
                    style={markRead.isPending ? { opacity: 0.6 } : undefined}
                    onClick={() => markRead.mutate({ threadId: selectedThread!, isRead: false })}
                  >
                    Mark unread
                  </Btn>
                  <span className="hint">Replies to the latest sender in this thread.</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <Toast msg={toast.msg} />
    </div>
  );
}
