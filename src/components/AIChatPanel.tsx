"use client";

// Elara — borrower-facing chat panel
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
//
// ── Design-system migration note ──────────────────────────────────────
// Restyled onto globals.css/app-extras.css classes: the thread uses the shared
// message vocabulary (`.msg` / `.msg-b` / `.msg.mine` / `.msg.ai` /
// `.thr-empty`), the composer uses `.composer` + `.composer-row`, and the
// conversation rows, starter prompts, chips and buttons use `.pick`,
// `.cellchip`, `.chip` and `.btn`.
//
// The SHELL stays inline on purpose, and this is the one deliberate departure
// from "everything onto classes". This is not a dialog with a body — it is a
// docked full-height panel with its own 280px rail, a flexible middle that
// scrolls, and a composer pinned to the bottom edge. ds/Drawer is a centred
// box whose `.drawer-b` owns padding and scrolling, and `.thr` caps itself at
// 56vh, which inside a 100vh docked panel leaves the composer floating in
// whitespace. Bespoke geometry stays inline (and is commented at each site)
// rather than being forced onto the wrong word.
//
// Every hook, every action case, every disabled predicate, both title
// tooltips, the Enter-to-send handler, the auto-scroll ref, the mark-seen
// effect and all seven empty/loading/error states are the ones that were here
// before. Public props (`open`, `onClose`) are untouched.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import { Btn, CellChip, IconBtn, Input, Linky, StatusLine, cx } from "@/components/ds";
import {
  useAIChatThread,
  useAIChatThreads,
  useChatAttachmentInit,
  useFindOrCreateChatThread,
  useLoans,
  useMarkThreadSeen,
  useMarkClientFinanceReady,
  useRequestPrequalification,
  useSendBuyerAgreement,
  useSendListingAgreement,
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
  const router = useRouter();
  const { data: loans = [] } = useLoans();
  const threadsQ = useAIChatThreads();
  const findOrCreate = useFindOrCreateChatThread();
  const sendMessage = useSendAIChatMessage();
  const attachmentInit = useChatAttachmentInit();
  const routeDocument = useRouteDocument();
  const requestPrequal = useRequestPrequalification();
  const sendBuyerAgreement = useSendBuyerAgreement();
  const sendListingAgreement = useSendListingAgreement();
  const markFinanceReady = useMarkClientFinanceReady();
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
    const priorInput = input;
    const priorStaged = staged;
    setInput("");
    setStaged([]);
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
    } catch (e) {
      setInput(priorInput);
      setStaged(priorStaged);
      setError(e instanceof Error ? e.message : "Elara failed to respond.");
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
          // Elara path — agent typed something like "Marcus is
          // ready for prequal" → AI emits this action card → click
          // confirms → fires the same endpoint as the
          // "Ready for Prequalification" button on /clients/[id].
          if (!action.client_id) return;
          await requestPrequal.mutateAsync(action.client_id);
          activeThreadQ.refetch();
          return;
        }
        // ── Realtor AI confirm-actions (alembic 0030) ────────────────
        // Each fires the matching backend stub and refetches the
        // thread so the AI's confirmation message lands.
        case "send_buyer_agreement": {
          if (!action.client_id) return;
          await sendBuyerAgreement.mutateAsync(action.client_id);
          activeThreadQ.refetch();
          return;
        }
        case "send_listing_agreement": {
          if (!action.client_id) return;
          await sendListingAgreement.mutateAsync(action.client_id);
          activeThreadQ.refetch();
          return;
        }
        case "mark_client_finance_ready": {
          if (!action.client_id) return;
          await markFinanceReady.mutateAsync(action.client_id);
          activeThreadQ.refetch();
          return;
        }
        // The remaining Realtor ChatAction kinds are placeholder cards
        // — backend handlers will land in follow-up. For now a tap is
        // a no-op that just refetches the thread (keeps the UI honest).
        case "create_buyer_intake":
        case "create_seller_intake":
        case "schedule_showing":
        case "schedule_picture_day":
        case "prepare_cma_task":
        case "create_listing_prep_checklist":
        case "send_property_matches":
        case "draft_follow_up_text":
        case "draft_follow_up_email":
        case "update_realtor_pipeline_stage": {
          // TODO: wire backend confirm-endpoints + drafted-message
          // textarea inside the card for the draft_* kinds.
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
      aria-label="Elara chat"
      // Scrim geometry. `.drawer-scrim` is the sheet's word for this, but it is
      // half of a pair whose other half is a centred `.drawer`; this panel is
      // docked to the right edge instead, so the two stay together here.
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
      {/* Docked panel: full viewport height, right edge, rounded on the inside
          corners only. Bespoke geometry — see the note at the top of the file. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(820px, 95vw)",
          background: "var(--bg)",
          boxShadow: "var(--sh2)",
          borderTopLeftRadius: 18,
          borderBottomLeftRadius: 18,
          display: "flex",
          flexDirection: "row",
        }}
      >
        {/* Conversation sidebar — derived, never raw. A fixed 280px rail; NOT
            `.side` (that is the app sidebar and carries height:100vh plus its
            own border) and not `.withrail > .railcol` (that is a page-level
            sticky column inside `.content`). */}
        <div
          style={{
            width: 280,
            flex: "0 0 auto",
            borderRight: "1px solid var(--line)",
            background: "var(--sunken2)",
            display: "flex",
            flexDirection: "column",
            borderTopLeftRadius: 18,
            borderBottomLeftRadius: 18,
            minWidth: 0,
          }}
        >
          <div
            style={{
              flex: "0 0 auto",
              padding: "16px 16px 12px",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <div className="lbl">Conversations</div>
            <div className="sub">
              {`1 account thread · ${loans.length} loan${loans.length === 1 ? "" : "s"}`}
            </div>
          </div>
          {/* The rail's own scroller. */}
          <div style={{ flex: "1 1 auto", overflowY: "auto", padding: 8, minHeight: 0 }}>
            <SidebarRow
              title="Account questions"
              subtitle={accountThread?.last_message_preview ?? "General questions about your portfolio."}
              timestamp={accountThread?.last_message_at ?? null}
              empty={!accountThread}
              isActive={!!accountThread && activeThreadId === accountThread.id}
              unread={!!accountThread?.unread}
              onClick={() => openThread(null)}
            />

            {loans.length > 0 ? <div className="lbl mt mb">Loans</div> : null}

            {loans.map((loan: Loan) => {
              const th = loanThreadMap.get(loan.id);
              return (
                <SidebarRow
                  key={loan.id}
                  title={loan.deal_id}
                  subtitleHeader={loan.address ?? ""}
                  subtitle={th?.last_message_preview ?? "No conversation yet — tap to start."}
                  timestamp={th?.last_message_at ?? null}
                  empty={!th}
                  isActive={!!th && activeThreadId === th.id}
                  unread={!!th?.unread}
                  onClick={() => openThread(loan.id)}
                />
              );
            })}

            {threadsQ.isLoading && (threadsQ.data ?? []).length === 0 ? (
              <div className="thr-empty">Loading…</div>
            ) : null}
          </div>
        </div>

        {/* Active conversation */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {/* Header */}
          <div
            style={{
              flex: "0 0 auto",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "16px 22px",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <div className="grow">
              <div className="lbl">Elara</div>
              <h3 className="trunc">{activeThreadQ.data?.title ?? "Pick a conversation"}</h3>
              {activeThreadQ.data?.loan_deal_id ? (
                <div className="sub trunc">
                  {activeThreadQ.data.loan_deal_id}
                  {activeThreadQ.data.loan_address ? ` · ${activeThreadQ.data.loan_address}` : ""}
                </div>
              ) : null}
            </div>
            <IconBtn onClick={onClose} aria-label="Close">
              <Icon name="x" size={16} />
            </IconBtn>
          </div>

          {/* Thread. The scroller is the flexible middle of a docked panel, so
              it cannot be `.thr` — that caps itself at 56vh and would leave the
              composer floating above a band of empty space. The messages inside
              it are the shared `.msg` vocabulary. */}
          <div
            ref={scrollRef}
            style={{
              flex: "1 1 auto",
              minHeight: 0,
              overflowY: "auto",
              padding: "16px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {!activeThreadId ? (
              <div className="thr-empty">
                Pick a conversation on the left to start chatting. Elara sees the
                full context for whichever scope you choose — account-wide for
                general questions, loan-specific for deal-level questions.
              </div>
            ) : messages.length === 0 ? (
              <>
                <div className="thr-empty">
                  Ask about your pipeline, outstanding documents, what&apos;s next on a
                  deal, or anything else underwriting-related.
                </div>
                <div className="lbl">Try asking</div>
                {/* No gap wrapper: `.pick + .pick` already carries the 7px
                    stacking rhythm, and a grid gap on top would double it. */}
                <div>
                  {STARTER_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="pick"
                      onClick={() => send(p)}
                      // `.pick` was written for a `<label>`; on a `<button>`
                      // the UA still centres the text and no class owns
                      // text-align.
                      style={{ textAlign: "left" }}
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
                  className={cx("msg", m.role === "user" ? "mine" : "ai")}
                  // Which side the bubble hangs off is derived from the
                  // message's role, so it stays at the site.
                  style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                  }}
                >
                  <div className="msg-b">{m.body}</div>
                  {m.attachments && m.attachments.length > 0 ? (
                    <div className="row">
                      {m.attachments.map((att) => (
                        <PanelAttachmentChip key={att.document_id} attachment={att} />
                      ))}
                    </div>
                  ) : null}
                  {m.role === "assistant" && m.actions && m.actions.length > 0 ? (
                    <div className="row">
                      {m.actions.map((a, idx) => (
                        <PanelActionButton
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
            {sendMessage.isPending ? (
              <div className="msg ai" style={{ alignSelf: "flex-start", maxWidth: "85%" }}>
                <div className="msg-b">Thinking…</div>
              </div>
            ) : null}
            {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
          </div>

          {/* Staged attachments preview */}
          {staged.length > 0 ? (
            <div className="row" style={{ flex: "0 0 auto", padding: "8px 22px 0" }}>
              {staged.map((s) => (
                <CellChip key={s.document_id} tone="pet">
                  <Icon name="doc" size={12} />
                  <span className="trunc" style={{ maxWidth: 200 }}>{s.name}</span>
                  <Linky
                    onClick={() => setStaged((prev) => prev.filter((x) => x.document_id !== s.document_id))}
                    aria-label="Remove attachment"
                  >
                    <Icon name="x" size={11} />
                  </Linky>
                </CellChip>
              ))}
            </div>
          ) : null}

          {/* Input. `.composer` owns the top hairline and the vertical rhythm;
              only the panel's 22px side gutter is set here, and no class owns
              that. */}
          <div
            className="composer"
            style={{ flex: "0 0 auto", paddingLeft: 22, paddingRight: 22, paddingBottom: 12 }}
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
              <IconBtn
                onClick={() => fileInputRef.current?.click()}
                disabled={!activeThreadLoanId || attachmentInit.isPending}
                aria-label="Attach file"
                title={activeThreadLoanId ? "Attach file" : "Attachments require a loan-scoped thread"}
              >
                <Icon name="paperclip" size={18} />
              </IconBtn>
              <Input
                grow
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  staged.length > 0
                    ? "Add a note (optional)…"
                    : activeThreadId
                      ? "Type your question…"
                      : "Pick a conversation first"
                }
                disabled={!activeThreadId}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                // Nothing in the sheet dims a disabled `.field`, and without
                // the dim there is no sign the box is inert until you click it.
                style={{ opacity: activeThreadId ? 1 : 0.6 }}
              />
              <IconBtn
                className="pri"
                onClick={() => send(input)}
                disabled={(!input.trim() && staged.length === 0) || sendMessage.isPending || !activeThreadId}
                aria-label="Send"
              >
                <Icon name="arrowR" size={16} />
              </IconBtn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SidebarRowProps {
  title: string;
  subtitleHeader?: string;
  subtitle: string;
  timestamp: string | null;
  empty: boolean;
  isActive: boolean;
  unread?: boolean;
  onClick: () => void;
}

function SidebarRow({
  title,
  subtitleHeader,
  subtitle,
  timestamp,
  empty,
  isActive,
  unread,
  onClick,
}: SidebarRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? "true" : undefined}
      className={cx("pick", isActive && "on")}
      // `.pick` owns `display` (flex) — the stack goes in a single `.grow`
      // child rather than being forced on top of it. Only text-align is set
      // here: `.pick` was written for a `<label>` and the UA centres a
      // `<button>`'s text.
      style={{ textAlign: "left" }}
    >
      <div className="grow">
        <div className="row">
          {/* An unread marker. `.repdot` owns the shape; the colour says which
              kind of attention it is. */}
          {unread ? <span className="repdot" style={{ background: "var(--danger)" }} /> : null}
          <b className="trunc grow">{title}</b>
          {timestamp ? (
            <span className="sub">
              {new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          ) : null}
        </div>
        {subtitleHeader ? <div className="sub trunc">{subtitleHeader}</div> : null}
        <div
          className="sub"
          // Two-line clamp. `.trunc` is the one-line form; the -webkit-box trio
          // is written out here because this is the only two-line clamp in the
          // app and a class for a single site is a class nobody finds.
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            fontStyle: empty ? "italic" : "normal",
          }}
        >
          {subtitle}
        </div>
      </div>
    </button>
  );
}

function PanelActionButton({
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

function PanelAttachmentChip({ attachment }: { attachment: ChatAttachment }) {
  const status = attachment.status ?? "received";
  // Tone is derived from the document's status, so the class is picked here.
  const statusTone = status === "verified" ? "ok" : status === "flagged" ? "warn" : "mut";
  return (
    <span className="chip">
      <Icon name="doc" size={12} />
      <span className="trunc" style={{ maxWidth: 220 }}>{attachment.name}</span>
      <CellChip tone={statusTone}>{status}</CellChip>
    </span>
  );
}
