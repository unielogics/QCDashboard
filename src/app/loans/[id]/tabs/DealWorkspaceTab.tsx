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
import { QC_FMT } from "@/components/design-system/tokens";
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
  useSendDealChat,
  useUnassignFromAI,
  useUpdateAssignment,
  useUpdateFileSettings,
  type WorkflowDoc,
} from "@/hooks/useApi";
import { DealChatMode, Role } from "@/lib/enums.generated";
import {
  DS_CATEGORY_META,
  DS_OUTREACH_MODE_LABELS,
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
import { useAIQuestions, useAnswerAIQuestion, useCreateCustomTask, type DSAIQuestion } from "@/hooks/useApi";
import { getCriteriaItems } from "../fileReadiness";
import { InstructionStrip } from "../components/InstructionStrip";
import { DealChatThread } from "../components/DealChatThread";
import { DealChatInput } from "../components/DealChatInput";

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
  const [openPanel, setOpenPanel] = useState<"instructions" | "chat" | "ai-questions" | null>(null);
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
        />
      )}

      {workspace && !workspaceLoading ? (
        <Card pad={12}>
          {/* Merged Instructions + Loan Chat + AI Questions in one
              tabbed container. Chat is the default since that's where
              the most interactive work happens. AI Questions is where
              the AI asks the operator for context before contacting
              the borrower (Phase B populates; for now an empty state). */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
            <TogglePanelButton
              active={(openPanel ?? "chat") === "chat"}
              icon="chat"
              label="Loan chat"
              onClick={() => setOpenPanel("chat")}
            />
            <TogglePanelButton
              active={openPanel === "instructions"}
              icon="sliders"
              label="Instructions"
              onClick={() => setOpenPanel("instructions")}
            />
            <TogglePanelButton
              active={openPanel === "ai-questions"}
              icon="alert"
              label={`AI questions${aiQuestions.length ? ` · ${aiQuestions.length}` : ""}`}
              onClick={() => setOpenPanel("ai-questions")}
            />
            <span style={{ marginLeft: "auto", color: t.ink3, fontSize: 11, fontWeight: 700 }}>
              {openPanel === "instructions"
                ? "Edit standing rules the AI honors on this file"
                : openPanel === "ai-questions"
                ? "Answer what the AI doesn't know before it engages the client"
                : "Talk to the file AI"}
            </span>
          </div>
          {openPanel === "instructions" ? (
            <InstructionStrip
              loanId={loanId}
              instructions={workspace.instructions}
              canEdit={isInternal}
            />
          ) : openPanel === "ai-questions" ? (
            <AIQuestionsPanel
              loanId={loanId}
              questions={aiQuestions}
              onAnswer={async (id, answer) => {
                await answerAIQuestion.mutateAsync({ question_id: id, answer });
              }}
            />
          ) : (
            <>
              <DealChatThread
                loanId={loanId}
                user={user}
                messages={workspace.chat_messages}
                pausedUntil={workspace.ai_paused_until}
              />
              <div style={{ height: 10 }} />
              <DealChatInput
                loanId={loanId}
                user={user}
                pausedUntil={workspace.ai_paused_until}
              />
            </>
          )}
        </Card>
      ) : null}
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
}) {
  const { t } = useTheme();
  const createCustomTask = useCreateCustomTask(loan.id);
  const send = useSendDealChat();
  const [filter, setFilter] = useState<"borrower" | "required" | "human" | "all">("borrower");
  const [busyDraft, setBusyDraft] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

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
  const sensitiveAssigned = aiTasks.filter((r) => canControlTask(r, isOperator) && r.completion_mode === "requires_human_verify");
  const visibleHumanTasks = humanTasks.filter((r) => {
    if (filter === "borrower") return r.visibility?.includes("borrower");
    if (filter === "required") return r.required_level === "required";
    if (filter === "human") return r.completion_mode === "requires_human_verify";
    return true;
  });
  const mode = secretary.file_settings.outreach_mode;
  const modeLabel = DS_OUTREACH_MODE_LABELS[mode];
  const canDraft = user.role === Role.SUPER_ADMIN || user.role === Role.LOAN_EXEC || user.role === Role.BROKER;

  const assignMany = (rows: DSTaskRow[]) => rows.forEach((r) => onAssign(r.requirement_key));
  const sendDraft = async (kind: "borrower" | "underwriting" | "closing") => {
    if (!canDraft) return;
    setBusyDraft(kind);
    setFlash(null);
    try {
      await send.mutateAsync({
        loanId: loan.id,
        mode: DealChatMode.BROKER_QUESTION,
        body: buildDraftPrompt(kind, loan, missingCriteria, openDocs, flaggedDocs, primaryConditions, warnings),
      });
      setFlash(kind === "borrower" ? "Borrower draft requested." : kind === "underwriting" ? "UW memo requested." : "Closing checklist requested.");
    } catch (error) {
      setFlash(error instanceof Error ? error.message : "Draft request failed.");
    } finally {
      setBusyDraft(null);
      window.setTimeout(() => setFlash(null), 2600);
    }
  };

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

      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(360px, 1.3fr) minmax(280px, 0.85fr)",
        gap: 12,
        alignItems: "stretch",
      }}>
        <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, background: t.surface, padding: 12, minWidth: 0 }}>
          {/* Compact header: tiny eyebrow + presets + filter inline */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <span style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
              Delegation
            </span>
            <span style={{ fontSize: 11, color: t.ink3 }}>· drag rows to assign</span>
            <div style={{ flex: 1 }} />
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
          </div>

          {/* Timeline view — replaces the old Human / AI two-column
              layout. Sections (Next Up / In Progress / Upcoming /
              Done) are computed server-side from dependencies + CRS
              status. Per-task: just an Owner button (click to flip
              Human ↔ AI). The system sequences everything else. */}
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
        </div>

        <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, background: t.surface, padding: 12, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
              Resolution Queue
            </span>
            <Pill bg={openDocs.length || missingCriteria.length || warnings.length ? t.warnBg : t.profitBg} color={openDocs.length || missingCriteria.length || warnings.length ? t.warn : t.profit}>
              {openDocs.length + missingCriteria.length + warnings.length} open
            </Pill>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflow: "auto", paddingRight: 2 }}>
            {warnings.slice(0, 3).map((warning) => (
              <ResolutionRow key={`${warning.code}-${warning.message}`} icon="alert" tone="danger" title={warning.message} meta={warning.code.replace(/_/g, " ")} action="Open UW" onClick={() => onOpenTab?.("uw")} />
            ))}
            {missingCriteria.slice(0, 4).map((item) => (
              <ResolutionRow key={item.id} icon="sliders" tone="watch" title={`${item.label} is missing`} meta={item.value} action="Fix field" onClick={() => onOpenTab?.("terms", criteriaTarget(item.id))} />
            ))}
            {flaggedDocs.slice(0, 3).map((doc) => (
              <ResolutionRow key={doc.id} icon="doc" tone="danger" title={doc.name} meta="Flagged document" action="Open doc" onClick={() => onOpenTab?.("docs")} />
            ))}
            {primaryConditions.slice(0, 5).map((item) => (
              <ResolutionRow key={item.document_id} icon="docCheck" tone={item.days_until_due != null && item.days_until_due < 0 ? "danger" : "watch"} title={item.name} meta={conditionMeta(item)} action="Schedule" onClick={() => onOpenTab?.("workflow")} />
            ))}
            {warnings.length === 0 && missingCriteria.length === 0 && openDocs.length === 0 ? (
              <ResolutionRow icon="check" tone="ready" title="No open criteria, conditions, or warnings" meta="Package can move to review" action="Open UW" onClick={() => onOpenTab?.("uw")} />
            ) : null}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 7, marginTop: 12 }}>
            <DraftButton icon="send" label="Draft borrower follow-up" busy={busyDraft === "borrower"} onClick={() => sendDraft("borrower")} />
            <DraftButton icon="shield" label="Draft UW memo" busy={busyDraft === "underwriting"} onClick={() => sendDraft("underwriting")} />
            <DraftButton icon="docCheck" label="Draft closing checklist" busy={busyDraft === "closing"} onClick={() => sendDraft("closing")} />
          </div>
          {flash ? <div style={{ marginTop: 9, fontSize: 11.5, color: flash.includes("failed") ? t.danger : t.ink3, fontWeight: 800 }}>{flash}</div> : null}
        </div>
      </div>
    </Card>
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

