"use client";

// Lender Thread (round 3) — Gmail-style mailbox + 65/35 split layout.
//
// Layout:
//   ┌────────────────────────────────┬──────────────────────────┐
//   │                                │ AI summary (collapsible) │
//   │                                ├──────────────────────────┤
//   │  Conversation (mailbox)        │ Living profile           │
//   │  ↳ LenderThreadMessageRow      ├──────────────────────────┤
//   │  + day dividers                │ Lender to-dos            │
//   │  + composer at bottom          ├──────────────────────────┤
//   │       65%                      │ Gmail status      35%    │
//   └────────────────────────────────┴──────────────────────────┘
//
// Right-column panels are collapsible; defaults are AI-suggested based
// on importance (open_asks present → AI summary open; deal_health off
// → Living Profile open; external action items present → To-dos open).
// User overrides persist per-loan in localStorage.
//
// Restyled onto the plain-CSS design system: chrome comes from classes,
// only the bespoke 65/35 page split stays inline.

import { useMemo, useState } from "react";
import {
  Btn,
  CellChip,
  Callout,
  Lbl,
  Linky,
  Panel,
  Seg,
  StatusLine,
  Sub,
  Textarea,
  Input,
} from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import {
  useConnectLenderHealth,
  useGmailTest,
  useInjectLenderEmail,
  useLenderThread,
  useLenderThreadReply,
  useLenderThreadSummary,
} from "@/hooks/useApi";
import type {
  Lender,
  LenderThreadEntry,
  LenderThreadPreviewResponse,
  LenderThreadReplyMode,
  Loan,
} from "@/lib/types";
import { LenderThreadMessageRow } from "./LenderThreadMessageRow";
import { LenderThreadAuditDrawer } from "./LenderThreadAuditDrawer";
import { LenderThreadPreviewModal } from "./LenderThreadPreviewModal";
import { CollapsiblePanel } from "./CollapsiblePanel";
import { LenderActionItemsPanel } from "./LenderActionItemsPanel";
import { ParticipantsCard } from "./ParticipantsCard";
import { EmailDraftsCard } from "./EmailDraftsCard";
import { LenderThreadAttachmentBar } from "./LenderThreadAttachmentBar";
import type { LenderAttachmentRef } from "@/lib/types";

interface Props {
  loan: Loan;
  lender: Lender;
}

