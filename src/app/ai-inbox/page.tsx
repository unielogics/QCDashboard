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
  Panel,
  Seg,
  Textarea,
  WarnLine,
  cx,
  type ChipTone,
} from "@/components/ds";
import { useAITasks, useAITaskDecision, useCurrentUser, useDecideActionItem, useProposedActionItems } from "@/hooks/useApi";
import { FeedbackOutputType } from "@/lib/enums.generated";
import type { AITask, BucketAIActionItemQueueItem } from "@/lib/types";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { AIInboxCard } from "@/components/AIInboxCard";
import { ConfirmDialog } from "@/components/design-system/ConfirmDialog";
import { PageActionMenu } from "@/components/ds/PageActionMenu";

const SOURCE_FILTERS = ["all", "underwriting", "messages", "risk", "calendar", "documents", "pipeline", "rates", "broker_suggestion"] as const;
type SourceFilter = (typeof SOURCE_FILTERS)[number];

const PRIORITY_FILTERS = ["all", "high", "medium", "low"] as const;
type PriorityFilter = (typeof PRIORITY_FILTERS)[number];

type ActiveTab = "inbox" | "rules";

const ROUTE_FILTERS = ["all", "admin", "uploader", "share", "vendor"] as const;
type RouteFilter = (typeof ROUTE_FILTERS)[number];

/** high → red, medium → amber, everything else → neutral. */
function priorityTone(priority: string): ChipTone {
  return priority === "high" ? "bad" : priority === "medium" ? "warn" : "mut";
}

