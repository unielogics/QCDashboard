"use client";

// Elara tab — the canonical place to manage what Elara is
// handling on a loan without forcing operators into drag/drop setup.
//
// Top-to-bottom:
//   1. SecretaryConsole — mode controls, delegation plan, and blockers.
//   2. Bootstrap nudge: button to repair if the CRS rows are missing
//      (happens on loans that pre-date alembic 0038).
//   3. Instructions and loan chat stay collapsed until needed.
//
// File-level outreach defaults to draft_first everywhere (see the
// JSONB default on ClientAIPlan.ai_secretary_settings) — nothing
// fires to the borrower until an operator flips the mode here.
//
// Styling: migrated off the inline-token system onto the plain-CSS classes in
// globals.css / app-extras.css. The inline styles that remain are the ones the
// stylesheet cannot own — the bespoke two-column split, the drag/drop state
// highlights, the measured scroll heights and the text truncation.

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import {
  Btn,
  Card,
  CellChip,
  Panel,
  Seg,
  Select,
  StatusLine,
  cx,
  type ChipTone,
} from "@/components/ds";
import {
  useAssignToAI,
  useBootstrapDealSecretary,
  useCurrentUser,
  useDealSecretary,
  useDealWorkspace,
  useDocuments,
  useLoan,
  useLoanWorkflow,
  useRecalc,
  useUnassignFromAI,
  useUpdateAssignment,
  useUpdateFileSettings,
  type WorkflowDoc,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import {
  DS_CATEGORY_META,
  type Document,
  type DSDealSecretaryView,
  type DSOutreachMode,
  type DSTaskRow,
  type Loan,
  type RecalcResponse,
  type User,
} from "@/lib/types";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AISecretaryTimeline } from "@/components/AISecretaryTimeline";
import {
  AISecretaryHandoffTable,
  HandoffChipPreview,
  defaultHandoffRows,
  loadHandoffRows,
  saveHandoffRows,
  type HandoffRow,
} from "@/components/AISecretaryHandoffTable";
import { useAIQuestions, useAnswerAIQuestion, useCreateCustomTask, usePatchDocument, type DSAIQuestion } from "@/hooks/useApi";
import { getCriteriaItems } from "../fileReadiness";
import { LoanChatSlideOut } from "../components/LoanChatSlideOut";
import { InstructionsModal } from "../components/InstructionsModal";
import { AIQuestionsPopover } from "../components/AIQuestionsPopover";
import { FollowUpRhythmModal } from "../components/FollowUpRhythmModal";

