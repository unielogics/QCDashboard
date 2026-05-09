"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useAITasks, useAITaskDecision } from "@/hooks/useApi";
import { FeedbackOutputType } from "@/lib/enums.generated";
import type { AITask } from "@/lib/types";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { AIInboxCard } from "@/components/AIInboxCard";

const SOURCE_FILTERS = ["all", "underwriting", "messages", "risk", "calendar", "documents", "pipeline", "rates", "broker_suggestion"] as const;
type SourceFilter = (typeof SOURCE_FILTERS)[number];

const PRIORITY_FILTERS = ["all", "high", "medium", "low"] as const;
type PriorityFilter = (typeof PRIORITY_FILTERS)[number];

type ActiveTab = "inbox" | "rules";

export default function AIInboxPage() {
  const { t } = useTheme();
  const { data: tasks = [] } = useAITasks();
  const [tab, setTab] = useState<ActiveTab>("inbox");
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [priority, setPriority] = useState<PriorityFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      tasks.filter(
        (task) =>
          (filter === "all" || task.source === filter) &&
          (priority === "all" || task.priority === priority) &&
          task.status === "pending",
      ),
    [tasks, filter, priority],
  );
  const selected = filtered.find((task) => task.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
      {/* Header with the AI Inbox / AI Rules tab toggle. AI Rules is the
          standing-config surface that earlier lived at /ai-tasks; folded in
          here so the Agent has one mental model — "AI" = both the queue of
          drafted actions awaiting my approval AND the rules that produce them. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>AI</h1>
        <div style={{ display: "inline-flex", background: t.surface, border: `1px solid ${t.line}`, borderRadius: 10, padding: 3 }}>
          <button
            onClick={() => setTab("inbox")}
            style={{
              all: "unset",
              cursor: "pointer",
              padding: "6px 14px",
              borderRadius: 7,
              fontSize: 12.5,
              fontWeight: 700,
              background: tab === "inbox" ? t.ink : "transparent",
              color: tab === "inbox" ? t.inverse : t.ink2,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="bolt" size={12} /> Inbox
            {tab === "inbox" && filtered.length > 0 && (
              <span style={{ fontSize: 10.5, fontWeight: 800, opacity: 0.85 }}>{filtered.length}</span>
            )}
          </button>
          <button
            onClick={() => setTab("rules")}
            style={{
              all: "unset",
              cursor: "pointer",
              padding: "6px 14px",
              borderRadius: 7,
              fontSize: 12.5,
              fontWeight: 700,
              background: tab === "rules" ? t.ink : "transparent",
              color: tab === "rules" ? t.inverse : t.ink2,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="spark" size={12} /> Rules
          </button>
        </div>
        <div style={{ flex: 1 }} />
        {tab === "inbox" && (
          <>
            <div style={{ display: "flex", gap: 4 }}>
              {PRIORITY_FILTERS.map((p) => (
                <button key={p} onClick={() => setPriority(p)} style={{
                  padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: priority === p ? (p === "high" ? t.dangerBg : p === "medium" ? t.warnBg : t.brandSoft) : "transparent",
                  color: priority === p ? t.ink : t.ink3,
                  border: `1px solid ${priority === p ? t.line : "transparent"}`,
                  textTransform: "capitalize",
                  cursor: "pointer",
                }}>{p}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {SOURCE_FILTERS.map((s) => (
                <button key={s} onClick={() => setFilter(s)} style={{
                  padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: filter === s ? t.brandSoft : "transparent",
                  color: filter === s ? t.ink : t.ink3,
                  border: `1px solid ${filter === s ? t.line : "transparent"}`,
                  textTransform: "capitalize",
                  cursor: "pointer",
                }}>{s}</button>
              ))}
            </div>
          </>
        )}
      </div>

      {tab === "inbox" ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(380px, 1fr) 2fr", gap: 14, flex: 1, minHeight: 0 }}>
          {/* Master list */}
          <Card pad={0} style={{ overflow: "auto" }}>
            {filtered.map((task) => (
              <button key={task.id} onClick={() => setSelectedId(task.id)} style={{
                width: "100%", textAlign: "left", padding: "12px 16px",
                borderBottom: `1px solid ${t.line}`,
                background: selected?.id === task.id ? t.brandSoft : "transparent",
                borderLeft: `3px solid ${task.priority === "high" ? t.danger : task.priority === "medium" ? t.warn : t.line}`,
                cursor: "pointer",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  {task.source === "broker_suggestion" ? (
                    <Pill bg={t.goldSoft} color={t.gold}>
                      <Icon name="user" size={9} stroke={2.4} /> broker suggestion
                    </Pill>
                  ) : (
                    <Pill>{task.source}</Pill>
                  )}
                  <Pill bg={task.priority === "high" ? t.dangerBg : task.priority === "medium" ? t.warnBg : t.chip} color={task.priority === "high" ? t.danger : task.priority === "medium" ? t.warn : t.ink2}>
                    {task.priority}
                  </Pill>
                  {task.loan_id && (
                    <span style={{ marginLeft: "auto", fontSize: 10.5, fontFamily: "ui-monospace, SF Mono, monospace", color: t.ink3 }}>
                      {task.loan_id.slice(0, 8)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, marginBottom: 2 }}>{task.title}</div>
                <div style={{ fontSize: 11.5, color: t.ink3 }}>conf {(task.confidence * 100).toFixed(0)}% · {task.agent}</div>
              </button>
            ))}
            {filtered.length === 0 && <div style={{ padding: 24, color: t.ink3, fontSize: 13 }}>No pending tasks.</div>}
          </Card>

          {/* Detail */}
          <Card pad={0}>
            {selected ? <Detail task={selected} key={selected.id} /> : <div style={{ padding: 24, color: t.ink3 }}>Select a task to view details.</div>}
          </Card>
        </div>
      ) : (
        <RulesPanel t={t} />
      )}
    </div>
  );
}

