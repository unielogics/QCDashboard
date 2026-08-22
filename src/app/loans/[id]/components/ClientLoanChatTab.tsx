"use client";

// ClientLoanChatTab — the borrower's view of the loan's workspace
// chat. Sister to LoanChatTab (the broker / operator surface), but
// with a single-mode composer (mode=chat only) and no role-pill
// chooser, since CLIENT can only send normal client messages.
//
// Reads workspace chat via /loans/{id}/chat. Server-side `list_chat`
// filters to `client_visible=true` rows for CLIENT role automatically;
// we still mount the same DealChatThread component so the bubble
// styling stays consistent with what the operator sees.
//
// Phase 7.5 — fixes the production gap where desktop clients had no
// chat surface at all (CLIENT_TABS = Overview / Simulator / Documents
// / Activity, no chat tab). Operator-to-client messages were
// invisible on desktop entirely.
//
// Restyled onto `.panel` + `.composer`; only the 60vh floor stays inline.

import { useRef, useState } from "react";
import { Btn, IconBtn, Panel, StatusLine, Sub, Textarea } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useDealChat, useDealWorkspace, useSendDealChat, useUploadDocument } from "@/hooks/useApi";
import { DealChatMode, DealChatRole } from "@/lib/enums.generated";
import type { User } from "@/lib/types";
import { DealChatThread } from "./DealChatThread";

interface Props {
  loanId: string;
  user: User;
}

export function ClientLoanChatTab({ loanId, user }: Props) {
  const { data: workspace, isLoading } = useDealWorkspace(loanId);
  const { data: messages = [] } = useDealChat(loanId);
  const send = useSendDealChat();
  const uploadDoc = useUploadDocument();
  const [draft, setDraft] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [staged, setStaged] = useState<{ document_id: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onPickFile = async (file: File) => {
    try {
      const init = await uploadDoc.mutateAsync({ loan_id: loanId, file, is_other: true });
      setStaged({ document_id: init.document_id, name: file.name });
    } catch (e: unknown) {
      setFlash(e instanceof Error ? e.message : "Couldn't attach the file.");
      setTimeout(() => setFlash(null), 4000);
    }
  };

  const pausedUntil = workspace?.ai_paused_until ?? null;
  const pauseRemainingMin = pausedUntil
    ? Math.max(0, Math.round((new Date(pausedUntil).getTime() - Date.now()) / 60_000))
    : 0;
  const isPaused = pauseRemainingMin > 0;

  const submit = async () => {
    const body = draft.trim();
    if ((!body && !staged) || send.isPending) return;
    const att = staged;
    setDraft("");
    setStaged(null);
    try {
      await send.mutateAsync({
        loanId,
        body: body || (att ? `Uploaded: ${att.name}` : ""),
        mode: DealChatMode.CHAT,
        attachment_document_id: att?.document_id ?? null,
        optimistic_from_role: DealChatRole.CLIENT,
        optimistic_client_visible: true,
      });
      // No client-side flash on send when un-paused; the AI reply will
      // appear in the thread within seconds. When paused, hint that
      // the operator is handling the conversation.
      if (isPaused) {
        setFlash("Your operator is replying directly — they'll see this within a minute.");
        setTimeout(() => setFlash(null), 4000);
      }
    } catch (e: unknown) {
      setDraft(body);
      if (att) setStaged(att);
      setFlash(e instanceof Error ? e.message : "Send failed");
      setTimeout(() => setFlash(null), 4000);
    }
  };

  if (isLoading || !workspace) {
    return (
      <Panel>
        <Sub>Loading conversation…</Sub>
      </Panel>
    );
  }

  return (
    // Bespoke floor: the panel stretches to fill it so the composer sits low
    // rather than riding up under a short thread.
    <div style={{ minHeight: "60vh", display: "grid" }}>
      <Panel
        title={
          <>
            <Icon name="chat" size={14} /> Messages
          </>
        }
        sub={
          isPaused
            ? `Your operator is handling this directly (AI back in ~${pauseRemainingMin} min)`
            : "AI ↔ you about this loan"
        }
        actions={
          /* AI disclosure microcopy — Disclosure §2 ("AI can make mistakes")
             on a borrower-facing AI surface. */
          <span className="sub" style={{ fontStyle: "italic" }}>
            Nurture AI can make mistakes — anything material is reviewed before action.
          </span>
        }
        noPad
      >
        <div className="grow" style={{ minHeight: 0, overflow: "auto", padding: 12 }}>
          <DealChatThread
            loanId={loanId}
            user={user}
            messages={messages}
            pausedUntil={pausedUntil}
          />
        </div>

        <div
          className="grid g8"
          style={{ padding: 12, borderTop: "1px solid var(--line)", background: "var(--sunken2)" }}
        >
          {flash && <StatusLine tone="warn">{flash}</StatusLine>}
          {staged && (
            <div className="itemrow">
              <Icon name="paperclip" size={13} />
              <span className="grow trunc">{staged.name}</span>
              <IconBtn onClick={() => setStaged(null)} aria-label="Remove attachment">
                <Icon name="x" size={13} />
              </IconBtn>
            </div>
          )}
          <div className="composer-row">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              // Functional, not decorative: the picker is opened
              // programmatically and this control is never laid out.
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onPickFile(f);
              }}
            />
            <Btn
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadDoc.isPending}
              aria-label="Attach a file"
              title="Attach a file"
            >
              <Icon name="paperclip" size={14} />
            </Btn>
            <Textarea
              className="grow"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="Ask about your loan — pricing, missing docs, next steps…"
              rows={2}
              // Bespoke bounds for a two-line composer that may be dragged
              // taller; `textarea.field` owns only `resize: vertical`.
              style={{ minHeight: 44, maxHeight: 200 }}
            />
            <Btn variant="pri" onClick={() => void submit()} disabled={!draft.trim() && !staged}>
              <Icon name="send" size={13} />
              {send.isPending ? "Sending…" : "Send"}
            </Btn>
          </div>
        </div>
      </Panel>
    </div>
  );
}
