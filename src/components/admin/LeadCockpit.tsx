"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { V, type CssVars } from "@/components/design-system/cssVars";
import { Icon } from "@/components/design-system/Icon";
import { TypingDots } from "@/components/design-system/TypingDots";
import { FileDropzone } from "@/components/design-system/FileDropzone";
import { Btn, Callout, CellChip, cx, IconBtn, ItemRow, Lbl, type ChipTone } from "@/components/ds";
import { PfsFormModal, DebtScheduleFormModal, type PfsFormPayload, type DebtScheduleFormPayload } from "@/components/intake/DraftFinancialFormModal";
import {
  buildIntelligenceModel,
  cryptoId,
  DEALER_STAGE_ONE_KEYWORDS,
  evidenceMapByFileId,
  fundabilityBanner,
  humanizeClassification,
  isStageOneRequestedDoc,
  RE_STAGE_ONE_KEYWORDS,
  type IntakeResponse,
  type IntelligenceModel,
  type IntelligenceValue,
} from "@/lib/intake";
import {
  CashFlowBars,
  chartCard,
  chartCardWide,
  chartGrid,
  chartHeader,
  EquityChart,
  EvidenceCoverageTable,
  GaugeChart,
  IntelligenceKpi,
  intelligenceTables,
  MiniBarChart,
  MissingTable,
  RiskStrengthTable,
} from "@/components/intake/IntelligenceCharts";

/**
 * Transport for the admin cockpit. The parent injects Clerk-authenticated calls
 * against the /admin/ai-underwriter-leads/{intake_id} endpoints, so this
 * component never touches auth or URLs directly.
 */
export type ClientThreadMessage = { id: string; role: string; author_name?: string | null; content: string; created_at: string };
export type ClientThreadResponse = { messages: ClientThreadMessage[] };

export type LeadCockpitAdapter = {
  sendChat: (message: string) => Promise<IntakeResponse>;
  uploadInit: (payload: {
    requested_document_id: string | null;
    file_name: string;
    content_type: string;
    size_bytes: number;
  }) => Promise<{ file_id: string; upload_url: string; required_headers: Record<string, string> }>;
  uploadComplete: (fileId: string) => Promise<void>;
  runReview: () => Promise<IntakeResponse>;
  reload: () => Promise<IntakeResponse>;
  /** The CLIENT-visible (uploader) thread — separate from the private admin chat. */
  loadClientThread: () => Promise<ClientThreadResponse>;
  /** Post a message on behalf into the client thread (attributed as underwriter). */
  replyClientThread: (message: string) => Promise<ClientThreadResponse>;
  /** Push a PFS/debt-schedule requested-document onto the lead (idempotent —
   *  a safe no-op if it already exists). Dealer leads only; omitted by the
   *  parent for real-estate leads, where PFS/debt-schedule are not offered. */
  requestPfs?: (ownerName?: string) => Promise<void>;
  requestDebtSchedule?: () => Promise<void>;
  /** Fill out the on-screen PFS/debt-schedule on the client's behalf — same
   *  fallback the client sees on their own pages, usable here so admin/broker
   *  can close out the checklist without waiting on the client. */
  submitPfs?: (payload: PfsFormPayload) => Promise<void>;
  submitDebtSchedule?: (payload: DebtScheduleFormPayload) => Promise<void>;
};

type ChatLine = { id: string; role: "assistant" | "user"; content: string; ts?: string };
type QueuedFile = { id: string; file: File; status: "ready" | "uploading" | "uploaded" | "error"; message?: string };

/**
 * Interactive admin cockpit for an AI Underwriter lead: a live chat + file
 * upload panel beside a live intelligence panel (fundability, KPIs, evidence
 * coverage, next step). Mirrors the client experience but is laid out for the
 * admin modal. Reuses the shared intake helpers.
 */
