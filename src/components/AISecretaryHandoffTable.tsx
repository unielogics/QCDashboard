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
//
// Restyled onto the plain-CSS design system. This screen is mostly
// drag-state feedback, so more stays inline here than anywhere else in the
// batch — every border, tint and opacity below is read off `drop.isOver`,
// the row's owner, or the hover/drag flags, which is exactly the case the
// inline escape hatch exists for. What did move to classes: the column
// headers are `.cellchip`s (the AI column's blue and the Human column's grey
// were the point of the hand-picked colours), the row number tile is
// `.datetile`, the delete control is a `.btn.danger` (its hover tint is now
// CSS, not two mouse handlers), the task label is `.trunc`, the category
// badge is `.mlbl`, and the drag preview is `.dragchip`.

import { useEffect, useMemo, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Icon } from "@/components/design-system/Icon";
import { Btn, CellChip, cx } from "@/components/ds";
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

/** The 48px number gutter plus the two equal owner columns. A bespoke track,
 *  not a page grid — it lives here rather than on `.cg`. */
const TRACK: React.CSSProperties = { gridTemplateColumns: "48px 1fr 1fr" };

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
    <div className="grid g8">
      <div className="grid g8" style={TRACK}>
        <span className="lbl">#</span>
        <span>
          <CellChip tone="acc">
            <Icon name="ai" size={11} stroke={2.2} />
            AI
          </CellChip>
        </span>
        <span>
          <CellChip tone="mut">
            <Icon name="user" size={11} stroke={2.2} />
            Human
          </CellChip>
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
  const aiActive = row.owner === "ai";
  const humanActive = row.owner === "human";
  const empty = row.owner === null;

  return (
    <div className="grid g8" style={{ ...TRACK, alignItems: "stretch" }}>
      <div className="datetile">
        <div className="d">{rowNumber}</div>
        {/* Data-derived: the owner word is tinted by which party holds the
            row, which `.datetile .m` cannot know. */}
        <div
          className="m"
          style={{
            color: aiActive ? "var(--accent)" : humanActive ? "var(--ink2)" : "var(--muted)",
          }}
        >
          {aiActive ? "AI" : humanActive ? "HUMAN" : "OPEN"}
        </div>
        {showDelete ? (
          /* `.btn` is inline-flex, so it centres inside `.datetile`'s
             text-align:center. `.iconbtn` would not — it is display:grid,
             which makes it a block box parked against the left edge. */
          <Btn
            size="sm"
            className="danger"
            onClick={onDeleteRow}
            aria-label={`Remove row ${rowNumber}`}
            title="Remove this row"
          >
            ×
          </Btn>
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
  const dropId = `handoff:${rowId}:${owner}`;
  // Every cell is a drop target — including the "owned by the other
  // party" column. Dropping there flips the whole row's owner (the
  // "one party per row" rule means a cross-column drop is an explicit
  // hand-off, not a split), which the parent's handler handles.
  const drop = useDroppable({ id: dropId });
  void active;
  const accent = owner === "ai" ? "var(--accent)" : "var(--ink2)";
  const tint = owner === "ai" ? "var(--accent-100)" : "var(--sunken2)";
  const borderColor = drop.isOver
    ? accent
    : ownedByOther
      ? "var(--line)"
      : taskKeys.length
        ? accent
        : "var(--line)";
  return (
    <div
      ref={drop.setNodeRef}
      // Every value here is drag-state: the border style and colour, the
      // tint and the dimming are all read off drop.isOver / ownedByOther /
      // whether the cell holds work. There is no class that can know them.
      style={{
        minHeight: 60,
        borderRadius: 10,
        border: `1.5px ${drop.isOver ? "dashed" : ownedByOther ? "dashed" : "solid"} ${borderColor}`,
        background: ownedByOther
          ? drop.isOver ? tint : "transparent"
          : drop.isOver ? tint : taskKeys.length ? "var(--surface)" : "var(--sunken2)",
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
        /* Bespoke: an overlay watermark filling the dimmed cell. */
        <span
          className="sub"
          style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          ⤺ row handed to other party
        </span>
      ) : ownedByOther && drop.isOver ? (
        /* Data-derived: the prompt takes the target column's accent. */
        <span
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            minHeight: 44,
            fontSize: 11.5, color: accent, fontWeight: 900, letterSpacing: 0.2,
          }}
        >
          Drop to flip row → {owner === "ai" ? "Elara" : "My Tasks"}
        </span>
      ) : taskKeys.length === 0 ? (
        /* Data-derived: the empty slot goes from a muted italic hint to the
           column's accent the moment something is dragged over it. */
        <span
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            minHeight: 44,
            fontSize: 11.5, color: drop.isOver ? accent : "var(--muted)",
            fontWeight: drop.isOver ? 900 : 700,
            fontStyle: drop.isOver ? "normal" : "italic",
            letterSpacing: 0.2,
          }}
        >
          {drop.isOver ? `Drop here → ${owner === "ai" ? "Elara" : "My Tasks"}` : `Drag work here`}
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
  const accent = owner === "ai" ? "var(--accent)" : "var(--ink2)";
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
      // Data-derived: the lift on hover and the ghosting while dragging.
      // The rest is the bespoke two-zone (handle | remove) chip box.
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        borderRadius: 8,
        background: hover ? "var(--surface)" : "var(--sunken2)",
        border: `1px solid ${hover ? accent : "var(--line)"}`,
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
        className="grabbable"
        title="Drag to move. Right-click to send back to the Resolution Queue."
        // Bespoke: the grab zone claims the row minus the × gutter.
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "7px 9px",
        }}
      >
        <Icon name={owner === "ai" ? "ai" : "user"} size={12} stroke={2.2} />
        <b className="grow trunc">{label}</b>
        {cat ? <span className="mlbl">{String(cat).slice(0, 12)}</span> : null}
      </div>

      {/* REMOVE BUTTON — separate hit zone, outside dnd-kit listeners */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        aria-label="Remove from this row"
        title="Remove from this row (returns to an empty slot)"
        // Data-derived: the gutter picks up the danger tint while the chip
        // it belongs to is hovered, which is a parent-state rule that no
        // :hover selector on this element can express.
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          minHeight: 32,
          padding: 0,
          background: hover ? "var(--danger-tint)" : "transparent",
          color: hover ? "var(--danger)" : "var(--muted)",
          border: "none",
          borderLeft: "1px solid var(--line)",
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
  return (
    <div
      className={cx("dragchip", owner === "ai" && "ai")}
      // The lifted shadow, the tilt and the cap on width are what make this
      // read as "in flight"; `.dragchip` owns the box and the owner tint.
      style={{
        boxShadow: "0 10px 24px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.12)",
        pointerEvents: "none",
        maxWidth: 360,
        transform: "rotate(-1deg)",
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
      }}
    >
      <Icon name={owner === "ai" ? "ai" : "user"} size={13} stroke={2.2} />
      <span className="trunc">{label}</span>
    </div>
  );
}