function ResolutionRow({ icon, tone, title, meta, action, onClick }: { icon: string; tone: "ready" | "watch" | "danger"; title: string; meta: string; action: string; onClick: () => void }) {
  const { t } = useTheme();
  const color = tone === "ready" ? t.profit : tone === "danger" ? t.danger : t.warn;
  const bg = tone === "ready" ? t.profitBg : tone === "danger" ? t.dangerBg : t.warnBg;
  return (
    <button type="button" onClick={onClick} style={{
      display: "grid",
      gridTemplateColumns: "28px minmax(0, 1fr) auto",
      gap: 8,
      alignItems: "center",
      padding: 9,
      borderRadius: 11,
      border: `1px solid ${t.line}`,
      background: t.surface2,
      color: t.ink,
      cursor: "pointer",
      textAlign: "left",
      fontFamily: "inherit",
    }}>
      <span style={{ width: 28, height: 28, borderRadius: 9, display: "grid", placeItems: "center", color, background: bg }}>
        <Icon name={icon} size={13} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        <span style={{ display: "block", marginTop: 1, fontSize: 10.8, color: t.ink3, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta}</span>
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 900, color, whiteSpace: "nowrap" }}>{action}</span>
    </button>
  );
}

function TogglePanelButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  const { t } = useTheme();
  return (
    <button type="button" onClick={onClick} style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "7px 10px",
      borderRadius: 9,
      border: `1px solid ${active ? t.brand : t.line}`,
      background: active ? t.brandSoft : t.surface2,
      color: active ? t.brand : t.ink2,
      fontSize: 12,
      fontWeight: 850,
      cursor: "pointer",
      fontFamily: "inherit",
    }}>
      <Icon name={icon} size={13} />
      {label}
    </button>
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

