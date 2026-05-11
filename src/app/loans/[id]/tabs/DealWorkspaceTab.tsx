"use client";

// AI Secretary tab — the canonical place to manage what the AI is
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

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
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
  PointerSensor,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { AISecretaryTimeline } from "@/components/AISecretaryTimeline";
import {
  AISecretaryHandoffTable,
  defaultHandoffRows,
  loadHandoffRows,
  saveHandoffRows,
  type HandoffRow,
} from "@/components/AISecretaryHandoffTable";
import { useAIQuestions, useAnswerAIQuestion, useCreateCustomTask, type DSAIQuestion } from "@/hooks/useApi";
import { getCriteriaItems } from "../fileReadiness";
import { LoanChatSlideOut } from "../components/LoanChatSlideOut";
import { InstructionsModal } from "../components/InstructionsModal";
import { AIQuestionsPopover } from "../components/AIQuestionsPopover";

export function DealWorkspaceTab({ loanId, onOpenTab }: { loanId: string; onOpenTab?: (tab: string, targetId?: string) => void }) {
  const { t } = useTheme();
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
    return <div style={{ padding: 16, color: t.ink3, fontSize: 13 }}>Loading workspace…</div>;
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
    <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
      {secretaryLoading ? (
        <div style={{ padding: 16, color: t.ink3, fontSize: 13 }}>Loading AI Secretary…</div>
      ) : !secretary ? (
        <Card pad={14}>
          <SectionLabel>AI Secretary</SectionLabel>
          <div style={{ marginTop: 8, fontSize: 12.5, color: t.ink3 }}>
            This loan pre-dates the AI Deal Secretary feature. Click below to populate
            the task list from your firm&apos;s playbook — safe to re-run, no outreach fires.
          </div>
          <button
            type="button"
            onClick={() => bootstrap.mutate()}
            disabled={bootstrap.isPending}
            style={{
              marginTop: 10,
              padding: "8px 12px",
              borderRadius: 9,
              background: t.brand,
              color: t.surface,
              border: "none",
              cursor: bootstrap.isPending ? "wait" : "pointer",
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            {bootstrap.isPending ? "Populating…" : "Populate workbench from playbook"}
          </button>
        </Card>
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
  const { t } = useTheme();
  const createCustomTask = useCreateCustomTask(loan.id);
  const [filter, setFilter] = useState<"borrower" | "required" | "human" | "all">("borrower");
  const [flash, setFlash] = useState<string | null>(null);
  // Right-pane view toggle. "handoff" = sequenced AI/Human assignment
  // table; "current" = the live timeline (Next up / In progress / etc.).
  const [rightView, setRightView] = useState<"handoff" | "current">("handoff");
  // Side panel state — Instructions / Loan chat / AI questions affordances
  // now live in the AI Secretary header. Single-modal-at-a-time.
  const [panel, setPanel] = useState<"chat" | "instructions" | "ai-questions" | null>(null);
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

  // Drag-from-Resolution-Queue → drop-on-AI-Secretary wiring.
  // Pointer sensor with a 4px activation distance so a click on a row
  // (which navigates) still works without triggering drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  // Build a key set of timeline rows so we can short-circuit a drag of
  // a Resolution Queue item that maps to an existing CRS row (e.g. a
  // workflow condition for "Bank statements" that's already on the
  // timeline as a human task — drop = onAssign instead of new custom).
  const timelineKeys = useMemo(
    () => new Set<string>([...humanTasks, ...aiTasks].map((r) => r.requirement_key)),
    [humanTasks, aiTasks],
  );
  const handleQueueDragEnd = (e: DragEndEvent) => {
    const overId = e.over?.id;
    if (overId === undefined) return;
    const payload = e.active.data?.current as
      | { kind?: string; label?: string; source_id?: string; requirement_key?: string }
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
        const next = handoffRows.map((r) =>
          r.id === rowId
            ? { ...r, owner, taskKeys: r.taskKeys.includes(key) ? r.taskKeys : [...r.taskKeys.filter((x) => x !== key), key] }
            : { ...r, taskKeys: r.taskKeys.filter((x) => x !== key) }, // remove from other rows
        );
        setHandoffRows(next);
        if (owner === "ai") onAssign(key);
        else onUnassign(key);
        setFlash(`Placed "${label ?? key}" in row ${rowId.replace("row_", "")} (${owner.toUpperCase()}).`);
        window.setTimeout(() => setFlash(null), 2400);
      };

      if (payload.requirement_key && timelineKeys.has(payload.requirement_key)) {
        placeIntoRow(payload.requirement_key, payload.label);
        return;
      }
      const label = payload.label || "Follow up";
      createCustomTask.mutate(
        { label, owner_type: owner, objective_text: undefined },
        {
          onSuccess: (created) => {
            placeIntoRow(created.requirement_key, label);
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
        setFlash(`Delegated "${payload.label ?? payload.requirement_key}" to AI.`);
        window.setTimeout(() => setFlash(null), 2400);
        return;
      }
      const label = payload.label || "Follow up";
      createCustomTask.mutate(
        { label, owner_type: "ai", objective_text: undefined },
        {
          onSuccess: () => {
            setFlash(`Added "${label}" to AI Secretary.`);
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
    <Card pad={12}>
      {/* Tight header strip — replaces the entire left status column */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        marginBottom: 12,
      }}>
        <span style={{ fontSize: 18 }} aria-hidden>🤖</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
            AI Secretary
          </div>
          <div style={{ marginTop: 1, fontSize: 13.5, fontWeight: 900, color: t.ink, lineHeight: 1.2 }}>
            {mode === "off"
              ? "Paused — drop tasks into AI to start"
              : aiTasks.length === 0
                ? "Standing by — drop tasks into AI to start"
                : `${aiIsLive ? "Working" : "Drafting"} · ${aiTasks.length} task${aiTasks.length === 1 ? "" : "s"} active${waiting ? ` · ${waiting} waiting` : ""}${stalled ? ` · ${stalled} stalled` : ""}`}
          </div>
        </div>
        <SecretaryStatus mode={mode} stalled={stalled} aiTasks={aiTasks.length} waiting={waiting} />
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => onChangeOutreachMode(mode === "off" ? "portal_auto" : "off")}
          style={{
            padding: "6px 12px",
            borderRadius: 9,
            border: `1px solid ${t.line}`,
            background: t.surface2,
            color: t.ink2,
            fontSize: 11.5,
            fontWeight: 800,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icon name={mode === "off" ? "send" : "pause"} size={12} />
          {mode === "off" ? "Resume" : "Pause"}
        </button>
        {isOperator ? (
          <select
            value={mode}
            onChange={(event) => onChangeOutreachMode(event.target.value as DSOutreachMode)}
            title="Advanced outreach mode"
            style={{
              padding: "6px 8px",
              borderRadius: 9,
              border: `1px solid ${t.line}`,
              background: t.surface,
              color: t.ink2,
              fontSize: 11,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            <option value="off">Off</option>
            <option value="draft_first">Draft first</option>
            <option value="portal_auto">Portal</option>
            <option value="portal_email">Portal + Email</option>
            <option value="portal_email_sms">Portal + Email + SMS</option>
          </select>
        ) : null}
      </div>

      {/* New header action row: Instructions / Loan chat / AI questions */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <ActionButton
          icon="sliders"
          label="Instructions"
          onClick={() => setPanel("instructions")}
          disabled={!workspace}
        />
        <ActionButton
          icon="chat"
          label="Loan chat"
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
        <span style={{ marginLeft: "auto", fontSize: 11, color: t.ink3, fontWeight: 700 }}>
          {workspaceLoading ? "Loading workspace…" : aiQuestions.length ? "AI is waiting on context — open AI questions" : "Drag work between the queue and AI / Human columns"}
        </span>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleQueueDragEnd}>
      {/* Two-column body: Resolution Queue (LEFT) | Handoff table or Timeline (RIGHT) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(280px, 0.85fr) minmax(420px, 1.3fr)",
        gap: 12,
        alignItems: "stretch",
      }}>
        {/* LEFT — Resolution Queue (was on the right) */}
        <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, background: t.surface, padding: 12, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
              Resolution Queue
            </span>
            <Pill bg={openDocs.length || missingCriteria.length || warnings.length ? t.warnBg : t.profitBg} color={openDocs.length || missingCriteria.length || warnings.length ? t.warn : t.profit}>
              {openDocs.length + missingCriteria.length + warnings.length} open
            </Pill>
            <span style={{ marginLeft: "auto", fontSize: 10.5, color: t.ink3, fontWeight: 700 }}>Drag → row cell</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 540, overflow: "auto", paddingRight: 2 }}>
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
            {primaryConditions.slice(0, 5).map((item) => (
              <ResolutionRow
                key={item.document_id}
                icon="docCheck"
                tone={item.days_until_due != null && item.days_until_due < 0 ? "danger" : "watch"}
                title={item.name}
                meta={conditionMeta(item)}
                action="Schedule"
                onClick={() => onOpenTab?.("workflow")}
                dragId={`queue:condition:${item.document_id}`}
                dragData={{ kind: "condition", label: `Collect ${item.name}`, requirement_key: item.checklist_key ?? undefined, source_id: item.document_id }}
              />
            ))}
            {warnings.length === 0 && missingCriteria.length === 0 && openDocs.length === 0 ? (
              <ResolutionRow icon="check" tone="ready" title="No open criteria, conditions, or warnings" meta="Package can move to review" action="Open UW" onClick={() => onOpenTab?.("uw")} />
            ) : null}
          </div>

          {flash ? <div style={{ marginTop: 9, fontSize: 11.5, color: flash.includes("failed") || flash.includes("Could not") ? t.danger : t.ink3, fontWeight: 800 }}>{flash}</div> : null}
        </div>

        {/* RIGHT — Toggle between Work-handoff and Current-activity views */}
        <AISecretaryDropZone>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <span style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
              Delegation
            </span>
            <ViewToggle
              value={rightView}
              onChange={setRightView}
              options={[
                { value: "handoff", label: "Work handoff" },
                { value: "current", label: "Current activity" },
              ]}
            />
            <div style={{ flex: 1 }} />
            {rightView === "handoff" ? (
              <span style={{ fontSize: 11, color: t.ink3 }}>Drop tasks into a numbered row's AI or Human column</span>
            ) : (
              <>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as typeof filter)}
                  style={{
                    padding: "5px 8px",
                    borderRadius: 8,
                    border: `1px solid ${t.line}`,
                    background: t.surface2,
                    color: t.ink2,
                    fontSize: 11,
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                >
                  <option value="borrower">Borrower-facing</option>
                  <option value="required">Required only</option>
                  <option value="human">Needs human review</option>
                  <option value="all">All</option>
                </select>
                <PresetAction label="Assign required" disabled={requiredTargets.length === 0} onClick={() => assignMany(requiredTargets)} />
                <PresetAction label="Start collection" disabled={collectionTargets.length === 0} onClick={() => assignMany(collectionTargets)} />
              </>
            )}
          </div>

          {rightView === "handoff" ? (
            <AISecretaryHandoffTable
              view={secretary}
              loanId={loan.id}
              isOperator={isOperator}
              onAssign={onAssign}
              onUnassign={onUnassign}
              rows={handoffRows}
              setRows={setHandoffRows}
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
        </AISecretaryDropZone>
      </div>
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
    </Card>
  );
}

// Drop zone wrapping the AI Secretary timeline. Receives drags from
// the Resolution Queue + (later) outside drops.
function AISecretaryDropZone({ children }: { children: React.ReactNode }) {
  const { t } = useTheme();
  const drop = useDroppable({ id: "ai-secretary-zone" });
  return (
    <div
      ref={drop.setNodeRef}
      style={{
        border: `1.5px ${drop.isOver ? "dashed" : "solid"} ${drop.isOver ? t.brand : t.line}`,
        borderRadius: 12,
        background: drop.isOver ? t.brandSoft : t.surface,
        padding: 12,
        minWidth: 0,
        transition: "background 0.12s, border-color 0.12s",
      }}
    >
      {children}
    </div>
  );
}

function SecretaryStatus({ mode, stalled, aiTasks, waiting }: { mode: DSOutreachMode; stalled: number; aiTasks: number; waiting: number }) {
  const { t } = useTheme();
  const color = stalled ? t.danger : mode === "off" ? t.ink3 : aiTasks ? t.brand : t.warn;
  const bg = stalled ? t.dangerBg : mode === "off" ? t.surface : aiTasks ? t.brandSoft : t.warnBg;
  const label = stalled ? `${stalled} stalled` : mode === "off" ? "Paused" : aiTasks ? `${aiTasks} active` : "Setup";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 999, background: bg, color, fontSize: 11.5, fontWeight: 900, whiteSpace: "nowrap" }}>
      <Icon name={stalled ? "alert" : mode === "off" ? "pause" : "ai"} size={12} />
      {label}{waiting ? ` / ${waiting} waiting` : ""}
    </span>
  );
}

function SecretaryKpi({ label, value, tone }: { label: string; value: string | number; tone: "ready" | "watch" | "danger" | "brand" | "muted" }) {
  const { t } = useTheme();
  const color = tone === "ready" ? t.profit : tone === "watch" ? t.warn : tone === "danger" ? t.danger : tone === "brand" ? t.brand : t.ink3;
  return (
    <div style={{ padding: "10px 11px", borderRadius: 11, border: `1px solid ${t.line}`, background: t.surface }}>
      <div style={{ fontSize: 9.5, fontWeight: 900, color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 19, fontWeight: 950, color, fontFeatureSettings: '"tnum"' }}>{value}</div>
    </div>
  );
}

function ModeButton({ active, icon, title, detail, onClick }: { active: boolean; icon: string; title: string; detail: string; onClick: () => void }) {
  const { t } = useTheme();
  return (
    <button type="button" onClick={onClick} style={{
      display: "grid",
      gridTemplateColumns: "26px minmax(0, 1fr)",
      gap: 8,
      alignItems: "center",
      padding: 9,
      borderRadius: 10,
      border: `1px solid ${active ? t.brand : t.line}`,
      background: active ? t.brandSoft : t.surface2,
      color: active ? t.brand : t.ink2,
      textAlign: "left",
      cursor: "pointer",
      fontFamily: "inherit",
    }}>
      <span style={{ width: 26, height: 26, borderRadius: 8, background: active ? t.brand : t.surface, color: active ? t.inverse : t.ink3, display: "grid", placeItems: "center" }}>
        <Icon name={icon} size={13} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        <span style={{ display: "block", marginTop: 1, fontSize: 10.8, color: t.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail}</span>
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
  const { t } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "7px 11px",
        borderRadius: 9,
        border: `1px solid ${attention ? t.warn : t.line}`,
        background: attention ? t.warnBg : t.surface2,
        color: attention ? t.warn : t.ink2,
        fontSize: 12,
        fontWeight: 850,
        fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
      }}
    >
      <Icon name={icon} size={13} />
      {label}
      {hint ? (
        <span style={{ fontSize: 10, fontWeight: 700, color: attention ? t.warn : t.ink3, marginLeft: 2 }}>{hint}</span>
      ) : null}
    </button>
  );
}

function ViewToggle<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
}) {
  const { t } = useTheme();
  return (
    <div style={{
      display: "inline-flex", padding: 3, borderRadius: 9,
      background: t.surface2, border: `1px solid ${t.line}`,
    }}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              padding: "4px 11px",
              borderRadius: 7,
              border: "none",
              background: active ? t.surface : "transparent",
              color: active ? t.ink : t.ink3,
              fontSize: 11.5,
              fontWeight: 900,
              fontFamily: "inherit",
              cursor: "pointer",
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}


function PresetAction({ label, onClick, disabled, tone }: { label: string; onClick: () => void; disabled?: boolean; tone?: "danger" }) {
  const { t } = useTheme();
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      padding: "7px 10px",
      borderRadius: 9,
      border: `1px solid ${tone === "danger" ? t.danger : t.line}`,
      background: tone === "danger" ? t.dangerBg : t.surface2,
      color: tone === "danger" ? t.danger : t.ink2,
      opacity: disabled ? 0.45 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
      fontSize: 11.5,
      fontWeight: 800,
      fontFamily: "inherit",
    }}>
      {label}
    </button>
  );
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  const { t } = useTheme();
  return (
    <button type="button" onClick={onClick} style={{
      padding: "5px 8px",
      borderRadius: 999,
      border: `1px solid ${active ? t.brand : t.line}`,
      background: active ? t.brandSoft : t.surface2,
      color: active ? t.brand : t.ink3,
      fontSize: 11,
      fontWeight: 850,
      cursor: "pointer",
      fontFamily: "inherit",
    }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, minHeight: 360 }}>
        <TaskColumn dropId="human-column" title="Human owns" count={visibleHumanTasks.length}>
          {visibleHumanTasks.length ? visibleHumanTasks.slice(0, 10).map((row) => (
            <SecretaryTaskRow key={row.requirement_key} row={row} side="human" isOperator={isOperator} onAssign={onAssign} onUnassign={onUnassign} onOpenAssignment={onOpenAssignment} />
          )) : <EmptyWork note="No matching human-owned tasks." />}
        </TaskColumn>
        <TaskColumn dropId="ai-column" title="AI owns" count={aiTasks.length}>
          {aiTasks.length ? aiTasks.slice(0, 10).map((row) => (
            <SecretaryTaskRow key={row.requirement_key} row={row} side="ai" isOperator={isOperator} onAssign={onAssign} onUnassign={onUnassign} onOpenAssignment={onOpenAssignment} />
          )) : <EmptyWork note="No AI tasks yet. Drag a row here or use a preset above." />}
        </TaskColumn>
      </div>
    </DndContext>
  );
}

function TaskColumn({ title, count, children, dropId }: { title: string; count: number; children: React.ReactNode; dropId?: string }) {
  const { t } = useTheme();
  // useDroppable is only called when dropId is provided (the column
  // is wired into a DndContext). Hooks must run unconditionally — we
  // pass a sentinel id when undefined so the call is stable, and
  // we only honor isOver when dropId is a real one.
  const droppable = useDroppable({ id: dropId ?? "_unused_" });
  const isOver = !!dropId && droppable.isOver;
  return (
    <div
      ref={dropId ? droppable.setNodeRef : undefined}
      style={{
        border: `1.5px ${isOver ? "dashed" : "solid"} ${isOver ? t.brand : t.line}`,
        borderRadius: 12,
        background: isOver ? t.brandSoft : t.surface2,
        padding: 10,
        minWidth: 0,
        transition: "background 0.12s, border-color 0.12s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.1, textTransform: "uppercase" }}>{title}</div>
        <span style={{ fontSize: 11, fontWeight: 900, color: t.ink3 }}>{count}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 390, overflow: "auto", paddingRight: 2 }}>{children}</div>
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
  const { t } = useTheme();
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
      style={{
        padding: 10,
        borderRadius: 11,
        border: `1px solid ${side === "ai" ? t.brand : t.line}`,
        background: t.surface,
        minWidth: 0,
        opacity: drag.isDragging ? 0.4 : 1,
        cursor: canControl ? "grab" : "not-allowed",
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", color: t.ink3 }}>{cat}</span>
        <span style={{ fontSize: 9.5, fontWeight: 900, padding: "2px 5px", borderRadius: 4, background: row.required_level === "required" ? t.dangerBg : row.required_level === "recommended" ? t.warnBg : t.surface2, color: row.required_level === "required" ? t.danger : row.required_level === "recommended" ? t.warn : t.ink3 }}>
          {row.required_level}
        </span>
      </div>
      <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 900, color: t.ink, lineHeight: 1.25 }}>
        {row.label}
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: t.ink3, lineHeight: 1.35, minHeight: 30 }}>
        {row.objective_text || row.completion_criteria || "No objective provided."}
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: isSensitive ? t.warn : t.ink3, textTransform: "capitalize" }}>
          {isSensitive ? "human verify" : row.status.replace(/_/g, " ")}
        </span>
        <div style={{ display: "flex", gap: 5 }}>
          {side === "ai" && row.assignment_id ? (
            <button type="button" onClick={() => onOpenAssignment(row)} style={taskBtn(t)}>
              Notes
            </button>
          ) : null}
          <button
            type="button"
            disabled={!canControl}
            onClick={() => side === "ai" ? onUnassign(row.requirement_key) : onAssign(row.requirement_key)}
            style={{ ...taskBtn(t), color: side === "ai" ? t.warn : t.brand, opacity: canControl ? 1 : 0.45, cursor: canControl ? "pointer" : "not-allowed" }}
          >
            {side === "ai" ? "Keep human" : "Give to AI"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyWork({ note }: { note: string }) {
  const { t } = useTheme();
  return (
    <div style={{ padding: 14, borderRadius: 10, border: `1px dashed ${t.line}`, background: t.surface, color: t.ink3, fontSize: 12, fontWeight: 750, textAlign: "center" }}>
      {note}
    </div>
  );
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
  /** Pass to make the row draggable into the AI Secretary drop zone.
   *  Omit for the empty-state placeholder row. */
  dragId?: string;
  dragData?: Record<string, unknown>;
}) {
  const { t } = useTheme();
  const color = tone === "ready" ? t.profit : tone === "danger" ? t.danger : t.warn;
  const bg = tone === "ready" ? t.profitBg : tone === "danger" ? t.dangerBg : t.warnBg;
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
      style={{
        display: "grid",
        gridTemplateColumns: "28px minmax(0, 1fr) auto",
        gap: 8,
        alignItems: "center",
        padding: 9,
        borderRadius: 11,
        border: `1px solid ${t.line}`,
        background: t.surface2,
        color: t.ink,
        cursor: draggable ? "grab" : "pointer",
        textAlign: "left",
        fontFamily: "inherit",
        opacity: drag.isDragging ? 0.4 : 1,
        userSelect: "none",
      }}
      title={draggable ? "Drag onto AI Secretary to delegate, or click for details" : undefined}
    >
      <span style={{ width: 28, height: 28, borderRadius: 9, display: "grid", placeItems: "center", color, background: bg }}>
        <Icon name={icon} size={13} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        <span style={{ display: "block", marginTop: 1, fontSize: 10.8, color: t.ink3, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta}</span>
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 900, color, whiteSpace: "nowrap" }}>{action}</span>
    </div>
  );
}

function canControlTask(row: DSTaskRow, isOperator: boolean) {
  if (row.owner_type === "funding_locked" && !isOperator) return false;
  return isOperator || row.can_agent_override;
}

function taskBtn(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    border: `1px solid ${t.line}`,
    background: t.surface2,
    borderRadius: 7,
    padding: "4px 7px",
    fontSize: 10.5,
    fontWeight: 850,
    cursor: "pointer",
    fontFamily: "inherit",
  };
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