// AI Rules surface — the standing config that produces the queue you see in
// the Inbox tab. Lives next to the live work queue (rather than a separate
// page) so the Agent has a single mental model for "the AI." The engine that
// evaluates these rules ships in P1; this view is the configuration shell.
function RulesPanel({ t }: { t: ReturnType<typeof useTheme>["t"] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <Card pad={18}>
        <SectionLabel>My Rules</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.6 }}>
            Standing AI tasks scoped to your book. Each rule generates entries
            in the Inbox tab when its condition fires. The engine ships in P1;
            today this is the configuration shell.
          </div>
          <RulePlaceholder
            t={t}
            title="Stale-lead nudge"
            description="If no contact in 7 days, draft a follow-up message for my approval."
          />
          <RulePlaceholder
            t={t}
            title="Document chase"
            description="When a deal hits ready_for_lending, request the standard funding-side docs."
          />
          <RulePlaceholder
            t={t}
            title="Closing timeline alert"
            description="When a closing date is ≤ 14 days and any required doc is missing, surface it as high priority."
          />
        </div>
      </Card>

      <Card pad={18}>
        <SectionLabel>Per-Client / Per-Deal Rules</SectionLabel>
        <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.6 }}>
          For client-specific or deal-specific tuning, configure on the
          individual record:
        </div>
        <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12.5, color: t.ink2, lineHeight: 1.7 }}>
          <li>Open a Client → AI rules section on their workspace</li>
          <li>Open a Deal in the Pipeline → per-deal AI rules</li>
        </ul>
        <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: t.surface2, border: `1px solid ${t.line}`, fontSize: 11.5, color: t.ink3, lineHeight: 1.55 }}>
          <strong style={{ color: t.ink2 }}>Compliance note:</strong> AI drafts
          for borrower-facing messages always require Agent approval. The
          firm-wide compliance policy (no &quot;you are approved&quot; / &quot;guaranteed
          rate&quot; phrasing) is enforced at prompt level — these rules can&apos;t
          override it.
        </div>
      </Card>
    </div>
  );
}

function RulePlaceholder({
  t,
  title,
  description,
}: {
  t: ReturnType<typeof useTheme>["t"];
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background: t.surface2,
        border: `1px dashed ${t.line}`,
        opacity: 0.85,
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="spark" size={12} />
        {title}
        <Pill bg={t.chip} color={t.ink3}>P1</Pill>
      </div>
      <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 4 }}>{description}</div>
    </div>
  );
}

