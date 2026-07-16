"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Icon } from "@/components/design-system/Icon";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { FileDropzone } from "@/components/design-system/FileDropzone";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
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
};

type ChatLine = { id: string; role: "assistant" | "user"; content: string; ts?: string };
type QueuedFile = { id: string; file: File; status: "ready" | "uploading" | "uploaded" | "error"; message?: string };

const SOURCE_LABEL: Record<IntelligenceValue["source"], string> = {
  verified: "Verified",
  extracted: "Extracted",
  estimated: "Estimated",
  unavailable: "—",
};

/**
 * Interactive admin cockpit for an AI Underwriter lead: a live chat + file
 * upload panel beside a live intelligence panel (fundability, KPIs, evidence
 * coverage, next step). Mirrors the client experience but is laid out for the
 * admin modal and themed via useTheme(). Reuses the shared intake helpers.
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
  const { t } = useTheme();
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
  const endRef = useRef<HTMLDivElement | null>(null);
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
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,0.85fr)", gap: 14, minHeight: 0, height: "100%" }}>
      {/* CHAT + UPLOAD */}
      <section style={{ display: "flex", flexDirection: "column", minHeight: 0, border: `1px solid ${t.line}`, borderRadius: 14, background: t.surface2, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", borderBottom: `1px solid ${t.line}` }}>
          <Icon name="spark" size={14} />
          <strong style={{ color: t.ink, fontSize: 13 }}>Underwriter conversation</strong>
          {fundability ? (
            <span style={{ marginLeft: "auto", ...pill(t, bannerTone(fundability.tone)) }}>{fundability.label}</span>
          ) : null}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {chat.length === 0 ? (
            <div style={{ color: t.ink3, fontSize: 13, textAlign: "center", margin: "auto", maxWidth: 320, lineHeight: 1.5 }}>
              Ask the AI underwriter about this file, or attach documents and re-run the review. This thread is internal — the client does not see it.
            </div>
          ) : (
            chat.map((line) =>
              line.role === "assistant" ? (
                <div key={line.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: t.brand, color: t.inverse, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, flexShrink: 0 }}>QC</div>
                  <div style={{ ...bubble(t), background: t.surface, color: t.ink2 }}>{line.content}</div>
                </div>
              ) : (
                <div key={line.id} style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div style={{ ...bubble(t), background: t.brandSoft, color: t.ink }}>{line.content}</div>
                </div>
              ),
            )
          )}
          {reviewing ? <div style={{ color: t.ink3, fontSize: 12, fontStyle: "italic" }}>Running AI review over the latest uploads…</div> : null}
          <div ref={endRef} />
        </div>

        {queue.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 14px", borderTop: `1px solid ${t.line}` }}>
            {queue.map((i) => (
              <span key={i.id} style={{ ...pill(t, i.status === "error" ? "danger" : "neutral"), display: "inline-flex", alignItems: "center", gap: 6 }}>
                {i.file.name}
                <span style={{ opacity: 0.7 }}>{i.status === "ready" ? "" : i.status}</span>
                {!uploading ? (
                  <button type="button" onClick={() => setQueue((q) => q.filter((x) => x.id !== i.id))} style={{ all: "unset", cursor: "pointer", color: t.ink3 }}>
                    <Icon name="x" size={11} />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}

        <div style={{ padding: "10px 14px", borderTop: `1px solid ${t.line}`, display: "flex", flexDirection: "column", gap: 8 }}>
          <FileDropzone onFiles={addFiles} disabled={uploading || busy} title="Drop files or click to attach" />
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask the AI underwriter…"
              style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.line}`, background: t.surface, color: t.ink, fontSize: 13, outline: "none" }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={busy || (!chatText.trim() && queue.length === 0)}
              style={{ ...qcBtnPrimary(t), opacity: busy || (!chatText.trim() && queue.length === 0) ? 0.6 : 1 }}
            >
              {busy ? "Sending…" : queue.length > 0 ? (chatText.trim() ? "Upload & send" : "Upload") : "Send"}
            </button>
          </div>
          {status ? <div style={{ color: t.warn, fontSize: 12 }}>{status}</div> : null}
        </div>
      </section>

      {/* INTELLIGENCE */}
      <section style={{ display: "flex", flexDirection: "column", minHeight: 0, border: `${intelligence?.lendingReady ? 2 : 1}px solid ${intelligence?.lendingReady ? t.profit : t.line}`, borderRadius: 14, background: t.surface, overflow: "hidden", boxShadow: intelligence?.lendingReady ? `0 0 0 3px ${t.profitBg}` : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", borderBottom: `1px solid ${t.line}` }}>
          <Icon name="spark" size={14} />
          <strong style={{ color: t.ink, fontSize: 13 }}>Live intelligence</strong>
          {intelligence?.lendingReady ? (
            <span style={{ ...pill(t, "profit"), display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon name="check" size={11} /> Ready for lending
            </span>
          ) : null}
          <button
            type="button"
            onClick={onRequestRerun ?? handleRunReview}
            disabled={reviewing}
            style={{ ...qcBtn(t), marginLeft: "auto", opacity: reviewing ? 0.6 : 1 }}
          >
            {reviewing ? "Re-running…" : "Re-run review"}
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
          {!intelligence ? (
            <div style={{ color: t.ink3, fontSize: 13, textAlign: "center", margin: "auto", maxWidth: 300, lineHeight: 1.5 }}>
              No AI screen yet. Attach the baseline documents and run the review to see the underwriting breakdown.
            </div>
          ) : (
            <>
              {intelligence.status ? (
                <div style={{ ...banner(t, bannerTone(intelligence.status.tone)) }}>
                  <strong style={{ display: "block", fontSize: 13 }}>{intelligence.status.label}</strong>
                  {intelligence.status.detail ? <span style={{ fontSize: 12, opacity: 0.9 }}>{intelligence.status.detail}</span> : null}
                </div>
              ) : null}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                {[intelligence.requestedAmount, intelligence.annualizedRevenue, intelligence.dscr, intelligence.ltv, intelligence.equity, intelligence.debtBurden].map((m, i) => (
                  <MetricTile key={i} metric={m} />
                ))}
              </div>

              {intelligence.oneNextStep ? (
                <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, padding: 12, background: t.surface2 }}>
                  <div style={sectionLabel(t)}>Next best action</div>
                  <p style={{ margin: "6px 0 0", color: t.ink2, fontSize: 13, lineHeight: 1.5 }}>{intelligence.oneNextStep}</p>
                </div>
              ) : null}

              {/* Full coverage / strengths / risks / file tables live in the
                  Workspace → Overview and Documents sub-tabs. This panel stays a
                  compact glance (readiness + metric tiles + next step) while chatting. */}
              <p style={{ margin: 0, color: t.ink3, fontSize: 11, lineHeight: 1.4 }}>
                See the Workspace tab for full evidence coverage, missing items, and documents.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function MetricTile({ metric }: { metric: IntelligenceValue }) {
  const { t } = useTheme();
  const unavailable = metric.source === "unavailable";
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 10, padding: "9px 11px", background: t.surface2 }}>
      <div style={{ color: t.ink3, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{metric.label}</div>
      <div style={{ color: unavailable ? t.ink3 : t.ink, fontSize: unavailable && metric.hint ? 13 : 16, fontWeight: 800, marginTop: 3 }}>{metric.value}</div>
      {/* When a number can't be computed, show what's needed instead of a bare source label. */}
      <div style={{ color: t.ink4, fontSize: 10, marginTop: 2 }}>{unavailable && metric.hint ? metric.hint : SOURCE_LABEL[metric.source]}</div>
    </div>
  );
}

function TwoColList({ title, items, tone }: { title: string; items: string[]; tone: "profit" | "warn" }) {
  const { t } = useTheme();
  const color = tone === "profit" ? t.profit : t.warn;
  return (
    <div>
      <div style={sectionLabel(t)}>{title}</div>
      <ul style={{ margin: "6px 0 0", paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
        {items.slice(0, 6).map((s, i) => (
          <li key={i} style={{ color: t.ink2, fontSize: 12, lineHeight: 1.45 }}>
            <span style={{ color }}>•</span> {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

function bubble(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    borderRadius: 12,
    padding: "9px 12px",
    fontSize: 13,
    lineHeight: 1.5,
    maxWidth: "82%",
    whiteSpace: "pre-wrap",
    border: `1px solid ${t.line}`,
  };
}

function sectionLabel(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return { color: t.ink3, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 };
}

function pill(t: ReturnType<typeof useTheme>["t"], tone: "neutral" | "profit" | "warn" | "danger"): CSSProperties {
  const map = {
    neutral: { bg: t.surface2, fg: t.ink2 },
    profit: { bg: t.profitBg, fg: t.profit },
    warn: { bg: t.warnBg, fg: t.warn },
    danger: { bg: t.dangerBg, fg: t.danger },
  }[tone];
  return { background: map.bg, color: map.fg, borderRadius: 999, padding: "3px 9px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" };
}

// Map the shared banner tone (green/red/amber) to the cockpit's pill/banner vocab.
function bannerTone(tone: "green" | "red" | "amber"): "profit" | "danger" | "warn" {
  if (tone === "green") return "profit";
  if (tone === "red") return "danger";
  return "warn";
}

function banner(t: ReturnType<typeof useTheme>["t"], tone: "profit" | "danger" | "warn"): CSSProperties {
  const isGood = tone === "profit";
  const isBad = tone === "danger";
  return {
    borderRadius: 12,
    padding: "11px 13px",
    background: isGood ? t.profitBg : isBad ? t.dangerBg : t.warnBg,
    color: isGood ? t.profit : isBad ? t.danger : t.warn,
    border: `1px solid ${t.line}`,
  };
}

function coverageTone(status: string): "profit" | "warn" | "danger" | "neutral" {
  const s = status.toLowerCase();
  if (s === "satisfied") return "profit";
  if (s === "partial" || s === "unclear") return "warn";
  if (s === "missing") return "danger";
  return "neutral";
}
