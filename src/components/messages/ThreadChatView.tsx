"use client";

// In-page chat view for a single AIChatThread. Renders the message
// history and accepts new sends. Used by:
//   - /messages (borrower thread list — account + per-loan threads)
//   - any other surface that wants an embedded chat for a known
//     thread id.
//
// Distinct from `AIChatPanel` (the topbar slide-in) — that one
// owns the thread sidebar; this one is just the chat surface.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useAIChatThread,
  useChatAttachmentInit,
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

export function ThreadChatView({
  threadId,
  title,
  subtitle,
  emptyState,
  starterPrompts,
}: Props) {
  const { t } = useTheme();
  const router = useRouter();
  const threadQ = useAIChatThread(threadId);
  const sendMessage = useSendAIChatMessage();
  const attachmentInit = useChatAttachmentInit();
  const routeDocument = useRouteDocument();
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

  const send = async (raw: string) => {
    const text = raw.trim();
    if ((!text && staged.length === 0) || sendMessage.isPending) return;
    setError(null);
    try {
      const tokens = staged.map((s) => s.document_id);
      await sendMessage.mutateAsync({
        threadId,
        body: text,
        attachment_tokens: tokens.length > 0 ? tokens : null,
      });
      setInput("");
      setStaged([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI failed to respond.");
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
          // Deep-link into the loan's docs tab with ?upload=<doc_id>.
          // DocsTab fires the upload picker pre-bound on mount.
          if (action.document_id && threadLoanId) {
            router.push(`/loans/${threadLoanId}?upload=${action.document_id}#docs`);
          } else if (threadLoanId) {
            router.push(`/loans/${threadLoanId}#docs`);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header */}
      <div
        style={{
          flex: "0 0 auto",
          padding: "14px 18px",
          borderBottom: `1px solid ${t.line}`,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            color: t.petrol,
          }}
        >
          AI Intelligent Underwriter
        </div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: t.ink,
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {headerTitle}
        </div>
        {headerSub ? (
          <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>{headerSub}</div>
        ) : null}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {threadQ.isLoading ? (
          <div style={{ fontSize: 12.5, color: t.ink3 }}>Loading…</div>
        ) : messages.length === 0 ? (
          <>
            <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.55 }}>
              {emptyState ?? "No messages yet. Ask anything — I see the full context."}
            </div>
            {starterPrompts && starterPrompts.length > 0 ? (
              <>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: t.ink3,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    marginTop: 8,
                  }}
                >
                  Try asking
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {starterPrompts.map((p) => (
                    <button
                      key={p}
                      onClick={() => send(p)}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        padding: 12,
                        borderRadius: 12,
                        border: `1px solid ${t.line}`,
                        fontSize: 13,
                        color: t.ink2,
                        lineHeight: 1.5,
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div
                style={{
                  padding: 11,
                  borderRadius: 14,
                  background: m.role === "user" ? t.brandSoft : t.surface2,
                  color: m.role === "user" ? t.brand : t.ink,
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.body}
              </div>
              {m.attachments && m.attachments.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {m.attachments.map((att) => (
                    <AttachmentChipDesktop key={att.document_id} t={t} attachment={att} />
                  ))}
                </div>
              ) : null}
              {m.role === "assistant" && m.actions && m.actions.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {m.actions.map((a, idx) => (
                    <ActionButtonDesktop
                      key={idx}
                      t={t}
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
        {sendMessage.isPending ? (
          <div
            style={{
              alignSelf: "flex-start",
              padding: 11,
              borderRadius: 14,
              background: t.surface2,
              fontSize: 12,
              color: t.ink3,
            }}
          >
            Thinking…
          </div>
        ) : null}
        {error ? <Pill bg={t.dangerBg} color={t.danger}>{error}</Pill> : null}
      </div>

      {/* Staged attachments preview */}
      {staged.length > 0 ? (
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            padding: "8px 18px 0",
          }}
        >
          {staged.map((s) => (
            <div
              key={s.document_id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                borderRadius: 999,
                background: t.petrolSoft,
                color: t.petrol,
                fontSize: 11.5,
                fontWeight: 600,
              }}
            >
              <Icon name="doc" size={12} />
              <span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.name}
              </span>
              <button
                onClick={() => setStaged((prev) => prev.filter((x) => x.document_id !== s.document_id))}
                aria-label="Remove attachment"
                style={{
                  all: "unset",
                  cursor: "pointer",
                  padding: 2,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                <Icon name="x" size={11} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Input */}
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 18px",
          borderTop: `1px solid ${t.line}`,
        }}
      >
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
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!threadLoanId || attachmentInit.isPending}
          aria-label="Attach file"
          title={threadLoanId ? "Attach file" : "Attachments require a loan-scoped thread"}
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            border: "none",
            background: "transparent",
            color: threadLoanId ? t.ink2 : t.ink4,
            cursor: threadLoanId ? "pointer" : "not-allowed",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: threadLoanId ? 1 : 0.5,
          }}
        >
          <Icon name="paperclip" size={18} />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={staged.length > 0 ? "Add a note (optional)…" : "Type your question…"}
          disabled={sendMessage.isPending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          style={{
            flex: 1,
            padding: "11px 14px",
            borderRadius: 12,
            background: t.surface2,
            border: `1px solid ${t.line}`,
            color: t.ink,
            fontSize: 14,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={(!input.trim() && staged.length === 0) || sendMessage.isPending}
          aria-label="Send"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            border: "none",
            background: (input.trim() || staged.length > 0) && !sendMessage.isPending ? t.petrol : t.chip,
            color: (input.trim() || staged.length > 0) && !sendMessage.isPending ? "#fff" : t.ink4,
            cursor: (input.trim() || staged.length > 0) && !sendMessage.isPending ? "pointer" : "not-allowed",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="arrowR" size={18} />
        </button>
      </div>
    </div>
  );
}

function ActionButtonDesktop({
  t,
  action,
  onClick,
  busy,
}: {
  t: ReturnType<typeof useTheme>["t"];
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
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        all: "unset",
        cursor: busy ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        borderRadius: 12,
        background: isPrimary ? t.petrol : t.surface2,
        border: isPrimary ? "none" : `1px solid ${t.line}`,
        color: isPrimary ? "#fff" : t.ink,
        fontSize: 12.5,
        fontWeight: 700,
        opacity: busy ? 0.6 : 1,
      }}
    >
      <Icon name={iconName} size={14} />
      <span>{action.label}</span>
    </button>
  );
}

function AttachmentChipDesktop({
  t,
  attachment,
}: {
  t: ReturnType<typeof useTheme>["t"];
  attachment: ChatAttachment;
}) {
  const status = attachment.status ?? "received";
  const statusColor =
    status === "verified" ? t.profit : status === "flagged" ? t.warn : t.ink3;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 12,
        background: t.surface2,
        border: `1px solid ${t.line}`,
        fontSize: 11.5,
      }}
    >
      <Icon name="doc" size={12} />
      <span style={{ color: t.ink, fontWeight: 600, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {attachment.name}
      </span>
      <span style={{ color: statusColor, textTransform: "uppercase", letterSpacing: 0.6, fontSize: 10.5 }}>
        {status}
      </span>
    </div>
  );
}
