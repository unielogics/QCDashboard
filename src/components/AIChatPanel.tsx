"use client";

// AI Intelligent Underwriter — borrower-facing chat panel
// (topbar slide-in shortcut). The full Messages page does the
// same job at /messages; this is the at-a-glance entry from any
// other page.
//
// Sidebar is DERIVED, not raw — exactly one Account row + one row
// per loan the user has. Threads lazy-create on first tap via
// /ai/chat/threads/find-or-create. Canonical-thread guarantees
// (alembic 0017 partial unique on (user, loan), 0018 partial
// unique on (user) WHERE loan_id IS NULL) prevent duplicates at
// the DB level no matter how the panel is poked.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useAIChatThread,
  useAIChatThreads,
  useChatAttachmentInit,
  useFindOrCreateChatThread,
  useLoans,
  useMarkThreadSeen,
  useRequestPrequalification,
  useRouteDocument,
  useSendAIChatMessage,
} from "@/hooks/useApi";
import type { AIChatThread, ChatAction, ChatAttachment, Loan } from "@/lib/types";

const STARTER_PROMPTS = [
  "What's the next thing I need to do?",
  "Are any of my docs overdue?",
  "What's blocking my deal from closing?",
  "Show me my current pipeline",
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AIChatPanel({ open, onClose }: Props) {
  const { t } = useTheme();
  const router = useRouter();
  const { data: loans = [] } = useLoans();
  const threadsQ = useAIChatThreads();
  const findOrCreate = useFindOrCreateChatThread();
  const sendMessage = useSendAIChatMessage();
  const attachmentInit = useChatAttachmentInit();
  const routeDocument = useRouteDocument();
  const requestPrequal = useRequestPrequalification();
  const markSeen = useMarkThreadSeen();

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [staged, setStaged] = useState<{ document_id: string; name: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const activeThreadQ = useAIChatThread(activeThreadId);
  const messages = activeThreadQ.data?.messages ?? [];
  const activeThreadLoanId = activeThreadQ.data?.loan_id ?? null;

  const accountThread = useMemo<AIChatThread | undefined>(
    () => (threadsQ.data ?? []).find((th) => !th.loan_id),
    [threadsQ.data],
  );
  const loanThreadMap = useMemo(() => {
    const map = new Map<string, AIChatThread>();
    for (const th of threadsQ.data ?? []) {
      if (th.loan_id) map.set(th.loan_id, th);
    }
    return map;
  }, [threadsQ.data]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length === 0) return;
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 60);
  }, [messages.length, sendMessage.isPending]);

  // Mark the thread as seen whenever it becomes the active view —
  // clears the unread dot. Re-fires when the user switches threads
  // OR when fresh messages arrive while the thread is open.
  useEffect(() => {
    if (!activeThreadId) return;
    markSeen.mutate(activeThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId, messages.length]);

  const openThread = async (loan_id: string | null) => {
    setError(null);
    const existing = loan_id == null ? accountThread : loanThreadMap.get(loan_id);
    if (existing) {
      setActiveThreadId(existing.id);
      return;
    }
    try {
      const created = await findOrCreate.mutateAsync({ loan_id });
      setActiveThreadId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the conversation.");
    }
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if ((!text && staged.length === 0) || sendMessage.isPending) return;
    setError(null);
    try {
      let threadId = activeThreadId;
      if (!threadId) {
        // Find-or-create the canonical Account thread (NOT plain
        // create) so we never spawn a duplicate.
        const t = await findOrCreate.mutateAsync({ loan_id: null });
        threadId = t.id;
        setActiveThreadId(threadId);
      }
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
    if (!activeThreadId || !activeThreadLoanId) {
      setError("Attachments require a loan-specific conversation.");
      return;
    }
    setError(null);
    try {
      const result = await attachmentInit.mutateAsync({ threadId: activeThreadId, file });
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
          if (action.document_id && activeThreadLoanId) {
            onClose();
            router.push(`/loans/${activeThreadLoanId}?upload=${action.document_id}#docs`);
          } else if (activeThreadLoanId) {
            onClose();
            router.push(`/loans/${activeThreadLoanId}#docs`);
          }
          return;
        }
        case "confirm_document_routing": {
          if (!action.document_id) return;
          await routeDocument.mutateAsync({
            documentId: action.document_id,
            checklist_key: action.checklist_key ?? null,
          });
          activeThreadQ.refetch();
          return;
        }
        case "complete_property_intake":
          activeThreadQ.refetch();
          return;
        case "open_calendar_event":
          return;
        case "request_prequalification": {
          // AI Secretary path — agent typed something like "Marcus is
          // ready for prequal" → AI emits this action card → click
          // confirms → fires the same endpoint as the
          // "Ready for Prequalification" button on /clients/[id].
          if (!action.client_id) return;
          await requestPrequal.mutateAsync(action.client_id);
          activeThreadQ.refetch();
          return;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI Intelligent Underwriter chat"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6, 7, 11, 0.55)",
        backdropFilter: "blur(2px)",
        zIndex: 200,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(820px, 95vw)",
          background: t.bg,
          boxShadow: t.shadowLg,
          borderTopLeftRadius: 18,
          borderBottomLeftRadius: 18,
          display: "flex",
          flexDirection: "row",
        }}
      >
        {/* Conversation sidebar — derived, never raw */}
        <div
          style={{
            width: 280,
            borderRight: `1px solid ${t.line}`,
            background: t.surface2,
            display: "flex",
            flexDirection: "column",
            borderTopLeftRadius: 18,
            borderBottomLeftRadius: 18,
          }}
        >
          <div
            style={{
              flex: "0 0 auto",
              padding: "16px 16px 12px",
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
              Conversations
            </div>
            <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 4, lineHeight: 1.5 }}>
              {`1 account thread · ${loans.length} loan${loans.length === 1 ? "" : "s"}`}
            </div>
          </div>
          <div style={{ flex: "1 1 auto", overflowY: "auto", padding: 8 }}>
            <SidebarRow
              t={t}
              title="Account questions"
              subtitle={accountThread?.last_message_preview ?? "General questions about your portfolio."}
              timestamp={accountThread?.last_message_at ?? null}
              accent="petrol"
              empty={!accountThread}
              isActive={!!accountThread && activeThreadId === accountThread.id}
              unread={!!accountThread?.unread}
              onClick={() => openThread(null)}
            />

            {loans.length > 0 ? (
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: t.ink3,
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  margin: "12px 4px 6px",
                }}
              >
                Loans
              </div>
            ) : null}

            {loans.map((loan: Loan) => {
              const th = loanThreadMap.get(loan.id);
              return (
                <SidebarRow
                  key={loan.id}
                  t={t}
                  title={loan.deal_id}
                  subtitleHeader={loan.address ?? ""}
                  subtitle={th?.last_message_preview ?? "No conversation yet — tap to start."}
                  timestamp={th?.last_message_at ?? null}
                  accent="brand"
                  empty={!th}
                  isActive={!!th && activeThreadId === th.id}
                  unread={!!th?.unread}
                  onClick={() => openThread(loan.id)}
                />
              );
            })}

            {threadsQ.isLoading && (threadsQ.data ?? []).length === 0 ? (
              <div style={{ padding: 12, fontSize: 12, color: t.ink3 }}>Loading…</div>
            ) : null}
          </div>
        </div>

        {/* Active conversation */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              flex: "0 0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 22px",
              borderBottom: `1px solid ${t.line}`,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
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
                  fontSize: 18,
                  fontWeight: 800,
                  color: t.ink,
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {activeThreadQ.data?.title ?? "Pick a conversation"}
              </div>
              {activeThreadQ.data?.loan_deal_id ? (
                <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>
                  {activeThreadQ.data.loan_deal_id}
                  {activeThreadQ.data.loan_address ? ` · ${activeThreadQ.data.loan_address}` : ""}
                </div>
              ) : null}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                all: "unset",
                cursor: "pointer",
                width: 32,
                height: 32,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 8,
                color: t.ink2,
              }}
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          {/* Thread */}
          <div
            ref={scrollRef}
            style={{
              flex: "1 1 auto",
              overflowY: "auto",
              padding: "16px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {!activeThreadId ? (
              <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.55 }}>
                Pick a conversation on the left to start chatting. The AI sees the
                full context for whichever scope you choose — account-wide for
                general questions, loan-specific for deal-level questions.
              </div>
            ) : messages.length === 0 ? (
              <>
                <div
                  style={{
                    fontSize: 12.5,
                    color: t.ink3,
                    lineHeight: 1.55,
                    marginBottom: 6,
                  }}
                >
                  Ask about your pipeline, outstanding documents, what&apos;s next on a
                  deal, or anything else underwriting-related.
                </div>
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
                  {STARTER_PROMPTS.map((p) => (
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
                        <PanelAttachmentChip key={att.document_id} t={t} attachment={att} />
                      ))}
                    </div>
                  ) : null}
                  {m.role === "assistant" && m.actions && m.actions.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {m.actions.map((a, idx) => (
                        <PanelActionButton
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
                padding: "8px 22px 0",
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
              padding: "12px 22px",
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
              disabled={!activeThreadLoanId || attachmentInit.isPending}
              aria-label="Attach file"
              title={activeThreadLoanId ? "Attach file" : "Attachments require a loan-scoped thread"}
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                border: "none",
                background: "transparent",
                color: activeThreadLoanId ? t.ink2 : t.ink4,
                cursor: activeThreadLoanId ? "pointer" : "not-allowed",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: activeThreadLoanId ? 1 : 0.5,
              }}
            >
              <Icon name="paperclip" size={18} />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                staged.length > 0
                  ? "Add a note (optional)…"
                  : activeThreadId
                    ? "Type your question…"
                    : "Pick a conversation first"
              }
              disabled={sendMessage.isPending || !activeThreadId}
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
                opacity: activeThreadId ? 1 : 0.6,
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={(!input.trim() && staged.length === 0) || sendMessage.isPending || !activeThreadId}
              aria-label="Send"
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                border: "none",
                background: (input.trim() || staged.length > 0) && !sendMessage.isPending && activeThreadId ? t.petrol : t.chip,
                color: (input.trim() || staged.length > 0) && !sendMessage.isPending && activeThreadId ? "#fff" : t.ink4,
                cursor: (input.trim() || staged.length > 0) && !sendMessage.isPending && activeThreadId ? "pointer" : "not-allowed",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="arrowR" size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SidebarRowProps {
  t: ReturnType<typeof useTheme>["t"];
  title: string;
  subtitleHeader?: string;
  subtitle: string;
  timestamp: string | null;
  accent: "petrol" | "brand";
  empty: boolean;
  isActive: boolean;
  unread?: boolean;
  onClick: () => void;
}

function SidebarRow({
  t,
  title,
  subtitleHeader,
  subtitle,
  timestamp,
  accent,
  empty,
  isActive,
  unread,
  onClick,
}: SidebarRowProps) {
  const accentColor = accent === "petrol" ? t.petrol : t.brand;
  const accentBg = accent === "petrol" ? t.petrolSoft : t.brandSoft;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "block",
        width: "100%",
        boxSizing: "border-box",
        padding: "10px 12px",
        borderRadius: 10,
        marginBottom: 4,
        background: isActive ? accentBg : "transparent",
        border: isActive ? `1px solid ${accentColor}` : "1px solid transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
          {unread ? (
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: t.danger,
                flex: "0 0 auto",
              }}
            />
          ) : null}
          <div
            style={{
              fontSize: 12.5,
              fontWeight: unread ? 800 : 700,
              color: isActive ? accentColor : t.ink,
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
      {subtitleHeader ? (
        <div
          style={{
            fontSize: 10.5,
            color: t.ink3,
            marginTop: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {subtitleHeader}
        </div>
      ) : null}
      <div
        style={{
          fontSize: 11,
          color: empty ? t.ink4 : t.ink3,
          fontStyle: empty ? "italic" : "normal",
          marginTop: 4,
          lineHeight: 1.4,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {subtitle}
      </div>
    </button>
  );
}

function PanelActionButton({
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

function PanelAttachmentChip({
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
