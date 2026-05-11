"use client";

// AI Workbench tab — the canonical place to manage what the AI is
// handling on a loan. Phase 2 of the AI Deal Secretary build.
//
// Top-to-bottom:
//   1. Workbench State chip (Setup / Active Work / Blocked).
//   2. DealSecretaryPicker — two-column @dnd-kit drag-drop, the
//      OutreachModeStrip is built into the picker.
//   3. Bootstrap nudge: button to repair if the CRS rows are missing
//      (happens on loans that pre-date alembic 0038).
//   4. Existing Instructions strip + Loan chat (kept — both are
//      operator-facing AI surfaces).
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
import type { Document, DSOutreachMode, DSTaskRow, Loan, RecalcResponse, User } from "@/lib/types";
import { DealSecretaryPicker } from "@/components/DealSecretaryPicker";
import { getCriteriaItems } from "../fileReadiness";
import { InstructionStrip } from "../components/InstructionStrip";
import { DealChatThread } from "../components/DealChatThread";
import { DealChatInput } from "../components/DealChatInput";

export function DealWorkspaceTab({ loanId }: { loanId: string }) {
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
      {/* Workbench State + Picker */}
      {secretaryLoading ? (
        <div style={{ padding: 16, color: t.ink3, fontSize: 13 }}>Loading AI Workbench…</div>
      ) : !secretary ? (
        <Card pad={14}>
          <SectionLabel>AI Workbench</SectionLabel>
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
        <Card pad={14}>
          <WorkbenchStateChip secretary={secretary} />
          <div style={{ height: 12 }} />
          <DealSecretaryPicker
            view={secretary}
            isOperator={isOperator}
            onAssign={handleAssign}
            onUnassign={handleUnassign}
            onChangeOutreachMode={handleOutreachMode}
            onOpenAssignment={handleOpenAssignment}
          />
        </Card>
      )}

      {isInternal ? (
        <AIDraftQueue
          loan={loan}
          user={user}
          docs={docs}
          workflow={workflow}
          recalcData={recalc.data}
          recalcPending={recalc.isPending}
        />
      ) : null}

      {/* Existing instruction strip + chat — kept below the workbench. */}
      {workspace && !workspaceLoading ? (
        <>
          <InstructionStrip
            loanId={loanId}
            instructions={workspace.instructions}
            canEdit={isInternal}
          />
          <Card pad={14}>
            <SectionLabel>Loan chat</SectionLabel>
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
          </Card>
        </>
      ) : null}
    </div>
  );
}

function WorkbenchStateChip({ secretary }: { secretary: import("@/lib/types").DSDealSecretaryView }) {
  const { t } = useTheme();
  const aiCount = secretary.right.length;
  const stalled = secretary.right.filter((r) => (r.attempts_made ?? 0) >= ((r.cadence?.max_attempts ?? 3))).length;
  const waitingOnBorrower = secretary.right.filter((r) => r.status === "asked" || r.status === "waiting_on_borrower").length;
  const mode = secretary.file_settings.outreach_mode;

  let state: "setup" | "active_work" | "blocked";
  let label: string;
  let bg = t.surface2;
  let color = t.ink;
  if (stalled > 0) {
    state = "blocked";
    label = `Blocked · ${stalled} task${stalled === 1 ? "" : "s"} stalled — recommend a human check-in`;
    bg = t.warnBg; color = t.warn;
  } else if (aiCount > 0 && mode !== "off") {
    state = "active_work";
    label = `Active Work · AI handling ${aiCount} task${aiCount === 1 ? "" : "s"}` +
      (waitingOnBorrower > 0 ? ` · waiting on borrower for ${waitingOnBorrower}` : "");
    bg = t.brandSoft; color = t.brand;
  } else {
    state = "setup";
    label = aiCount === 0
      ? "Setup · Drag tasks to the right column to start handing them to the AI"
      : `Setup · ${aiCount} task${aiCount === 1 ? "" : "s"} assigned to AI but outreach is off`;
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "9px 12px", borderRadius: 10,
      background: bg, color, fontSize: 12.5, fontWeight: 800,
    }}>
      <span style={{ fontSize: 16 }}>
        {state === "blocked" ? "⚠️" : state === "active_work" ? "🤖" : "🕒"}
      </span>
      <span>{label}</span>
    </div>
  );
}

