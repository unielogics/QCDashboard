"use client";

// AISecretaryHandoffTable — operator-configured handoff sequence.
//
// Numbered rows × 2 columns (AI | Human). Each row is one synchronized
// "step" in the deal flow, owned by exactly one party. Multiple tasks
// can live in the same cell — they all happen together at that step.
//
// Storage: per-loan client-side (localStorage). The handoff sequence is
// pure UI configuration on top of the existing CRS rows; the underlying
// owner_type writes through to the backend on drop so the AI/cadence
// engine sees the right ownership immediately. Row ordering itself is
// presentational — Phase B will add a `sequence_index` server-side.
//
// Drag sources accepted:
//   • ResolutionRow (Resolution Queue items) — payload { kind, label,
//     requirement_key? }. If requirement_key matches an existing CRS
//     row we assign + slot; otherwise we create a new custom task.
//   • Timeline TaskCards — payload { task: "<requirement_key>" }. We
//     re-slot the row + flip ownership.
//
// Drop targets: each (row, owner) cell uses id "handoff:<row_id>:<owner>"
// so the parent DndContext (in DealWorkspaceTab) can route on drag-end.

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Icon } from "@/components/design-system/Icon";
import type { DSDealSecretaryView, DSTaskRow } from "@/lib/types";

export interface HandoffRow {
  id: string;
  owner: "ai" | "human" | null;
  taskKeys: string[];
}

export interface AISecretaryHandoffTableProps {
  view: DSDealSecretaryView;
  loanId: string;
  isOperator: boolean;
  /** When the user drops a queue/timeline task on a cell. */
  onAssign: (key: string) => void;
  onUnassign: (key: string) => void;
  /** Row state, mirrored from the parent for drag-end routing. */
  rows: HandoffRow[];
  setRows: (next: HandoffRow[]) => void;
  /** Right-click on a cell-task → send back to Resolution Queue.
   *  Removes from the handoff config + flips the owner_type back to
   *  human server-side (and frees the row owner if this was the last
   *  task in the cell). */
  onUnplaceTask?: (taskKey: string) => void;
}

const STORAGE_PREFIX = "qc.secretary.handoff.";

export function loadHandoffRows(loanId: string): HandoffRow[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + loanId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as HandoffRow[];
  } catch {
    return null;
  }
}

export function saveHandoffRows(loanId: string, rows: HandoffRow[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + loanId, JSON.stringify(rows));
  } catch {
    // Quota / private-mode — ignore. Worst case the next reload starts fresh.
  }
}

export function defaultHandoffRows(view: DSDealSecretaryView): HandoffRow[] {
  // Seed with all existing tasks, distributed by their current owner type.
  // Each task gets its own row so the operator sees the full inventory
  // and can collapse rows by dragging tasks together.
  const allTasks = [...view.left, ...view.right];
  const rows: HandoffRow[] = allTasks.map((t, i) => ({
    id: `row_${i + 1}`,
    owner: t.owner_type === "ai" ? "ai" : t.owner_type === "shared" ? "ai" : "human",
    taskKeys: [t.requirement_key],
  }));
  // Always end with at least one empty row so the user can add new work.
  rows.push({ id: `row_${allTasks.length + 1}`, owner: null, taskKeys: [] });
  return rows;
}