export function DealWorkspaceTab({ loanId, onOpenTab }: { loanId: string; onOpenTab?: (tab: string, targetId?: string) => void }) {
  const { data: user } = useCurrentUser();
  const { data: loan } = useLoan(loanId);
  const { data: workspace, isLoading: workspaceLoading } = useDealWorkspace(loanId);
  const { data: secretary, isLoading: secretaryLoading } = useDealSecretary(loanId);
  const { data: docs = [] } = useDocuments(loanId);
  const { data: workflow = [] } = useLoanWorkflow(loanId);
  const recalc = useRecalc();
  const assign = useAssignToAI(loanId);
  const unassign = useUnassignFromAI(loanId);
  const updateAssignment = useUpdateAssignment(loanId);
  const updateFileSettings = useUpdateFileSettings(loanId);
  const bootstrap = useBootstrapDealSecretary(loanId);
  // AI clarifying questions — Phase A empty stub; Phase B populates.
  const { data: aiQuestions = [] } = useAIQuestions(loanId);
  const answerAIQuestion = useAnswerAIQuestion(loanId);

  useEffect(() => {
    if (!loan) return;
    recalc.mutate({
      loanId: loan.id,
      discount_points: loan.discount_points || 0,
      loan_amount: loan.amount,
      base_rate: loan.base_rate ?? undefined,
      annual_taxes: loan.annual_taxes,
      annual_insurance: loan.annual_insurance,
      monthly_hoa: loan.monthly_hoa,
      term_months: loan.term_months,
      monthly_rent: loan.monthly_rent,
      purpose: loan.purpose,
      arv: loan.arv,
      ltv: loan.ltv ?? undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loan?.id, loan?.amount, loan?.base_rate, loan?.discount_points, loan?.annual_taxes, loan?.annual_insurance, loan?.monthly_hoa, loan?.term_months, loan?.monthly_rent, loan?.purpose, loan?.arv, loan?.ltv]);

  if (!user || !loan) {
    return (
      <Panel>
        <div className="sub">Loading workspace…</div>
      </Panel>
    );
  }

  const isInternal = user.role !== Role.CLIENT;
  const isOperator = user.role === Role.SUPER_ADMIN || user.role === Role.LOAN_EXEC;

  const handleAssign = (key: string) => assign.mutate({ requirement_key: key });
  const handleUnassign = (key: string) => unassign.mutate(key);
  const handleOutreachMode = (mode: DSOutreachMode) => updateFileSettings.mutate({ outreach_mode: mode });
  const handleOpenAssignment = (row: DSTaskRow) => {
    if (!row.assignment_id) return;
    // Minimal v1: click prompts for new instructions via window.prompt.
    // Phase 2+ will replace with AssignmentDrawer (RightPanel).
    const next = window.prompt(
      `AI instructions for "${row.label}":\n\nObjective: ${row.objective_text || "—"}\nCompletion: ${row.completion_criteria || "—"}`,
      row.instructions ?? "",
    );
    if (next !== null && next !== row.instructions) {
      updateAssignment.mutate({ assignment_id: row.assignment_id, instructions: next });
    }
  };

  return (
    // min-width:0 keeps the bespoke two-column body below from widening the
    // page instead of scrolling inside itself.
    <div className="grid" style={{ minWidth: 0 }}>
      {secretaryLoading ? (
        <Panel>
          <div className="sub">Loading Elara…</div>
        </Panel>
      ) : !secretary ? (
        <Panel title="Elara">
          <div className="sub">
            This loan pre-dates Elara Deal Secretary feature. Click below to populate
            the task list from your firm&apos;s playbook — safe to re-run, no outreach fires.
          </div>
          <div className="mt">
            <Btn
              variant="pri"
              onClick={() => bootstrap.mutate()}
              disabled={bootstrap.isPending}
            >
              {bootstrap.isPending ? "Populating…" : "Populate workbench from playbook"}
            </Btn>
          </div>
        </Panel>
      ) : (
        <SecretaryConsole
          loan={loan}
          user={user}
          secretary={secretary}
          docs={docs}
          workflow={workflow}
          recalcData={recalc.data}
          recalcPending={recalc.isPending}
          isOperator={isOperator}
          onAssign={handleAssign}
          onUnassign={handleUnassign}
          onChangeOutreachMode={handleOutreachMode}
          onOpenAssignment={handleOpenAssignment}
          onOpenTab={onOpenTab}
          workspace={workspace}
          workspaceLoading={workspaceLoading}
          aiQuestions={aiQuestions}
          onAnswerAIQuestion={async (id, answer) => {
            await answerAIQuestion.mutateAsync({ question_id: id, answer });
          }}
          canEditInstructions={isInternal}
        />
      )}
    </div>
  );
}

function SecretaryConsole({
  loan,
  user,
  secretary,
  docs,
  workflow,
  recalcData,
  recalcPending,
  isOperator,
  onAssign,
  onUnassign,
  onChangeOutreachMode,
  onOpenAssignment,
  onOpenTab,
  workspace,
  workspaceLoading,
  aiQuestions,
  onAnswerAIQuestion,
  canEditInstructions,
}: {
  loan: Loan;
  user: User;
  secretary: DSDealSecretaryView;
  docs: Document[];
  workflow: WorkflowDoc[];
  recalcData?: RecalcResponse;
  recalcPending: boolean;
  isOperator: boolean;
  onAssign: (key: string) => void;
  onUnassign: (key: string) => void;
  onChangeOutreachMode: (mode: DSOutreachMode) => void;
  onOpenAssignment: (row: DSTaskRow) => void;
  onOpenTab?: (tab: string, targetId?: string) => void;
  workspace?: import("@/lib/types").WorkspaceState;
  workspaceLoading: boolean;
  aiQuestions: DSAIQuestion[];
  onAnswerAIQuestion: (questionId: string, answer: string) => Promise<void>;
  canEditInstructions: boolean;
}) {
  const createCustomTask = useCreateCustomTask(loan.id);
  const patchDocument = usePatchDocument();
  const [filter, setFilter] = useState<"borrower" | "required" | "human" | "all">("borrower");
  const [flash, setFlash] = useState<string | null>(null);
  // Right-pane view toggle. "handoff" = sequenced AI/Human assignment
  // table; "current" = the live timeline (Next up / In progress / etc.).
  const [rightView, setRightView] = useState<"handoff" | "current">("handoff");
  // Side panel state — Instructions / Loan chat / AI questions affordances
  // now live in Elara header. Single-modal-at-a-time.
  const [panel, setPanel] = useState<"chat" | "instructions" | "ai-questions" | "follow-up" | null>(null);
  // Handoff table rows (per-loan localStorage).
  const [handoffRows, setHandoffRows] = useState<HandoffRow[]>([]);
  useEffect(() => {
    const stored = loadHandoffRows(loan.id);
    if (stored) setHandoffRows(stored);
    else setHandoffRows(defaultHandoffRows(secretary));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loan.id]);
  useEffect(() => {
    if (handoffRows.length > 0) saveHandoffRows(loan.id, handoffRows);
  }, [loan.id, handoffRows]);

  // Loan-header "Open loan chat" affordance lands here — it dispatches
  // a `qc:open-loan-chat` window event AND stamps `?chat=open` on the
  // URL. We honor both so a fresh page load with the param works AND
  // an in-app click works without a re-render race.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stripParam = () => {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("chat") === "open") {
        sp.delete("chat");
        const next = sp.toString();
        window.history.replaceState(null, "", next ? `?${next}` : window.location.pathname);
      }
    };
    // Initial param check (deep-link case).
    const params = new URLSearchParams(window.location.search);
    if (params.get("chat") === "open") {
      setPanel("chat");
      stripParam();
    }
    const handler = () => {
      setPanel("chat");
      stripParam();
    };
    window.addEventListener("qc:open-loan-chat", handler);
    return () => window.removeEventListener("qc:open-loan-chat", handler);
  }, []);

  const missingCriteria = useMemo(() => getCriteriaItems(loan).filter((item) => !item.ready), [loan]);
  const openDocs = docs.filter((doc) => doc.status !== "verified" && doc.status !== "skipped");
  const flaggedDocs = docs.filter((doc) => doc.status === "flagged");
  const dueWorkflow = workflow
    .filter((item) => item.status !== "verified" && item.status !== "skipped")
    .sort((a, b) => (a.days_until_due ?? 999) - (b.days_until_due ?? 999));
  const warnings = recalcData?.warnings ?? [];
  const primaryConditions = dueWorkflow.slice(0, 6);
  const aiTasks = secretary.right;
  const humanTasks = secretary.left;
  const stalled = aiTasks.filter((r) => (r.attempts_made ?? 0) >= ((r.cadence?.max_attempts ?? 3))).length;
  const waiting = aiTasks.filter((r) => r.status === "asked" || r.status === "waiting_on_borrower").length;
  const collectionTargets = humanTasks.filter((r) => canControlTask(r, isOperator) && r.visibility?.includes("borrower"));
  const requiredTargets = humanTasks.filter((r) => canControlTask(r, isOperator) && r.required_level === "required");
  const visibleHumanTasks = humanTasks.filter((r) => {
    if (filter === "borrower") return r.visibility?.includes("borrower");
    if (filter === "required") return r.required_level === "required";
    if (filter === "human") return r.completion_mode === "requires_human_verify";
    return true;
  });
  const mode = secretary.file_settings.outreach_mode;
  const queueOpen = openDocs.length + missingCriteria.length + warnings.length;

  // Drag-from-Resolution-Queue → drop-on-AI-Secretary wiring.
  // Pointer sensor with a 4px activation distance so a click on a row
  // (which navigates) still works without triggering drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  // Track the currently-dragged item so we can render a floating
  // preview under the cursor via <DragOverlay/>.
  const [activeDrag, setActiveDrag] = useState<
    | { kind: string; label: string; owner: "ai" | "human" }
    | null
  >(null);
  // Build a key set of timeline rows so we can short-circuit a drag of
  // a Resolution Queue item that maps to an existing CRS row (e.g. a
  // workflow condition for "Bank statements" that's already on the
  // timeline as a human task — drop = onAssign instead of new custom).
  const timelineKeys = useMemo(
    () => new Set<string>([...humanTasks, ...aiTasks].map((r) => r.requirement_key)),
    [humanTasks, aiTasks],
  );
  // Look up the owner of an in-table chip so the DragOverlay shows the
  // right color while the user is dragging it.
  const ownerByKey = useMemo(() => {
    const m = new Map<string, "ai" | "human">();
    for (const r of humanTasks) m.set(r.requirement_key, "human");
    for (const r of aiTasks) m.set(r.requirement_key, "ai");
    return m;
  }, [humanTasks, aiTasks]);
  const handleQueueDragStart = (e: DragStartEvent) => {
    const data = e.active.data?.current as
      | { kind?: string; label?: string; requirement_key?: string }
      | undefined;
    if (!data) return;
    const ownerGuess: "ai" | "human" =
      data.requirement_key
        ? (ownerByKey.get(data.requirement_key) ?? "human")
        : "ai";
    setActiveDrag({
      kind: data.kind ?? "queue",
      label: data.label ?? data.requirement_key ?? "Task",
      owner: ownerGuess,
    });
  };
  const handleQueueDragCancel = () => setActiveDrag(null);
  // Right-click on a chip in the table → take it out of every row +
  // flip server-side ownership back to human. The task then re-appears
  // in the orphan absorber's "fresh row" so it's still visible.
  const handleUnplaceTask = (key: string) => {
    setHandoffRows((rows) =>
      rows.map((r) => ({ ...r, taskKeys: r.taskKeys.filter((k) => k !== key) })),
    );
    onUnassign(key);
    setFlash(`Sent task back — flipped to Human.`);
    window.setTimeout(() => setFlash(null), 2400);
  };
  // YYYY-MM-DD for today (local wall clock). The PATCH /documents
  // endpoint accepts a date string in this form; the backend stores
  // it as the operator-overridden due_date and the workflow cron then
  // honors it instead of computing default_due from intake offsets.
  const todayIso = () => {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${m}-${d}`;
  };
  // When the operator drags an overdue queue item onto Elara,
  // the implied promise is "yes I'm still on this, just give it a fresh
  // shot today." Roll the due date forward so the cadence engine + the
  // overdue indicator both reset. No-op when the item wasn't overdue or
  // we don't have a document_id to patch (e.g. warnings, criteria).
  const maybeRollDueDateToToday = (payload: {
    kind?: string;
    overdue?: boolean;
    document_id?: string;
  }) => {
    if (!payload.overdue || !payload.document_id) return;
    patchDocument.mutate(
      { documentId: payload.document_id, due_date: todayIso() },
      {
        onError: (err) => {
          // Non-fatal — placement succeeded, just due-date roll failed.
          // Surface in flash so the operator can manually adjust if
          // they want to.
          setFlash(err instanceof Error ? `Placed, but couldn't reset due date: ${err.message}` : "Placed, but couldn't reset due date.");
          window.setTimeout(() => setFlash(null), 4200);
        },
      },
    );
  };
  const handleQueueDragEnd = (e: DragEndEvent) => {
    setActiveDrag(null);
    const overId = e.over?.id;
    if (overId === undefined) return;
    const payload = e.active.data?.current as
      | {
          kind?: string;
          label?: string;
          source_id?: string;
          requirement_key?: string;
          document_id?: string;
          overdue?: boolean;
        }
      | undefined;
    if (!payload) return;

    // Handoff cell drop: target id looks like "handoff:<row_id>:<owner>".
    // We commit two side-effects:
    //   1) Pin the task to that row in the local handoff config so the
    //      operator's sequencing sticks across reloads.
    //   2) Flip ownership server-side via onAssign / onUnassign so the
    //      cadence engine + visual timeline stay in sync.
    const overStr = String(overId);
    if (overStr.startsWith("handoff:")) {
      const [, rowId, ownerStr] = overStr.split(":");
      const owner: "ai" | "human" = ownerStr === "ai" ? "ai" : "human";

      // Resolve the dragged task. Either it already maps to a CRS row,
      // or we need to spin up a custom task first.
      const placeIntoRow = (key: string, label?: string) => {
        // "One party per row" → if the target row was previously owned
        // by the OTHER column, flipping it carries every chip already
        // in that row across as well. Capture those siblings before we
        // overwrite the row so we can flip their server-side owner.
        const target = handoffRows.find((r) => r.id === rowId);
        const targetWasOtherOwner = target?.owner && target.owner !== owner;
        const siblingsToFlip = targetWasOtherOwner
          ? (target?.taskKeys ?? []).filter((k) => k !== key)
          : [];
        const next = handoffRows.map((r) =>
          r.id === rowId
            ? { ...r, owner, taskKeys: r.taskKeys.includes(key) ? r.taskKeys : [...r.taskKeys.filter((x) => x !== key), key] }
            : { ...r, taskKeys: r.taskKeys.filter((x) => x !== key) }, // remove from other rows
        );
        setHandoffRows(next);
        if (owner === "ai") onAssign(key);
        else onUnassign(key);
        for (const sib of siblingsToFlip) {
          if (owner === "ai") onAssign(sib);
          else onUnassign(sib);
        }
        const rowLabel = rowId.replace(/^row_/, "").split("_")[0];
        if (siblingsToFlip.length > 0) {
          setFlash(`Row ${rowLabel} flipped → ${owner.toUpperCase()} (${siblingsToFlip.length + 1} task${siblingsToFlip.length ? "s" : ""}).`);
        } else {
          setFlash(`Placed "${label ?? key}" in row ${rowLabel} (${owner.toUpperCase()}).`);
        }
        window.setTimeout(() => setFlash(null), 2400);
      };

      if (payload.requirement_key && timelineKeys.has(payload.requirement_key)) {
        placeIntoRow(payload.requirement_key, payload.label);
        // If the source row was an overdue workflow condition, roll its
        // due_date forward to today as the operator's commitment signal.
        maybeRollDueDateToToday(payload);
        return;
      }
      const label = payload.label || "Follow up";
      createCustomTask.mutate(
        {
          label,
          owner_type: owner,
          objective_text: undefined,
          // Same rule for fresh custom tasks: if they came from an
          // overdue queue item, anchor the new task to today.
          ...(payload.overdue ? { due_at: todayIso() } : {}),
        },
        {
          onSuccess: (created) => {
            placeIntoRow(created.requirement_key, label);
            maybeRollDueDateToToday(payload);
          },
          onError: (err) => {
            setFlash(err instanceof Error ? err.message : "Could not add task.");
            window.setTimeout(() => setFlash(null), 3200);
          },
        },
      );
      return;
    }

    // Legacy whole-zone drop (current-activity timeline view) — always AI.
    if (overStr === "ai-secretary-zone") {
      if (payload.requirement_key && timelineKeys.has(payload.requirement_key)) {
        onAssign(payload.requirement_key);
        maybeRollDueDateToToday(payload);
        setFlash(`Delegated "${payload.label ?? payload.requirement_key}" to AI.`);
        window.setTimeout(() => setFlash(null), 2400);
        return;
      }
      const label = payload.label || "Follow up";
      createCustomTask.mutate(
        {
          label,
          owner_type: "ai",
          objective_text: undefined,
          ...(payload.overdue ? { due_at: todayIso() } : {}),
        },
        {
          onSuccess: () => {
            maybeRollDueDateToToday(payload);
            setFlash(`Added "${label}" to Elara.`);
            window.setTimeout(() => setFlash(null), 2400);
          },
          onError: (err) => {
            setFlash(err instanceof Error ? err.message : "Could not add task.");
            window.setTimeout(() => setFlash(null), 3200);
          },
        },
      );
    }
  };

  const assignMany = (rows: DSTaskRow[]) => rows.forEach((r) => onAssign(r.requirement_key));

  // Slimmer layout — dropped the entire left status column (status card
  // + 4 KPI tiles + 3 ModeButtons + advanced dropdown). The pipeline
  // badge + DealHealthPill in the loan header already cover the same
  // status info. What's left is a tight inline header with the
  // status + a single Pause toggle, and the 2-column delegation grid
  // beside the Resolution Queue.
  const aiIsLive = mode === "portal_auto" || mode === "portal_email" || mode === "portal_email_sms";
  return (
    <Card>
      {/* Tight header strip — replaces the entire left status column */}
      <div className="row">
        <span aria-hidden>🤖</span>
        <div style={{ minWidth: 0 }}>
          <div className="lbl">Elara</div>
          <b>
            {mode === "off"
              ? "Paused — drop tasks into Elara to start"
              : aiTasks.length === 0
                ? "Standing by — drop tasks into Elara to start"
                : `${aiIsLive ? "Working" : "Drafting"} · ${aiTasks.length} task${aiTasks.length === 1 ? "" : "s"} active${waiting ? ` · ${waiting} waiting` : ""}${stalled ? ` · ${stalled} stalled` : ""}`}
          </b>
        </div>
        <SecretaryStatus mode={mode} stalled={stalled} aiTasks={aiTasks.length} waiting={waiting} />
        <span className="sp" />
        <Btn onClick={() => onChangeOutreachMode(mode === "off" ? "portal_auto" : "off")}>
          <Icon name={mode === "off" ? "send" : "pause"} size={12} />
          {mode === "off" ? "Resume" : "Pause"}
        </Btn>
        {isOperator ? (
          <Select
            value={mode}
            onChange={(event) => onChangeOutreachMode(event.target.value as DSOutreachMode)}
            title="Advanced outreach mode"
            aria-label="Advanced outreach mode"
          >
            <option value="off">Off</option>
            <option value="draft_first">Draft first</option>
            <option value="portal_auto">Portal</option>
            <option value="portal_email">Portal + Email</option>
            <option value="portal_email_sms">Portal + Email + SMS</option>
          </Select>
        ) : null}
      </div>

      {/* New header action row: Instructions / Loan chat / AI questions */}
      <div className="row mt">
        <ActionButton
          icon="sliders"
          label="Instructions"
          onClick={() => setPanel("instructions")}
          disabled={!workspace}
        />
        <ActionButton
          icon="chat"
          label="Chat"
          hint="AI ↔ client"
          onClick={() => setPanel("chat")}
          disabled={!workspace}
        />
        <ActionButton
          icon="alert"
          label={aiQuestions.length ? `AI questions (${aiQuestions.length})` : "AI questions"}
          attention={aiQuestions.length > 0}
          onClick={() => setPanel("ai-questions")}
        />
        <ActionButton
          icon="cal"
          label="Follow-up rhythm"
          hint={secretary.file_settings.follow_up ? "overridden" : undefined}
          onClick={() => setPanel("follow-up")}
        />
        <span className="sp" />
        <span className="sub">
          {workspaceLoading ? "Loading workspace…" : aiQuestions.length ? "AI is waiting on context — open AI questions" : "Drag work between the queue and AI / Human columns"}
        </span>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleQueueDragStart}
        onDragEnd={handleQueueDragEnd}
        onDragCancel={handleQueueDragCancel}
      >
      {/* Two-column body: Resolution Queue (LEFT) | Handoff table or Timeline (RIGHT).
          The split is bespoke — a narrow queue against a wide working surface — so it
          stays an explicit grid rather than being forced into .cg's 12 columns. */}
      <div className="mt" style={{
        display: "grid",
        gridTemplateColumns: "minmax(280px, 0.85fr) minmax(420px, 1.3fr)",
        gap: 12,
        alignItems: "stretch",
      }}>
        {/* LEFT — Resolution Queue (was on the right) */}
        <Panel
          title="Resolution Queue"
          sub={<CellChip tone={queueOpen ? "warn" : "ok"}>{queueOpen} open</CellChip>}
          actions={<span className="sub">Drag → row cell</span>}
        >
          {/* Measured scroll box: the queue must not push the panel taller than
              the delegation surface beside it. */}
          <div style={{ maxHeight: 540, overflow: "auto" }}>
            {warnings.slice(0, 3).map((warning) => (
              <ResolutionRow
                key={`${warning.code}-${warning.message}`}
                icon="alert"
                tone="danger"
                title={warning.message}
                meta={warning.code.replace(/_/g, " ")}
                action="Open UW"
                onClick={() => onOpenTab?.("uw")}
                dragId={`queue:warning:${warning.code}`}
                dragData={{ kind: "warning", label: warning.message, source_id: warning.code }}
              />
            ))}
            {missingCriteria.slice(0, 4).map((item) => (
              <ResolutionRow
                key={item.id}
                icon="sliders"
                tone="watch"
                title={`${item.label} is missing`}
                meta={item.value}
                action="Fix field"
                onClick={() => onOpenTab?.("terms", criteriaTarget(item.id))}
                dragId={`queue:criteria:${item.id}`}
                dragData={{ kind: "criteria", label: `Collect ${item.label.toLowerCase()}`, source_id: item.id }}
              />
            ))}
            {flaggedDocs.slice(0, 3).map((doc) => (
              <ResolutionRow
                key={doc.id}
                icon="doc"
                tone="danger"
                title={doc.name}
                meta="Flagged document"
                action="Open doc"
                onClick={() => onOpenTab?.("docs")}
                dragId={`queue:flagged_doc:${doc.id}`}
                dragData={{ kind: "flagged_doc", label: `Resolve flag on ${doc.name}`, source_id: doc.id }}
              />
            ))}
            {primaryConditions.slice(0, 5).map((item) => {
              const overdue = item.days_until_due != null && item.days_until_due < 0;
              return (
                <ResolutionRow
                  key={item.document_id}
                  icon="docCheck"
                  tone={overdue ? "danger" : "watch"}
                  title={item.name}
                  meta={conditionMeta(item)}
                  action="Schedule"
                  onClick={() => onOpenTab?.("workflow")}
                  dragId={`queue:condition:${item.document_id}`}
                  dragData={{
                    kind: "condition",
                    label: `Collect ${item.name}`,
                    requirement_key: item.checklist_key ?? undefined,
                    source_id: item.document_id,
                    document_id: item.document_id,
                    overdue,
                  }}
                />
              );
            })}
            {warnings.length === 0 && missingCriteria.length === 0 && openDocs.length === 0 ? (
              <ResolutionRow icon="check" tone="ready" title="No open criteria, conditions, or warnings" meta="Package can move to review" action="Open UW" onClick={() => onOpenTab?.("uw")} />
            ) : null}
          </div>

          {flash ? (
            flash.includes("failed") || flash.includes("Could not") ? (
              <StatusLine tone="bad" className="mt">{flash}</StatusLine>
            ) : (
              <div className="sub mt">{flash}</div>
            )
          ) : null}
        </Panel>

        {/* RIGHT — Toggle between Work-handoff and Current-activity views */}
        <AISecretaryDropZone>
          <div className="row">
            <span className="lbl">Delegation</span>
            <ViewToggle
              value={rightView}
              onChange={setRightView}
              options={[
                { value: "handoff", label: "Work handoff" },
                { value: "current", label: "Current activity" },
              ]}
            />
            <span className="sp" />
            {rightView === "handoff" ? (
              <span className="sub">Drop tasks into a numbered row&apos;s AI or Human column</span>
            ) : (
              <>
                <Select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as typeof filter)}
                  aria-label="Filter delegation tasks"
                >
                  <option value="borrower">Borrower-facing</option>
                  <option value="required">Required only</option>
                  <option value="human">Needs human review</option>
                  <option value="all">All</option>
                </Select>
                <PresetAction label="Assign required" disabled={requiredTargets.length === 0} onClick={() => assignMany(requiredTargets)} />
                <PresetAction label="Start collection" disabled={collectionTargets.length === 0} onClick={() => assignMany(collectionTargets)} />
              </>
            )}
          </div>

          <div className="mt">
            {rightView === "handoff" ? (
              <AISecretaryHandoffTable
                view={secretary}
                loanId={loan.id}
                isOperator={isOperator}
                onAssign={onAssign}
                onUnassign={onUnassign}
                rows={handoffRows}
                setRows={setHandoffRows}
                onUnplaceTask={handleUnplaceTask}
              />
            ) : (
              <AISecretaryTimeline
                view={secretary}
                isOperator={isOperator}
                onAssign={onAssign}
                onUnassign={onUnassign}
                onOpenAssignment={onOpenAssignment}
                onCreateCustomTask={async (input) => {
                  await createCustomTask.mutateAsync(input);
                }}
              />
            )}
          </div>
        </AISecretaryDropZone>
      </div>
      {/* Floating preview of the dragged element under the cursor.
          dnd-kit's DragOverlay handles auto-positioning + cleanup. */}
      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          <HandoffChipPreview label={activeDrag.label} owner={activeDrag.owner} />
        ) : null}
      </DragOverlay>
      </DndContext>

      {/* Overlay surfaces — Loan chat (slide-out), Instructions (modal),
          AI questions (popover). Single-modal-at-a-time. */}
      {workspace ? (
        <LoanChatSlideOut
          open={panel === "chat"}
          onClose={() => setPanel(null)}
          loanId={loan.id}
          user={user}
          workspace={workspace}
        />
      ) : null}
      {workspace ? (
        <InstructionsModal
          open={panel === "instructions"}
          onClose={() => setPanel(null)}
          loanId={loan.id}
          instructions={workspace.instructions}
          canEdit={canEditInstructions}
        />
      ) : null}
      <AIQuestionsPopover
        open={panel === "ai-questions"}
        onClose={() => setPanel(null)}
        questions={aiQuestions}
        onAnswer={onAnswerAIQuestion}
      />
      <FollowUpRhythmModal
        open={panel === "follow-up"}
        onClose={() => setPanel(null)}
        loanId={loan.id}
        value={secretary.file_settings.follow_up ?? null}
      />
    </Card>
  );
}

