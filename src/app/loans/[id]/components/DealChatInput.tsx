"use client";

// Mode-aware chat input. The available modes depend on the current user's role:
//   super_admin → [Chat, Instruct AI]   (Chat triggers a 1h AI pause)
//   broker      → [Ask the AI, Suggest to Inbox, Instruct AI]  (no Chat — can't write to client thread)
//   loan_exec   → same as super_admin minus the pause (acts as broker_question)
//   client      → just textarea, mode=Chat, hidden when paused

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtnPrimary } from "@/components/design-system/buttons";
import { useSendDealChat } from "@/hooks/useApi";
import { DealChatMode, Role } from "@/lib/enums.generated";
import type { User } from "@/lib/types";

interface ModeOption {
  mode: DealChatMode;
  label: string;
  hint: string;
  icon: string;
}

interface Props {
  loanId: string;
  user: User;
  pausedUntil: string | null;
}

const SUPER_ADMIN_MODES: ModeOption[] = [
  { mode: DealChatMode.CHAT, label: "Chat", hint: "Send to the client thread (pauses AI for 1h)", icon: "send" },
  { mode: DealChatMode.INSTRUCT, label: "Instruct AI", hint: "Save as a persistent loan instruction", icon: "shield" },
  { mode: DealChatMode.BROKER_QUESTION, label: "Ask AI", hint: "Internal Q&A — borrower won't see this", icon: "ai" },
];

const BROKER_MODES: ModeOption[] = [
  // Live Chat — leftmost / default so brokers in a hand-on moment land
  // in the right mode without an extra click. Same backend semantics as
  // super_admin's CHAT (pauses AI for 1h, client_visible=true).
  { mode: DealChatMode.LIVE_CHAT, label: "Live Chat", hint: "Reply directly to the client (pauses AI for 1h)", icon: "send" },
  { mode: DealChatMode.BROKER_QUESTION, label: "Ask the AI", hint: "Internal Q&A — borrower won't see this", icon: "ai" },
  { mode: DealChatMode.BROKER_SUGGESTION, label: "Suggest to Inbox", hint: "Files an item for super-admin review", icon: "send" },
  { mode: DealChatMode.INSTRUCT, label: "Instruct AI", hint: "Save as a persistent loan instruction", icon: "shield" },
];

export function DealChatInput({ loanId, user, pausedUntil }: Props) {
  const { t } = useTheme();
  const send = useSendDealChat();

  const modeOptions: ModeOption[] =
    user.role === Role.SUPER_ADMIN || user.role === Role.LOAN_EXEC
      ? SUPER_ADMIN_MODES
      : user.role === Role.BROKER
        ? BROKER_MODES
        : [{ mode: DealChatMode.CHAT, label: "Send", hint: "", icon: "send" }];

  const [mode, setMode] = useState<DealChatMode>(modeOptions[0].mode);
  const [body, setBody] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  const isClient = user.role === Role.CLIENT;
  const pauseRemainingMs = pausedUntil ? new Date(pausedUntil).getTime() - Date.now() : 0;
  const clientLockedOut = isClient && pauseRemainingMs > 0;

  const submit = async () => {
    if (!body.trim()) return;
    try {
      const res = await send.mutateAsync({ loanId, body: body.trim(), mode });
      setBody("");
      if (res.kind === "instruction") setFlash("Instruction saved.");
      else if (res.kind === "ai_task") setFlash("Suggestion filed in AI Inbox.");
      else if (res.paused_until) setFlash("AI paused for 1h.");
      else setFlash(null);
      if (flash) setTimeout(() => setFlash(null), 2400);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Send failed");
      setTimeout(() => setFlash(null), 2400);
    }
  };

  if (clientLockedOut) {
    return (
      <div
        style={{
          padding: 14,
          borderRadius: 10,
          border: `1px solid ${t.warn}40`,
          background: t.warnBg,
          color: t.warn,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        Your operator is replying directly. The AI will resume shortly.
      </div>
    );
  }

  const activeMode = modeOptions.find((m) => m.mode === mode) ?? modeOptions[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {modeOptions.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {modeOptions.map((opt) => {
            const active = opt.mode === mode;
            return (
              <button
                key={opt.mode}
                onClick={() => setMode(opt.mode)}
                title={opt.hint}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: active ? t.ink : t.surface,
                  color: active ? t.inverse : t.ink2,
                  border: active ? "none" : `1px solid ${t.lineStrong}`,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                <Icon name={opt.icon} size={12} />
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder={activeMode.hint || "Type a message…"}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          background: t.surface2,
          border: `1px solid ${t.line}`,
          color: t.ink,
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
          resize: "vertical",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
        {flash ? (
          <Pill bg={t.profitBg} color={t.profit}>{flash}</Pill>
        ) : null}
        <button
          onClick={submit}
          disabled={!body.trim() || send.isPending}
          style={{ ...qcBtnPrimary(t), opacity: body.trim() && !send.isPending ? 1 : 0.5 }}
        >
          <Icon name={activeMode.icon} size={13} />
          {send.isPending ? "Sending…" : activeMode.label}
        </button>
      </div>
    </div>
  );
}
