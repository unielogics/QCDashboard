"use client";

// Lender Thread — embedded under the Lender Connect card on the loan
// detail page. Three stacked surfaces:
//
//   1. Loan Living Profile (re-using loan.status_summary +
//      loan.living_profile populated by The Associate summarizer)
//   2. Lender-thread mini-summary (scoped to the lender conversation
//      via GET /loans/{id}/lender-thread/summary)
//   3. Dated timeline of inbound + outbound messages with the
//      sender name and channel pill
//   4. Reply composer with three modes:
//        • Send now   — outbound via Gmail, immediate
//        • Instruct AI — AI writes + sends the reply
//        • Save draft  — EmailDraft(status=PENDING), no send
//
// Super-admin + loan-exec see the composer; broker/client see the
// timeline with the lender identity redacted. Inject-test-email
// helper is super-admin only and shown only when USE_FAKE_INBOX is
// true (signalled via the connect-lender health probe).

import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import {
  useConnectLenderHealth,
  useInjectLenderEmail,
  useLenderThread,
  useLenderThreadReply,
  useLenderThreadSummary,
} from "@/hooks/useApi";
import type {
  Lender,
  LenderThreadEntry,
  LenderThreadReplyMode,
  Loan,
} from "@/lib/types";

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

  const inboxIsMock = useMemo(() => {
    const check = health.data?.checks.find((c) => c.name === "Gmail inbound");
    return check?.status === "warn"; // warn = USE_FAKE_INBOX=True
  }, [health.data]);

  const [text, setText] = useState("");
  const [mode, setMode] = useState<LenderThreadReplyMode>("send_now");
  const [error, setError] = useState<string | null>(null);
  const [lastNote, setLastNote] = useState<string | null>(null);

  const [injectOpen, setInjectOpen] = useState(false);
  const [injectFrom, setInjectFrom] = useState(
    lender.contact_email || lender.submission_email || "",
  );
  const [injectSubject, setInjectSubject] = useState("");
  const [injectBody, setInjectBody] = useState("");

  const livingProfile = loan.living_profile;
  const statusSummary = loan.status_summary;

  const handleSubmit = async () => {
    setError(null);
    setLastNote(null);
    if (!text.trim()) {
      setError("Write something before sending.");
      return;
    }
    try {
      const res = await reply.mutateAsync({
        loanId: loan.id,
        payload: { mode, text: text.trim() },
      });
      setText("");
      setLastNote(res.note);
    } catch (err) {
      setError((err as Error).message ?? "Reply failed.");
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Living Profile (loan-level Associate summary) */}
      {(statusSummary || livingProfile) && (
        <Card pad={0}>
          <div
            style={{
              padding: "10px 14px",
              borderBottom: `1px solid ${t.line}`,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="spark" size={12} stroke={2.5} />
            <SectionLabel>Living loan profile</SectionLabel>
            {livingProfile?.deal_health ? (
              <DealHealthPill t={t} health={livingProfile.deal_health} />
            ) : null}
          </div>
          <div style={{ padding: 14, fontSize: 12.5, color: t.ink2, lineHeight: 1.5 }}>
            {statusSummary ? (
              <div style={{ marginBottom: 8 }}>{statusSummary}</div>
            ) : null}
            {livingProfile?.bottlenecks && livingProfile.bottlenecks.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    color: t.ink3,
                    marginBottom: 4,
                  }}
                >
                  Bottlenecks
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {livingProfile.bottlenecks.map((b) => (
                    <Pill key={b} bg={t.warnBg} color={t.warn}>
                      {b}
                    </Pill>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Lender-thread mini-summary */}
      <Card pad={0}>
        <div
          style={{
            padding: "10px 14px",
            borderBottom: `1px solid ${t.line}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="ai" size={12} stroke={2.5} />
            <SectionLabel>Lender thread — AI summary</SectionLabel>
          </div>
          {summary.data ? (
            <Pill bg={t.brandSoft} color={t.brand}>
              {summary.data.message_count} msg{summary.data.message_count === 1 ? "" : "s"}
            </Pill>
          ) : null}
        </div>
        <div style={{ padding: 14, fontSize: 12.5, color: t.ink2, lineHeight: 1.5 }}>
          {summary.isLoading ? (
            <div style={{ color: t.ink3 }}>Generating summary…</div>
          ) : summary.data ? (
            <>
              <div style={{ color: t.ink, fontWeight: 600, marginBottom: 6 }}>
                {summary.data.headline}
              </div>
              {summary.data.open_asks.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: 1.2,
                      textTransform: "uppercase",
                      color: t.ink3,
                      marginBottom: 4,
                    }}
                  >
                    Open asks
                  </div>
                  <ul
                    style={{
                      margin: 0,
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
              {summary.data.suggested_next_reply && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 8,
                    background: t.brandSoft,
                    border: `1px solid ${t.line}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: 1.2,
                      textTransform: "uppercase",
                      color: t.brand,
                      marginBottom: 4,
                    }}
                  >
                    Suggested reply
                  </div>
                  <div style={{ color: t.ink, fontSize: 12.5, lineHeight: 1.5 }}>
                    {summary.data.suggested_next_reply}
                  </div>
                  {canPost && (
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
                      Use as starting point ↓
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ color: t.ink3 }}>Summary unavailable.</div>
          )}
        </div>
      </Card>

      {/* Dated timeline */}
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
          <SectionLabel>Conversation</SectionLabel>
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
            <div
              style={{
                fontSize: 11,
                color: t.ink3,
                lineHeight: 1.5,
              }}
            >
              Dev-only mock-inbox injector. Writes a synthetic inbound
              Message(from_role=LENDER) row — same shape the Pub/Sub
              consumer will produce. The from-email must match the
              connected lender&apos;s submission or contact address.
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
              style={{
                ...primaryButton(t),
                opacity: inject.isPending ? 0.6 : 1,
              }}
            >
              {inject.isPending ? "Injecting…" : "Inject as inbound lender email"}
            </button>
          </div>
        )}

        <div style={{ padding: 14 }}>
          {thread.isLoading ? (
            <div style={{ fontSize: 12.5, color: t.ink3 }}>Loading thread…</div>
          ) : thread.data && thread.data.entries.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {thread.data.entries.map((e) => (
                <TimelineEntry key={e.id} t={t} entry={e} />
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: t.ink3 }}>
              No messages yet. {canPost ? "Send the first one below." : ""}
            </div>
          )}
        </div>
      </Card>

      {/* Composer */}
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
          <div
            style={{
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div
              style={{
                fontSize: 11.5,
                color: t.ink3,
                lineHeight: 1.45,
              }}
            >
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
            {error && (
              <div style={{ fontSize: 12, color: t.danger }}>{error}</div>
            )}
            {lastNote && !error && (
              <div style={{ fontSize: 12, color: t.profit }}>{lastNote}</div>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={reply.isPending}
              style={{ ...primaryButton(t), opacity: reply.isPending ? 0.6 : 1 }}
            >
              {reply.isPending ? "Working…" : modeCta(mode)}
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function TimelineEntry({
  t,
  entry,
}: {
  t: ReturnType<typeof useTheme>["t"];
  entry: LenderThreadEntry;
}) {
  const ts = new Date(entry.sent_at);
  const isInbound = entry.kind === "inbound";
  const isDraft = entry.kind === "pending_draft";
  const isAI = entry.kind === "ai_outbound";

  const alignSelf = isInbound ? "flex-start" : "flex-end";
  const bg = isInbound
    ? t.surface2
    : isDraft
    ? t.warnBg
    : isAI
    ? t.petrolSoft
    : t.brandSoft;
  const border = isInbound ? t.line : t.line;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignSelf, maxWidth: "85%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 4,
          fontSize: 11,
          color: t.ink3,
        }}
      >
        <span style={{ fontWeight: 700, color: t.ink2 }}>{entry.sender_label}</span>
        <span>·</span>
        <time title={ts.toISOString()}>{formatRelative(ts)}</time>
        {isInbound && <Pill bg={t.profitBg} color={t.profit}>Inbound</Pill>}
        {entry.kind === "outbound" && <Pill bg={t.brandSoft} color={t.brand}>Outbound</Pill>}
        {isAI && <Pill bg={t.petrolSoft} color={t.petrol}>AI</Pill>}
        {isDraft && <Pill bg={t.warnBg} color={t.warn}>Pending draft</Pill>}
      </div>
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          background: bg,
          border: `1px solid ${border}`,
          fontSize: 12.5,
          color: t.ink,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
        }}
      >
        {entry.subject && isDraft ? (
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: t.ink3,
              marginBottom: 6,
            }}
          >
            Subject: {entry.subject}
          </div>
        ) : null}
        {entry.body}
      </div>
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
  return (
    <Pill bg={cfg.bg} color={cfg.fg}>
      {cfg.label}
    </Pill>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function modeLabel(m: LenderThreadReplyMode): string {
  return m === "send_now" ? "Send now" : m === "instruct_ai" ? "Instruct AI" : "Save draft";
}

function modeCta(m: LenderThreadReplyMode): string {
  return m === "send_now"
    ? "Send to lender"
    : m === "instruct_ai"
    ? "Have AI draft & send"
    : "Save as draft";
}

function modeHint(m: LenderThreadReplyMode, lenderName: string): string {
  switch (m) {
    case "send_now":
      return `Sends your message directly to ${lenderName} via Gmail. No approval step.`;
    case "instruct_ai":
      return `Tell the AI what to ask or say (e.g. "Ask for the appraisal report and a 30-day rate-lock quote"). The AI writes the email and sends it to ${lenderName}.`;
    case "save_draft":
      return `Saves your message as a draft. It will not be sent until you (or anyone with access) approves it from the Drafts panel.`;
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

function formatRelative(d: Date): string {
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
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