// Drop zone wrapping Elara timeline. Receives drags from
// the Resolution Queue + (later) outside drops.
function AISecretaryDropZone({ children }: { children: React.ReactNode }) {
  const drop = useDroppable({ id: "ai-secretary-zone" });
  return (
    <div
      ref={drop.setNodeRef}
      className="card"
      // .card owns the resting border/background; the spread below only exists
      // while a drag is hovering the zone, which no stylesheet can know about.
      style={{
        minWidth: 0,
        transition: "background 0.12s, border-color 0.12s",
        ...(drop.isOver
          ? { borderColor: "var(--accent)", borderStyle: "dashed", background: "var(--accent-100)" }
          : null),
      }}
    >
      {children}
    </div>
  );
}

function SecretaryStatus({ mode, stalled, aiTasks, waiting }: { mode: DSOutreachMode; stalled: number; aiTasks: number; waiting: number }) {
  const tone: ChipTone = stalled ? "bad" : mode === "off" ? "mut" : aiTasks ? "acc" : "warn";
  const label = stalled ? `${stalled} stalled` : mode === "off" ? "Paused" : aiTasks ? `${aiTasks} active` : "Setup";
  return (
    <CellChip tone={tone}>
      <Icon name={stalled ? "alert" : mode === "off" ? "pause" : "ai"} size={12} />
      {label}{waiting ? ` / ${waiting} waiting` : ""}
    </CellChip>
  );
}

