"use client";

// In-page chat view for a single AIChatThread. Renders the message
// history and accepts new sends. Used by:
//   - /messages (borrower thread list — account + per-loan threads)
//   - any other surface that wants an embedded chat for a known
//     thread id.
//
// Distinct from `AIChatPanel` (the topbar slide-in) — that one
// owns the thread sidebar; this one is just the chat surface.
//
// Styling note: this renders INSIDE a caller's `.panel` (see /messages),
// so it borrows the panel vocabulary — `.panel-h` for the header, a
// `.panel-b` scroller, `.composer` for the footer. The one thing it keeps
// inline is the full-height flex column: the surface has to fill whatever
// box the caller gives it, and no class in the sheet expresses that.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import { Btn, CellChip, IconBtn, Input, WarnLine, cx } from "@/components/ds";
import type { ChipTone } from "@/components/ds";
import {
  useAIChatThread,
  useChatAttachmentInit,
  useMarkThreadSeen,
  useRouteDocument,
  useSendAIChatMessage,
} from "@/hooks/useApi";
import type { ChatAction, ChatAttachment } from "@/lib/types";

interface Props {
  threadId: string;
  // Optional caller-supplied header text. Falls back to thread.title.
  title?: string | null;
  subtitle?: string | null;
  // Empty-state copy when the thread has no messages yet.
  emptyState?: React.ReactNode;
  // Caller can pass starter prompts that auto-send on click.
  starterPrompts?: string[];
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ThreadChatView({
  threadId,
  title,
  subtitle,
  emptyState,
  starterPrompts,
}: Props) {
  const router = useRouter();
  const threadQ = useAIChatThread(threadId);
  const sendMessage = useSendAIChatMessage();
  const attachmentInit = useChatAttachmentInit();
  const routeDocument = useRouteDocument();
  const markSeen = useMarkThreadSeen();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [staged, setStaged] = useState<{ document_id: string; name: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messages = threadQ.data?.messages ?? [];
  const threadLoanId = threadQ.data?.loan_id ?? null;

  useEffect(() => {
    if (messages.length === 0) return;
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 60);
  }, [messages.length, sendMessage.isPending]);

  // Mark thread seen on open + whenever new messages land while it's
  // open. Bumps `last_seen_at = now()` on the server so the unread
  // dot clears across refreshes.
  useEffect(() => {
    if (!threadId) return;
    markSeen.mutate(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, messages.length]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if ((!text && staged.length === 0) || sendMessage.isPending) return;
    setError(null);
    const priorInput = input;
    const priorStaged = staged;
    setInput("");
    setStaged([]);
    try {
      const tokens = staged.map((s) => s.document_id);
      await sendMessage.mutateAsync({
        threadId,
        body: text,
        attachment_tokens: tokens.length > 0 ? tokens : null,
      });
    } catch (e) {
      setInput(priorInput);
      setStaged(priorStaged);
      setError(e instanceof Error ? e.message : "Elara failed to respond.");
    }
  };

  const onPickFile = async (file: File) => {
    if (!threadLoanId) {
      setError("Attachments only work in loan-specific conversations.");
      return;
    }
    setError(null);
    try {
      const result = await attachmentInit.mutateAsync({ threadId, file });
      setStaged((prev) => [...prev, { document_id: result.document_id, name: file.name }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't attach the file.");
    }
  };

  const onAction = async (action: ChatAction) => {
    setError(null);
    try {
      switch (action.kind) {
        case "upload_document": {
          // In-chat upload: open the file picker right here; the file
          // stages on the composer and sends into the chat (scan +
          // classify inline). Only loan-scoped threads can attach;
          // fall back to the docs-tab deep-link otherwise.
          if (threadLoanId) {
            fileInputRef.current?.click();
            return;
          }
          if (action.document_id) {
            router.push(`/loans/${threadLoanId}?upload=${action.document_id}#docs`);
          }
          return;
        }
        case "confirm_document_routing": {
          if (!action.document_id) return;
          await routeDocument.mutateAsync({
            documentId: action.document_id,
            checklist_key: action.checklist_key ?? null,
          });
          threadQ.refetch();
          return;
        }
        case "complete_property_intake":
          threadQ.refetch();
          return;
        case "open_calendar_event":
          // v1: no-op. Calendar deep-link is a follow-up.
          return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    }
  };

  const headerTitle = title ?? threadQ.data?.title ?? "Conversation";
  const headerSub = subtitle ?? (threadQ.data?.loan_deal_id
    ? `${threadQ.data.loan_deal_id}${threadQ.data.loan_address ? ` · ${threadQ.data.loan_address}` : ""}`
    : "Account-wide context");

  const canSend = (input.trim().length > 0 || staged.length > 0) && !sendMessage.isPending;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header */}
      <div className="panel-h">
        <CellChip tone="pet">Elara</CellChip>
        <h3>{headerTitle}</h3>
        {headerSub ? <span className="sub">{headerSub}</span> : null}
      </div>

      {/* Messages — `.panel-b` owns the padding and the flex fill, `.ladder`
          the column + gap; the scroll is this box's own job. */}
      <div
        ref={scrollRef}
        className="panel-b ladder"
        style={{ overflowY: "auto", minHeight: 0 }}
      >
        {threadQ.isLoading ? (
          <div className="sub">Loading…</div>
        ) : messages.length === 0 ? (
          <>
            <div className="sub">
              {emptyState ?? "No messages yet. Ask anything — I see the full context."}
            </div>
            {starterPrompts && starterPrompts.length > 0 ? (
              <div>
                <div className="lbl">Try asking</div>
                <div className="mt">
                  {starterPrompts.map((p) => (
                    <button key={p} type="button" className="pick" onClick={() => send(p)}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          messages.map((m) => (
            // `.mine` / `.ai` is what tells the two voices apart now that the
            // thread is flat rather than bubble-aligned — same signal the
            // inbox and the Elara rail use.
            <div key={m.id} className={cx("msg", m.role === "user" ? "mine" : "ai")}>
              <div className="msg-h">
                <span className="msg-who">{m.role === "user" ? "You" : "Elara"}</span>
                {m.created_at ? <span className="msg-when">{formatWhen(m.created_at)}</span> : null}
              </div>
              <div className="msg-b">{m.body}</div>
              {m.attachments && m.attachments.length > 0 ? (
                <div className="row">
                  {m.attachments.map((att) => (
                    <AttachmentChipDesktop key={att.document_id} attachment={att} />
                  ))}
                </div>
              ) : null}
              {m.role === "assistant" && m.actions && m.actions.length > 0 ? (
                <div className="row mt">
                  {m.actions.map((a, idx) => (
                    <ActionButtonDesktop
                      key={idx}
                      action={a}
                      onClick={() => onAction(a)}
                      busy={routeDocument.isPending}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
        {sendMessage.isPending ? <div className="sub">Thinking…</div> : null}
        {error ? <WarnLine>{error}</WarnLine> : null}
      </div>

      {/* Staged attachments preview */}
      {staged.length > 0 ? (
        <div className="row" style={{ flex: "0 0 auto", padding: "8px 16px 0" }}>
          {staged.map((s) => (
            <CellChip key={s.document_id} tone="pet">
              <Icon name="doc" size={12} />
              <span
                style={{
                  maxWidth: 200,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {s.name}
              </span>
              <button
                type="button"
                className="linky"
                onClick={() => setStaged((prev) => prev.filter((x) => x.document_id !== s.document_id))}
                aria-label="Remove attachment"
              >
                <Icon name="x" size={11} />
              </button>
            </CellChip>
          ))}
        </div>
      ) : null}

      {/* Input */}
      <div
        className="composer"
        style={{ flex: "0 0 auto", paddingLeft: 16, paddingRight: 16, paddingBottom: 14 }}
      >
        <div className="composer-row">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickFile(f);
              e.target.value = "";
            }}
            style={{ display: "none" }}
          />
          {/* `.btn:disabled` carries the dimmed, not-actionable state that the
              old inline opacity/cursor pair did. */}
          <IconBtn
            onClick={() => fileInputRef.current?.click()}
            disabled={!threadLoanId || attachmentInit.isPending}
            aria-label="Attach file"
            title={threadLoanId ? "Attach file" : "Attachments require a loan-scoped thread"}
          >
            <Icon name="paperclip" size={15} />
          </IconBtn>
          <Input
            grow
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={staged.length > 0 ? "Add a note (optional)…" : "Type your question…"}
            aria-label="Message"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <IconBtn
            className="pri"
            onClick={() => send(input)}
            disabled={!canSend}
            aria-label="Send"
          >
            <Icon name="arrowR" size={15} />
          </IconBtn>
        </div>
      </div>
    </div>
  );
}

function ActionButtonDesktop({
  action,
  onClick,
  busy,
}: {
  action: ChatAction;
  onClick: () => void;
  busy: boolean;
}) {
  const isPrimary = action.confirm !== false;
  const iconName =
    action.kind === "upload_document"
      ? "upload"
      : action.kind === "confirm_document_routing"
        ? (isPrimary ? "check" : "x")
        : action.kind === "complete_property_intake"
          ? "check"
          : "chevR";
  return (
    <Btn variant={isPrimary ? "pri" : "default"} onClick={onClick} disabled={busy}>
      <Icon name={iconName} size={14} />
      <span>{action.label}</span>
    </Btn>
  );
}

function AttachmentChipDesktop({ attachment }: { attachment: ChatAttachment }) {
  const status = attachment.status ?? "received";
  const tone: ChipTone = status === "verified" ? "ok" : status === "flagged" ? "warn" : "mut";
  return (
    <CellChip tone={tone}>
      <Icon name="doc" size={12} />
      <span
        style={{
          maxWidth: 220,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {attachment.name}
      </span>
      <span>{status.toUpperCase()}</span>
    </CellChip>
  );
}