export function LeadCockpit({
  response,
  adapter,
  variant,
  initialMessages,
  onResponse,
  onRequestRerun,
}: {
  response: IntakeResponse;
  adapter: LeadCockpitAdapter;
  variant?: string | null;
  initialMessages?: Array<{ id: string; role: string; content: string; created_at?: string }>;
  onResponse?: (r: IntakeResponse) => void;
  /** When provided, the cockpit's "Re-run review" button delegates to the
   *  parent's RunReviewDialog (themed confirm + live progress) instead of
   *  running inline. */
  onRequestRerun?: () => void;
}) {
  const [current, setCurrent] = useState<IntakeResponse>(response);
  const seedChat = (msgs?: Array<{ id: string; role: string; content: string; created_at?: string }>): ChatLine[] =>
    (msgs ?? []).map((m) => ({
      id: m.id || cryptoId(),
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
      ts: m.created_at,
    }));
  const [chat, setChat] = useState<ChatLine[]>(() => seedChat(initialMessages));
  const [chatText, setChatText] = useState("");
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [status, setStatus] = useState("");
  const [fullScreen, setFullScreen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [draftingDocKind, setDraftingDocKind] = useState<"pfs" | "debt_schedule" | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [requestingDoc, setRequestingDoc] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Signature of the last server thread we seeded, so we re-sync when the
  // parent supplies a genuinely different/newer message set (e.g. after reopen
  // or re-run) instead of keeping the stale first-mount snapshot.
  const seededSig = useRef<string>((initialMessages ?? []).map((m) => m.id).join("|"));

  useEffect(() => {
    setCurrent(response);
  }, [response]);

  // Re-seed chat from the server thread when it actually changes. Preserve any
  // optimistic local messages the user just sent that the server hasn't
  // returned yet (matched by content) so nothing the user typed disappears.
  useEffect(() => {
    const sig = (initialMessages ?? []).map((m) => m.id).join("|");
    if (sig === seededSig.current) return;
    seededSig.current = sig;
    setChat((local) => {
      const seeded = seedChat(initialMessages);
      const seededContents = new Set(seeded.map((m) => `${m.role}:${m.content}`));
      const pendingLocal = local.filter((m) => !seededContents.has(`${m.role}:${m.content}`));
      return [...seeded, ...pendingLocal];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat, reviewing]);

  // Grow the composer with multi-line input, up to the existing 160px cap.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [chatText]);

  useEffect(() => {
    if (!fullScreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullScreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullScreen]);

  const result = useMemo(
    () => (current.intake?.result_snapshot as Record<string, unknown> | null) ?? current.latest_review?.result ?? null,
    [current],
  );
  const bankability = useMemo(() => {
    const r = result as Record<string, unknown> | null;
    const b = r?.bankability_assessment;
    return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
  }, [result]);
  const fundability = useMemo(() => fundabilityBanner(result, bankability), [result, bankability]);
  const missingDocs = useMemo(() => {
    const uploadedIds = new Set((current.files ?? []).map((f) => f.requested_document_id).filter(Boolean));
    const keywords = variant === "real_estate_dscr_v1" ? RE_STAGE_ONE_KEYWORDS : DEALER_STAGE_ONE_KEYWORDS;
    // A requested doc is satisfied if a file is linked to it OR the backend
    // reconciled its status to uploaded from an analyzed file's classification.
    return (current.requested_documents ?? []).filter(
      (d) => d.required && isStageOneRequestedDoc(d, keywords) && d.status !== "uploaded" && !uploadedIds.has(d.id),
    );
  }, [current, variant]);
  // PFS/debt-schedule sit outside the Stage-1 keyword set above (they're
  // Stage-2/parallel documents), so they need their own not-yet-uploaded
  // check — mirrors dealer-ai-underwriter/page.tsx's category gate exactly.
  const missingPfsOrDebtDocs = useMemo(() => {
    const uploadedIds = new Set((current.files ?? []).map((f) => f.requested_document_id).filter(Boolean));
    return (current.requested_documents ?? []).filter(
      (d) => (d.category === "Personal Financials" || d.category === "Debts") && d.status !== "uploaded" && !uploadedIds.has(d.id),
    );
  }, [current]);
  const intelligence = useMemo<IntelligenceModel | null>(
    () => (result ? buildIntelligenceModel(current, result, missingDocs, fundability) : null),
    [current, result, missingDocs, fundability],
  );
  const evidenceByFile = useMemo(() => evidenceMapByFileId(result), [result]);

  function applyResponse(r: IntakeResponse) {
    setCurrent(r);
    onResponse?.(r);
  }

  function pushLine(role: "assistant" | "user", content: string) {
    if (!content) return;
    setChat((c) => [...c, { id: cryptoId(), role, content }]);
  }

  async function handleSend() {
    const text = chatText.trim();
    if ((!text && queue.length === 0) || busy) return;
    setBusy(true);
    setStatus("");
    try {
      if (queue.length > 0) await uploadQueue();
      if (text) {
        pushLine("user", text);
        setChatText("");
        const r = await adapter.sendChat(text);
        applyResponse(r);
        if (r.assistant_message) pushLine("assistant", r.assistant_message);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function addFiles(files: File[]) {
    setQueue((q) => {
      const seen = new Set(q.map((i) => `${i.file.name}:${i.file.size}`));
      const incoming = files
        .filter((f) => !seen.has(`${f.name}:${f.size}`))
        .map((file) => ({ id: cryptoId(), file, status: "ready" as const }));
      return [...q, ...incoming];
    });
  }

  async function uploadQueue() {
    const ready = queue.filter((i) => i.status === "ready" || i.status === "error");
    if (ready.length === 0) return;
    setUploading(true);
    try {
      for (const item of ready) {
        setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "uploading" } : i)));
        try {
          const init = await adapter.uploadInit({
            requested_document_id: null,
            file_name: item.file.name,
            content_type: item.file.type || "application/octet-stream",
            size_bytes: item.file.size,
          });
          await fetch(init.upload_url, { method: "PUT", body: item.file, headers: init.required_headers });
          await adapter.uploadComplete(init.file_id);
          setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "uploaded" } : i)));
        } catch (err) {
          setQueue((q) =>
            q.map((i) => (i.id === item.id ? { ...i, status: "error", message: err instanceof Error ? err.message : "Upload failed" } : i)),
          );
        }
      }
      const r = await adapter.reload();
      applyResponse(r);
      setQueue((q) => q.filter((i) => i.status !== "uploaded"));
      pushLine("assistant", "Files uploaded. Re-run the AI review to fold them into the latest breakdown.");
    } finally {
      setUploading(false);
    }
  }

  async function requestPfs() {
    if (!adapter.requestPfs || requestingDoc) return;
    setRequestingDoc(true);
    try {
      await adapter.requestPfs();
      const r = await adapter.reload();
      applyResponse(r);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not request the PFS.");
    } finally {
      setRequestingDoc(false);
    }
  }

  async function requestDebtSchedule() {
    if (!adapter.requestDebtSchedule || requestingDoc) return;
    setRequestingDoc(true);
    try {
      await adapter.requestDebtSchedule();
      const r = await adapter.reload();
      applyResponse(r);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not request the debt schedule.");
    } finally {
      setRequestingDoc(false);
    }
  }

  async function submitPfsForm(payload: PfsFormPayload) {
    if (!adapter.submitPfs) return;
    setDraftBusy(true);
    setDraftError(null);
    try {
      await adapter.submitPfs(payload);
      setDraftingDocKind(null);
      const r = await adapter.reload();
      applyResponse(r);
      pushLine("assistant", "Personal financial statement recorded.");
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Could not submit the PFS.");
    } finally {
      setDraftBusy(false);
    }
  }

  async function submitDebtScheduleForm(payload: DebtScheduleFormPayload) {
    if (!adapter.submitDebtSchedule) return;
    setDraftBusy(true);
    setDraftError(null);
    try {
      await adapter.submitDebtSchedule(payload);
      setDraftingDocKind(null);
      const r = await adapter.reload();
      applyResponse(r);
      pushLine("assistant", "Debt schedule recorded.");
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Could not submit the debt schedule.");
    } finally {
      setDraftBusy(false);
    }
  }

  async function handleRunReview() {
    if (reviewing) return;
    if (!window.confirm("Re-run the AI review on this lead's latest uploads?")) return;
    setReviewing(true);
    setStatus("");
    try {
      const r = await adapter.runReview();
      applyResponse(r);
      pushLine("assistant", r.assistant_message || "AI review complete — the intelligence panel is updated.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Re-run failed.");
    } finally {
      setReviewing(false);
    }
  }

  const files = current.files ?? [];

  return (
    // Bespoke track (rule 3) — and load-bearing: the parent Modal is size="stage"
    // and this height:100% + minHeight:0 chain is what lets both panels scroll
    // inside it instead of growing the dialog. Do not swap this for `.cg`.
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,0.85fr)", gap: 14, minHeight: 0, height: "100%" }}>
      {/* CHAT + UPLOAD */}
      <section
        className="panel"
        style={
          fullScreen
            ? // Full-bleed override: the panel IS the viewport in this state, so
              // its rounding goes with its place in the grid. `.panel` owns
              // border-radius; this is the one state where it has to lose.
              { minHeight: 0, position: "fixed", inset: 0, zIndex: 400, height: "100vh", width: "100vw", borderRadius: 0 }
            : { minHeight: 0 }
        }
      >
        <div className="panel-h">
          <Icon name="spark" size={14} />
          <strong>Underwriter conversation</strong>
          <span className="grow" />
          {fundability ? <CellChip tone={chipTone(fundability.tone)}>{fundability.label}</CellChip> : null}
          <IconBtn
            onClick={() => setFullScreen((v) => !v)}
            aria-label={fullScreen ? "Exit full screen" : "Full screen"}
            title={fullScreen ? "Exit full screen" : "Full screen"}
          >
            <Icon name={fullScreen ? "minimize" : "maximize"} size={14} />
          </IconBtn>
        </div>

        {/* The scroller: `.panel-b` supplies the padding and `flex: 1`; the rest
            is the height chain this cockpit depends on. */}
        <div className="panel-b" style={{ minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {chat.length === 0 ? (
            <div className="thr-empty" style={{ margin: "auto", maxWidth: 320, textAlign: "center" }}>
              Ask the AI underwriter about this file, or attach documents and re-run the review. This thread is internal — the client does not see it.
            </div>
          ) : (
            (() => {
              // A month of Q&A rendered as one wall reads like unrelated
              // messages invading the current conversation. Show recent days
              // in full; collapse everything older behind one control, and
              // mark day boundaries so history reads as history.
              const dayOf = (ts?: string) => (ts ? ts.slice(0, 10) : "");
              const days = Array.from(new Set(chat.map((l) => dayOf(l.ts)).filter(Boolean)));
              const recentDays = new Set(days.slice(-2)); // today + the previous chat day
              const older = chat.filter((l) => dayOf(l.ts) && !recentDays.has(dayOf(l.ts)));
              const visible = showHistory ? chat : chat.filter((l) => !dayOf(l.ts) || recentDays.has(dayOf(l.ts)));
              let lastDay = "";
              const out: React.ReactNode[] = [];
              if (!showHistory && older.length > 0) {
                out.push(
                  <button key="hist" type="button" className="btn sm" style={{ alignSelf: "center" }} onClick={() => setShowHistory(true)}>
                    Show earlier conversation ({older.length} message{older.length === 1 ? "" : "s"})
                  </button>,
                );
              }
              for (const line of visible) {
                const d = dayOf(line.ts);
                if (d && d !== lastDay) {
                  lastDay = d;
                  out.push(
                    <div key={`day-${d}`} className="thr-day">
                      {new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>,
                  );
                }
                out.push(
                  <div key={line.id} className={cx("msg", line.role === "assistant" ? "ai" : "mine")}>
                    <div className="msg-h">
                      <span className="msg-who">{line.role === "assistant" ? "Underwriter AI" : "You"}</span>
                    </div>
                    <div className="msg-b">{line.content}</div>
                  </div>,
                );
              }
              return out;
            })()
          )}
          {busy && !uploading ? (
            <div className="msg ai">
              <div className="msg-h">
                <span className="msg-who">Underwriter AI</span>
              </div>
              <div className="msg-b"><TypingDots label="Underwriter AI is thinking" /></div>
            </div>
          ) : null}
          {reviewing ? <div className="sub" style={{ fontStyle: "italic" }}>Running AI review over the latest uploads…</div> : null}
          <div ref={endRef} />
        </div>

        {queue.length > 0 ? (
          // Bottom band of a height:100% panel — the padding and hairline are
          // this strip's own geometry, not something `.row` describes.
          <div className="row" style={{ padding: "8px 14px", borderTop: "1px solid var(--line)" }}>
            {queue.map((i) => (
              <CellChip key={i.id} tone={i.status === "error" ? "bad" : "mut"}>
                {i.file.name}
                <span style={{ opacity: 0.7 }}>{i.status === "ready" ? "" : i.status}</span>
                {!uploading ? (
                  <button
                    type="button"
                    aria-label={`Remove ${i.file.name} from the upload queue`}
                    onClick={() => setQueue((q) => q.filter((x) => x.id !== i.id))}
                    style={{ all: "unset", cursor: "pointer", display: "inline-flex" }}
                  >
                    <Icon name="x" size={11} />
                  </button>
                ) : null}
              </CellChip>
            ))}
          </div>
        ) : null}

        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
          <FileDropzone onFiles={addFiles} disabled={uploading || busy} title="Drop files or click to attach" compact />
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            {/* A bare <textarea class="field grow"> rather than the <Textarea>
                wrapper: React 18 function components do not forward refs, and
                this one is ref-driven (auto-grow). Same classes either way. */}
            <textarea
              ref={textareaRef}
              className="field grow"
              aria-label="Message the AI underwriter"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter inserts a newline.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder="Ask the AI underwriter…  (Enter to send, Shift+Enter for a new line)"
              // Script-controlled geometry: the auto-grow effect writes
              // el.style.height directly, so the box is measured, not styled —
              // and a drag handle would fight it, which is why `resize: none`
              // deliberately overrides `textarea.field { resize: vertical }`.
              style={{ resize: "none", minHeight: 40, maxHeight: 160, overflowY: "auto", lineHeight: 1.45 }}
            />
            <Btn
              variant="pri"
              onClick={handleSend}
              disabled={busy || (!chatText.trim() && queue.length === 0)}
            >
              {busy ? "Sending…" : queue.length > 0 ? (chatText.trim() ? "Upload & send" : "Upload") : "Send"}
            </Btn>
          </div>
          {status ? <div className="warnline">{status}</div> : null}
        </div>
      </section>

      {/* INTELLIGENCE */}
      <section className={cx("panel", intelligence?.lendingReady && "ring-ok")} style={{ minHeight: 0 }}>
        <div className="panel-h">
          <Icon name="spark" size={14} />
          <strong>Live intelligence</strong>
          {intelligence?.lendingReady ? (
            <CellChip tone="ok">
              <Icon name="check" size={11} /> Ready for lending
            </CellChip>
          ) : null}
          <span className="grow" />
          <Btn onClick={onRequestRerun ?? handleRunReview} disabled={reviewing}>
            {reviewing ? "Re-running…" : "Re-run review"}
          </Btn>
        </div>

        <div className="panel-b" style={{ minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          {!intelligence ? (
            <div className="thr-empty" style={{ margin: "auto", maxWidth: 300, textAlign: "center" }}>
              No AI screen yet. Attach the baseline documents and run the review to see the underwriting breakdown.
            </div>
          ) : (
            <>
              {intelligence.status ? (
                <Callout tone={chipTone(intelligence.status.tone)}>
                  <div className="grid g4">
                    <strong>{intelligence.status.label}</strong>
                    {intelligence.status.detail ? <span className="sub">{intelligence.status.detail}</span> : null}
                  </div>
                </Callout>
              ) : null}

              <div className="kpis">
                {[intelligence.requestedAmount, intelligence.annualizedRevenue, intelligence.dscr, intelligence.ltv, intelligence.equity, intelligence.debtBurden].map((m, i) => (
                  <IntelligenceKpi key={i} metric={m} />
                ))}
              </div>

              {intelligence.oneNextStep ? (
                <Callout tone="acc">
                  <div className="grid g6">
                    <Lbl>Next best action</Lbl>
                    <p className="sub">{intelligence.oneNextStep}</p>
                  </div>
                </Callout>
              ) : null}

              <div style={chartGrid}>
                <div style={chartCard()}>
                  <div style={chartHeader}>
                    <strong>Debt service coverage</strong>
                  </div>
                  <GaugeChart value={intelligence.dscr.raw} />
                </div>

                <div style={chartCard()}>
                  <div style={chartHeader}>
                    <strong>Real estate equity / LTV</strong>
                  </div>
                  <EquityChart equity={intelligence.equity.raw} ltv={intelligence.ltv.raw} />
                </div>

                <div style={chartCardWide()}>
                  <div style={chartHeader}>
                    <strong>Cash flow stack</strong>
                    <span className="sub">Revenue / cash flow / debt service</span>
                  </div>
                  <CashFlowBars bars={intelligence.cashFlowBars} />
                </div>

                <div style={chartCard()}>
                  <div style={chartHeader}>
                    <strong>Year-to-year performance</strong>
                    <span className="sub">Tax / P&amp;L trend</span>
                  </div>
                  <MiniBarChart series={intelligence.yearlySeries} emptyLabel="Awaiting tax returns and YTD P&L figures." />
                </div>

                <div style={chartCard()}>
                  <div style={chartHeader}>
                    <strong>Month-to-month cash flow</strong>
                    <span className="sub">Bank statement trend</span>
                  </div>
                  <MiniBarChart series={intelligence.monthlySeries} emptyLabel="Awaiting six months of main operating bank statements." />
                </div>
              </div>

              <div style={intelligenceTables}>
                <div style={chartCard()}>
                  <div style={chartHeader}>
                    <strong>Evidence coverage</strong>
                    <span className="sub">{current.files.length} files</span>
                  </div>
                  <EvidenceCoverageTable rows={intelligence.coverage} />
                </div>
                <div style={chartCard()}>
                  <div style={chartHeader}>
                    <strong>Still needed</strong>
                    <span className="sub">{intelligence.missing.length} items</span>
                  </div>
                  <MissingTable rows={intelligence.missing} />
                </div>
              </div>

              <div style={intelligenceTables}>
                <RiskStrengthTable title="Strengths" rows={intelligence.strengths} tone="green" />
                <RiskStrengthTable title="Risks" rows={intelligence.risks} tone="amber" />
              </div>
            </>
          )}

          {/* Always visible, independent of whether an AI review has run yet —
              a brand-new lead with no documents should still let admin/broker
              request or fill out a PFS/debt-schedule immediately. */}
          {variant !== "real_estate_dscr_v1" && (adapter.requestPfs || adapter.requestDebtSchedule) ? (
            <div style={chartCard()}>
              <div style={chartHeader}>
                <strong>Financial forms</strong>
                <span className="sub">{missingPfsOrDebtDocs.length} open</span>
              </div>
              <div className="grid g8">
                <p className="sub">
                  Request a Personal Financial Statement or Debt Schedule from the client, or fill one out on
                  their behalf right here.
                </p>
                <div className="row">
                  {adapter.requestPfs ? (
                    <Btn onClick={requestPfs} disabled={requestingDoc}>
                      {requestingDoc ? "Requesting…" : "Request PFS"}
                    </Btn>
                  ) : null}
                  {adapter.requestDebtSchedule ? (
                    <Btn onClick={requestDebtSchedule} disabled={requestingDoc}>
                      {requestingDoc ? "Requesting…" : "Request debt schedule"}
                    </Btn>
                  ) : null}
                </div>
                {missingPfsOrDebtDocs.length ? (
                  <div className="grid g6">
                    {missingPfsOrDebtDocs.map((doc) => (
                      <ItemRow
                        key={doc.id}
                        right={
                          adapter.submitPfs || adapter.submitDebtSchedule ? (
                            <Btn
                              size="sm"
                              onClick={() => setDraftingDocKind(doc.category === "Personal Financials" ? "pfs" : "debt_schedule")}
                            >
                              Fill out online
                            </Btn>
                          ) : null
                        }
                      >
                        {doc.name}
                      </ItemRow>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {adapter.submitPfs ? (
        <PfsFormModal
          open={draftingDocKind === "pfs"}
          onClose={() => setDraftingDocKind(null)}
          ownerDefaultName={current.intake.full_name}
          busy={draftBusy}
          error={draftError}
          onSubmit={submitPfsForm}
        />
      ) : null}
      {adapter.submitDebtSchedule ? (
        <DebtScheduleFormModal
          open={draftingDocKind === "debt_schedule"}
          onClose={() => setDraftingDocKind(null)}
          businessNameDefault={current.intake.business_name ?? undefined}
          busy={draftBusy}
          error={draftError}
          onSubmit={submitDebtScheduleForm}
        />
      ) : null}
    </div>
  );
}

// Map the shared banner tone (green/red/amber) onto the chip/callout tone
// vocabulary. Sibling of bannerTone() below, which maps the same three onto the
// retired inline pill/banner names; both are kept while other callers migrate.
function chipTone(tone: "green" | "red" | "amber"): ChipTone {
  if (tone === "green") return "ok";
  if (tone === "red") return "bad";
  return "warn";
}

// ── retired inline-style helpers ────────────────────────────────────────────
// Superseded by the classes above (.msg-b, .lbl, .cellchip, .callout). Kept
// rather than deleted: removing them is a separate call, and `bannerTone` is
// still the documented mapping for the pill/banner names.

function bubble(): CSSProperties {
  return {
    borderRadius: 12,
    padding: "9px 12px",
    fontSize: 13,
    lineHeight: 1.5,
    maxWidth: "82%",
    whiteSpace: "pre-wrap",
    border: `1px solid ${V.line}`,
  };
}

function sectionLabel(): CSSProperties {
  return { color: V.ink3, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 };
}

function pill(tone: "neutral" | "profit" | "warn" | "danger"): CSSProperties {
  const map = {
    neutral: { bg: V.surface2, fg: V.ink2 },
    profit: { bg: V.profitBg, fg: V.profit },
    warn: { bg: V.warnBg, fg: V.warn },
    danger: { bg: V.dangerBg, fg: V.danger },
  }[tone];
  return { background: map.bg, color: map.fg, borderRadius: 999, padding: "3px 9px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" };
}

// Map the shared banner tone (green/red/amber) to the cockpit's pill/banner vocab.
function bannerTone(tone: "green" | "red" | "amber"): "profit" | "danger" | "warn" {
  if (tone === "green") return "profit";
  if (tone === "red") return "danger";
  return "warn";
}

function banner(tone: "profit" | "danger" | "warn"): CSSProperties {
  const isGood = tone === "profit";
  const isBad = tone === "danger";
  return {
    borderRadius: 12,
    padding: "11px 13px",
    background: isGood ? V.profitBg : isBad ? V.dangerBg : V.warnBg,
    color: isGood ? V.profit : isBad ? V.danger : V.warn,
    border: `1px solid ${V.line}`,
  };
}

function coverageTone(status: string): "profit" | "warn" | "danger" | "neutral" {
  const s = status.toLowerCase();
  if (s === "satisfied") return "profit";
  if (s === "partial" || s === "unclear") return "warn";
  if (s === "missing") return "danger";
  return "neutral";
}