function DraftButton({ icon, label, busy, onClick }: { icon: string; label: string; busy: boolean; onClick: () => void }) {
  const { t } = useTheme();
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        border: `1px solid ${t.lineStrong}`,
        background: t.surface,
        color: t.ink,
        borderRadius: 9,
        padding: "8px 7px",
        fontSize: 11.5,
        fontWeight: 850,
        cursor: busy ? "wait" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        minWidth: 0,
        whiteSpace: "nowrap",
      }}
    >
      <Icon name={icon} size={12} />
      {busy ? "Drafting" : label}
    </button>
  );
}

function conditionMeta(item: WorkflowDoc) {
  if (item.days_until_due == null) return item.status.replace(/_/g, " ");
  if (item.days_until_due < 0) return `${Math.abs(item.days_until_due)}d overdue`;
  if (item.days_until_due === 0) return "Due today";
  return `Due in ${item.days_until_due}d`;
}

function buildDraftPrompt(
  kind: "borrower" | "underwriting" | "closing",
  loan: Loan,
  missingCriteria: ReturnType<typeof getCriteriaItems>,
  openDocs: Document[],
  flaggedDocs: Document[],
  conditions: WorkflowDoc[],
  warnings: NonNullable<RecalcResponse["warnings"]>,
) {
  const missing = missingCriteria.map((item) => `${item.label}: ${item.value}`).join("; ") || "none";
  const docs = openDocs.slice(0, 8).map((doc) => `${doc.name} (${doc.status})`).join("; ") || "none";
  const flagged = flaggedDocs.map((doc) => doc.name).join("; ") || "none";
  const conditionLines = conditions.map((item) => `${item.name}: ${conditionMeta(item)}`).join("; ") || "none";
  const warningLines = warnings.map((warning) => `${warning.code}: ${warning.message}`).join("; ") || "none";
  const header = `Loan ${loan.deal_id} / ${loan.address} / ${loan.type.replace(/_/g, " ")} / amount ${QC_FMT.usd(Number(loan.amount), 0)}.`;

  if (kind === "borrower") {
    return [
      "Draft a borrower-facing follow-up message for this loan file. Do not send it. Keep it plain, specific, and low-friction.",
      header,
      `Missing criteria: ${missing}.`,
      `Open document conditions: ${docs}.`,
      `Due/overdue queue: ${conditionLines}.`,
      `Flagged documents: ${flagged}.`,
    ].join("\n");
  }

  if (kind === "underwriting") {
    return [
      "Draft an internal underwriting condition memo. Group issues into loan structure, missing evidence, document quality, and blockers before submission.",
      header,
      `Missing criteria: ${missing}.`,
      `Open document conditions: ${docs}.`,
      `Flagged documents: ${flagged}.`,
      `Calculation warnings: ${warningLines}.`,
    ].join("\n");
  }

  return [
    "Draft a closing-readiness checklist for the file team. Include what is complete, what blocks closing, and the next three actions.",
    header,
    `Missing criteria: ${missing}.`,
    `Open document conditions: ${docs}.`,
    `Due/overdue queue: ${conditionLines}.`,
    `Calculation warnings: ${warningLines}.`,
  ].join("\n");
}

