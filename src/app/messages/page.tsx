"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { Btn, CellChip, Input, Panel, WarnLine, cx } from "@/components/ds";
import {
  useAIChatThreads,
  useFindOrCreateChatThread,
  useLoans,
  useMessages,
  useSendMessage,
} from "@/hooks/useApi";
import { useDealChannel } from "@/hooks/useDealChannel";
import { useActiveProfile } from "@/store/role";
import { MessageFrom, Role } from "@/lib/enums.generated";
import { NewThreadDialog } from "./components/NewThreadDialog";
import { ThreadChatView } from "@/components/messages/ThreadChatView";
import type { AIChatThread, Loan } from "@/lib/types";
import { PageActionMenu } from "@/components/ds/PageActionMenu";
import { ConfirmDialog } from "@/components/design-system/ConfirmDialog";
import { UnifiedMessagesInbox } from "@/components/communications/UnifiedMessagesInbox";

// Per-role attribution for outbound messages. Architecture decision #6 —
// Agent-side messages should be labeled from the Agent (the Borrower sees
// "from your Agent"); Funding Team / Underwriter messages get labeled as
// "Qualified Commercial Funding Team" on the Borrower's side. The
// from_role travels with each Message row so the Borrower's unified thread
// can render a clear sender attribution.
function fromRoleForProfile(role: string): typeof MessageFrom[keyof typeof MessageFrom] {
  switch (role) {
    case Role.CLIENT:
      return MessageFrom.CLIENT;
    case Role.BROKER:
      return MessageFrom.BROKER;
    case Role.LOAN_EXEC:
    case Role.SUPER_ADMIN:
      return MessageFrom.LENDER;
    default:
      return MessageFrom.LENDER;
  }
}

const STARTER_PROMPTS = [
  "What's the next thing I need to do?",
  "Are any of my docs overdue?",
  "What's blocking my deal from closing?",
];

// The rail + conversation split. A fixed 320px thread rail beside a fluid
// pane is a bespoke split, not a 12-column proportion, so it stays an inline
// grid. `minmax(0, 1fr)` on the row is what lets the panels' own scrollers
// take the overflow instead of stretching the page.
const SPLIT: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "320px 1fr",
  gridTemplateRows: "minmax(0, 1fr)",
  gap: 14,
  height: "100%",
};

export default function MessagesPage() {
  const profile = useActiveProfile();
  const isClient = profile?.role === Role.CLIENT;
  if (isClient) {
    return <BorrowerMessagesView />;
  }
  return <UnifiedMessagesInbox />;
}