export function LenderThread({ loan, lender }: Props) {
  const profile = useActiveProfile();
  const canPost =
    profile.role === Role.SUPER_ADMIN || profile.role === Role.LOAN_EXEC;
  const isSuperAdmin = profile.role === Role.SUPER_ADMIN;

  const thread = useLenderThread(loan.id);
  const summary = useLenderThreadSummary(loan.id);
  const reply = useLenderThreadReply();
  const inject = useInjectLenderEmail();
  const health = useConnectLenderHealth(isSuperAdmin);
  const gmailTest = useGmailTest();

  const inboxIsMock = useMemo(() => {
    const check = health.data?.checks.find((c) => c.name === "Gmail inbound");
    return check?.status === "warn";
  }, [health.data]);
  const gmailCanSend = health.data?.gmail_can_send ?? false;

  const [text, setText] = useState("");
  const [mode, setMode] = useState<LenderThreadReplyMode>("send_now");
  const [attachments, setAttachments] = useState<LenderAttachmentRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastNote, setLastNote] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [auditEntry, setAuditEntry] = useState<LenderThreadEntry | null>(null);

  const [injectOpen, setInjectOpen] = useState(false);
  const [injectFrom, setInjectFrom] = useState(
    lender.contact_email || lender.submission_email || "",
  );
  const [injectSubject, setInjectSubject] = useState("");
  const [injectBody, setInjectBody] = useState("");

  const livingProfile = loan.living_profile;
  const statusSummary = loan.status_summary;

  const grouped = useMemo(
    () => groupByDay(thread.data?.entries ?? []),
    [thread.data],
  );
  const lenderExtract = thread.data?.lender_extract ?? null;

  // AI-suggested defaults for right-column panels. CollapsiblePanel
  // honors user overrides via localStorage, so these only apply on
  // first visit per (loanId, panelKey).
  const summaryHasOpenAsks = (summary.data?.open_asks?.length ?? 0) > 0;
  const profileNeedsAttention = livingProfile?.deal_health
    ? livingProfile.deal_health !== "on_track"
    : false;
  const hasExternalAsks = lenderExtract
    ? (lenderExtract.action_items ?? []).some((i) => i.sensitivity === "external")
    : false;

  const openPreviewOrSave = () => {
    setError(null);
    setLastNote(null);
    if (!text.trim()) {
      setError("Write something before submitting.");
      return;
    }
    if (mode === "save_draft") {
      reply
        .mutateAsync({
          loanId: loan.id,
          payload: {
            mode,
            text: text.trim(),
            attachment_ids: attachments.map((a) => a.attachment_id),
          },
        })
        .then((res) => {
          setText("");
          setAttachments([]);
          setLastNote(res.note);
        })
        .catch((err) => setError((err as Error).message ?? "Save failed."));
      return;
    }
    setPreviewOpen(true);
  };

  const confirmFromPreview = async (_preview: LenderThreadPreviewResponse) => {
    setError(null);
    try {
      const res = await reply.mutateAsync({
        loanId: loan.id,
        payload: {
          mode,
          text: text.trim(),
          attachment_ids: attachments.map((a) => a.attachment_id),
        },
      });
      setText("");
      setAttachments([]);
      setLastNote(res.note);
      setPreviewOpen(false);
    } catch (err) {
      setError((err as Error).message ?? "Send failed.");
    }
  };

  const handleInject = async () => {
    setError(null);
    if (!injectFrom.trim() || !injectBody.trim()) {
      setError("Inject needs a from-email and a body.");
      return;
    }
    try {
      await inject.mutateAsync({
        loan_id: loan.id,
        from_email: injectFrom.trim(),
        subject: injectSubject.trim() || "(test)",
        body: injectBody.trim(),
      });
      setInjectBody("");
      setInjectSubject("");
      setInjectOpen(false);
    } catch (err) {
      setError((err as Error).message ?? "Inject failed.");
    }
  };

  return (
    // Bespoke 65/35 split — not the twelve-column page grid, and the
    // ratio is this surface's own. Stays inline.
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 65fr) minmax(0, 35fr)",
        gap: 12,
        alignItems: "start",
      }}
    >
      {/* LEFT 65% — Mailbox + composer.
          Grid, not flex: `.panel` is overflow:hidden, and as a flex child
          that zeroes its automatic minimum size and clips the composer. */}
      <div className="grid">
        <Panel
          title={
            <>
              <Icon name="mail" size={13} stroke={2.5} /> Conversation — {lender.name}
            </>
          }
          actions={
            isSuperAdmin && inboxIsMock ? (
              <Btn size="sm" onClick={() => setInjectOpen((v) => !v)}>
                {injectOpen ? "Cancel" : "Inject test email"}
              </Btn>
            ) : undefined
          }
          noPad
        >
          {injectOpen && isSuperAdmin && (
            /* Full-bleed section inside a noPad panel — the inset and the
               sunken ground are this block's own, not a class's. */
            <div style={{ padding: 14, borderBottom: "1px solid var(--line)", background: "var(--sunken2)" }}>
              <div className="sub">
                Dev-only mock-inbox injector. Writes a synthetic inbound
                Message(from_role=LENDER) row — same shape the real
                Gmail poller produces.
              </div>
              <div className="grid g8 mt">
                <Input
                  value={injectFrom}
                  onChange={(e) => setInjectFrom(e.target.value)}
                  placeholder="from email (lender)"
                />
                <Input
                  value={injectSubject}
                  onChange={(e) => setInjectSubject(e.target.value)}
                  placeholder="subject"
                />
                <Textarea
                  value={injectBody}
                  onChange={(e) => setInjectBody(e.target.value)}
                  placeholder="paste the email body (eg from an .eml file)"
                  rows={5}
                />
                <Btn variant="pri" onClick={handleInject} disabled={inject.isPending}>
                  {inject.isPending ? "Injecting…" : "Inject as inbound lender email"}
                </Btn>
              </div>
            </div>
          )}

          <div>
            {thread.isLoading ? (
              <div className="sub" style={{ padding: 14 }}>Loading thread…</div>
            ) : grouped.length === 0 ? (
              <div className="sub" style={{ padding: 14 }}>
                No messages yet. {canPost ? "Send the first one below." : ""}
              </div>
            ) : (
              grouped.map(({ day, entries }) => (
                <div key={day}>
                  {/* `.thr-day` is the sheet's day divider; the panel is
                      noPad, so the inset comes from here. */}
                  <div className="thr-day" style={{ padding: "10px 14px" }}>
                    {day}
                  </div>
                  {entries.map((e) => (
                    <LenderThreadMessageRow
                      key={e.id}
                      entry={e}
                      onShowDetails={setAuditEntry}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </Panel>

        {canPost && (
          <Panel
            title="Reply"
            actions={
              // A group of mutually-exclusive send modes, NOT a tablist:
              // picking one changes what Submit does, not which view you
              // are looking at.
              <Seg
                as="filter"
                ariaLabel="Reply mode"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "send_now", label: modeLabel("send_now") },
                  { value: "instruct_ai", label: modeLabel("instruct_ai") },
                  { value: "save_draft", label: modeLabel("save_draft") },
                ]}
              />
            }
            bodyClass="grid g10"
          >
            <Sub>{modeHint(mode, lender.name)}</Sub>
            <LenderThreadAttachmentBar
              loanId={loan.id}
              attachments={attachments}
              onChange={setAttachments}
            />
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder={modePlaceholder(mode)}
            />
            {error && <StatusLine tone="bad">{error}</StatusLine>}
            {lastNote && !error && <StatusLine tone="ok">{lastNote}</StatusLine>}
            <Btn variant="pri" onClick={openPreviewOrSave} disabled={reply.isPending}>
              {reply.isPending
                ? "Working…"
                : mode === "save_draft"
                ? "Save as draft"
                : "Preview…"}
            </Btn>
          </Panel>
        )}
      </div>

      {/* RIGHT 35% — stackable collapsible panels */}
      <div className="grid g10">
        <CollapsiblePanel
          loanId={loan.id}
          panelKey="ai-summary"
          title="AI summary"
          importance={summaryHasOpenAsks ? "high" : "med"}
          defaultOpen={true}
          rightBadge={
            summary.data ? (
              <CellChip tone="acc">
                {summary.data.message_count} msg
                {summary.data.message_count === 1 ? "" : "s"}
              </CellChip>
            ) : null
          }
        >
          {summary.isLoading ? (
            <Sub>Generating summary…</Sub>
          ) : summary.data ? (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                {summary.data.headline}
              </div>
              {summary.data.open_asks.length > 0 && (
                <div className="mt">
                  <Lbl>Open asks</Lbl>
                  {/* Bespoke list geometry; `.sub` owns colour and size. */}
                  <ul className="sub" style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {summary.data.open_asks.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.data.suggested_next_reply && canPost && (
                <Callout tone="acc" className="mt">
                  <Lbl>Suggested reply</Lbl>
                  <div style={{ marginTop: 4 }}>{summary.data.suggested_next_reply}</div>
                  <div className="mt">
                    <Linky
                      onClick={() => {
                        setText(summary.data?.suggested_next_reply ?? "");
                        setMode("send_now");
                      }}
                    >
                      Use as starting point ←
                    </Linky>
                  </div>
                </Callout>
              )}
            </div>
          ) : (
            <Sub>Summary unavailable.</Sub>
          )}
        </CollapsiblePanel>

        <CollapsiblePanel
          loanId={loan.id}
          panelKey="action-items"
          title="What's needed"
          importance={hasExternalAsks ? "high" : "med"}
          defaultOpen={hasExternalAsks || !!lenderExtract}
          rightBadge={
            lenderExtract && lenderExtract.action_items.length > 0 ? (
              <CellChip tone="warn">{lenderExtract.action_items.length}</CellChip>
            ) : null
          }
        >
          <LenderActionItemsPanel extract={lenderExtract} />
        </CollapsiblePanel>

        {(statusSummary || livingProfile) && (
          <CollapsiblePanel
            loanId={loan.id}
            panelKey="living-profile"
            title="Living profile"
            importance={profileNeedsAttention ? "high" : "low"}
            defaultOpen={profileNeedsAttention}
            rightBadge={
              livingProfile?.deal_health ? (
                <DealHealthPill health={livingProfile.deal_health} />
              ) : null
            }
          >
            <div>
              {statusSummary ? <div style={{ marginBottom: 8 }}>{statusSummary}</div> : null}
              {livingProfile?.bottlenecks && livingProfile.bottlenecks.length > 0 && (
                <div className="mt">
                  <Lbl>Bottlenecks</Lbl>
                  <div className="row" style={{ marginTop: 4 }}>
                    {livingProfile.bottlenecks.map((b) => (
                      <CellChip key={b} tone="warn">
                        {b}
                      </CellChip>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CollapsiblePanel>
        )}

        {/* Thread participants — the routing source-of-truth for the
            Fintech Orchestrator (CC/BCC/hide_identity). Moved into this
            column so the operator can add more people as the file
            grows without leaving the lender section. */}
        <ParticipantsCard loanId={loan.id} />

        {/* Pending email drafts — round-1 created this card; moving it
            here keeps everything lender-thread in one column. */}
        <EmailDraftsCard loanId={loan.id} />

        {isSuperAdmin && (
          <CollapsiblePanel
            loanId={loan.id}
            panelKey="gmail-status"
            title="Gmail status"
            importance={gmailCanSend ? "low" : "high"}
            defaultOpen={!gmailCanSend}
            rightBadge={
              <CellChip tone={gmailCanSend ? "ok" : "warn"}>
                {gmailCanSend ? "Ready" : "Not configured"}
              </CellChip>
            }
          >
            <div>
              {gmailCanSend
                ? "Send Now and Instruct Elara will deliver via Gmail."
                : "Messages will be saved locally only — recipients will NOT receive them."}
              <div className="mt">
                <Btn size="sm" onClick={() => gmailTest.mutate()} disabled={gmailTest.isPending}>
                  {gmailTest.isPending ? "Testing…" : "Test Gmail"}
                </Btn>
              </div>
              {gmailTest.data ? (
                <StatusLine tone={gmailTest.data.ok ? "ok" : "bad"} className="mt">
                  {gmailTest.data.note}
                </StatusLine>
              ) : null}
            </div>
          </CollapsiblePanel>
        )}
      </div>

      {/* Modals / drawers */}
      <LenderThreadPreviewModal
        open={previewOpen && mode !== "save_draft"}
        loanId={loan.id}
        mode={mode}
        text={text}
        onCancel={() => setPreviewOpen(false)}
        onConfirm={confirmFromPreview}
        confirming={reply.isPending}
      />
      <LenderThreadAuditDrawer
        loanId={loan.id}
        entry={auditEntry}
        onClose={() => setAuditEntry(null)}
      />
    </div>
  );
}

function DealHealthPill({
  health,
}: {
  health: "on_track" | "at_risk" | "stuck";
}) {
  const map = {
    on_track: { tone: "ok", label: "On track" },
    at_risk: { tone: "warn", label: "At risk" },
    stuck: { tone: "bad", label: "Stuck" },
  } as const;
  const cfg = map[health];
  return <CellChip tone={cfg.tone}>{cfg.label}</CellChip>;
}

interface DayGroup {
  day: string;
  entries: LenderThreadEntry[];
}

function groupByDay(entries: LenderThreadEntry[]): DayGroup[] {
  if (entries.length === 0) return [];
  const buckets = new Map<string, LenderThreadEntry[]>();
  const order: string[] = [];
  for (const e of entries) {
    const d = new Date(e.sent_at);
    const key = d.toISOString().slice(0, 10);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(e);
  }
  return order.map((key) => ({ day: labelForDayKey(key), entries: buckets.get(key)! }));
}

function labelForDayKey(yyyymmdd: string): string {
  const d = new Date(yyyymmdd + "T00:00:00");
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return "Today";
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate()
  ) {
    return "Yesterday";
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  }
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function modeLabel(m: LenderThreadReplyMode): string {
  return m === "send_now" ? "Send now" : m === "instruct_ai" ? "Instruct Elara" : "Save draft";
}

function modeHint(m: LenderThreadReplyMode, lenderName: string): string {
  switch (m) {
    case "send_now":
      return `Sends your message directly to ${lenderName} via Gmail. Preview before send.`;
    case "instruct_ai":
      return `Tell Elara what to ask or say. AI's draft is shown for review before send.`;
    case "save_draft":
      return `Saves your message as a draft for later approval.`;
  }
}

function modePlaceholder(m: LenderThreadReplyMode): string {
  switch (m) {
    case "send_now":
      return "Write the email body as you would to the lender…";
    case "instruct_ai":
      return "Tell Elara what to say to the lender on your behalf…";
    case "save_draft":
      return "Write the message you want to save for later approval…";
  }
}