export function AISecretaryHandoffTable({
  view, loanId: _loanId, isOperator: _isOperator, onAssign: _onAssign, onUnassign: _onUnassign, rows, setRows, onUnplaceTask,
}: AISecretaryHandoffTableProps) {
  const { t } = useTheme();

  // Build a key → task map so each cell can render the full task labels.
  const tasksByKey = useMemo(() => {
    const m = new Map<string, DSTaskRow>();
    for (const r of [...view.left, ...view.right]) {
      m.set(r.requirement_key, r);
    }
    return m;
  }, [view]);

  // Track tasks NOT yet placed in any row so the operator knows the
  // table is in sync with the underlying data. New CRS rows that
  // appear after a drop land here until placed.
  const placedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) for (const k of r.taskKeys) s.add(k);
    return s;
  }, [rows]);
  const orphanTasks = useMemo(
    () => [...view.left, ...view.right].filter((t) => !placedKeys.has(t.requirement_key)),
    [view, placedKeys],
  );

  // Single absorber effect that keeps the table consistent:
  //   1) place any orphan tasks (just created / just unplaced) into a
  //      trailing empty row, owner inferred from server CRS state;
  //   2) guarantee exactly one trailing empty row so the operator
  //      always has a fresh drop target — no manual "+ Add row" needed.
  useEffect(() => {
    let changed = false;
    let next = [...rows];
    for (const orphan of orphanTasks) {
      const ownerCol: "ai" | "human" = orphan.owner_type === "ai" ? "ai" : "human";
      const lastEmptyIdx = next.findIndex(
        (r) => r.taskKeys.length === 0 && (r.owner === null || r.owner === ownerCol),
      );
      if (lastEmptyIdx !== -1) {
        next[lastEmptyIdx] = {
          ...next[lastEmptyIdx],
          owner: ownerCol,
          taskKeys: [orphan.requirement_key],
        };
      } else {
        next.push({
          id: `row_${next.length + 1}_${Date.now().toString(36)}`,
          owner: ownerCol,
          taskKeys: [orphan.requirement_key],
        });
      }
      changed = true;
    }
    // Trim trailing empty rows down to exactly one. We never want a
    // stack of empties and we always want exactly one open slot.
    while (next.length >= 2 && next[next.length - 1].taskKeys.length === 0 && next[next.length - 2].taskKeys.length === 0) {
      next = next.slice(0, -1);
      changed = true;
    }
    if (next.length === 0 || next[next.length - 1].taskKeys.length > 0) {
      next.push({
        id: `row_${next.length + 1}_${Date.now().toString(36)}`,
        owner: null,
        taskKeys: [],
      });
      changed = true;
    }
    if (changed) setRows(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orphanTasks.length, rows.length, rows.map((r) => r.taskKeys.length).join(",")]);

  const removeKeyFromRow = (rowId: string, key: string) => {
    const next = rows.map((r) =>
      r.id === rowId
        ? { ...r, taskKeys: r.taskKeys.filter((k) => k !== key) }
        : r,
    );
    setRows(next);
  };

  const deleteRow = (rowId: string) => {
    setRows(rows.filter((r) => r.id !== rowId));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "grid", gridTemplateColumns: "48px 1fr 1fr", gap: 7, paddingBottom: 2 }}>
        <span style={cellHeader(t)}>#</span>
        <span style={{ ...cellHeader(t), color: t.brand, display: "flex", alignItems: "center", gap: 5 }}>
          <Icon name="ai" size={11} stroke={2.2} />
          AI
        </span>
        <span style={{ ...cellHeader(t), display: "flex", alignItems: "center", gap: 5 }}>
          <Icon name="user" size={11} stroke={2.2} />
          Human
        </span>
      </div>
      {rows.map((row, i) => (
        <HandoffRowView
          key={row.id}
          rowNumber={i + 1}
          row={row}
          tasksByKey={tasksByKey}
          onRemoveKey={(key) => removeKeyFromRow(row.id, key)}
          onDeleteRow={() => deleteRow(row.id)}
          showDelete={rows.length > 1}
          onUnplaceTask={onUnplaceTask}
        />
      ))}
    </div>
  );
}

