"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import {
  Btn,
  CellChip,
  Lbl,
  Linky,
  Note,
  PageHeader,
  Panel,
  Seg,
  Textarea,
  WarnLine,
  cx,
  type ChipTone,
} from "@/components/ds";
import { useAITasks, useAITaskDecision } from "@/hooks/useApi";
import { useActiveProfile } from "@/store/role";
import { FeedbackOutputType, Role } from "@/lib/enums.generated";
import type { AITask } from "@/lib/types";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { AIInboxCard } from "@/components/AIInboxCard";

const SOURCE_FILTERS = ["all", "underwriting", "messages", "risk", "calendar", "documents", "pipeline", "rates", "broker_suggestion"] as const;
type SourceFilter = (typeof SOURCE_FILTERS)[number];

const PRIORITY_FILTERS = ["all", "high", "medium", "low"] as const;
type PriorityFilter = (typeof PRIORITY_FILTERS)[number];

type ActiveTab = "inbox" | "rules";

/** high → red, medium → amber, everything else → neutral. */
function priorityTone(priority: string): ChipTone {
  return priority === "high" ? "bad" : priority === "medium" ? "warn" : "mut";
}

export default function AIInboxPage() {
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

  // Elara Inbox is an operator/agent surface — borrowers must not reach it,
  // even by typing the URL. Bounce CLIENT logins back to their dashboard.
  const profile = useActiveProfile();
  const router = useRouter();
  useEffect(() => {
    if (profile.role === Role.CLIENT) router.replace("/");
  }, [profile.role, router]);
  if (profile.role === Role.CLIENT) return null;

  return (
    // Full-height master/detail: the queue and the detail pane each scroll
    // inside themselves so the approve/dismiss bar never leaves the viewport.
    // Deliberately not .cg — that grid sizes to content and would drop the
    // footer below the fold.
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
      {/* Header with Elara Inbox / Elara Rules tab toggle. Elara Rules is the
          standing-config surface that earlier lived at /ai-tasks; folded in
          here so the Agent has one mental model — "AI" = both the queue of
          drafted actions awaiting my approval AND the rules that produce them. */}
      <PageHeader
        title="AI"
        actions={
          <Seg<ActiveTab>
            value={tab}
            onChange={setTab}
            ariaLabel="AI section"
            options={[
              {
                value: "inbox",
                label:
                  tab === "inbox" && filtered.length > 0 ? (
                    <>
                      Inbox <span className="tag">{filtered.length}</span>
                    </>
                  ) : (
                    "Inbox"
                  ),
              },
              { value: "rules", label: "Rules" },
            ]}
          />
        }
      />

      {tab === "inbox" && (
        <div className="row">
          <Lbl>Priority</Lbl>
          <Seg<PriorityFilter>
            value={priority}
            onChange={setPriority}
            ariaLabel="Filter by priority"
            as="filter"
            options={PRIORITY_FILTERS.map((p) => ({ value: p, label: humanLabel(p) }))}
          />
          <Lbl>Source</Lbl>
          <div className="row">
            {SOURCE_FILTERS.map((s) => (
              <Btn
                key={s}
                size="sm"
                variant={filter === s ? "pri" : "default"}
                aria-pressed={filter === s}
                onClick={() => setFilter(s)}
              >
                {humanLabel(s)}
              </Btn>
            ))}
          </div>
        </div>
      )}

      {tab === "inbox" ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(380px, 1fr) 2fr", gap: 14, flex: 1, minHeight: 0 }}>
          {/* Master list */}
          <Panel title="Queue" sub={`${filtered.length} pending`} noPad>
            <div className="panel-b" style={{ overflowY: "auto", minHeight: 0 }}>
              {filtered.map((task) => (
                <button
                  key={task.id}
                  onClick={() => setSelectedId(task.id)}
                  className={cx("pick", selected?.id === task.id && "on")}
                  aria-current={selected?.id === task.id}
                  style={{ width: "100%", textAlign: "left" }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row">
                      {task.source === "broker_suggestion" ? (
                        <CellChip tone="gold">
                          <Icon name="user" size={9} stroke={2.4} /> broker suggestion
                        </CellChip>
                      ) : (
                        <CellChip tone="mut">{task.source}</CellChip>
                      )}
                      <CellChip tone={priorityTone(task.priority)}>{task.priority}</CellChip>
                      {task.loan_id && (
                        <>
                          <span className="sp" />
                          <span className="sub num">{task.loan_id.slice(0, 8)}</span>
                        </>
                      )}
                    </div>
                    <div>
                      <b>{task.title}</b>
                    </div>
                    <div className="sub num">
                      conf {(task.confidence * 100).toFixed(0)}% · {task.agent}
                    </div>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && <div className="sub">No pending tasks.</div>}
            </div>
          </Panel>

          {/* Detail */}
          {selected ? (
            <Detail task={selected} key={selected.id} />
          ) : (
            <div className="panel">
              <div className="panel-b sub">Select a task to view details.</div>
            </div>
          )}
        </div>
      ) : (
        <RulesPanel />
      )}
    </div>
  );
}

// Elara Rules surface — the standing config that produces the queue you see in
// the Inbox tab. Lives next to the live work queue (rather than a separate
// page) so the Agent has a single mental model for "the AI." The engine that
// evaluates these rules ships in P1; this view is the configuration shell.
function RulesPanel() {
  return (
    <div className="cg">
      <Panel className="s6" title="My Rules">
        <p>
          Standing AI tasks scoped to your book. Each rule generates entries in
          the Inbox tab when its condition fires. The engine ships in P1; today
          this is the configuration shell.
        </p>
        <div className="ladder mt">
          <RulePlaceholder
            title="Stale-lead nudge"
            description="If no contact in 7 days, draft a follow-up message for my approval."
          />
          <RulePlaceholder
            title="Document chase"
            description="When a deal hits ready_for_lending, request the standard funding-side docs."
          />
          <RulePlaceholder
            title="Closing timeline alert"
            description="When a closing date is ≤ 14 days and any required doc is missing, surface it as high priority."
          />
        </div>
      </Panel>

      <Panel className="s6" title="Per-Client / Per-Deal Rules">
        <p>
          For client-specific or deal-specific tuning, configure on the
          individual record:
        </p>
        <ul className="mt">
          <li className="filerow">Open a Client → AI rules section on their workspace</li>
          <li className="filerow">Open a Deal in the Pipeline → per-deal AI rules</li>
        </ul>
        <Note>
          <div>
            <b>Compliance note:</b> AI drafts for borrower-facing messages always
            require Agent approval. The firm-wide compliance policy (no
            &quot;you are approved&quot; / &quot;guaranteed rate&quot; phrasing) is
            enforced at prompt level — these rules can&apos;t override it.
          </div>
        </Note>
      </Panel>
    </div>
  );
}

function RulePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="rung">
      <Icon name="spark" size={14} />
      <div className="rk">{title}</div>
      <div className="rq">{description}</div>
      <CellChip tone="mut">P1</CellChip>
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

  const confidencePct = (task.confidence * 100).toFixed(0);

  return (
    <Panel
      title={task.title}
      sub={`${task.agent} · conf ${confidencePct}%`}
      noPad
      actions={
        <>
          {/* Source jump — bounces to whichever screen the agent came from */}
          <Link href={sourceHref(task.source, task.loan_id)} className="btn sm">
            <Icon name="external" size={11} /> Open source
          </Link>
          {task.loan_id && (
            <Link href={`/loans/${task.loan_id}`} className="btn sm pri">
              Open loan <Icon name="chevR" size={12} />
            </Link>
          )}
        </>
      }
    >
      <div className="panel-b" style={{ overflowY: "auto", minHeight: 0 }}>
        <div className="row">
          <CellChip tone="mut">{task.source}</CellChip>
          <CellChip tone={priorityTone(task.priority)}>{task.priority}</CellChip>
        </div>
        <p className="mt">{task.summary}</p>

        {/* Plain-language card for cadence-spawned tasks (Phase 5).
            The human-readable framing — What / Why / What happens if I
            approve — sits ABOVE the technical drafted-artifact view
            for these. Older tasks (non-cadence) keep the original
            detail-only layout. */}
        {task.action?.startsWith("cadence_") || task.action?.startsWith("confirm_") ? (
          <div className="mt">
            <AIInboxCard
              task={task}
              onApprove={handleApprove}
              onDismiss={handleDismiss}
              onEdit={() => setEditMode(true)}
            />
          </div>
        ) : null}

        <div className="row mt">
          <Lbl>Drafted artifact ({task.action})</Lbl>
          <span className="sp" />
          {editMode ? (
            <Linky onClick={() => setEditMode(false)}>Cancel edit</Linky>
          ) : task.draft_payload ? (
            <Linky onClick={() => setEditMode(true)}>Edit draft</Linky>
          ) : null}
        </div>
        {editMode ? (
          <Textarea
            aria-label="Drafted payload JSON"
            value={draftJson}
            onChange={(e) => setDraftJson(e.target.value)}
            style={{ width: "100%", minHeight: 200, resize: "vertical" }}
          />
        ) : (
          <DraftedArtifactView payload={task.draft_payload} action={task.action} />
        )}
        {editError && <WarnLine className="mt">{editError}</WarnLine>}

        {/* Confidence bar */}
        <div className="meter mt">
          <div className="mn">Confidence</div>
          <div className="track">
            <div
              className="fill"
              style={{
                width: `${task.confidence * 100}%`,
                background:
                  task.confidence >= 0.85
                    ? "var(--ok)"
                    : task.confidence >= 0.7
                      ? "var(--warn)"
                      : "var(--danger)",
              }}
            />
          </div>
          <div className="mv num">{confidencePct}%</div>
        </div>

        {/* Operator feedback — rolls into 'avoid these patterns' on the next
            AI run for this loan (services/ai/context.assemble_loan_context). */}
        <div className="mt">
          <Lbl>Operator feedback</Lbl>
          <FeedbackWidget
            outputType={FeedbackOutputType.AI_TASK}
            outputId={task.id}
            loanId={task.loan_id ?? null}
          />
        </div>
      </div>

      <div className="drawer-f">
        {feedback && <span className="sub">{feedback}</span>}
        <span className="sp" />
        <Btn onClick={handleDismiss} disabled={decision.isPending}>
          Dismiss
        </Btn>
        <Btn
          onClick={() => setEditMode((m) => !m)}
          disabled={decision.isPending || !task.draft_payload}
        >
          {editMode ? "Editing…" : "Edit"}
        </Btn>
        <Btn variant="pri" onClick={handleApprove} disabled={decision.isPending}>
          <Icon name="check" size={14} /> {decision.isPending ? "Working…" : "Approve & Run"}
        </Btn>
      </div>
    </Panel>
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
}: {
  payload: Record<string, unknown> | null;
  action: string;
}) {
  if (!payload) {
    return (
      <Note>
        <div>
          No drafted content yet for action <code className="tag">{action}</code>.
        </div>
      </Note>
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
    // The card is a document preview, so it keeps its own vertical rhythm
    // rather than inheriting the body's block spacing.
    <div className="card mt" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {title && <b>{title}</b>}

      {(kind || owner || priority || channel) && (
        <div className="row">
          {kind && <CellChip tone="mut">{humanLabel(kind)}</CellChip>}
          {owner && (
            <CellChip tone="pet">
              <Icon name="user" size={9} stroke={2.4} /> {humanLabel(owner)}
            </CellChip>
          )}
          {priority && (
            <CellChip tone={priorityTone(priority)}>{humanLabel(priority)} priority</CellChip>
          )}
          {channel && <CellChip tone="acc">via {channel}</CellChip>}
        </div>
      )}

      {to && (
        <div>
          <span className="lbl">TO:</span> {to}
        </div>
      )}

      {body && <div className="msg-b">{body}</div>}

      {dueAt && (
        <div className="row">
          <Icon name="cal" size={13} />
          <span className="lbl">Due</span>
          {dueAt}
        </div>
      )}

      {cta && (
        <div className="row">
          <Icon name="arrowR" size={13} />
          <span className="lbl">Action</span>
          {cta}
        </div>
      )}

      {extras.length > 0 && (
        <div>
          {extras.map(([k, v]) => (
            <div className="kv" key={k}>
              <span>{humanLabel(k)}</span>
              <b>{String(v)}</b>
            </div>
          ))}
        </div>
      )}

      <details>
        <summary className="linky">View raw payload</summary>
        <pre className="msg-b mt">{JSON.stringify(payload, null, 2)}</pre>
      </details>
    </div>
  );
}