function sourceHref(source: AITask["source"], loanId: string | null): string {
  // Map AI task source to the screen that originated it.
  switch (source) {
    case "underwriting": return loanId ? `/loans/${loanId}` : "/pipeline";
    case "messages":     return loanId ? `/loans/${loanId}` : "/messages";
    case "risk":         return loanId ? `/loans/${loanId}` : "/pipeline";
    case "calendar":     return "/calendar";
    case "documents":    return loanId ? `/loans/${loanId}` : "/documents";
    case "pipeline":     return "/pipeline";
    case "rates":        return "/rates";
    default:             return loanId ? `/loans/${loanId}` : "/pipeline";
  }
}

function Detail({ task }: { task: AITask }) {
  const { t } = useTheme();
  const decision = useAITaskDecision();
  const [editMode, setEditMode] = useState(false);
  const [draftJson, setDraftJson] = useState<string>("");
  const [editError, setEditError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Reset edit state when task changes
  useEffect(() => {
    setEditMode(false);
    setDraftJson(task.draft_payload ? JSON.stringify(task.draft_payload, null, 2) : "");
    setEditError(null);
    setFeedback(null);
  }, [task.id]);

  const handleApprove = async () => {
    setEditError(null);
    setFeedback(null);
    let editedPayload: Record<string, unknown> | undefined = undefined;
    if (editMode) {
      try {
        editedPayload = JSON.parse(draftJson);
      } catch (e) {
        setEditError("Drafted payload is not valid JSON.");
        return;
      }
    }
    try {
      await decision.mutateAsync({
        taskId: task.id,
        decision: "approved",
        edited_payload: editedPayload ?? null,
        loanId: task.loan_id ?? undefined,
      });
      setFeedback("Approved & queued for execution.");
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Failed to approve.");
    }
  };

  const handleDismiss = async () => {
    setEditError(null);
    setFeedback(null);
    try {
      await decision.mutateAsync({
        taskId: task.id,
        decision: "dismissed",
        loanId: task.loan_id ?? undefined,
      });
      setFeedback("Dismissed.");
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Failed to dismiss.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: 20, borderBottom: `1px solid ${t.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
          <Pill>{task.source}</Pill>
          <Pill bg={task.priority === "high" ? t.dangerBg : t.chip} color={task.priority === "high" ? t.danger : t.ink2}>{task.priority}</Pill>
          <span style={{ fontSize: 11, color: t.ink3 }}>· {task.agent} · conf {(task.confidence * 100).toFixed(0)}%</span>

          {/* Source jump — bounces to whichever screen the agent came from */}
          <Link
            href={sourceHref(task.source, task.loan_id)}
            style={{
              marginLeft: "auto",
              fontSize: 12,
              color: t.ink2,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 9px",
              borderRadius: 7,
              border: `1px solid ${t.line}`,
              textDecoration: "none",
            }}
          >
            <Icon name="external" size={11} /> Open source
          </Link>

          {task.loan_id && (
            <Link
              href={`/loans/${task.loan_id}`}
              style={{
                fontSize: 12,
                color: t.petrol,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "5px 9px",
                borderRadius: 7,
                border: `1px solid ${t.petrol}40`,
                background: t.petrolSoft,
                textDecoration: "none",
              }}
            >
              Open loan <Icon name="chevR" size={12} />
            </Link>
          )}
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: t.ink, margin: 0 }}>{task.title}</h2>
        <div style={{ fontSize: 13, color: t.ink2, marginTop: 8 }}>{task.summary}</div>
      </div>

      <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
        {/* Plain-language card for cadence-spawned tasks (Phase 5).
            The human-readable framing — What / Why / What happens if I
            approve — sits ABOVE the technical drafted-artifact view
            for these. Older tasks (non-cadence) keep the original
            detail-only layout. */}
        {task.action?.startsWith("cadence_") || task.action?.startsWith("confirm_") ? (
          <div style={{ marginBottom: 16 }}>
            <AIInboxCard
              task={task}
              onApprove={handleApprove}
              onDismiss={handleDismiss}
              onEdit={() => setEditMode(true)}
            />
          </div>
        ) : null}

        <SectionLabel action={
          editMode ? (
            <button onClick={() => setEditMode(false)} style={{ background: "transparent", border: "none", color: t.ink3, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Cancel edit</button>
          ) : (
            task.draft_payload ? (
              <button onClick={() => setEditMode(true)} style={{ background: "transparent", border: "none", color: t.petrol, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Edit draft</button>
            ) : null
          )
        }>
          Drafted artifact ({task.action})
        </SectionLabel>
        {editMode ? (
          <textarea
            value={draftJson}
            onChange={(e) => setDraftJson(e.target.value)}
            style={{
              width: "100%",
              minHeight: 200,
              padding: 12,
              borderRadius: 10,
              border: `1px solid ${t.line}`,
              background: t.surface2,
              color: t.ink,
              fontFamily: "ui-monospace, SF Mono, monospace",
              fontSize: 12,
              lineHeight: 1.5,
              outline: "none",
              resize: "vertical",
            }}
          />
        ) : (
          <DraftedArtifactView payload={task.draft_payload} action={task.action} t={t} />
        )}
        {editError && <div style={{ marginTop: 8, color: t.danger, fontSize: 12, fontWeight: 700 }}>{editError}</div>}

        {/* Confidence bar */}
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <SectionLabel>Confidence</SectionLabel>
            <div style={{ fontSize: 12, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"' }}>{(task.confidence * 100).toFixed(0)}%</div>
          </div>
          <div style={{ height: 6, background: t.line, borderRadius: 999, overflow: "hidden" }}>
            <div style={{
              width: `${task.confidence * 100}%`,
              height: "100%",
              background: task.confidence >= 0.85 ? t.profit : task.confidence >= 0.7 ? t.warn : t.danger,
            }} />
          </div>
        </div>

        {/* Operator feedback — rolls into 'avoid these patterns' on the next
            AI run for this loan (services/ai/context.assemble_loan_context). */}
        <div style={{ marginTop: 18 }}>
          <SectionLabel>Operator feedback</SectionLabel>
          <FeedbackWidget
            outputType={FeedbackOutputType.AI_TASK}
            outputId={task.id}
            loanId={task.loan_id ?? null}
          />
        </div>
      </div>

      <div style={{ padding: 16, borderTop: `1px solid ${t.line}`, display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
        {feedback && <span style={{ flex: 1, fontSize: 12, color: t.ink2, fontWeight: 600 }}>{feedback}</span>}
        <button
          onClick={handleDismiss}
          disabled={decision.isPending}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            color: t.ink3,
            fontSize: 13,
            fontWeight: 700,
            background: "transparent",
            border: "none",
            cursor: decision.isPending ? "wait" : "pointer",
          }}
        >
          Dismiss
        </button>
        <button
          onClick={() => setEditMode((m) => !m)}
          disabled={decision.isPending || !task.draft_payload}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: t.surface2,
            color: t.ink,
            fontSize: 13,
            fontWeight: 700,
            border: `1px solid ${t.line}`,
            cursor: !task.draft_payload ? "not-allowed" : decision.isPending ? "wait" : "pointer",
            opacity: !task.draft_payload ? 0.5 : 1,
          }}
        >
          {editMode ? "Editing…" : "Edit"}
        </button>
        <button
          onClick={handleApprove}
          disabled={decision.isPending}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            background: t.brand,
            color: t.inverse,
            fontSize: 13,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            border: "none",
            cursor: decision.isPending ? "wait" : "pointer",
            opacity: decision.isPending ? 0.6 : 1,
          }}
        >
          <Icon name="check" size={14} /> {decision.isPending ? "Working…" : "Approve & Run"}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// DraftedArtifactView — humanized renderer for task.draft_payload.
//
// The earlier implementation dumped JSON.stringify(payload) into the right
// pane, which is correct data but unreadable for a non-engineer. This
// component renders the common payload shapes (scheduled_followup,
// email_draft, message_draft, doc_request, etc.) as a friendly preview:
// title up top, supporting fields as labeled rows / pills, dates formatted,
// internal IDs hidden. Unrecognized fields collapse into a "raw payload"
// disclosure for debugging.
// ────────────────────────────────────────────────────────────────────────────

const HIDDEN_KEYS = new Set([
  "loan_id",
  "deal_id",
  "client_id",
  "borrower_id",
  "relative_days",
]);

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

function formatDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  // Friendly local format: "Thu, May 8 · 10:00 AM"
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function humanLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function DraftedArtifactView({
  payload,
  action,
  t,
}: {
  payload: Record<string, unknown> | null;
  action: string;
  t: ReturnType<typeof useTheme>["t"];
}) {
  if (!payload) {
    return (
      <div style={{ background: t.surface2, borderRadius: 10, padding: 14, fontSize: 13, color: t.ink3 }}>
        No drafted content yet for action <code style={{ background: t.chip, padding: "1px 5px", borderRadius: 4 }}>{action}</code>.
      </div>
    );
  }

  // Known fields, rendered prominently
  const title = (payload.title as string | undefined) ?? (payload.subject as string | undefined);
  const body = (payload.body as string | undefined) ?? (payload.message as string | undefined) ?? (payload.summary as string | undefined);
  const dueAt = formatDate(payload.due_at) ?? formatDate(payload.starts_at) ?? formatDate(payload.scheduled_at);
  const kind = payload.kind as string | undefined;
  const owner = payload.owner as string | undefined;
  const priority = payload.priority as string | undefined;
  const channel = payload.channel as string | undefined;
  const to = payload.to as string | undefined;
  const cta = payload.cta as string | undefined;

  // Anything we didn't pluck explicitly that isn't an internal id, isn't
  // empty, and isn't already shown in the dedicated rows above.
  const consumed = new Set([
    "title", "subject",
    "body", "message", "summary",
    "due_at", "starts_at", "scheduled_at",
    "kind", "owner", "priority", "channel", "to", "cta",
  ]);
  const extras = Object.entries(payload).filter(
    ([k, v]) => !consumed.has(k) && !HIDDEN_KEYS.has(k) && !isEmptyValue(v),
  );

  return (
    <div
      style={{
        background: t.surface2,
        border: `1px solid ${t.line}`,
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {title && (
        <div style={{ fontSize: 14, fontWeight: 700, color: t.ink, lineHeight: 1.45 }}>
          {title}
        </div>
      )}

      {(kind || owner || priority || channel) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {kind && <Pill>{humanLabel(kind)}</Pill>}
          {owner && (
            <Pill bg={t.petrolSoft} color={t.petrol}>
              <Icon name="user" size={9} stroke={2.4} /> {humanLabel(owner)}
            </Pill>
          )}
          {priority && (
            <Pill
              bg={priority === "high" ? t.dangerBg : priority === "medium" ? t.warnBg : t.chip}
              color={priority === "high" ? t.danger : priority === "medium" ? t.warn : t.ink2}
            >
              {humanLabel(priority)} priority
            </Pill>
          )}
          {channel && <Pill bg={t.brandSoft} color={t.brand}>via {channel}</Pill>}
        </div>
      )}

      {to && (
        <div style={{ fontSize: 12.5, color: t.ink2 }}>
          <span style={{ color: t.ink3, fontWeight: 700, marginRight: 6 }}>TO:</span>
          {to}
        </div>
      )}

      {body && (
        <div
          style={{
            fontSize: 13,
            color: t.ink2,
            whiteSpace: "pre-wrap",
            lineHeight: 1.55,
            padding: "10px 12px",
            background: t.surface,
            border: `1px solid ${t.line}`,
            borderRadius: 9,
          }}
        >
          {body}
        </div>
      )}

      {dueAt && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: t.ink2 }}>
          <Icon name="cal" size={13} style={{ color: t.ink3 }} />
          <span style={{ color: t.ink3, fontWeight: 700 }}>Due:</span>
          {dueAt}
        </div>
      )}

      {cta && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: t.ink2 }}>
          <Icon name="arrowR" size={13} style={{ color: t.ink3 }} />
          <span style={{ color: t.ink3, fontWeight: 700 }}>Action:</span>
          {cta}
        </div>
      )}

      {extras.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {extras.map(([k, v]) => (
            <div key={k} style={{ fontSize: 12, color: t.ink3 }}>
              <span style={{ fontWeight: 700, marginRight: 6 }}>{humanLabel(k)}:</span>
              <span style={{ color: t.ink2 }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      <details style={{ marginTop: 4 }}>
        <summary
          style={{
            cursor: "pointer",
            fontSize: 11,
            color: t.ink3,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            userSelect: "none",
          }}
        >
          View raw payload
        </summary>
        <pre
          style={{
            marginTop: 8,
            background: t.surface,
            border: `1px solid ${t.line}`,
            borderRadius: 8,
            padding: 10,
            fontSize: 11,
            color: t.ink3,
            fontFamily: "ui-monospace, SF Mono, monospace",
            overflowX: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {JSON.stringify(payload, null, 2)}
        </pre>
      </details>
    </div>
  );
}