function HandoffRowView({
  rowNumber, row, tasksByKey, onRemoveKey, onDeleteRow, showDelete, onUnplaceTask,
}: {
  rowNumber: number;
  row: HandoffRow;
  tasksByKey: Map<string, DSTaskRow>;
  onRemoveKey: (key: string) => void;
  onDeleteRow: () => void;
  showDelete: boolean;
  onUnplaceTask?: (taskKey: string) => void;
}) {
  const { t } = useTheme();
  const aiActive = row.owner === "ai";
  const humanActive = row.owner === "human";
  const empty = row.owner === null;

  const accent = aiActive ? t.brand : humanActive ? t.ink2 : t.ink3;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "48px 1fr 1fr", gap: 7, alignItems: "stretch" }}>
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
        padding: "10px 4px", borderRadius: 10,
        background: t.surface2,
        border: `1px solid ${t.line}`,
        position: "relative",
      }}>
        <span style={{
          fontSize: 15, fontWeight: 900, color: t.ink, lineHeight: 1,
        }}>
          {rowNumber}
        </span>
        <span style={{
          fontSize: 8.5, fontWeight: 900, letterSpacing: 0.6,
          textTransform: "uppercase", color: accent,
          marginTop: 4, marginBottom: 4,
        }}>
          {aiActive ? "AI" : humanActive ? "HUMAN" : "OPEN"}
        </span>
        {showDelete ? (
          <button
            type="button"
            onClick={onDeleteRow}
            aria-label={`Remove row ${rowNumber}`}
            title="Remove this row"
            style={{
              all: "unset",
              cursor: "pointer",
              color: t.ink3,
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1,
              padding: "4px 8px",
              borderRadius: 6,
              background: "transparent",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = t.dangerBg; e.currentTarget.style.color = t.danger; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = t.ink3; }}
          >×</button>
        ) : null}
      </div>
      <HandoffCell
        rowId={row.id}
        owner="ai"
        active={aiActive || empty}
        ownedByOther={humanActive}
        tasksByKey={tasksByKey}
        taskKeys={aiActive ? row.taskKeys : []}
        onRemoveKey={onRemoveKey}
        onUnplaceTask={onUnplaceTask}
      />
      <HandoffCell
        rowId={row.id}
        owner="human"
        active={humanActive || empty}
        ownedByOther={aiActive}
        tasksByKey={tasksByKey}
        taskKeys={humanActive ? row.taskKeys : []}
        onRemoveKey={onRemoveKey}
        onUnplaceTask={onUnplaceTask}
      />
    </div>
  );
}

function HandoffCell({
  rowId, owner, active, ownedByOther, tasksByKey, taskKeys, onRemoveKey, onUnplaceTask,
}: {
  rowId: string;
  owner: "ai" | "human";
  active: boolean;
  ownedByOther: boolean;
  tasksByKey: Map<string, DSTaskRow>;
  taskKeys: string[];
  onRemoveKey: (key: string) => void;
  onUnplaceTask?: (taskKey: string) => void;
}) {
  const { t } = useTheme();
  const dropId = `handoff:${rowId}:${owner}`;
  // Every cell is a drop target — including the "owned by the other
  // party" column. Dropping there flips the whole row's owner (the
  // "one party per row" rule means a cross-column drop is an explicit
  // hand-off, not a split), which the parent's handler handles.
  const drop = useDroppable({ id: dropId });
  void active;
  const accent = owner === "ai" ? t.brand : t.ink2;
  const tint = owner === "ai" ? t.brandSoft : t.surface2;
  const borderColor = drop.isOver
    ? accent
    : ownedByOther
      ? `${t.line}`
      : taskKeys.length
        ? accent
        : t.line;
  return (
    <div
      ref={drop.setNodeRef}
      style={{
        minHeight: 60,
        borderRadius: 10,
        border: `1.5px ${drop.isOver ? "dashed" : ownedByOther ? "dashed" : "solid"} ${borderColor}`,
        background: ownedByOther
          ? drop.isOver ? tint : "transparent"
          : drop.isOver ? tint : taskKeys.length ? t.surface : t.surface2,
        opacity: ownedByOther && !drop.isOver ? 0.45 : 1,
        padding: 8,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        position: "relative",
        transition: "background 0.12s, border-color 0.12s, opacity 0.12s",
      }}
    >
      {ownedByOther && !drop.isOver ? (
        <span style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 800, color: t.ink3,
          letterSpacing: 0.5,
        }}>
          ⤺ row handed to other party
        </span>
      ) : ownedByOther && drop.isOver ? (
        <span style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: 44,
          fontSize: 11.5, color: accent, fontWeight: 900, letterSpacing: 0.2,
        }}>
          Drop to flip row → {owner === "ai" ? "My AI Secretary" : "My Tasks"}
        </span>
      ) : taskKeys.length === 0 ? (
        <span style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          minHeight: 44,
          fontSize: 11.5, color: drop.isOver ? accent : t.ink3,
          fontWeight: drop.isOver ? 900 : 700,
          fontStyle: drop.isOver ? "normal" : "italic",
          letterSpacing: 0.2,
        }}>
          {drop.isOver ? `Drop here → ${owner === "ai" ? "My AI Secretary" : "My Tasks"}` : `Drag work here`}
        </span>
      ) : (
        taskKeys.map((k) => (
          <HandoffTaskChip
            key={k}
            taskKey={k}
            task={tasksByKey.get(k)}
            owner={owner}
            onRemove={() => onRemoveKey(k)}
            onUnplace={onUnplaceTask ? () => onUnplaceTask(k) : undefined}
          />
        ))
      )}
    </div>
  );
}