function AIDraftQueue({
  loan,
  user,
  docs,
  workflow,
  recalcData,
  recalcPending,
}: {
  loan: Loan;
  user: User;
  docs: Document[];
  workflow: WorkflowDoc[];
  recalcData?: RecalcResponse;
  recalcPending: boolean;
}) {
  const { t } = useTheme();
  const send = useSendDealChat();
  const [busyDraft, setBusyDraft] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const missingCriteria = useMemo(
    () => getCriteriaItems(loan).filter((item) => !item.ready),
    [loan],
  );
  const openDocs = docs.filter((doc) => doc.status !== "verified" && doc.status !== "skipped");
  const flaggedDocs = docs.filter((doc) => doc.status === "flagged");
  const dueWorkflow = workflow
    .filter((item) => item.status !== "verified" && item.status !== "skipped")
    .sort((a, b) => {
      const ad = a.days_until_due ?? 999;
      const bd = b.days_until_due ?? 999;
      return ad - bd;
    });
  const warnings = recalcData?.warnings ?? [];
  const primaryConditions = dueWorkflow.slice(0, 5);
  const canDraft = user.role === Role.SUPER_ADMIN || user.role === Role.LOAN_EXEC || user.role === Role.BROKER;

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

  return (
    <Card pad={14}>
      <SectionLabel
        action={
          <Pill bg={openDocs.length || warnings.length ? t.warnBg : t.profitBg} color={openDocs.length || warnings.length ? t.warn : t.profit}>
            {openDocs.length + warnings.length + missingCriteria.length} open
          </Pill>
        }
      >
        AI Draft Queue
      </SectionLabel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 10 }}>
        <DraftMetric label="Criteria" value={missingCriteria.length} tone={missingCriteria.length ? "watch" : "ready"} />
        <DraftMetric label="Conditions" value={openDocs.length} tone={openDocs.length ? "watch" : "ready"} />
        <DraftMetric label="UW Warnings" value={recalcPending ? "..." : warnings.length} tone={warnings.length ? "danger" : "ready"} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {missingCriteria.slice(0, 3).map((item) => (
          <DraftItem key={item.id} icon="sliders" title={item.label} meta={item.value} tone="watch" />
        ))}
        {flaggedDocs.slice(0, 2).map((doc) => (
          <DraftItem key={doc.id} icon="doc" title={doc.name} meta="Flagged document" tone="danger" />
        ))}
        {primaryConditions.slice(0, 4).map((item) => (
          <DraftItem
            key={item.document_id}
            icon="docCheck"
            title={item.name}
            meta={conditionMeta(item)}
            tone={item.days_until_due != null && item.days_until_due < 0 ? "danger" : "watch"}
          />
        ))}
        {missingCriteria.length === 0 && openDocs.length === 0 && warnings.length === 0 ? (
          <DraftItem icon="check" title="No open criteria, conditions, or warnings" meta="Package can be reviewed" tone="ready" />
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 12 }}>
        <DraftButton icon="send" label="Borrower Draft" busy={busyDraft === "borrower"} onClick={() => sendDraft("borrower")} />
        <DraftButton icon="shield" label="UW Memo" busy={busyDraft === "underwriting"} onClick={() => sendDraft("underwriting")} />
        <DraftButton icon="docCheck" label="Close Checklist" busy={busyDraft === "closing"} onClick={() => sendDraft("closing")} />
      </div>
      {flash ? <div style={{ marginTop: 9, fontSize: 11.5, color: flash.includes("failed") ? t.danger : t.ink3, fontWeight: 800 }}>{flash}</div> : null}
    </Card>
  );
}

function DraftMetric({ label, value, tone }: { label: string; value: string | number; tone: "ready" | "watch" | "danger" }) {
  const { t } = useTheme();
  const color = tone === "ready" ? t.profit : tone === "danger" ? t.danger : t.warn;
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 10, padding: "8px 9px", background: t.surface2 }}>
      <div style={{ fontSize: 9.5, color: t.ink3, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 3, fontSize: 17, color, fontWeight: 950, fontFeatureSettings: '"tnum"' }}>{value}</div>
    </div>
  );
}

function DraftItem({ icon, title, meta, tone }: { icon: string; title: string; meta: string; tone: "ready" | "watch" | "danger" }) {
  const { t } = useTheme();
  const color = tone === "ready" ? t.profit : tone === "danger" ? t.danger : t.warn;
  const bg = tone === "ready" ? t.profitBg : tone === "danger" ? t.dangerBg : t.warnBg;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "26px minmax(0, 1fr)", gap: 8, alignItems: "center", padding: "7px 8px", borderRadius: 10, background: t.surface2, border: `1px solid ${t.line}` }}>
      <div style={{ width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", background: bg, color }}>
        <Icon name={icon} size={13} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ marginTop: 1, fontSize: 10.8, color: t.ink3, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta}</div>
      </div>
    </div>
  );
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