function SecretaryKpi({ label, value, tone }: { label: string; value: string | number; tone: "ready" | "watch" | "danger" | "brand" | "muted" }) {
  const color =
    tone === "ready" ? "var(--ok)"
      : tone === "watch" ? "var(--warn)"
        : tone === "danger" ? "var(--danger)"
          : tone === "brand" ? "var(--accent)"
            : "var(--muted)";
  return (
    <div className="kpi">
      <div className="lbl">{label}</div>
      {/* .knum owns the type; only the tone colour is data-derived. */}
      <div className="knum num" style={{ color }}>{value}</div>
    </div>
  );
}

function ModeButton({ active, icon, title, detail, onClick }: { active: boolean; icon: string; title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cx("pick", active && "on")} style={{ width: "100%", textAlign: "left" }}>
      <Icon name={icon} size={13} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</b>
        <span className="sub" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail}</span>
      </span>
    </button>
  );
}

function ActionButton({
  icon, label, onClick, hint, disabled, attention,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  hint?: string;
  disabled?: boolean;
  attention?: boolean;
}) {
  return (
    <Btn
      onClick={onClick}
      disabled={disabled}
      title={hint}
      // `.btn.tone-warn`, not a bare `.c-warn`: `.btn:hover` out-specifies a
      // single class, so the chip tone dropped off the moment you pointed at
      // the button — the attention signal disappearing exactly when someone
      // reaches for it.
      className={cx(attention && "tone-warn")}
    >
      <Icon name={icon} size={13} />
      {label}
      {hint ? <span className="sub">{hint}</span> : null}
    </Btn>
  );
}