function HandoffTaskChip({
  taskKey, task, owner, onRemove, onUnplace,
}: {
  taskKey: string;
  task?: DSTaskRow;
  owner: "ai" | "human";
  onRemove: () => void;
  onUnplace?: () => void;
}) {
  const { t } = useTheme();
  const [hover, setHover] = useState(false);
  const label = task?.label ?? taskKey;
  const cat = task?.category ?? "";
  // Task chip is draggable so users can drag from one cell into another
  // (Human → AI in the same row, or AI in row 1 → Human in row 3, etc.).
  // CRITICAL: drag.listeners is applied ONLY to the inner handle, NOT to
  // the whole chip. Putting listeners on the whole chip lets dnd-kit
  // intercept pointer events on the × button — even with stopPropagation
  // the click was inconsistent because the pointer sensor's 4px
  // activation could promote a click into a drag and swallow the
  // onClick. With a dedicated drag handle the × button is a normal
  // <button> that always fires.
  const drag = useDraggable({
    id: `chip:${taskKey}`,
    data: { kind: "chip", requirement_key: taskKey, label },
  });
  const accent = owner === "ai" ? t.brand : t.ink2;
  return (
    <div
      ref={drag.setNodeRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onContextMenu={(e) => {
        if (!onUnplace) return;
        e.preventDefault();
        onUnplace();
      }}
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        borderRadius: 8,
        background: hover ? t.surface : t.surface2,
        border: `1px solid ${hover ? accent : t.line}`,
        minWidth: 0,
        userSelect: "none",
        opacity: drag.isDragging ? 0.4 : 1,
        overflow: "hidden",
        transition: "background 0.12s, border-color 0.12s",
      }}
    >
      {/* DRAG HANDLE — everything except the × is the grab area */}
      <div
        {...drag.attributes}
        {...drag.listeners}
        title="Drag to move. Right-click to send back to the Resolution Queue."
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "7px 9px",
          cursor: "grab",
        }}
      >
        <Icon name={owner === "ai" ? "ai" : "user"} size={12} stroke={2.2} />
        <span style={{
          flex: 1, minWidth: 0,
          fontSize: 12, fontWeight: 700, color: t.ink,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          lineHeight: 1.3,
        }}>
          {label}
        </span>
        {cat ? (
          <span style={{
            fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4,
            background: t.chip, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.4,
            whiteSpace: "nowrap",
          }}>
            {String(cat).slice(0, 12)}
          </span>
        ) : null}
      </div>

      {/* REMOVE BUTTON — separate hit zone, outside dnd-kit listeners */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        aria-label="Remove from this row"
        title="Remove from this row (returns to an empty slot)"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          minHeight: 32,
          padding: 0,
          background: hover ? t.dangerBg : "transparent",
          color: hover ? t.danger : t.ink3,
          border: "none",
          borderLeft: `1px solid ${t.line}`,
          fontSize: 18,
          fontWeight: 700,
          lineHeight: 1,
          cursor: "pointer",
          fontFamily: "inherit",
          flexShrink: 0,
          transition: "background 0.12s, color 0.12s",
        }}
      >
        ×
      </button>
    </div>
  );
}

/** Read-only preview rendered inside the parent's <DragOverlay /> so the
 *  user sees what they're dragging follow the cursor. */
export function HandoffChipPreview({ label, owner }: { label: string; owner: "ai" | "human" }) {
  const { t } = useTheme();
  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      padding: "8px 12px",
      borderRadius: 9,
      background: owner === "ai" ? t.brandSoft : t.surface,
      border: `1.5px solid ${owner === "ai" ? t.brand : t.lineStrong}`,
      boxShadow: "0 10px 24px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.12)",
      fontSize: 12.5, fontWeight: 800, color: t.ink,
      pointerEvents: "none",
      maxWidth: 360,
      transform: "rotate(-1deg)",
    }}>
      <Icon name={owner === "ai" ? "ai" : "user"} size={13} stroke={2.2} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
    </div>
  );
}


function cellHeader(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 900, letterSpacing: 1.1,
    textTransform: "uppercase", color: t.ink3,
    padding: "0 4px",
  };
}
