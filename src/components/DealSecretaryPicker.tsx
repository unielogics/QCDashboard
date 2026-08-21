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
//
// Styling: migrated to the plain-CSS design system (globals.css +
// app-extras.css). The inline styles that remain are the ones a class
// cannot own — the drag-over column highlight, the dragging card state,
// and two bespoke grids (the 1fr/1fr drop-zone pair and the 5-up mode
// ladder), both of which are deliberate layout, not spacing defaults.

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
import { Btn, Row, cx } from "@/components/ds";
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
    <div className="cg">
      {onChangeOutreachMode ? (
        <OutreachModeStrip
          mode={view.file_settings.outreach_mode}
          onChange={onChangeOutreachMode}
        />
      ) : null}

      {/* Presets bar */}
      <Row className="s12">
        <PresetButton onClick={presetAssignCommon}>Assign common collection</PresetButton>
        <PresetButton onClick={presetAssignBorrowerFacing}>Assign all borrower-facing</PresetButton>
        <PresetButton onClick={presetPullSensitive}>Keep sensitive items human-owned</PresetButton>
        <PresetButton onClick={presetReset} tone="danger">Reset all to human</PresetButton>
      </Row>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* Bespoke: the two drop zones are a matched pair and must stay the
            same height, so this keeps its own 1fr/1fr grid rather than .cg,
            whose `align-items: start` would let one bin outgrow the other. */}
        <div className="s12" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "stretch" }}>
          <Column id="human-column" title="My Tasks" subtitle={`${view.left.length} task${view.left.length === 1 ? "" : "s"} on your side`}>
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

          <Column id="ai-column" title="Elara" subtitle={`${view.right.length} task${view.right.length === 1 ? "" : "s"} assigned to AI`}>
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
        <div className="sub s12">
          🔒 {view.funding_locked_count} item{view.funding_locked_count === 1 ? "" : "s"} locked by funding — only an underwriter can reassign.
        </div>
      ) : null}
    </div>
  );
}

// ── OutreachModeStrip — the sticky kill-switch at the top ─────────

function OutreachModeStrip({ mode, onChange }: { mode: DSOutreachMode; onChange: (m: DSOutreachMode) => void }) {
  const modes: DSOutreachMode[] = ["off", "draft_first", "portal_auto", "portal_email", "portal_email_sms"];
  return (
    <div className="card s12">
      <Row>
        <div>
          <div className="lbl">AI Outreach</div>
          <div>
            <b>{DS_OUTREACH_MODE_LABELS[mode].title}</b>
          </div>
        </div>
        <span className="sp" />
        <div className="sub align-r">
          AI can only work tasks assigned on the right column. Off = nothing sends, the AI just tracks.
        </div>
      </Row>
      {/* Bespoke: five modes on one escalating ladder, equal width. */}
      <div className="mt" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
        {modes.map((m) => {
          const active = m === mode;
          const meta = DS_OUTREACH_MODE_LABELS[m];
          return (
            <Btn
              key={m}
              variant={active ? "pri" : "default"}
              aria-pressed={active}
              onClick={() => onChange(m)}
              style={{ flexDirection: "column" }}
            >
              <span>{meta.title}</span>
              <small style={{ fontWeight: 500, lineHeight: 1.3 }}>{meta.sub}</small>
            </Btn>
          );
        })}
      </div>
    </div>
  );
}

// ── Column droppable ───────────────────────────────────────────────

function Column({ id, title, subtitle, children }: { id: string; title: string; subtitle: string; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      // Dynamic: the drop-zone highlight is drag state, and no class in the
      // sheet carries a dashed bin with an `is-over` variant.
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: isOver ? "var(--accent-100)" : "var(--sunken2)",
        border: `1.5px dashed ${isOver ? "var(--accent-400)" : "var(--line)"}`,
        borderRadius: "var(--r)",
        padding: 12,
        minHeight: 240,
        transition: "background 0.12s, border-color 0.12s",
      }}
    >
      <div>
        <div className="lbl">{title}</div>
        <div className="sub">{subtitle}</div>
      </div>
      <div className="ladder">{children}</div>
    </div>
  );
}

function EmptyHint({ side }: { side: "left" | "right" }) {
  return (
    <div className="card sub" style={{ textAlign: "center" }}>
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
      // Dynamic: drag state + the disabled affordance.
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
  const catMeta = DS_CATEGORY_META[row.category];
  const isFundingLocked = row.owner_type === "funding_locked";
  const isAI = row.owner_type === "ai";
  return (
    // Dynamic: the accent border marks an AI-owned card, and the lifted
    // shadow only exists while the card is under the cursor in DragOverlay.
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 6,
      background: "var(--surface)",
      border: `1px solid ${isAI ? "var(--accent)" : "var(--line)"}`,
      borderRadius: 12,
      padding: 11,
      boxShadow: dragging ? "0 8px 20px rgba(15, 23, 32, 0.2)" : "var(--sh1)",
      minWidth: 0,
    }}>
      <Row>
        <span className="cellchip c-mut">{catMeta?.short ?? row.category}</span>
        <span className="sp" />
        {row.required_level === "required" ? (
          <span className="cellchip c-bad">REQ</span>
        ) : null}
        {row.required_level === "recommended" ? (
          <span className="cellchip c-warn">REC</span>
        ) : null}
        {isFundingLocked ? (
          <span className="cellchip c-mut">🔒 LOCKED</span>
        ) : null}
      </Row>
      <div>
        <b>{row.label}</b>
      </div>
      {row.objective_text ? (
        <div className="sub">{row.objective_text}</div>
      ) : null}
      <Row>
        <span className="lbl">{row.status.replace(/_/g, " ")}</span>
        <span className="sp" />
        {row.link_url ? (
          <a
            className="linky"
            href={row.link_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {row.link_kind === "docusign" ? "✍ " : "🔗 "}{row.link_label ?? "Open link"}
          </a>
        ) : null}
      </Row>
      {isAI && (row.attempts_made ?? 0) > 0 ? (
        <div className="sub">
          {row.attempts_made} attempt{row.attempts_made === 1 ? "" : "s"} so far
        </div>
      ) : null}
    </div>
  );
}

// ── Preset button ──────────────────────────────────────────────────

function PresetButton({ onClick, children, tone }: { onClick: () => void; children: React.ReactNode; tone?: "danger" }) {
  return (
    <Btn size="sm" className={cx(tone === "danger" && "c-bad")} onClick={onClick}>
      {children}
    </Btn>
  );
}