function BorrowerMessagesView() {
  const { data: loans = [] } = useLoans();
  const { data: threads = [], isLoading: threadsLoading } = useAIChatThreads();
  const findOrCreate = useFindOrCreateChatThread();
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Build the unified thread list: account thread first, then one
  // row per loan. Threads that already exist surface their preview;
  // loans without a thread show a "tap to start" placeholder.
  const accountThread = useMemo<AIChatThread | undefined>(
    () => threads.find((th) => !th.loan_id),
    [threads],
  );
  const loanThreadMap = useMemo(() => {
    const map = new Map<string, AIChatThread>();
    for (const th of threads) {
      if (th.loan_id) map.set(th.loan_id, th);
    }
    return map;
  }, [threads]);

  const openAccountThread = async () => {
    setError(null);
    if (accountThread) {
      setActiveThreadId(accountThread.id);
      return;
    }
    try {
      const t = await findOrCreate.mutateAsync({ loan_id: null });
      setActiveThreadId(t.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the thread.");
    }
  };

  const openLoanThread = async (loan: Loan) => {
    setError(null);
    const existing = loanThreadMap.get(loan.id);
    if (existing) {
      setActiveThreadId(existing.id);
      return;
    }
    try {
      const t = await findOrCreate.mutateAsync({ loan_id: loan.id });
      setActiveThreadId(t.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the thread.");
    }
  };

  return (
    <div style={SPLIT}>
      <Panel
        title="Conversations"
        sub="Account thread for general questions. Each loan has its own thread."
        noPad
      >
        <div className="panel-b" style={{ overflowY: "auto", minHeight: 0 }}>
          {/* Account / general thread row */}
          <ThreadRow
            title="Account questions"
            subtitle={accountThread?.last_message_preview ?? "General questions about your portfolio."}
            timestamp={accountThread?.last_message_at ?? null}
            active={!!accountThread && activeThreadId === accountThread.id}
            onClick={openAccountThread}
            accent="petrol"
            empty={!accountThread}
            unread={!!accountThread?.unread}
          />

          {/* One row per loan */}
          {loans.map((loan) => {
            const th = loanThreadMap.get(loan.id);
            return (
              <ThreadRow
                key={loan.id}
                title={`${loan.deal_id} — ${loan.address ?? ""}`}
                subtitle={th?.last_message_preview ?? "No conversation yet — tap to start."}
                timestamp={th?.last_message_at ?? null}
                active={!!th && activeThreadId === th.id}
                onClick={() => openLoanThread(loan)}
                accent="brand"
                empty={!th}
                unread={!!th?.unread}
              />
            );
          })}

          {threadsLoading && threads.length === 0 ? (
            <div className="sub mt">Loading…</div>
          ) : null}
          {error ? <WarnLine className="mt">{error}</WarnLine> : null}
        </div>
      </Panel>

      <div className="panel" style={{ minHeight: 0 }}>
        {activeThreadId ? (
          <ThreadChatView
            threadId={activeThreadId}
            starterPrompts={STARTER_PROMPTS}
          />
        ) : (
          <div className="panel-b">
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Pick a thread to start.</div>
            <p className="sub">
              Use the <strong>Account thread</strong> for general questions, or pick a loan
              to chat about a specific deal. Elara sees your full context — credit, docs,
              outstanding requests — and can also auto-message you when a doc is reviewed
              or a deadline is approaching.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadRow({
  title,
  subtitle,
  timestamp,
  active,
  onClick,
  accent,
  empty,
  unread,
}: {
  title: string;
  subtitle: string;
  timestamp: string | null;
  active: boolean;
  onClick: () => void;
  accent: "petrol" | "brand";
  empty: boolean;
  unread?: boolean;
}) {
  // The dot carries two signals at once, as it did before: the channel
  // (petrol = account-wide, blue = a loan) and, in danger red, an unread
  // thread — which the heavier title weight reinforces.
  const dot = unread
    ? "var(--danger)"
    : accent === "petrol"
    ? "var(--petrol)"
    : "var(--accent)";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("pick", "btnreset", active && "on")}
    >
      <span className="grow">
        {/* Bespoke: title and date on one line that must not wrap — `.row`
            wraps, which would drop the date under the deal id. */}
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Data-derived: channel colour, or danger when unread. */}
          <span className="repdot" style={{ background: dot }} />
          <span
            className="trunc"
            // `.trunc` owns the ellipsis; the weight is read state.
            style={{ fontWeight: unread ? 800 : 700, flex: 1 }}
          >
            {title}
          </span>
          {timestamp ? (
            <span className="msg-when">
              {new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          ) : null}
        </span>
        <span
          className="sub"
          // Bespoke: a two-line clamp. `.trunc` is the ONE-line ellipsis and
          // a preview that gets one line is a preview that says nothing. The
          // italic is data — it marks a thread that has not started.
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontStyle: empty ? "italic" : "normal",
            marginTop: 3,
          }}
        >
          {subtitle}
        </span>
      </span>
    </button>
  );
}


function OperatorMessagesView() {
  const profile = useActiveProfile();
  const { data: loans = [] } = useLoans();
  const [activeLoan, setActiveLoan] = useState<string | null>(null);
  const [newThreadOpen, setNewThreadOpen] = useState(false);
  const { data: messages = [] } = useMessages(activeLoan);
  const sendMessage = useSendMessage();
  const [draft, setDraft] = useState("");
  const [sendReviewOpen, setSendReviewOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const activeLoanData = useMemo(() => loans.find((l) => l.id === activeLoan), [loans, activeLoan]);
  // Subscribe to the deal channel for live message updates.
  useDealChannel(activeLoan, activeLoanData?.deal_id ?? null);

  // Which from_role is "me". Drives `.msg.mine` so an operator can tell their
  // own side of the desk from the other one without reading the role label.
  const myFromRole = fromRoleForProfile(profile.role);

  useEffect(() => {
    if (!activeLoan && loans.length) setActiveLoan(loans[0].id);
  }, [activeLoan, loans]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages.length, activeLoan]);

  const handleSend = async () => {
    if (!activeLoan || !draft.trim() || sendMessage.isPending) return;
    setSendReviewOpen(true);
  };

  const confirmSend = async () => {
    if (!activeLoan || !draft.trim() || sendMessage.isPending) return;
    const body = draft.trim();
    setDraft("");
    try {
      await sendMessage.mutateAsync({
        loan_id: activeLoan,
        body,
        from_role: fromRoleForProfile(profile.role),
        is_draft: false,
      });
      setSendReviewOpen(false);
    } catch {
      // restore draft on failure
      setDraft(body);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
      <div className="ckhead">
        <div className="ckrow">
          <h1>Messages</h1>
          <CellChip tone="mut">{loans.length} threads</CellChip>
          <span className="sp" />
          <Btn variant="pri" size="sm" onClick={() => setNewThreadOpen(true)}><Icon name="plus" size={13} /> New thread</Btn>
          <PageActionMenu label="Message actions" items={[
            { label: "Open Elara queue", href: "/ai-inbox" },
            { label: "Open pipeline", href: "/pipeline" },
          ]} />
        </div>
      </div>
      <div style={{ ...SPLIT, flex: 1, minHeight: 0 }}>
      <Panel
        title="Threads"
        noPad
      >
        <div className="panel-b" style={{ overflowY: "auto", minHeight: 0 }}>
          {loans.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setActiveLoan(l.id)}
              className={cx("pick", "btnreset", activeLoan === l.id && "on")}
            >
              <span className="grow">
                <span className="lbl" style={{ display: "block" }}>{l.deal_id}</span>
                <span className="trunc" style={{ display: "block", fontWeight: 700, marginTop: 2 }}>
                  {l.address}
                </span>
              </span>
            </button>
          ))}
          {loans.length === 0 && (
            <div className="sub">
              No active threads yet. Click <strong>+ New</strong> to start one.
            </div>
          )}
        </div>
      </Panel>
      <NewThreadDialog
        open={newThreadOpen}
        onClose={() => setNewThreadOpen(false)}
        onThreadReady={(loanId) => setActiveLoan(loanId)}
      />
      <div className="panel" style={{ minHeight: 0 }}>
        <div className="panel-b" style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div ref={scrollerRef} className="thr" style={{ minHeight: 0 }}>
            {!activeLoan && <div className="thr-empty">Pick a thread.</div>}
            {activeLoan && messages.length === 0 && (
              <div className="thr-empty">No messages yet — start the conversation.</div>
            )}
            {messages.map((m) => {
              // BROKER and LENDER both align flex-start (operator side).
              // CLIENT aligns flex-end. AI/system float center.
              const align =
                m.from_role === "client"
                  ? "flex-end"
                  : m.from_role === "lender" || m.from_role === "broker"
                  ? "flex-start"
                  : "center";
              const pillLabel =
                m.from_role === "broker"
                  ? "Agent"
                  : m.from_role === "lender"
                  ? "Funding Team"
                  : m.from_role === "client"
                  ? "Client"
                  : m.from_role;
              // Channel ground: the client channel keeps its own amber, the AI
              // its own white, and my own outbound messages the accent tint.
              const channel =
                m.from_role === "client"
                  ? "client-ch"
                  : m.from_role === "ai"
                  ? "ai"
                  : m.from_role === myFromRole
                  ? "mine"
                  : null;
              return (
                <div
                  key={m.id}
                  className={cx("msg", channel)}
                  style={{ alignSelf: align, maxWidth: "70%" }}
                >
                  <div className="msg-h">
                    <span className="msg-role">{pillLabel}</span>
                    {m.is_draft && <CellChip tone="warn">Draft</CellChip>}
                    {m.is_system && <CellChip tone="pet">System</CellChip>}
                  </div>
                  <div className="msg-b">{m.body}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="composer" style={{ paddingLeft: 16, paddingRight: 16, paddingBottom: 14 }}>
          <div className="composer-row">
            <Input
              grow
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              placeholder={activeLoan ? "Type a message…" : "Select a thread to start typing"}
              disabled={!activeLoan}
              // Data-derived: the composer dims until a thread is picked.
              // `.field` carries no disabled state and one input in the whole
              // app needs one, which is not a class.
              style={{ opacity: activeLoan ? 1 : 0.5 }}
            />
            <Btn
              variant="pri"
              onClick={handleSend}
              disabled={!activeLoan || !draft.trim() || sendMessage.isPending}
            >
              <Icon name="bolt" size={13} />
              {sendMessage.isPending ? "Sending…" : "Send"}
            </Btn>
          </div>
        </div>
      </div>
      </div>
      <ConfirmDialog
        open={sendReviewOpen}
        onClose={() => setSendReviewOpen(false)}
        onConfirm={confirmSend}
        busy={sendMessage.isPending}
        title="Send message"
        body={<>The message will be sent as <b>{profile.role === Role.BROKER ? "Agent" : "Qualified Commercial Funding Team"}</b> and recorded on the active loan file.</>}
        confirmLabel="Send message"
      />
    </div>
  );
}
