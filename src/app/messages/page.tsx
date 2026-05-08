"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
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

function fromRoleForProfile(role: string): typeof MessageFrom[keyof typeof MessageFrom] {
  switch (role) {
    case Role.CLIENT:
      return MessageFrom.CLIENT;
    case Role.BROKER:
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

export default function MessagesPage() {
  const profile = useActiveProfile();
  const isClient = profile?.role === Role.CLIENT;
  if (isClient) {
    return <BorrowerMessagesView />;
  }
  return <OperatorMessagesView />;
}


function BorrowerMessagesView() {
  const { t } = useTheme();
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
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 14, height: "100%" }}>
      <Card pad={0} style={{ overflow: "auto" }}>
        <div style={{ padding: 12, borderBottom: `1px solid ${t.line}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: t.petrol }}>
            Messages
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: t.ink, marginTop: 2 }}>
            Conversations
          </div>
          <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 4, lineHeight: 1.5 }}>
            Account thread for general questions. Each loan has its own thread.
          </div>
        </div>

        {/* Account / general thread row */}
        <ThreadRow
          t={t}
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
              t={t}
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
          <div style={{ padding: 16, fontSize: 12.5, color: t.ink3 }}>Loading…</div>
        ) : null}
        {error ? (
          <div style={{ padding: 12 }}>
            <Pill bg={t.dangerBg} color={t.danger}>{error}</Pill>
          </div>
        ) : null}
      </Card>

      <Card pad={0} style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        {activeThreadId ? (
          <ThreadChatView
            threadId={activeThreadId}
            starterPrompts={STARTER_PROMPTS}
          />
        ) : (
          <div style={{ padding: 32, color: t.ink3, fontSize: 13, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 700, color: t.ink, marginBottom: 6 }}>Pick a thread to start.</div>
            Use the <strong>Account thread</strong> for general questions, or pick a loan
            to chat about a specific deal. The AI sees your full context — credit, docs,
            outstanding requests — and can also auto-message you when a doc is reviewed
            or a deadline is approaching.
          </div>
        )}
      </Card>
    </div>
  );
}

function ThreadRow({
  t,
  title,
  subtitle,
  timestamp,
  active,
  onClick,
  accent,
  empty,
  unread,
}: {
  t: ReturnType<typeof useTheme>["t"];
  title: string;
  subtitle: string;
  timestamp: string | null;
  active: boolean;
  onClick: () => void;
  accent: "petrol" | "brand";
  empty: boolean;
  unread?: boolean;
}) {
  const accentColor = accent === "petrol" ? t.petrol : t.brand;
  const accentBg = accent === "petrol" ? t.petrolSoft : t.brandSoft;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        width: "100%",
        boxSizing: "border-box",
        padding: "12px 14px",
        borderBottom: `1px solid ${t.line}`,
        background: active ? accentBg : "transparent",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
          {unread ? (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: t.danger,
                flex: "0 0 auto",
              }}
            />
          ) : null}
          <div
            style={{
              fontSize: 13,
              fontWeight: unread ? 800 : 700,
              color: active ? accentColor : t.ink,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
              flex: 1,
            }}
          >
            {title}
          </div>
        </div>
        {timestamp ? (
          <div style={{ fontSize: 10, color: t.ink4, flex: "0 0 auto" }}>
            {new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </div>
        ) : null}
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: empty ? t.ink4 : t.ink3,
          fontStyle: empty ? "italic" : "normal",
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          lineHeight: 1.4,
        }}
      >
        {subtitle}
      </div>
    </button>
  );
}


function OperatorMessagesView() {
  const { t } = useTheme();
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
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 14, height: "100%" }}>
      <Card pad={0} style={{ overflow: "auto" }}>
        <div
          style={{
            padding: 12,
            borderBottom: `1px solid ${t.line}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>Threads</div>
          <button
            onClick={() => setNewThreadOpen(true)}
            title="Start a new thread (pick client + loan)"
            style={{
              all: "unset",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 9px",
              borderRadius: 7,
              background: t.brand,
              color: t.inverse,
              fontSize: 11.5,
              fontWeight: 700,
            }}
          >
            <Icon name="plus" size={11} stroke={2.4} /> New
          </button>
        </div>
        {loans.map((l) => (
          <button key={l.id} onClick={() => setActiveLoan(l.id)} style={{
            width: "100%", textAlign: "left", padding: "12px 14px", borderBottom: `1px solid ${t.line}`,
            background: activeLoan === l.id ? t.brandSoft : "transparent",
            cursor: "pointer", border: "none",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.ink3 }}>{l.deal_id}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, marginTop: 2 }}>{l.address}</div>
          </button>
        ))}
        {loans.length === 0 && (
          <div style={{ padding: 16, fontSize: 13, color: t.ink3 }}>
            No active threads yet. Click <strong>+ New</strong> to start one.
          </div>
        )}
      </Card>
      <NewThreadDialog
        open={newThreadOpen}
        onClose={() => setNewThreadOpen(false)}
        onThreadReady={(loanId) => setActiveLoan(loanId)}
      />
      <Card pad={0} style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div ref={scrollerRef} style={{ flex: 1, padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {!activeLoan && <div style={{ color: t.ink3, fontSize: 13 }}>Pick a thread.</div>}
          {activeLoan && messages.length === 0 && <div style={{ color: t.ink3, fontSize: 13 }}>No messages yet — start the conversation.</div>}
          {messages.map((m) => (
            <div key={m.id} style={{ alignSelf: m.from_role === "lender" ? "flex-start" : m.from_role === "client" ? "flex-end" : "center", maxWidth: "70%" }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                <Pill>{m.from_role}</Pill>
                {m.is_draft && <Pill bg={t.warnBg} color={t.warn}>Draft</Pill>}
                {m.is_system && <Pill bg={t.petrolSoft} color={t.petrol}>System</Pill>}
              </div>
              <div style={{
                padding: "10px 14px", borderRadius: 14,
                background: m.from_role === "client" ? t.brandSoft : m.from_role === "ai" ? t.petrolSoft : t.surface2,
                color: t.ink, fontSize: 13,
              }}>{m.body}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: 12, borderTop: `1px solid ${t.line}`, display: "flex", gap: 8 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder={activeLoan ? "Type a message…" : "Select a thread to start typing"}
            disabled={!activeLoan}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              background: t.surface2,
              border: `1px solid ${t.line}`,
              color: t.ink,
              fontFamily: "inherit",
              fontSize: 13,
              outline: "none",
              opacity: activeLoan ? 1 : 0.5,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!activeLoan || !draft.trim() || sendMessage.isPending}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              background: t.brand,
              color: t.inverse,
              fontWeight: 700,
              fontSize: 13,
              border: "none",
              cursor: !activeLoan || !draft.trim() ? "not-allowed" : "pointer",
              opacity: !activeLoan || !draft.trim() ? 0.5 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="bolt" size={13} />
            {sendMessage.isPending ? "Sending…" : "Send"}
          </button>
        </div>
      </Card>
    </div>
  );
}
