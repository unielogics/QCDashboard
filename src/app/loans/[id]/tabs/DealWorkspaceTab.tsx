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

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import {
  useAssignToAI,
  useBootstrapDealSecretary,
  useCurrentUser,
  useDealSecretary,
  useDealWorkspace,
  useLoan,
  useUnassignFromAI,
  useUpdateAssignment,
  useUpdateFileSettings,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import type { DSOutreachMode, DSTaskRow } from "@/lib/types";
import { DealSecretaryPicker } from "@/components/DealSecretaryPicker";
import { InstructionStrip } from "../components/InstructionStrip";
import { DealChatThread } from "../components/DealChatThread";
import { DealChatInput } from "../components/DealChatInput";

export function DealWorkspaceTab({ loanId }: { loanId: string }) {
  const { t } = useTheme();
  const { data: user } = useCurrentUser();
  const { data: loan } = useLoan(loanId);
  const { data: workspace, isLoading: workspaceLoading } = useDealWorkspace(loanId);
  const { data: secretary, isLoading: secretaryLoading } = useDealSecretary(loanId);
  const assign = useAssignToAI(loanId);
  const unassign = useUnassignFromAI(loanId);
  const updateAssignment = useUpdateAssignment(loanId);
  const updateFileSettings = useUpdateFileSettings(loanId);
  const bootstrap = useBootstrapDealSecretary(loanId);

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
