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
  return <OperatorMessagesView />;
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
      className={cx("pick", active && "on")}
      style={{ width: "100%", textAlign: "left" }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="repdot" style={{ background: dot }} />
          <span
            style={{
              fontSize: 13,
              fontWeight: unread ? 800 : 700,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
              flex: 1,
            }}
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
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const activeLoanData = useMemo(() => loans.find((l) => l.id === activeLoan), [loans, activeLoan]);
  // Subscribe to the deal channel for live message updates.
  useDealChannel(activeLoan, activeLoanData?.deal_id ?? null);

  // Which from_role is "me". Drives `.msg.mine` so an operator can tell their
  // own side of the desk from the other one without reading the role label.
  const myFromRole = fromRoleForProfile(profile.role);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages.length, activeLoan]);

  const handleSend = async () => {
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
    <div style={SPLIT}>
      <Panel
        title="Threads"
        noPad
        actions={
          <Btn
            size="sm"
            variant="pri"
            onClick={() => setNewThreadOpen(true)}
            title="Start a new thread (pick client + loan)"
          >
            <Icon name="plus" size={11} stroke={2.4} /> New
          </Btn>
        }
      >
        <div className="panel-b" style={{ overflowY: "auto", minHeight: 0 }}>
          {loans.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setActiveLoan(l.id)}
              className={cx("pick", activeLoan === l.id && "on")}
              style={{ width: "100%", textAlign: "left" }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="lbl" style={{ display: "block" }}>{l.deal_id}</span>
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, marginTop: 2 }}>
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
  );
}
