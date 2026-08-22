"use client";

// Mode-aware chat input. The available modes depend on the current user's role:
//   super_admin → [Chat, Instruct Elara]   (Chat triggers a 1h Elara pause)
//   broker      → [Ask Elara, Suggest to Inbox, Instruct Elara]  (no Chat — can't write to client thread)
//   loan_exec   → same as super_admin minus the pause (acts as broker_question)
//   client      → just textarea, mode=Chat, hidden when paused
//
// Restyled onto the design system. The mode row stays a set of plain buttons
// with `aria-pressed` rather than a `Seg`: which mode is armed changes what
// Send DOES, it does not switch which view you are looking at, and a tablist
// would tell a screen-reader user the page is about to change.

import { useRef, useState } from "react";
import { Btn, CellChip, Textarea, WarnLine } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useSendDealChat, useUploadDocument } from "@/hooks/useApi";
import { DealChatMode, DealChatRole, Role } from "@/lib/enums.generated";
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
  { mode: DealChatMode.CHAT, label: "Chat", hint: "Send to the client thread (pauses Elara for 1h)", icon: "send" },
  { mode: DealChatMode.INSTRUCT, label: "Instruct Elara", hint: "Save as a persistent loan instruction", icon: "shield" },
  { mode: DealChatMode.BROKER_QUESTION, label: "Ask Elara", hint: "Internal Q&A — borrower won't see this", icon: "ai" },
];

const BROKER_MODES: ModeOption[] = [
  // Live Chat — leftmost / default so brokers in a hand-on moment land
  // in the right mode without an extra click. Same backend semantics as
  // super_admin's CHAT (pauses Elara for 1h, client_visible=true).
  { mode: DealChatMode.LIVE_CHAT, label: "Live Chat", hint: "Reply directly to the client (pauses Elara for 1h)", icon: "send" },
  { mode: DealChatMode.BROKER_QUESTION, label: "Ask Elara", hint: "Internal Q&A — borrower won't see this", icon: "ai" },
  { mode: DealChatMode.BROKER_SUGGESTION, label: "Suggest to Inbox", hint: "Files an item for super-admin review", icon: "send" },
  { mode: DealChatMode.INSTRUCT, label: "Instruct Elara", hint: "Save as a persistent loan instruction", icon: "shield" },
];

export function DealChatInput({ loanId, user, pausedUntil }: Props) {
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
  const uploadDoc = useUploadDocument();
  const [staged, setStaged] = useState<{ document_id: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onPickFile = async (file: File) => {
    try {
      const init = await uploadDoc.mutateAsync({ loan_id: loanId, file, is_other: true });
      setStaged({ document_id: init.document_id, name: file.name });
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Couldn't attach the file.");
      setTimeout(() => setFlash(null), 2400);
    }
  };

  const isClient = user.role === Role.CLIENT;
  const pauseRemainingMs = pausedUntil ? new Date(pausedUntil).getTime() - Date.now() : 0;
  const clientLockedOut = isClient && pauseRemainingMs > 0;

  const submit = async () => {
    const text = body.trim();
    if (!text && !staged) return;
    const att = staged;
    setBody("");
    setStaged(null);
    try {
      const res = await send.mutateAsync({
        loanId,
        body: text || (att ? `Uploaded: ${att.name}` : ""),
        mode,
        attachment_document_id: att?.document_id ?? null,
        optimistic_from_role:
          mode === DealChatMode.BROKER_QUESTION
            ? DealChatRole.BROKER_INTERNAL
            : user.role === Role.BROKER
              ? DealChatRole.BROKER
              : user.role === Role.CLIENT
                ? DealChatRole.CLIENT
                : DealChatRole.SUPER_ADMIN,
        optimistic_client_visible: mode !== DealChatMode.BROKER_QUESTION,
      });
      if (res.kind === "instruction") setFlash("Instruction saved.");
      else if (res.kind === "ai_task") setFlash("Suggestion filed in Elara Inbox.");
      else if (res.paused_until) setFlash("Elara paused for 1h.");
      else setFlash(null);
      if (flash) setTimeout(() => setFlash(null), 2400);
    } catch (e) {
      setBody(text);
      if (att) setStaged(att);
      setFlash(e instanceof Error ? e.message : "Send failed");
      setTimeout(() => setFlash(null), 2400);
    }
  };

  if (clientLockedOut) {
    return (
      <WarnLine>Your operator is replying directly. Elara will resume shortly.</WarnLine>
    );
  }

  const activeMode = modeOptions.find((m) => m.mode === mode) ?? modeOptions[0];

  return (
    <div className="grid g8">
      {modeOptions.length > 1 && (
        <div className="row">
          {modeOptions.map((opt) => {
            const active = opt.mode === mode;
            return (
              <Btn
                key={opt.mode}
                size="sm"
                variant={active ? "pri" : "default"}
                aria-pressed={active}
                onClick={() => setMode(opt.mode)}
                title={opt.hint}
              >
                <Icon name={opt.icon} size={12} />
                {opt.label}
              </Btn>
            );
          })}
        </div>
      )}

      <Textarea
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
      />
      <div className="composer-row">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/*"
          // Functional, not decorative: opened programmatically, never laid out.
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onPickFile(f);
          }}
        />
        <Btn
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadDoc.isPending}
          aria-label="Attach a file"
          title="Attach a file"
        >
          <Icon name="paperclip" size={14} />
        </Btn>
        {staged ? (
          <CellChip>
            {staged.name.length > 22 ? staged.name.slice(0, 21) + "…" : staged.name}
            {/* Was a bare <span onClick> — neither focusable nor
                Enter-activatable. A real button gets it back. */}
            <button
              type="button"
              className="linky"
              aria-label={`Remove ${staged.name}`}
              onClick={() => setStaged(null)}
            >
              ×
            </button>
          </CellChip>
        ) : null}
        <div className="grow" />
        {flash ? <CellChip tone="ok">{flash}</CellChip> : null}
        <Btn variant="pri" onClick={submit} disabled={!body.trim() && !staged}>
          <Icon name={activeMode.icon} size={13} />
          {send.isPending ? "Sending…" : activeMode.label}
        </Btn>
      </div>
    </div>
  );
}
