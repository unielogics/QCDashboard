"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel, Avatar, useToast, Toast } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { apiErrorMessage } from "@/components/email/EmailComposer";
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
  const { t } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { data: user } = useCurrentUser();
  const { data: conn, isLoading: connLoading } = useGoogleConnection();

  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "starred">("all");
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
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
            <Icon name="mail" size={28} />
            <h2 style={{ fontSize: 18, fontWeight: 800, color: t.ink, margin: 0 }}>Connect your inbox</h2>
            <p style={{ fontSize: 13.5, color: t.ink2, margin: 0, lineHeight: 1.5 }}>
              The Workspace inbox surfaces email from your clients and parties, matched to loans and
              clients — privately, in your own mailbox. Connect Gmail in Settings to turn it on.
            </p>
            <Link href="/settings" style={{ ...qcBtnPrimary(t), textDecoration: "none" }}>
              Go to Settings
            </Link>
          </div>
        </Card>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>Inbox</h1>
        {conn?.google_email && (
          <Pill bg={t.brandSoft} color={t.brand}>
            <Icon name="mail" size={12} /> {conn.google_email}
          </Pill>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ position: "relative", minWidth: 220 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subject or sender…"
            style={{
              width: "100%",
              padding: "8px 12px 8px 32px",
              borderRadius: 10,
              border: `1px solid ${t.line}`,
              background: t.surface,
              color: t.ink,
              fontSize: 13,
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          <span style={{ position: "absolute", left: 10, top: 9, opacity: 0.6 }}>
            <Icon name="search" size={14} />
          </span>
        </div>
        <div style={{ display: "inline-flex", background: t.surface, border: `1px solid ${t.line}`, borderRadius: 10, padding: 3 }}>
          {(["all", "unread", "starred"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              disabled={searching}
              style={{
                all: "unset",
                cursor: searching ? "not-allowed" : "pointer",
                padding: "6px 12px",
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 700,
                textTransform: "capitalize",
                opacity: searching ? 0.5 : 1,
                background: filter === f ? t.brandSoft : "transparent",
                color: filter === f ? t.brand : t.ink2,
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {list?.truncated && (
        <div style={{ fontSize: 12, color: t.ink3 }}>
          Showing your most recent mail — narrow with search to see older threads.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 38fr) minmax(0, 62fr)", gap: 12, alignItems: "start", minHeight: 0, flex: 1 }}>
        {/* Thread list */}
        <Card pad={0}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${t.line}` }}>
            <SectionLabel>{searching ? "Search results" : "Threads"}</SectionLabel>
          </div>
          <div style={{ maxHeight: "72vh", overflowY: "auto" }}>
            {listLoading && <div style={{ padding: 14, fontSize: 12.5, color: t.ink3 }}>Loading…</div>}
            {!listLoading && threads.length === 0 && (
              <div style={{ padding: 14, fontSize: 12.5, color: t.ink3 }}>
                {searching ? "No matches." : "No email yet. Matched client and party mail will appear here."}
              </div>
            )}
            {threads.map((th) => {
              const active = th.thread_id === selectedThread;
              const unread = th.unread_count > 0;
              return (
                <button
                  key={th.thread_id}
                  onClick={() => setSelectedThread(th.thread_id)}
                  style={{
                    all: "unset",
                    display: "block",
                    width: "100%",
                    boxSizing: "border-box",
                    cursor: "pointer",
                    padding: "11px 14px",
                    borderBottom: `1px solid ${t.line}`,
                    background: active ? t.surface2 : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    {unread && <span style={{ width: 7, height: 7, borderRadius: 999, background: t.brand, flexShrink: 0 }} />}
                    <span style={{ fontSize: 12.5, fontWeight: unread ? 800 : 600, color: unread ? t.ink : t.ink2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                      {th.last_from ?? "(unknown)"}
                    </span>
                    {th.is_starred && <span title="Starred" style={{ color: t.warn, fontSize: 12 }}>★</span>}
                    {th.has_attachments && <Icon name="paperclip" size={12} />}
                    <span style={{ fontSize: 11, color: t.ink3, whiteSpace: "nowrap" }}>{fmtTime(th.last_received_at)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: unread ? 700 : 500, color: t.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {th.subject || "(no subject)"}
                    {th.message_count > 1 && <span style={{ color: t.ink3, fontWeight: 600 }}> · {th.message_count}</span>}
                  </div>
                  {th.preview && (
                    <div style={{ fontSize: 11.5, color: t.ink3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
                      {th.preview}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                    {th.loan_id && (
                      <Pill bg={t.petrolSoft} color={t.petrol}><Icon name="layers" size={10} /> Loan</Pill>
                    )}
                    {th.client_id && (
                      <Pill bg={t.brandSoft} color={t.brand}><Icon name="clients" size={10} /> Client</Pill>
                    )}
                    {th.matched_party_role && (
                      <Pill>{th.matched_party_role}</Pill>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Open thread */}
        <Card pad={0}>
          {!selectedThread && (
            <div style={{ padding: 28, fontSize: 13, color: t.ink3, textAlign: "center" }}>
              Select a thread to read it.
            </div>
          )}
          {selectedThread && threadQ.isLoading && (
            <div style={{ padding: 20, fontSize: 12.5, color: t.ink3 }}>Loading thread…</div>
          )}
          {selectedThread && threadQ.data && (
            <div style={{ display: "flex", flexDirection: "column", maxHeight: "78vh" }}>
              {/* thread header */}
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: t.ink }}>
                    {threadQ.data.subject || "(no subject)"}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    {threadQ.data.loan_id && (
                      <Link href={`/loans/${threadQ.data.loan_id}`} style={{ textDecoration: "none" }}>
                        <Pill bg={t.petrolSoft} color={t.petrol}><Icon name="layers" size={11} /> Open loan</Pill>
                      </Link>
                    )}
                    {threadQ.data.client_id && (
                      <Link href={`/clients/${threadQ.data.client_id}`} style={{ textDecoration: "none" }}>
                        <Pill bg={t.brandSoft} color={t.brand}><Icon name="clients" size={11} /> Open client</Pill>
                      </Link>
                    )}
                    {threadQ.data.matched_party_role && <Pill>{threadQ.data.matched_party_role}</Pill>}
                  </div>
                </div>
                <button
                  title={activeSummary?.is_starred ? "Unstar" : "Star"}
                  onClick={() => {
                    const last = threadQ.data!.messages[threadQ.data!.messages.length - 1];
                    if (last) star.mutate({ messageId: last.id, isStarred: !activeSummary?.is_starred, threadId: selectedThread! });
                  }}
                  style={{ all: "unset", cursor: "pointer", color: activeSummary?.is_starred ? t.warn : t.ink3, fontSize: 18 }}
                >
                  {activeSummary?.is_starred ? "★" : "☆"}
                </button>
              </div>

              {/* messages */}
              <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
                {threadQ.data.messages.map((m) => {
                  const outbound = m.direction === "outbound";
                  return (
                    <div key={m.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
                        <Avatar label={initialsOf(m.from_email)} color={outbound ? t.petrol : t.brand} size={30} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink }}>
                            {m.from_email || (outbound ? "You" : "(unknown)")}
                          </div>
                          <div style={{ fontSize: 11, color: t.ink3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            to {(m.to_emails ?? []).join(", ") || "—"}
                          </div>
                        </div>
                        {outbound && <Pill bg={t.petrolSoft} color={t.petrol}>Sent</Pill>}
                        <span style={{ fontSize: 11, color: t.ink3, whiteSpace: "nowrap" }}>{fmtTime(m.received_at)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: t.ink, whiteSpace: "pre-wrap", lineHeight: 1.5, wordBreak: "break-word" }}>
                        {m.body_text || <span style={{ color: t.ink3, fontStyle: "italic" }}>(no readable text body)</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* reply */}
              <div style={{ padding: "12px 16px", borderTop: `1px solid ${t.line}`, background: t.surface }}>
                <SectionLabel>Reply from your Gmail</SectionLabel>
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Write a reply…"
                  rows={4}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    marginTop: 6,
                    padding: 10,
                    minHeight: 92,
                    resize: "vertical",
                    borderRadius: 10,
                    border: `1px solid ${t.line}`,
                    background: t.surface2,
                    color: t.ink,
                    fontSize: 13,
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <button style={qcBtnPrimary(t)} disabled={replyBusy} onClick={doReply}>
                    {replyBusy ? "Sending…" : "Send reply"}
                  </button>
                  <button
                    style={{ ...qcBtn(t), opacity: markRead.isPending ? 0.6 : 1 }}
                    onClick={() => markRead.mutate({ threadId: selectedThread!, isRead: false })}
                  >
                    Mark unread
                  </button>
                  <span style={{ fontSize: 11, color: t.ink3 }}>
                    Replies to the latest sender in this thread.
                  </span>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
      <Toast msg={toast.msg} />
    </div>
  );
}