// ─── AIQuestionsPanel ──────────────────────────────────────────────
//
// Third mode in the merged Loan Chat container. Renders the AI's
// open questions as chat bubbles; operator types an answer per
// question. Empty state explains what the panel is for.

function AIQuestionsPanel({
  loanId: _loanId,
  questions,
  onAnswer,
}: {
  loanId: string;
  questions: DSAIQuestion[];
  onAnswer: (questionId: string, answer: string) => Promise<void>;
}) {
  const { t } = useTheme();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  if (questions.length === 0) {
    return (
      <div style={{
        padding: "24px 18px",
        textAlign: "center",
        color: t.ink3,
        fontSize: 13,
        lineHeight: 1.55,
      }}>
        <div style={{ fontSize: 32, marginBottom: 10 }} aria-hidden>💭</div>
        <div style={{ fontWeight: 800, color: t.ink2, marginBottom: 4 }}>
          No questions waiting for you
        </div>
        <div style={{ maxWidth: 420, margin: "0 auto" }}>
          When the AI Secretary spots something unclear about how to engage
          this borrower — tone, timing, a specific item to mention — it will
          ask here before sending anything. Your answers shape every
          outreach message from then on.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {questions.map((q) => {
        const answered = !!q.answered_at;
        const draft = answers[q.id] ?? "";
        const isSending = sending === q.id;
        return (
          <div key={q.id} style={{
            border: `1px solid ${t.line}`,
            borderRadius: 11,
            background: answered ? t.surface2 : t.surface,
            padding: 12,
            opacity: answered ? 0.85 : 1,
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{
                fontSize: 9.5, fontWeight: 900,
                padding: "2px 6px", borderRadius: 4,
                background: t.brandSoft, color: t.brand,
                letterSpacing: 0.4, textTransform: "uppercase",
              }}>
                AI asks
              </span>
              {q.requirement_key ? (
                <span style={{
                  fontSize: 9.5, fontWeight: 800,
                  padding: "2px 6px", borderRadius: 4,
                  background: t.chip, color: t.ink3,
                  letterSpacing: 0.3, textTransform: "uppercase",
                }}>
                  {q.requirement_key}
                </span>
              ) : null}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10, color: t.ink3 }}>
                {new Date(q.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
            <div style={{ marginTop: 7, fontSize: 13.5, fontWeight: 700, color: t.ink, lineHeight: 1.35 }}>
              {q.question}
            </div>
            {q.context ? (
              <div style={{ marginTop: 4, fontSize: 11, color: t.ink3, lineHeight: 1.4 }}>
                {q.context}
              </div>
            ) : null}
            {answered ? (
              <div style={{ marginTop: 9, padding: 9, borderRadius: 9, background: t.profitBg, color: t.profit, fontSize: 12, fontWeight: 700 }}>
                ✓ Answer: {q.answer ?? "—"}
              </div>
            ) : (
              <div style={{ marginTop: 9, display: "flex", gap: 6 }}>
                <input
                  value={draft}
                  onChange={(e) => setAnswers((m) => ({ ...m, [q.id]: e.target.value }))}
                  placeholder="Type your answer…"
                  style={{
                    flex: 1,
                    padding: "8px 11px", borderRadius: 8,
                    background: t.surface2, color: t.ink,
                    border: `1px solid ${t.line}`, fontSize: 12.5,
                    outline: "none", fontFamily: "inherit",
                  }}
                />
                <button
                  type="button"
                  disabled={!draft.trim() || isSending}
                  onClick={async () => {
                    setSending(q.id);
                    try {
                      await onAnswer(q.id, draft.trim());
                      setAnswers((m) => ({ ...m, [q.id]: "" }));
                    } finally {
                      setSending(null);
                    }
                  }}
                  style={{
                    padding: "8px 14px", borderRadius: 8,
                    background: t.brand, color: t.inverse,
                    border: "none",
                    fontSize: 12, fontWeight: 900,
                    cursor: !draft.trim() || isSending ? "not-allowed" : "pointer",
                    opacity: !draft.trim() || isSending ? 0.55 : 1,
                    fontFamily: "inherit",
                  }}
                >
                  {isSending ? "Sending…" : "Answer"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
