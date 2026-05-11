"use client";

// DealSecretaryPicker — the two-column workbench picker.
//
// Used by:
//   • AgentLeadModal Step 4 (pre-loan — buffered intent path).
//   • SmartIntakeModal Step 3.
//   • DealSecretaryWorkbench on /loans/[id] AI Workspace tab.
//
// Controlled component. The parent owns the data + mutation calls.
// We expose:
//   • The drag-drop layout via @dnd-kit/core + sortable.
//   • The presets bar (assign common / borrower-facing / pull-back
//     sensitive / saved default / reset).
//   • The Outreach Mode strip (the file-level kill switch).
//   • Funding-locked items rendered with a 🔒 chip + disabled drag.
//
// What we DON'T do here:
//   • Per-task instruction editing — that lives in AssignmentDrawer,
//     opened by clicking a TaskCard.
//   • Network — parent component owns the mutation hooks.

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import {
  DS_CATEGORY_META,
  DS_OUTREACH_MODE_LABELS,
  type DSDealSecretaryView,
  type DSOutreachMode,
  type DSTaskRow,
} from "@/lib/types";

export interface DealSecretaryPickerProps {
  /** The DealSecretaryView GET response — or a synthesized one for the wizard
   *  (pre-loan, where loan_id is "" / client_id holds the real client). */
  view: DSDealSecretaryView;

  /** True for operators (super-admin / loan_exec). False for brokers
   *  — disables drag on funding-locked items. */
  isOperator: boolean;

  /** Called when the user drags a card or hits a preset. The parent
   *  decides how to persist (PATCH /assign on the workbench, or
   *  buffered intent on the wizard). */
  onAssign: (requirement_key: string) => void;
  onUnassign: (requirement_key: string) => void;

  /** File-level OutreachMode picker. Optional — wizard surfaces show
   *  the strip too; if you really want to hide it, pass undefined. */
  onChangeOutreachMode?: (mode: DSOutreachMode) => void;

  /** Click a card to open the AssignmentDrawer (workbench only). */
  onOpenAssignment?: (task: DSTaskRow) => void;
}

