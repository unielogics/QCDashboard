"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast, Toast } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { apiErrorMessage } from "@/components/email/EmailComposer";
import { Btn, CellChip, IconBtn, Input, Lbl, PageHeader, Panel, Textarea, cx } from "@/components/ds";
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
  const toast = useToast();
  const { data: user } = useCurrentUser();
  const { data: conn, isLoading: connLoading } = useGoogleConnection();

  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [replyBody, setReplyBody] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);

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

  // Owner gate: only a user with a connected Gmail mailbox sees the inbox.
  // Clients never reach it. Backend enforces owner-scoping regardless; this is UX.
  const isClient = user?.role === Role.CLIENT;
  useEffect(() => {
    if (isClient) router.replace("/");
  }, [isClient, router]);

  // Auto-mark a thread read when opened.
  useEffect(() => {
    if (selectedThread && threadQ.data && threadQ.data.messages.some((m) => !m.is_read)) {
      markRead.mutate({ threadId: selectedThread, isRead: true });
    }
    setReplyBody("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThread, threadQ.data?.thread_id]);

  const threads: InboxThreadSummary[] = list?.threads ?? [];

  const activeSummary = useMemo(
    () => threads.find((th) => th.thread_id === selectedThread) ?? null,
    [threads, selectedThread],
  );

  if (isClient) return null;

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
    if (!replyBody.trim()) {
      toast.show("Write a reply first");
      return;
    }
    setReplyBusy(true);
    try {
      const res = await reply.mutateAsync({ threadId: selectedThread, body: replyBody });
      if (res.ok) {
        toast.show("Reply sent");
        setReplyBody("");
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
            {/* Hand-rolled .seg rather than <Seg> because these tabs disable
                while a search is running — a real `disabled` attribute, not a
                dimmed-but-clickable one. */}
            <div className="seg" role="tablist" aria-label="Filter threads">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.value}
                  className={filter === f.value ? "on" : ""}
                  disabled={searching}
                  onClick={() => setFilter(f.value)}
                  style={searching ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
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
                  className={cx("pick", active && "on")}
                  aria-current={active}
                  style={{ width: "100%", textAlign: "left" }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {unread && <span className="repdot" style={{ background: "var(--accent)" }} />}
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: unread ? 800 : 600,
                          color: unread ? "var(--ink)" : "var(--ink2)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        {th.last_from ?? "(unknown)"}
                      </span>
                      {th.is_starred && (
                        <span title="Starred" style={{ color: "var(--warn)", fontSize: 12 }}>
                          ★
                        </span>
                      )}
                      {th.has_attachments && <Icon name="paperclip" size={12} />}
                      <span className="msg-when">{fmtTime(th.last_received_at)}</span>
                    </span>
                    <span
                      style={{
                        display: "block",
                        marginTop: 3,
                        fontSize: 12.5,
                        fontWeight: unread ? 700 : 500,
                        color: "var(--ink)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {th.subject || "(no subject)"}
                      {th.message_count > 1 && (
                        <span className="sub" style={{ fontWeight: 600 }}> · {th.message_count}</span>
                      )}
                    </span>
                    {th.preview && (
                      <span
                        className="sub"
                        style={{
                          display: "block",
                          marginTop: 2,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {th.preview}
                      </span>
                    )}
                    <span style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
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
          {selectedThread && threadQ.data && (
            <>
              {/* thread header */}
              <div className="panel-h">
                <div style={{ flex: 1, minWidth: 0 }}>
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
              <div className="thr" style={{ paddingLeft: 16, paddingRight: 16, minHeight: 0 }}>
                {threadQ.data.messages.map((m) => {
                  const outbound = m.direction === "outbound";
                  return (
                    <div key={m.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span
                        className="avatar"
                        style={{ background: outbound ? "var(--petrol)" : "var(--accent)" }}
                      >
                        {initialsOf(m.from_email)}
                      </span>
                      <div className={cx("msg", outbound && "mine")} style={{ flex: 1, minWidth: 0 }}>
                        <div className="msg-h">
                          <span className="msg-who">
                            {m.from_email || (outbound ? "You" : "(unknown)")}
                          </span>
                          {outbound && <CellChip tone="pet">Sent</CellChip>}
                          <span className="msg-when">{fmtTime(m.received_at)}</span>
                        </div>
                        <div
                          className="sub"
                          style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                        >
                          to {(m.to_emails ?? []).join(", ") || "—"}
                        </div>
                        <div className="msg-b">
                          {m.body_text || (
                            <span className="sub" style={{ fontStyle: "italic" }}>
                              (no readable text body)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* reply */}
              <div className="composer" style={{ paddingLeft: 16, paddingRight: 16, paddingBottom: 14 }}>
                <Lbl>Reply from your Gmail</Lbl>
                <Textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Write a reply…"
                  rows={4}
                />
                <div className="composer-row">
                  <Btn variant="pri" disabled={replyBusy} onClick={doReply}>
                    {replyBusy ? "Sending…" : "Send reply"}
                  </Btn>
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
