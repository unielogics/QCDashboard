"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useLoans, useMessages, useSendMessage } from "@/hooks/useApi";
import { useDealChannel } from "@/hooks/useDealChannel";
import { useActiveProfile } from "@/store/role";
import { MessageFrom, Role } from "@/lib/enums.generated";
import { NewThreadDialog } from "./components/NewThreadDialog";

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

export default function MessagesPage() {
  const { t } = useTheme();
  const profile = useActiveProfile();
  const isClient = profile?.role === Role.CLIENT;
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
          {/* Borrowers don't initiate new threads via the client+loan picker
              (which is operator-centric). They reply to threads operators
              start. The full role-based recipient picker (broker + admins
              for borrowers, clients + admins for brokers) is a follow-up. */}
          {!isClient && (
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
          )}
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
            {isClient
              ? "No active threads yet. Your broker will start a thread once your loan is in flight."
              : <>No active threads yet. Click <strong>+ New</strong> to start one.</>}
          </div>
        )}
      </Card>
      {!isClient && (
        <NewThreadDialog
          open={newThreadOpen}
          onClose={() => setNewThreadOpen(false)}
          onThreadReady={(loanId) => setActiveLoan(loanId)}
        />
      )}
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
