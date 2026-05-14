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

import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
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

interface Props {
  loan: Loan;
  lender: Lender;
}

export function LenderThread({ loan, lender }: Props) {
  const { t } = useTheme();
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
        .mutateAsync({ loanId: loan.id, payload: { mode, text: text.trim() } })
        .then((res) => {
          setText("");
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
        payload: { mode, text: text.trim() },
      });
      setText("");
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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 65fr) minmax(0, 35fr)",
        gap: 12,
        alignItems: "start",
      }}
    >
      {/* LEFT 65% — Mailbox + composer */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <Card pad={0}>
          <div
            style={{
              padding: "10px 14px",
              borderBottom: `1px solid ${t.line}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="mail" size={13} stroke={2.5} />
              <SectionLabel>Conversation — {lender.name}</SectionLabel>
            </div>
            {isSuperAdmin && inboxIsMock && (
              <button
                type="button"
                onClick={() => setInjectOpen((v) => !v)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: `1px solid ${t.line}`,
                  fontSize: 11,
                  fontWeight: 700,
                  color: t.petrol,
                }}
              >
                {injectOpen ? "Cancel" : "Inject test email"}
              </button>
            )}
          </div>

          {injectOpen && isSuperAdmin && (
            <div
              style={{
                padding: 14,
                borderBottom: `1px solid ${t.line}`,
                background: t.surface2,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 11, color: t.ink3, lineHeight: 1.5 }}>
                Dev-only mock-inbox injector. Writes a synthetic inbound
                Message(from_role=LENDER) row — same shape the real
                Gmail poller produces.
              </div>
              <input
                value={injectFrom}
                onChange={(e) => setInjectFrom(e.target.value)}
                placeholder="from email (lender)"
                style={inputStyle(t)}
              />
              <input
                value={injectSubject}
                onChange={(e) => setInjectSubject(e.target.value)}
                placeholder="subject"
                style={inputStyle(t)}
              />
              <textarea
                value={injectBody}
                onChange={(e) => setInjectBody(e.target.value)}
                placeholder="paste the email body (eg from an .eml file)"
                rows={5}
                style={{ ...inputStyle(t), fontFamily: "inherit", resize: "vertical" }}
              />
              <button
                type="button"
                onClick={handleInject}
                disabled={inject.isPending}
                style={{ ...primaryButton(t), opacity: inject.isPending ? 0.6 : 1 }}
              >
                {inject.isPending ? "Injecting…" : "Inject as inbound lender email"}
              </button>
            </div>
          )}

          <div>
            {thread.isLoading ? (
              <div style={{ padding: 14, fontSize: 12.5, color: t.ink3 }}>
                Loading thread…
              </div>
            ) : grouped.length === 0 ? (
              <div style={{ padding: 14, fontSize: 12.5, color: t.ink3 }}>
                No messages yet. {canPost ? "Send the first one below." : ""}
              </div>
            ) : (
              grouped.map(({ day, entries }) => (
                <div key={day}>
                  <DayDivider t={t} label={day} />
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
        </Card>

        {canPost && (
          <Card pad={0}>
            <div
              style={{
                padding: "10px 14px",
                borderBottom: `1px solid ${t.line}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <SectionLabel>Reply</SectionLabel>
              <div style={{ display: "flex", gap: 6 }}>
                {(["send_now", "instruct_ai", "save_draft"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: `1px solid ${mode === m ? t.brand : t.line}`,
                      background: mode === m ? t.brandSoft : t.surface,
                      fontSize: 11,
                      fontWeight: 700,
                      color: mode === m ? t.brand : t.ink3,
                    }}
                  >
                    {modeLabel(m)}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 11.5, color: t.ink3, lineHeight: 1.45 }}>
                {modeHint(mode, lender.name)}
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                placeholder={modePlaceholder(mode)}
                style={{
                  ...inputStyle(t),
                  fontFamily: "inherit",
                  resize: "vertical",
                  minHeight: 110,
                }}
              />
              {error && <div style={{ fontSize: 12, color: t.danger }}>{error}</div>}
              {lastNote && !error && (
                <div style={{ fontSize: 12, color: t.profit }}>{lastNote}</div>
              )}
              <button
                type="button"
                onClick={openPreviewOrSave}
                disabled={reply.isPending}
                style={{ ...primaryButton(t), opacity: reply.isPending ? 0.6 : 1 }}
              >
                {reply.isPending
                  ? "Working…"
                  : mode === "save_draft"
                  ? "Save as draft"
                  : "Preview…"}
              </button>
            </div>
          </Card>
        )}
      </div>

      {/* RIGHT 35% — stackable collapsible panels */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        <CollapsiblePanel
          loanId={loan.id}
          panelKey="ai-summary"
          title="AI summary"
          importance={summaryHasOpenAsks ? "high" : "med"}
          defaultOpen={true}
          rightBadge={
            summary.data ? (
              <Pill bg={t.brandSoft} color={t.brand}>
                {summary.data.message_count} msg
                {summary.data.message_count === 1 ? "" : "s"}
              </Pill>
            ) : null
          }
        >
          {summary.isLoading ? (
            <div style={{ fontSize: 12, color: t.ink3 }}>Generating summary…</div>
          ) : summary.data ? (
            <div style={{ fontSize: 12.5, color: t.ink2, lineHeight: 1.5 }}>
              <div style={{ color: t.ink, fontWeight: 600, marginBottom: 6 }}>
                {summary.data.headline}
              </div>
              {summary.data.open_asks.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <SubLabel t={t}>Open asks</SubLabel>
                  <ul
                    style={{
                      margin: "4px 0 0",
                      paddingLeft: 18,
                      color: t.ink2,
                      fontSize: 12,
                    }}
                  >
                    {summary.data.open_asks.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.data.suggested_next_reply && canPost && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 8,
                    background: t.brandSoft,
                    border: `1px solid ${t.line}`,
                  }}
                >
                  <SubLabel t={t}>Suggested reply</SubLabel>
                  <div
                    style={{
                      color: t.ink,
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      marginTop: 4,
                    }}
                  >
                    {summary.data.suggested_next_reply}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setText(summary.data?.suggested_next_reply ?? "");
                      setMode("send_now");
                    }}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      marginTop: 8,
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: t.brand,
                      textDecoration: "underline",
                    }}
                  >
                    Use as starting point ←
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: t.ink3 }}>Summary unavailable.</div>
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
              <Pill bg={t.warnBg} color={t.warn}>
                {lenderExtract.action_items.length}
              </Pill>
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
                <DealHealthPill t={t} health={livingProfile.deal_health} />
              ) : null
            }
          >
            <div style={{ fontSize: 12, color: t.ink2, lineHeight: 1.5 }}>
              {statusSummary ? (
                <div style={{ marginBottom: 8 }}>{statusSummary}</div>
              ) : null}
              {livingProfile?.bottlenecks && livingProfile.bottlenecks.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <SubLabel t={t}>Bottlenecks</SubLabel>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 4,
                      marginTop: 4,
                    }}
                  >
                    {livingProfile.bottlenecks.map((b) => (
                      <Pill key={b} bg={t.warnBg} color={t.warn}>
                        {b}
                      </Pill>
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
              <Pill
                bg={gmailCanSend ? t.profitBg : t.warnBg}
                color={gmailCanSend ? t.profit : t.warn}
              >
                {gmailCanSend ? "Ready" : "Not configured"}
              </Pill>
            }
          >
            <div style={{ fontSize: 12, color: t.ink2, lineHeight: 1.5 }}>
              {gmailCanSend
                ? "Send Now and Instruct AI will deliver via Gmail."
                : "Messages will be saved locally only — recipients will NOT receive them."}
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => gmailTest.mutate()}
                  disabled={gmailTest.isPending}
                  style={{
                    all: "unset",
                    cursor: gmailTest.isPending ? "wait" : "pointer",
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: `1px solid ${t.line}`,
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: t.brand,
                  }}
                >
                  {gmailTest.isPending ? "Testing…" : "Test Gmail"}
                </button>
              </div>
              {gmailTest.data ? (
                <div
                  style={{
                    marginTop: 8,
                    padding: "6px 8px",
                    borderRadius: 6,
                    background: gmailTest.data.ok ? t.profitBg : t.dangerBg,
                    color: gmailTest.data.ok ? t.profit : t.danger,
                    fontSize: 11.5,
                    lineHeight: 1.45,
                  }}
                >
                  {gmailTest.data.note}
                </div>
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

function DayDivider({
  t,
  label,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
}) {
  return (
    <div
      style={{
        padding: "8px 14px",
        background: t.surface2,
        borderTop: `1px solid ${t.line}`,
        borderBottom: `1px solid ${t.line}`,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 1.4,
        textTransform: "uppercase",
        color: t.ink3,
      }}
    >
      {label}
    </div>
  );
}

function DealHealthPill({
  t,
  health,
}: {
  t: ReturnType<typeof useTheme>["t"];
  health: "on_track" | "at_risk" | "stuck";
}) {
  const map = {
    on_track: { bg: t.profitBg, fg: t.profit, label: "On track" },
    at_risk: { bg: t.warnBg, fg: t.warn, label: "At risk" },
    stuck: { bg: t.dangerBg, fg: t.danger, label: "Stuck" },
  } as const;
  const cfg = map[health];
  return <Pill bg={cfg.bg} color={cfg.fg}>{cfg.label}</Pill>;
}

function SubLabel({
  t,
  children,
}: {
  t: ReturnType<typeof useTheme>["t"];
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: t.ink3,
      }}
    >
      {children}
    </div>
  );
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
  return m === "send_now" ? "Send now" : m === "instruct_ai" ? "Instruct AI" : "Save draft";
}

function modeHint(m: LenderThreadReplyMode, lenderName: string): string {
  switch (m) {
    case "send_now":
      return `Sends your message directly to ${lenderName} via Gmail. Preview before send.`;
    case "instruct_ai":
      return `Tell the AI what to ask or say. AI's draft is shown for review before send.`;
    case "save_draft":
      return `Saves your message as a draft for later approval.`;
  }
}

function modePlaceholder(m: LenderThreadReplyMode): string {
  switch (m) {
    case "send_now":
      return "Write the email body as you would to the lender…";
    case "instruct_ai":
      return "Tell the AI what to say to the lender on your behalf…";
    case "save_draft":
      return "Write the message you want to save for later approval…";
  }
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%",
    padding: "9px 12px",
    background: t.surface,
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    color: t.ink,
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  };
}

function primaryButton(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    padding: "10px 16px",
    borderRadius: 10,
    background: t.petrol,
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    textAlign: "center",
  };
}