export default function AIInboxPage() {
  const { data: tasks = [] } = useAITasks();
  const { data: actionItems = [], isLoading: itemsLoading } = useProposedActionItems();
  const [routeFilter, setRouteFilter] = useState<RouteFilter>("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);
  const visibleItems = useMemo(
    () => actionItems.filter((item) => routeFilter === "all" || item.route === routeFilter),
    [actionItems, routeFilter],
  );
  const selectedItem = visibleItems.find((item) => item.id === selectedItemId) ?? visibleItems[0] ?? null;
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
  const { data: currentUser, isLoading: currentUserLoading } = useCurrentUser();
  const router = useRouter();
  useEffect(() => {
    if (currentUser?.role === "client") router.replace("/");
  }, [currentUser?.role, router]);
  if (currentUserLoading || !currentUser || currentUser.role === "client") return null;

  return (
    // Full-height master/detail: the queue and the detail pane each scroll
    // inside themselves so the approve/dismiss bar never leaves the viewport.
    // Deliberately not .cg — that grid sizes to content and would drop the
    // footer below the fold.
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
      <div className="ckhead">
        <div className="ckrow">
          <h1>Elara inbox</h1>
          <CellChip tone={visibleItems.length ? "warn" : "ok"}>{itemsLoading ? "…" : `${visibleItems.length} waiting`}</CellChip>
          <span className="sp" />
          <span className="sub">AI suggestions from every live room. Nothing here has been sent; every item waits for a person.</span>
          <Btn variant="pri" size="sm" onClick={() => visibleItems[0] && setSelectedItemId(visibleItems[0].id)} disabled={!visibleItems.length}>Review next</Btn>
          <PageActionMenu label="AI queue actions" items={[
            { label: "Open pipeline", href: "/pipeline" },
            { label: "Open files", href: "/admin/ai-underwriter-leads" },
          ]} />
        </div>
        <div className="cktabs" role="tablist" aria-label="AI section">
          <button type="button" role="tab" aria-selected={tab === "inbox"} className={tab === "inbox" ? "on" : undefined} onClick={() => setTab("inbox")}>Inbox <span className="tag">{visibleItems.length}</span></button>
          <button type="button" role="tab" aria-selected={tab === "rules"} className={tab === "rules" ? "on" : undefined} onClick={() => setTab("rules")}>Rules</button>
        </div>
        {tab === "inbox" ? <div className="pagebar" style={{ paddingBottom: 10 }}>
          <Lbl>Who acts</Lbl>
          {ROUTE_FILTERS.map((route) => <Btn key={route} size="sm" variant={routeFilter === route ? "pri" : "default"} aria-pressed={routeFilter === route} onClick={() => setRouteFilter(route)}>{routeLabel(route)}</Btn>)}
        </div> : null}
      </div>

      {tab === "inbox" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
          <div className="daily-split" style={{ flex: 1, minHeight: 0 }}>
            <Panel title="Queue" sub={`${visibleItems.length} waiting`} noPad>
              <div className="panel-b" style={{ overflowY: "auto", minHeight: 0 }}>
                {itemsLoading ? <div className="grid g8" aria-live="polite" aria-label="Loading suggestions">{[0, 1, 2, 3].map((row) => <span key={row} className="skeleton" style={{ height: 52, borderRadius: 6 }} />)}</div> : null}
                {visibleItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={cx("pick", selectedItem?.id === item.id && "on")}
                    aria-current={selectedItem?.id === item.id}
                    style={{ width: "100%", textAlign: "left" }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row">
                        <CellChip tone="mut">{routeLabel(item.route)}</CellChip>
                        <CellChip tone={ageTone(item.created_at)}>{ageLabel(item.created_at)}</CellChip>
                        <span className="sp" />
                        <span className="sub">{item.client_name || item.bucket_name}</span>
                      </div>
                      <div><b>{item.title}</b></div>
                    </div>
                  </button>
                ))}
                {!itemsLoading && visibleItems.length === 0 && <div className="sub">No suggestions are waiting.</div>}
              </div>
            </Panel>

            {selectedItem ? (
              <ActionItemDetail item={selectedItem} key={selectedItem.id} canApprove={currentUser.role === "super_admin"} />
            ) : (
              <div className="panel">
                <div className="panel-b sub">Select a suggestion to review it.</div>
              </div>
            )}
          </div>

          {tasks.length ? (
            <LegacyLoanSuggestions tasks={tasks} open={showLegacy} onToggle={() => setShowLegacy((value) => !value)} filter={filter} priority={priority} selectedId={selectedId} onSelect={setSelectedId} />
          ) : null}
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
  const [pendingDecision, setPendingDecision] = useState<"approved" | "dismissed" | null>(null);

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
    if (editMode) {
      try {
        JSON.parse(draftJson);
      } catch (e) {
        setEditError("Drafted payload is not valid JSON.");
        return;
      }
    }
    setPendingDecision("approved");
  };

  const handleDismiss = async () => {
    setEditError(null);
    setFeedback(null);
    setPendingDecision("dismissed");
  };

  const confirmDecision = async () => {
    if (!pendingDecision) return;
    try {
      const editedPayload = editMode && pendingDecision === "approved" ? JSON.parse(draftJson) as Record<string, unknown> : undefined;
      await decision.mutateAsync({
        taskId: task.id,
        decision: pendingDecision,
        edited_payload: editedPayload ?? null,
        loanId: task.loan_id ?? undefined,
      });
      setFeedback(pendingDecision === "approved" ? "Approved and queued for execution." : "Dismissed.");
      setPendingDecision(null);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Failed to update this task.");
    }
  };

  const confidencePct = (task.confidence * 100).toFixed(0);

  return (
    <>
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
    <ConfirmDialog
      open={pendingDecision !== null}
      onClose={() => setPendingDecision(null)}
      onConfirm={confirmDecision}
      busy={decision.isPending}
      title={pendingDecision === "dismissed" ? "Dismiss Elara task" : editMode ? "Approve edited task" : "Approve and run Elara task"}
      body={pendingDecision === "dismissed" ? "The recommendation leaves the pending queue and the decision remains in audit history." : "The drafted action will be queued for execution using the currently displayed payload."}
      confirmLabel={pendingDecision === "dismissed" ? "Dismiss task" : editMode ? "Approve edited draft" : "Approve and run"}
      tone={pendingDecision === "dismissed" ? "danger" : "default"}
    />
    </>
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


function routeLabel(route: string): string {
  switch (route) {
    case "all": return "Everyone";
    case "admin": return "Desk";
    case "uploader": return "Client";
    case "share": return "Shared recipient";
    case "vendor": return "Vendor";
    default: return route;
  }
}

function ageDays(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function ageLabel(iso: string): string {
  const days = ageDays(iso);
  return days === 0 ? "today" : `${days}d waiting`;
}

function ageTone(iso: string): ChipTone {
  const days = ageDays(iso);
  return days >= 14 ? "bad" : days >= 7 ? "warn" : "mut";
}

/**
 * One AI suggestion from a room. Approving an item routed to a client, shared
 * recipient or vendor needs a recipient chosen in the room itself, so those
 * open the file instead of approving here.
 */
function ActionItemDetail({ item, canApprove }: { item: BucketAIActionItemQueueItem; canApprove: boolean }) {
  const decide = useDecideActionItem();
  const [pending, setPending] = useState<"approved" | "rejected" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function confirm() {
    if (!pending) return;
    try {
      await decide.mutateAsync({ bucketId: item.bucket_id, itemId: item.id, status: pending });
      setFeedback(pending === "approved" ? "Approved. The room will carry it out." : "Dismissed.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not update this suggestion.");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <Panel
        title={item.title}
        sub={`${item.client_name || item.bucket_name} · ${ageLabel(item.created_at)}`}
        noPad
        actions={<Link href={item.href} className="btn sm pri">Open file <Icon name="chevR" size={12} /></Link>}
      >
        <div className="panel-b" style={{ overflowY: "auto", minHeight: 0 }}>
          <div className="row">
            <CellChip tone="mut">{routeLabel(item.route)} acts</CellChip>
            <CellChip tone="mut">{item.created_by === "ai" ? "Proposed by Elara" : `Proposed by ${item.created_by}`}</CellChip>
          </div>
          <p className="mt">{item.instructions}</p>
          {item.rationale ? <Note><div><b>Why:</b> {item.rationale}</div></Note> : null}
          {!item.approvable_here ? <WarnLine>This suggestion is routed to a {routeLabel(item.route).toLowerCase()}. Open the file to choose the recipient and approve it there.</WarnLine> : null}
          {feedback ? <div role="status" className="mt sub">{feedback}</div> : null}
        </div>
        <div className="panel-f row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <Btn onClick={() => setPending("rejected")} disabled={decide.isPending || !canApprove}>Dismiss</Btn>
          <Btn variant="pri" onClick={() => setPending("approved")} disabled={decide.isPending || !canApprove || !item.approvable_here}>Approve</Btn>
        </div>
      </Panel>
      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending === "approved" ? `Approve “${item.title}”?` : `Dismiss “${item.title}”?`}
        body={pending === "approved" ? "The room records your approval and carries the suggestion out. Nothing is sent to the client without the room's own confirmations." : "The suggestion is marked rejected and leaves the queue. It stays on the room's record."}
        confirmLabel={pending === "approved" ? "Approve" : "Dismiss"}
        tone={pending === "approved" ? "default" : "danger"}
        busy={decide.isPending}
        onConfirm={() => void confirm()}
      />
    </>
  );
}

/**
 * The loan-task queue this page used to show. It has not been written to since
 * June 2026 and nothing in it ever left pending, so it is kept reachable rather
 * than shown: nothing is deleted, nothing pretends to be current.
 */
function LegacyLoanSuggestions({ tasks, open, onToggle, filter, priority, selectedId, onSelect }: {
  tasks: AITask[];
  open: boolean;
  onToggle: () => void;
  filter: SourceFilter;
  priority: PriorityFilter;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const filtered = tasks.filter((task) => (filter === "all" || task.source === filter) && (priority === "all" || task.priority === priority) && task.status === "pending");
  const selected = filtered.find((task) => task.id === selectedId) ?? filtered[0] ?? null;
  const newest = tasks.reduce<string | null>((top, task) => (!top || task.created_at > top ? task.created_at : top), null);
  return (
    <div className="panel">
      <button type="button" className="panel-h row" style={{ width: "100%", textAlign: "left" }} onClick={onToggle} aria-expanded={open}>
        <b>Legacy loan suggestions</b>
        <span className="sub">{filtered.length} pending · last written {newest ? new Date(newest).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—"}</span>
        <span className="sp" />
        <Icon name={open ? "chevU" : "chevD"} size={14} />
      </button>
      {open ? (
        <div className="daily-split" style={{ minHeight: 0 }}>
          <Panel title="Queue" sub={`${filtered.length} pending`} noPad>
            <div className="panel-b" style={{ overflowY: "auto", minHeight: 0, maxHeight: 360 }}>
              {filtered.map((task) => (
                <button key={task.id} onClick={() => onSelect(task.id)} className={cx("pick", selected?.id === task.id && "on")} aria-current={selected?.id === task.id} style={{ width: "100%", textAlign: "left" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row">
                      <CellChip tone="mut">{task.source}</CellChip>
                      <CellChip tone={priorityTone(task.priority)}>{task.priority}</CellChip>
                      {task.loan_id ? <><span className="sp" /><span className="sub num">{task.loan_id.slice(0, 8)}</span></> : null}
                    </div>
                    <div><b>{task.title}</b></div>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && <div className="sub">No pending tasks.</div>}
            </div>
          </Panel>
          {selected ? <Detail task={selected} key={selected.id} /> : <div className="panel"><div className="panel-b sub">Select a task to view details.</div></div>}
        </div>
      ) : null}
    </div>
  );
}