export function DealSecretaryPicker({
  view,
  isOperator,
  onAssign,
  onUnassign,
  onChangeOutreachMode,
  onOpenAssignment,
}: DealSecretaryPickerProps) {
  const { t } = useTheme();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const allByKey = useMemo(() => {
    const m = new Map<string, DSTaskRow>();
    [...view.left, ...view.right].forEach((r) => m.set(r.requirement_key, r));
    return m;
  }, [view.left, view.right]);

  const activeRow = activeKey ? allByKey.get(activeKey) ?? null : null;

  const handleDragStart = (e: DragStartEvent) => {
    setActiveKey(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveKey(null);
    const id = String(e.active.id);
    const over = e.over?.id;
    const row = allByKey.get(id);
    if (!row || over === undefined) return;

    // Guard: funding-locked + non-operator → no-op.
    if (row.owner_type === "funding_locked" && !isOperator) return;
    if (over === "ai-column" && row.owner_type !== "ai") {
      onAssign(row.requirement_key);
    } else if (over === "human-column" && row.owner_type === "ai") {
      onUnassign(row.requirement_key);
    }
  };

  // ── Presets ────────────────────────────────────────────────────
  const presetAssignCommon = () => {
    const targets = view.left.filter(
      (r) => ["financials", "insurance", "scheduling", "communication"].includes(r.category) && (isOperator || r.can_agent_override),
    );
    targets.forEach((r) => onAssign(r.requirement_key));
  };
  const presetAssignBorrowerFacing = () => {
    const targets = view.left.filter(
      (r) => r.visibility?.includes("borrower") && (isOperator || r.can_agent_override),
    );
    targets.forEach((r) => onAssign(r.requirement_key));
  };
  const presetPullSensitive = () => {
    const targets = view.right.filter((r) => r.completion_mode === "requires_human_verify");
    targets.forEach((r) => onUnassign(r.requirement_key));
  };
  const presetReset = () => {
    view.right.forEach((r) => {
      if (r.owner_type === "ai" && (isOperator || r.can_agent_override)) {
        onUnassign(r.requirement_key);
      }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {onChangeOutreachMode ? (
        <OutreachModeStrip
          mode={view.file_settings.outreach_mode}
          onChange={onChangeOutreachMode}
        />
      ) : null}

      {/* Presets bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <PresetButton t={t} onClick={presetAssignCommon}>Assign common collection</PresetButton>
        <PresetButton t={t} onClick={presetAssignBorrowerFacing}>Assign all borrower-facing</PresetButton>
        <PresetButton t={t} onClick={presetPullSensitive}>Keep sensitive items human-owned</PresetButton>
        <PresetButton t={t} onClick={presetReset} tone="danger">Reset all to human</PresetButton>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "stretch" }}>
          <Column id="human-column" title="Human handles this" subtitle={`${view.left.length} task${view.left.length === 1 ? "" : "s"} on your side`}>
            {view.left.map((r) => (
              <DraggableTaskCard
                key={r.requirement_key}
                row={r}
                isOperator={isOperator}
                onOpen={onOpenAssignment}
              />
            ))}
            {view.left.length === 0 ? <EmptyHint side="left" /> : null}
          </Column>

          <Column id="ai-column" title="AI handles this" subtitle={`${view.right.length} task${view.right.length === 1 ? "" : "s"} assigned to AI`}>
            {view.right.map((r) => (
              <DraggableTaskCard
                key={r.requirement_key}
                row={r}
                isOperator={isOperator}
                onOpen={onOpenAssignment}
              />
            ))}
            {view.right.length === 0 ? <EmptyHint side="right" /> : null}
          </Column>
        </div>

        <DragOverlay>
          {activeRow ? <TaskCardBody row={activeRow} isOperator={isOperator} dragging /> : null}
        </DragOverlay>
      </DndContext>

      {view.funding_locked_count > 0 ? (
        <div style={{ fontSize: 11.5, color: t.ink3 }}>
          🔒 {view.funding_locked_count} item{view.funding_locked_count === 1 ? "" : "s"} locked by funding — only an underwriter can reassign.
        </div>
      ) : null}
    </div>
  );
}

// ── OutreachModeStrip — the sticky kill-switch at the top ─────────

function OutreachModeStrip({ mode, onChange }: { mode: DSOutreachMode; onChange: (m: DSOutreachMode) => void }) {
  const { t } = useTheme();
  const modes: DSOutreachMode[] = ["off", "draft_first", "portal_auto", "portal_email", "portal_email_sms"];
  return (
    <div style={{
      border: `1px solid ${t.lineStrong}`,
      borderRadius: 14,
      background: t.surface,
      padding: "12px 14px",
      boxShadow: t.shadow,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.3, textTransform: "uppercase" }}>
            AI Outreach
          </div>
          <div style={{ marginTop: 2, fontSize: 13, fontWeight: 800, color: t.ink }}>
            {DS_OUTREACH_MODE_LABELS[mode].title}
          </div>
        </div>
        <div style={{ fontSize: 11, color: t.ink3, maxWidth: "60%", textAlign: "right" }}>
          AI can only work tasks assigned on the right column. Off = nothing sends, the AI just tracks.
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
        {modes.map((m) => {
          const active = m === mode;
          const meta = DS_OUTREACH_MODE_LABELS[m];
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              style={{
                all: "unset",
                cursor: "pointer",
                padding: "9px 8px",
                borderRadius: 10,
                background: active ? t.brandSoft : t.surface2,
                border: `1px solid ${active ? t.brand : t.line}`,
                color: active ? t.brand : t.ink2,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 11.5, fontWeight: 900 }}>{meta.title}</div>
              <div style={{ fontSize: 10, color: active ? t.brand : t.ink3, marginTop: 2 }}>{meta.sub}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Column droppable ───────────────────────────────────────────────

function Column({ id, title, subtitle, children }: { id: string; title: string; subtitle: string; children: React.ReactNode }) {
  const { t } = useTheme();
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        background: isOver ? t.brandSoft : t.surface2,
        border: `1.5px dashed ${isOver ? t.brand : t.line}`,
        borderRadius: 14,
        padding: 12,
        minHeight: 240,
        transition: "background 0.12s, border-color 0.12s",
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>{title}</div>
        <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>{subtitle}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

function EmptyHint({ side }: { side: "left" | "right" }) {
  const { t } = useTheme();
  return (
    <div style={{
      padding: "16px 12px",
      fontSize: 12, color: t.ink3,
      background: t.surface, borderRadius: 10,
      border: `1px dashed ${t.line}`,
      textAlign: "center",
    }}>
      {side === "left"
        ? "All tasks handed to AI. Drag any card back to keep it on your side."
        : "No tasks assigned to AI yet. Drag a card here or use a preset above."}
    </div>
  );
}

// ── Draggable task card ────────────────────────────────────────────

function DraggableTaskCard({ row, isOperator, onOpen }: { row: DSTaskRow; isOperator: boolean; onOpen?: (r: DSTaskRow) => void }) {
  const locked = row.owner_type === "funding_locked" && !isOperator;
  const overridable = isOperator || row.can_agent_override;
  const disabled = locked || !overridable;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: row.requirement_key,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : { ...attributes, ...listeners })}
      style={{
        opacity: isDragging ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "grab",
        outline: "none",
      }}
      onDoubleClick={() => onOpen?.(row)}
    >
      <TaskCardBody row={row} isOperator={isOperator} />
    </div>
  );
}

function TaskCardBody({ row, isOperator: _io, dragging = false }: { row: DSTaskRow; isOperator: boolean; dragging?: boolean }) {
  const { t } = useTheme();
  const catMeta = DS_CATEGORY_META[row.category];
  const isFundingLocked = row.owner_type === "funding_locked";
  const isAI = row.owner_type === "ai";
  return (
    <div style={{
      background: t.surface,
      border: `1px solid ${isAI ? t.brand : t.line}`,
      borderRadius: 12,
      padding: 11,
      boxShadow: dragging ? "0 8px 20px rgba(0,0,0,0.2)" : t.shadow,
      minWidth: 0,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <span style={{
          fontSize: 9.5, fontWeight: 800,
          padding: "2px 6px", borderRadius: 4,
          background: t.chip, color: t.ink2,
          letterSpacing: 0.6, textTransform: "uppercase",
        }}>
          {catMeta?.short ?? row.category}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {row.required_level === "required" ? (
            <span style={{ fontSize: 9.5, fontWeight: 900, padding: "2px 5px", borderRadius: 4, background: t.dangerBg, color: t.danger }}>REQ</span>
          ) : null}
          {row.required_level === "recommended" ? (
            <span style={{ fontSize: 9.5, fontWeight: 900, padding: "2px 5px", borderRadius: 4, background: t.warnBg, color: t.warn }}>REC</span>
          ) : null}
          {isFundingLocked ? (
            <span style={{ fontSize: 9.5, fontWeight: 900, padding: "2px 5px", borderRadius: 4, background: t.surface2, color: t.ink3 }}>🔒 LOCKED</span>
          ) : null}
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: t.ink, lineHeight: 1.25 }}>
        {row.label}
      </div>
      {row.objective_text ? (
        <div style={{ marginTop: 4, fontSize: 11.5, color: t.ink3, lineHeight: 1.4 }}>
          {row.objective_text}
        </div>
      ) : null}
      <div style={{ marginTop: 9, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <span style={{ fontSize: 10.5, color: t.ink3, fontWeight: 700, textTransform: "capitalize" }}>
          {row.status.replace(/_/g, " ")}
        </span>
        {row.link_url ? (
          <a
            href={row.link_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 11, color: t.brand, textDecoration: "none", fontWeight: 700 }}
          >
            {row.link_kind === "docusign" ? "✍ " : "🔗 "}{row.link_label ?? "Open link"}
          </a>
        ) : null}
      </div>
      {isAI && (row.attempts_made ?? 0) > 0 ? (
        <div style={{ marginTop: 6, fontSize: 10, color: t.ink3 }}>
          {row.attempts_made} attempt{row.attempts_made === 1 ? "" : "s"} so far
        </div>
      ) : null}
    </div>
  );
}

// ── Preset button ──────────────────────────────────────────────────

function PresetButton({ t, onClick, children, tone }: { t: ReturnType<typeof useTheme>["t"]; onClick: () => void; children: React.ReactNode; tone?: "danger" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        fontSize: 11.5,
        fontWeight: 700,
        padding: "7px 11px",
        borderRadius: 9,
        background: tone === "danger" ? t.dangerBg : t.surface2,
        color: tone === "danger" ? t.danger : t.ink2,
        border: `1px solid ${tone === "danger" ? t.danger : t.line}`,
      }}
    >
      {children}
    </button>
  );
}
