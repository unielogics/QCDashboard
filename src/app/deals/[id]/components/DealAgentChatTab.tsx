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
import { Icon } from "@/components/design-system/Icon";
import { Btn, Panel, Seg, Textarea } from "@/components/ds";
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
  { mode: DealChatMode.BROKER_QUESTION, label: "Ask Elara", hint: "Internal Q&A — borrower won't see this" },
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
    setBody("");
    try {
      const res = await send.mutateAsync({
        dealId,
        body: text,
        mode,
        optimistic_from_role:
          mode === DealChatMode.BROKER_QUESTION
            ? DealChatRole.BROKER_INTERNAL
            : user.role === Role.CLIENT
              ? DealChatRole.CLIENT
              : user.role === Role.BROKER
                ? DealChatRole.BROKER
                : DealChatRole.SUPER_ADMIN,
        optimistic_client_visible: mode !== DealChatMode.BROKER_QUESTION,
      });
      if (res.kind === "ai_task") setFlash("Filed to Elara Inbox.");
      else setFlash(null);
    } catch (e) {
      setBody(text);
      setFlash(e instanceof Error ? e.message : "Send failed.");
    }
    setTimeout(() => setFlash(null), 4000);
  };

  return (
    <Panel
      title={
        <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
          <Icon name="chat" size={14} /> Agent chat (A)
        </span>
      }
      sub="AI ↔ broker ↔ client — pre-funding nurture"
    >
      <div className="thr">
        {isLoading ? (
          <div className="thr-empty">Loading conversation…</div>
        ) : messages.length === 0 ? (
          <div className="thr-empty" style={{ textAlign: "center", padding: 32 }}>
            No messages yet. Start the conversation — the AI will join in.
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} m={m} user={user} />)
        )}
      </div>

      <div className="composer">
        {modes.length > 1 ? (
          <Seg
            as="filter"
            value={mode}
            onChange={setMode}
            options={modes.map((m) => ({ value: m.mode, label: m.label }))}
          />
        ) : null}
        {flash ? (
          <div
            className="sub"
            style={{ color: flash.includes("fail") ? "var(--danger)" : undefined }}
          >
            {flash}
          </div>
        ) : null}
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          // The mode hint moved to the composer row below. A placeholder
          // vanishes the moment you start typing, which is exactly when
          // "does the borrower see this?" becomes worth checking.
          placeholder="Type a message…"
          rows={2}
        />
        <div className="composer-row">
          <span className="hint">
            {modes.find((m) => m.mode === mode)?.hint}
          </span>
          <Btn variant="pri" onClick={submit} disabled={!body.trim() || send.isPending}>
            {send.isPending ? "Sending…" : "Send"}
          </Btn>
        </div>
      </div>
    </Panel>
  );
}

function Bubble({ m, user }: { m: LoanChatMessage; user: User }) {
  const isMe =
    (m.from_role === DealChatRole.CLIENT && user.role === Role.CLIENT) ||
    (m.from_role === DealChatRole.BROKER && user.role === Role.BROKER) ||
    (m.from_role === DealChatRole.SUPER_ADMIN && (user.role === Role.SUPER_ADMIN || user.role === Role.LOAN_EXEC));
  const isAI = m.from_role === DealChatRole.AI;
  const isInternal = m.from_role === DealChatRole.BROKER_INTERNAL;
  const label = (() => {
    if (m.from_role === DealChatRole.AI) return "Elara";
    const roleWord =
      m.from_role === DealChatRole.BROKER ? "Agent"
      : m.from_role === DealChatRole.BROKER_INTERNAL ? "Agent (private)"
      : m.from_role === DealChatRole.SUPER_ADMIN ? "Operator"
      : "Borrower";
    const nm = (m as { from_name?: string | null }).from_name;
    return nm ? `${nm} (${roleWord})` : roleWord;
  })();
  return (
    // `.msg.internal` is dashed rather than tinted: an internal note is not a
    // fourth kind of participant, it is the same person speaking off the
    // record, and a dashed edge says that without inventing another colour.
    <div className={`msg${isMe ? " mine" : ""}${isAI ? " ai" : ""}${isInternal ? " internal" : ""}`}>
      <div className="msg-h">
        <span className="msg-role">{label}</span>
        <span className="msg-when">
          {new Date(m.created_at).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </div>
      <div className="msg-b">{m.body}</div>
    </div>
  );
}
