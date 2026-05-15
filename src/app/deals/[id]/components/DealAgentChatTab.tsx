"use client";

// (A) Agent deal-chat — the pre-promotion (and ongoing post-promotion)
// thread where broker + client + AI all converge on a Deal. Mirrors
// the loan workspace LoanChatTab but reads/writes via the new
// /deals/{id}/chat endpoint introduced by the qcbackend patch.
//
// Modes available on (A) are a subset of (L): CHAT / LIVE_CHAT /
// BROKER_QUESTION. INSTRUCT and BROKER_SUGGESTION are loan-scoped
// only (they reference loan_instructions / ai_tasks).

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { qcBtnPrimary } from "@/components/design-system/buttons";
import { useDealAgentChat, useSendDealAgentChat } from "@/hooks/useApi";
import { DealChatMode, Role, DealChatRole } from "@/lib/enums.generated";
import type { LoanChatMessage, User } from "@/lib/types";

interface ModeOption {
  mode: DealChatMode;
  label: string;
  hint: string;
}

const SUPER_ADMIN_MODES: ModeOption[] = [
  { mode: DealChatMode.CHAT, label: "Chat", hint: "Send to the client thread (operator takeover)" },
  { mode: DealChatMode.BROKER_QUESTION, label: "Ask AI", hint: "Internal Q&A — borrower won't see this" },
];

const BROKER_MODES: ModeOption[] = [
  { mode: DealChatMode.LIVE_CHAT, label: "Live Chat", hint: "Reply directly to the client" },
  { mode: DealChatMode.BROKER_QUESTION, label: "Ask the AI", hint: "Internal Q&A — borrower won't see this" },
];

interface Props {
  dealId: string;
  user: User;
}

export function DealAgentChatTab({ dealId, user }: Props) {
  const { t } = useTheme();
  const { data: messages = [], isLoading } = useDealAgentChat(dealId);
  const send = useSendDealAgentChat();

  const modes: ModeOption[] =
    user.role === Role.SUPER_ADMIN || user.role === Role.LOAN_EXEC
      ? SUPER_ADMIN_MODES
      : user.role === Role.BROKER
        ? BROKER_MODES
        : [{ mode: DealChatMode.CHAT, label: "Send", hint: "" }];

  const [mode, setMode] = useState<DealChatMode>(modes[0].mode);
  const [body, setBody] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  const submit = async () => {
    const text = body.trim();
    if (!text || send.isPending) return;
    try {
      const res = await send.mutateAsync({ dealId, body: text, mode });
      setBody("");
      if (res.kind === "ai_task") setFlash("Filed to AI Inbox.");
      else setFlash(null);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Send failed.");
    }
    setTimeout(() => setFlash(null), 4000);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        gap: 12,
        background: t.surface,
        borderRadius: 14,
        border: `1px solid ${t.line}`,
        boxShadow: t.shadow,
        minHeight: "60vh",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          borderBottom: `1px solid ${t.line}`,
          background: t.surface2,
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
        }}
      >
        <Icon name="chat" size={14} />
        <span style={{ fontSize: 13, fontWeight: 900, color: t.ink }}>
          Agent chat (A)
        </span>
        <span style={{ fontSize: 11, color: t.ink3, fontWeight: 700 }}>
          AI ↔ broker ↔ client — pre-funding nurture
        </span>
      </header>

      <div style={{ minHeight: 0, overflow: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {isLoading ? (
          <div style={{ color: t.ink3, fontSize: 13 }}>Loading conversation…</div>
        ) : messages.length === 0 ? (
          <div style={{ color: t.ink3, fontSize: 13, textAlign: "center", padding: 32 }}>
            No messages yet. Start the conversation — the AI will join in.
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} m={m} user={user} />)
        )}
      </div>

      <div
        style={{
          padding: 12,
          borderTop: `1px solid ${t.line}`,
          background: t.surface2,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {modes.length > 1 ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {modes.map((m) => {
              const active = mode === m.mode;
              return (
                <button
                  key={m.mode}
                  onClick={() => setMode(m.mode)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    padding: "5px 10px",
                    borderRadius: 999,
                    fontSize: 11.5,
                    fontWeight: 700,
                    border: `1px solid ${active ? t.brand : t.line}`,
                    background: active ? t.brandSoft : "transparent",
                    color: active ? t.brand : t.ink2,
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        ) : null}
        {flash ? (
          <div style={{ fontSize: 11.5, color: flash.includes("fail") ? t.danger : t.ink2 }}>{flash}</div>
        ) : null}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={modes.find((m) => m.mode === mode)?.hint ?? "Type a message…"}
            disabled={send.isPending}
            rows={2}
            style={{
              flex: 1,
              resize: "none",
              padding: "10px 12px",
              borderRadius: 10,
              border: `1px solid ${t.line}`,
              background: t.surface,
              color: t.ink,
              fontSize: 13,
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={submit}
            disabled={!body.trim() || send.isPending}
            style={{
              ...qcBtnPrimary(t),
              opacity: !body.trim() || send.isPending ? 0.5 : 1,
              cursor: !body.trim() || send.isPending ? "not-allowed" : "pointer",
            }}
          >
            {send.isPending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ m, user }: { m: LoanChatMessage; user: User }) {
  const { t } = useTheme();
  const isMe =
    (m.from_role === DealChatRole.CLIENT && user.role === Role.CLIENT) ||
    (m.from_role === DealChatRole.BROKER && user.role === Role.BROKER) ||
    (m.from_role === DealChatRole.SUPER_ADMIN && (user.role === Role.SUPER_ADMIN || user.role === Role.LOAN_EXEC));
  const isAI = m.from_role === DealChatRole.AI;
  const isInternal = m.from_role === DealChatRole.BROKER_INTERNAL;
  const bg = isInternal ? t.surface2 : isAI ? t.petrolSoft : isMe ? t.brandSoft : t.surface2;
  const borderC = isInternal ? t.line : isAI ? t.petrol : isMe ? t.brand : t.line;
  const label = (() => {
    if (m.from_role === DealChatRole.AI) return "Smart Assistant";
    const roleWord =
      m.from_role === DealChatRole.BROKER ? "Agent"
      : m.from_role === DealChatRole.BROKER_INTERNAL ? "Agent (private)"
      : m.from_role === DealChatRole.SUPER_ADMIN ? "Operator"
      : "Borrower";
    const nm = (m as { from_name?: string | null }).from_name;
    return nm ? `${nm} (${roleWord})` : roleWord;
  })();
  return (
    <div style={{ alignSelf: isMe ? "flex-end" : "flex-start", maxWidth: "78%" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.6 }}>
        {label}
      </div>
      <div
        style={{
          padding: "10px 13px",
          borderRadius: 12,
          background: bg,
          borderWidth: 1,
          borderStyle: isInternal ? "dashed" : "solid",
          borderColor: borderC,
        }}
      >
        <div style={{ fontSize: 13, color: t.ink, whiteSpace: "pre-wrap" }}>{m.body}</div>
      </div>
      <div style={{ fontSize: 10.5, color: t.ink4, marginTop: 3 }}>
        {new Date(m.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
      </div>
    </div>
  );
}