function ViewToggle<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
}) {
  return <Seg value={value} onChange={onChange} options={options} ariaLabel="Delegation view" />;
}


function PresetAction({ label, onClick, disabled, tone }: { label: string; onClick: () => void; disabled?: boolean; tone?: "danger" }) {
  return (
    <Btn onClick={onClick} disabled={disabled} className={cx(tone === "danger" && "c-bad")}>
      {label}
    </Btn>
  );
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cx("btn", "sm", active && "c-acc")}>
      {label}
    </button>
  );
}

// ── Drag-drop wrapper around the two task columns ──────────────────
//
// SecretaryTaskRow becomes draggable (id = requirement_key). TaskColumn
// becomes droppable (id = "human-column" | "ai-column"). On drop we
// call onAssign or onUnassign based on which column the row lands in.
// The existing "Give to AI" / "Keep human" buttons on each row stay
// as a keyboard- and mobile-friendly fallback path.

function DealSecretaryDnd({
  visibleHumanTasks,
  aiTasks,
  isOperator,
  onAssign,
  onUnassign,
  onOpenAssignment,
}: {
  visibleHumanTasks: DSTaskRow[];
  aiTasks: DSTaskRow[];
  isOperator: boolean;
  onAssign: (key: string) => void;
  onUnassign: (key: string) => void;
  onOpenAssignment: (row: DSTaskRow) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const allByKey = useMemo(() => {
    const m = new Map<string, DSTaskRow>();
    [...visibleHumanTasks, ...aiTasks].forEach((r) => m.set(r.requirement_key, r));
    return m;
  }, [visibleHumanTasks, aiTasks]);

  const handleDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    const over = e.over?.id;
    const row = allByKey.get(id);
    if (!row || over === undefined) return;
    if (row.owner_type === "funding_locked" && !isOperator) return;
    if (over === "ai-column" && row.owner_type !== "ai") {
      onAssign(row.requirement_key);
    } else if (over === "human-column" && row.owner_type === "ai") {
      onUnassign(row.requirement_key);
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {/* Two equal columns → the 12-col grid, six spans each. */}
      <div className="cg">
        <TaskColumn className="s6" dropId="human-column" title="Human owns" count={visibleHumanTasks.length}>
          {visibleHumanTasks.length ? visibleHumanTasks.slice(0, 10).map((row) => (
            <SecretaryTaskRow key={row.requirement_key} row={row} side="human" isOperator={isOperator} onAssign={onAssign} onUnassign={onUnassign} onOpenAssignment={onOpenAssignment} />
          )) : <EmptyWork note="No matching human-owned tasks." />}
        </TaskColumn>
        <TaskColumn className="s6" dropId="ai-column" title="AI owns" count={aiTasks.length}>
          {aiTasks.length ? aiTasks.slice(0, 10).map((row) => (
            <SecretaryTaskRow key={row.requirement_key} row={row} side="ai" isOperator={isOperator} onAssign={onAssign} onUnassign={onUnassign} onOpenAssignment={onOpenAssignment} />
          )) : <EmptyWork note="No AI tasks yet. Drag a row here or use a preset above." />}
        </TaskColumn>
      </div>
    </DndContext>
  );
}

function TaskColumn({ title, count, children, dropId, className }: { title: string; count: number; children: React.ReactNode; dropId?: string; className?: string }) {
  // useDroppable is only called when dropId is provided (the column
  // is wired into a DndContext). Hooks must run unconditionally — we
  // pass a sentinel id when undefined so the call is stable, and
  // we only honor isOver when dropId is a real one.
  const droppable = useDroppable({ id: dropId ?? "_unused_" });
  const isOver = !!dropId && droppable.isOver;
  return (
    <div
      ref={dropId ? droppable.setNodeRef : undefined}
      className={cx("kcol", className)}
      // Resting surface is .kcol's; the spread is the live drop-target state.
      style={{
        transition: "background 0.12s, border-color 0.12s",
        ...(isOver
          ? { borderColor: "var(--accent)", borderStyle: "dashed", background: "var(--accent-100)" }
          : null),
      }}
    >
      <div className="lbl">
        <span>{title}</span>
        <span className="num">{count}</span>
      </div>
      <div className="grid g8" style={{ maxHeight: 390, overflow: "auto" }}>{children}</div>
    </div>
  );
}

function SecretaryTaskRow({
  row,
  side,
  isOperator,
  onAssign,
  onUnassign,
  onOpenAssignment,
}: {
  row: DSTaskRow;
  side: "human" | "ai";
  isOperator: boolean;
  onAssign: (key: string) => void;
  onUnassign: (key: string) => void;
  onOpenAssignment: (row: DSTaskRow) => void;
}) {
  const canControl = canControlTask(row, isOperator);
  const cat = DS_CATEGORY_META[row.category]?.short ?? row.category;
  const isSensitive = row.completion_mode === "requires_human_verify";
  // Drag handle on the card itself. Click-controls (the "Give to AI"
  // button) stay as a fallback for keyboard + mobile users.
  const drag = useDraggable({ id: row.requirement_key, disabled: !canControl });
  return (
    <div
      ref={drag.setNodeRef}
      {...(canControl ? { ...drag.attributes, ...drag.listeners } : {})}
      className="kcard"
      style={{
        minWidth: 0,
        opacity: drag.isDragging ? 0.4 : 1,
        cursor: canControl ? "grab" : "not-allowed",
        userSelect: "none",
        ...(side === "ai" ? { borderColor: "var(--accent)" } : null),
      }}
    >
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="mlbl">{cat}</span>
        <CellChip tone={row.required_level === "required" ? "bad" : row.required_level === "recommended" ? "warn" : "mut"}>
          {row.required_level}
        </CellChip>
      </div>
      <div className="mt"><b>{row.label}</b></div>
      <div className="sub" style={{ minHeight: 30 }}>
        {row.objective_text || row.completion_criteria || "No objective provided."}
      </div>
      <div className="row mt" style={{ justifyContent: "space-between" }}>
        {isSensitive ? (
          <CellChip tone="warn">human verify</CellChip>
        ) : (
          <span className="sub" style={{ textTransform: "capitalize" }}>{row.status.replace(/_/g, " ")}</span>
        )}
        <span className="row">
          {side === "ai" && row.assignment_id ? (
            <Btn size="sm" onClick={() => onOpenAssignment(row)}>
              Notes
            </Btn>
          ) : null}
          <Btn
            size="sm"
            disabled={!canControl}
            onClick={() => side === "ai" ? onUnassign(row.requirement_key) : onAssign(row.requirement_key)}
            className={side === "ai" ? "c-warn" : "c-acc"}
          >
            {side === "ai" ? "Keep human" : "Give to AI"}
          </Btn>
        </span>
      </div>
    </div>
  );
}

function EmptyWork({ note }: { note: string }) {
  return <div className="itemrow sub">{note}</div>;
}

function ResolutionRow({
  icon, tone, title, meta, action, onClick, dragId, dragData,
}: {
  icon: string;
  tone: "ready" | "watch" | "danger";
  title: string;
  meta: string;
  action: string;
  onClick: () => void;
  /** Pass to make the row draggable into Elara drop zone.
   *  Omit for the empty-state placeholder row. */
  dragId?: string;
  dragData?: Record<string, unknown>;
}) {
  const chipTone: ChipTone = tone === "ready" ? "ok" : tone === "danger" ? "bad" : "warn";
  // useDraggable must run unconditionally; pass a sentinel id when not draggable.
  const drag = useDraggable({ id: dragId ?? "_resolution_row_inert", disabled: !dragId, data: dragData });
  const draggable = !!dragId;
  return (
    <div
      ref={draggable ? drag.setNodeRef : undefined}
      {...(draggable ? { ...drag.attributes, ...drag.listeners } : {})}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className="pick"
      // .pick is the interactive row; the two values below are drag state, which
      // is why they override its resting cursor.
      style={{ cursor: draggable ? "grab" : "pointer", opacity: drag.isDragging ? 0.4 : 1, userSelect: "none" }}
      title={draggable ? "Drag onto Elara to delegate, or click for details" : undefined}
    >
      {/* Tone tile: the c-* class owns the colours, the box is bespoke. */}
      <span className={`c-${chipTone}`} style={{ width: 28, height: 28, borderRadius: 9, display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon name={icon} size={13} />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</b>
        <span className="sub" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta}</span>
      </span>
      <CellChip tone={chipTone}>{action}</CellChip>
    </div>
  );
}

function canControlTask(row: DSTaskRow, isOperator: boolean) {
  if (row.owner_type === "funding_locked" && !isOperator) return false;
  return isOperator || row.can_agent_override;
}

function criteriaTarget(id: string) {
  if (["value", "ltv", "income"].includes(id)) return "criteria-collateral";
  if (id === "close") return "criteria-output";
  return "criteria-pricing";
}

function conditionMeta(item: WorkflowDoc) {
  if (item.days_until_due == null) return item.status.replace(/_/g, " ");
  if (item.days_until_due < 0) return `${Math.abs(item.days_until_due)}d overdue`;
  if (item.days_until_due === 0) return "Due today";
  return `Due in ${item.days_until_due}d`;
}
