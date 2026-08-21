"use client";

// AISecretaryTimeline — single-pipeline view of the file's work.
//
// Replaces the two-column Human owns / AI owns layout with four
// vertically-stacked sections sorted by where each task is in the
// flow:
//
//   NEXT UP      — tasks whose deps are done; ready to be picked up.
//   IN PROGRESS  — tasks the AI or a human is actively working.
//   UPCOMING     — tasks blocked by an unfinished dependency.
//   DONE         — completed / verified / waived.
//
// Per task we surface ONLY:
//   • Owner (Human / AI / Shared) — click to flip
//   • Label + one-line objective
//   • Category chip
//   • Status pill
//   • Link button when a DocuSign / e-sign URL is configured
//
// No cadence hours, no channel pickers, no completion-mode toggles.
// The system schedules.
//
// Sub-tasks (rows with parent_key set) are nested under the parent
// card so A,B,C,D under X show as a single grouped card.
//
// Styling is the shared class system (globals.css + app-extras.css):
// a section is a `.card` with a collapse header, a task is a `.rung`
// (`.cur` = Elara owns it, `.done` = faded), and the stack spacing is
// `.ladder`. No palette tokens live in this file.

import { useMemo, useState } from "react";
import {
  Btn,
  Card,
  CellChip,
  Input,
  Lbl,
  Seg,
  Tag,
  cx,
  type ChipTone,
} from "@/components/ds";
import {
  DS_CATEGORY_META,
  type DSDealSecretaryView,
  type DSRequirementCategory,
  type DSTaskRow,
  type DSTimelineState,
} from "@/lib/types";

/** Section marker dot. The chip beside it carries the same tone, but a
 *  `.cellchip` cannot be a 8px circle, so the dot reads its colour from
 *  the same palette variable the tone class uses. */
const TONE_DOT: Record<ChipTone, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--danger)",
  mut: "var(--muted)",
  acc: "var(--accent)",
  gold: "var(--gold)",
  pet: "var(--petrol)",
};

export interface AISecretaryTimelineProps {
  view: DSDealSecretaryView;
  isOperator: boolean;
  onAssign: (key: string) => void;
  onUnassign: (key: string) => void;
  onOpenAssignment?: (row: DSTaskRow) => void;
  /** Called when the user fills out the "+ New task" form. Returns
   *  a Promise so the button can show a loading state. */
  onCreateCustomTask?: (input: {
    label: string;
    owner_type: "human" | "ai";
    objective_text?: string;
  }) => Promise<void>;
}

export function AISecretaryTimeline({
  view, isOperator, onAssign, onUnassign, onOpenAssignment, onCreateCustomTask,
}: AISecretaryTimelineProps) {
  const [adhoc, setAdhoc] = useState<{ label: string; owner: "human" | "ai"; objective: string } | null>(null);
  const [creating, setCreating] = useState(false);

  // Group tasks by parent_key. Parent rows render the card; children
  // are nested. Orphan children (parent doesn't exist as a CRS row)
  // render as standalone rows.
  const allRows = useMemo(() => {
    const seen = new Set<string>();
    const out: DSTaskRow[] = [];
    for (const r of [...(view.next_up ?? []), ...(view.in_progress ?? []), ...(view.upcoming ?? []), ...(view.done ?? [])]) {
      if (!seen.has(r.requirement_key)) {
        seen.add(r.requirement_key);
        out.push(r);
      }
    }
    return out;
  }, [view]);

  const childrenByParent = useMemo(() => {
    const m = new Map<string, DSTaskRow[]>();
    for (const r of allRows) {
      if (r.parent_key) {
        const arr = m.get(r.parent_key) ?? [];
        arr.push(r);
        m.set(r.parent_key, arr);
      }
    }
    return m;
  }, [allRows]);

  // Top-level rows = rows with no parent_key OR whose parent isn't in
  // the visible row set.
  const visibleParentKeys = useMemo(() => new Set(allRows.map((r) => r.requirement_key)), [allRows]);
  const topLevel = useMemo(
    () => allRows.filter((r) => !r.parent_key || !visibleParentKeys.has(r.parent_key)),
    [allRows, visibleParentKeys],
  );

  // Re-bucket top-level rows by timeline_state for the section render.
  const buckets = useMemo(() => {
    const byState: Record<DSTimelineState, DSTaskRow[]> = {
      next_up: [], in_progress: [], upcoming: [], done: [], waived: [],
    };
    for (const r of topLevel) {
      const s = r.timeline_state ?? "next_up";
      (byState[s] ?? byState.next_up).push(r);
    }
    return byState;
  }, [topLevel]);

  const handleCreate = async () => {
    if (!adhoc || !adhoc.label.trim() || !onCreateCustomTask) return;
    setCreating(true);
    try {
      await onCreateCustomTask({
        label: adhoc.label.trim(),
        owner_type: adhoc.owner,
        objective_text: adhoc.objective.trim() || undefined,
      });
      setAdhoc(null);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="ladder">
      {/* "+ New task" — ad-hoc one-off work not in the playbook.
          Lands as a real CRS row so it shows on the timeline. */}
      {onCreateCustomTask ? (
        adhoc ? (
          <Card className="ladder">
            <Input
              value={adhoc.label}
              onChange={(e) => setAdhoc({ ...adhoc, label: e.target.value })}
              autoFocus
              aria-label="Task"
              placeholder="e.g. Follow up about tenant leaving on the 1st"
            />
            <Input
              value={adhoc.objective}
              onChange={(e) => setAdhoc({ ...adhoc, objective: e.target.value })}
              aria-label="Objective"
              placeholder="What needs to happen (optional)"
            />
            <div className="row">
              <Lbl>Owner</Lbl>
              <Seg<"human" | "ai">
                value={adhoc.owner}
                onChange={(o) => setAdhoc({ ...adhoc, owner: o })}
                ariaLabel="Task owner"
                as="filter"
                options={[
                  { value: "human", label: "My Tasks" },
                  { value: "ai", label: "Elara" },
                ]}
              />
              <span className="sp" />
              <Btn onClick={() => setAdhoc(null)}>Cancel</Btn>
              <Btn
                variant="pri"
                onClick={handleCreate}
                disabled={creating || !adhoc.label.trim()}
              >
                {creating ? "Adding…" : "Add task"}
              </Btn>
            </div>
          </Card>
        ) : (
          <div className="row">
            <span className="sp" />
            <Btn onClick={() => setAdhoc({ label: "", owner: "human", objective: "" })}>
              + New task
            </Btn>
          </div>
        )
      ) : null}

      <Section
        title="Next up"
        eyebrow={`${buckets.next_up.length} ready`}
        tone="acc"
        emptyHint="No tasks ready right now."
      >
        {buckets.next_up.map((row) => (
          <TaskCard
            key={row.requirement_key}
            row={row}
            children={childrenByParent.get(row.requirement_key) ?? []}
            isOperator={isOperator}
            onAssign={onAssign}
            onUnassign={onUnassign}
            onOpenAssignment={onOpenAssignment}
          />
        ))}
      </Section>

      <Section
        title="In progress"
        eyebrow={`${buckets.in_progress.length} active`}
        tone="warn"
        emptyHint="Nothing actively being chased."
      >
        {buckets.in_progress.map((row) => (
          <TaskCard
            key={row.requirement_key}
            row={row}
            children={childrenByParent.get(row.requirement_key) ?? []}
            isOperator={isOperator}
            onAssign={onAssign}
            onUnassign={onUnassign}
            onOpenAssignment={onOpenAssignment}
          />
        ))}
      </Section>

      <Section
        title="Upcoming"
        eyebrow={`${buckets.upcoming.length} waiting`}
        tone="mut"
        emptyHint="Everything is either done, in flight, or ready to pick up."
        collapsibleDefault={true}
      >
        {buckets.upcoming.map((row) => (
          <TaskCard
            key={row.requirement_key}
            row={row}
            children={childrenByParent.get(row.requirement_key) ?? []}
            isOperator={isOperator}
            onAssign={onAssign}
            onUnassign={onUnassign}
            onOpenAssignment={onOpenAssignment}
          />
        ))}
      </Section>

      <Section
        title="Done"
        eyebrow={`${buckets.done.length} complete`}
        tone="ok"
        emptyHint="No tasks completed yet."
        collapsibleDefault={true}
      >
        {buckets.done.map((row) => (
          <TaskCard
            key={row.requirement_key}
            row={row}
            children={childrenByParent.get(row.requirement_key) ?? []}
            isOperator={isOperator}
            onAssign={onAssign}
            onUnassign={onUnassign}
            onOpenAssignment={onOpenAssignment}
            faded
          />
        ))}
      </Section>
    </div>
  );
}

// ── Section ────────────────────────────────────────────────────────

function Section({
  title, eyebrow, tone, children, emptyHint, collapsibleDefault,
}: {
  title: string;
  eyebrow: string;
  /** Replaces the old accent/bg colour pair — the tone drives the chip
   *  class and the marker dot together, so they can no longer drift. */
  tone: ChipTone;
  children: React.ReactNode;
  emptyHint: string;
  collapsibleDefault?: boolean;
}) {
  const childArr = Array.isArray(children) ? children : [children];
  const isEmpty = !childArr.some(Boolean);
  const [collapsed, setCollapsed] = useState<boolean>(!!collapsibleDefault);
  return (
    <section className="card">
      {/* A real button, so it keeps its focus ring and Enter/Space
          activation. The old `all: unset` stripped the ring off it. */}
      <button
        type="button"
        className="row"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((v) => !v)}
        style={{ width: "100%" }}
      >
        <span className="repdot" style={{ background: TONE_DOT[tone] }} />
        <b>{title}</b>
        <CellChip tone={tone}>{eyebrow}</CellChip>
        <span className="sp" />
        {!isEmpty ? (
          <span className="sub">{collapsed ? "Show" : "Hide"}</span>
        ) : null}
      </button>
      {collapsed ? null : isEmpty ? (
        <div className="sub mt">{emptyHint}</div>
      ) : (
        <div className="ladder mt">{children}</div>
      )}
    </section>
  );
}

// ── TaskCard ───────────────────────────────────────────────────────

function TaskCard({
  row, children, isOperator, onAssign, onUnassign, onOpenAssignment, faded,
}: {
  row: DSTaskRow;
  children: DSTaskRow[];
  isOperator: boolean;
  onAssign: (key: string) => void;
  onUnassign: (key: string) => void;
  onOpenAssignment?: (row: DSTaskRow) => void;
  faded?: boolean;
}) {
  const cat = DS_CATEGORY_META[row.category as DSRequirementCategory]?.short ?? row.category;
  const isAI = row.owner_type === "ai";
  const isLocked = row.owner_type === "funding_locked" && !isOperator;
  const canControl = isOperator || row.can_agent_override;
  return (
    <div className={cx("rung", isAI && "cur", faded && "done")}>
      {/* `.rung` is a flex row; everything stacks inside this one column
          so the nested sub-task block sits under the parent's content. */}
      <div className="ladder sp" style={{ minWidth: 0 }}>
        <div className="row">
          <Tag>{cat}</Tag>
          {row.required_level === "required" ? (
            <CellChip tone="bad">REQ</CellChip>
          ) : row.required_level === "recommended" ? (
            <CellChip tone="warn">REC</CellChip>
          ) : null}
          {isLocked ? <CellChip tone="mut">🔒 LOCKED</CellChip> : null}
          <span className="sub">{statusLabel(row.status)}</span>
          <span className="sp" />
          {/* Owner flip. Disabled — not hidden — when the viewer cannot
              control it, so the current owner still reads. */}
          <Btn
            size="sm"
            variant={isAI ? "pri" : "default"}
            disabled={!canControl}
            onClick={() => isAI ? onUnassign(row.requirement_key) : onAssign(row.requirement_key)}
          >
            {isAI ? "Elara" : isLocked ? "🔒 Funding" : row.owner_type === "shared" ? "Shared" : "My Tasks"}
          </Btn>
          {isAI && row.assignment_id && onOpenAssignment ? (
            <Btn size="sm" onClick={() => onOpenAssignment(row)}>
              Notes
            </Btn>
          ) : null}
        </div>

        <b>{row.label}</b>

        {row.objective_text ? (
          <div className="sub">{row.objective_text}</div>
        ) : null}

        {row.link_url ? (
          <div>
            <a
              className="linky"
              href={row.link_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              {row.link_kind === "docusign" ? "✍ " : "🔗 "}
              {row.link_label ?? "Open link"}
            </a>
          </div>
        ) : null}

        {row.blocked_by && row.blocked_by.length > 0 ? (
          <div className="sub">Waiting on: {row.blocked_by.join(", ")}</div>
        ) : null}

        {/* Nested sub-tasks if this card is a parent */}
        {children.length > 0 ? (
          <div className="mt">
            <Lbl>Sub-tasks</Lbl>
            <div className="ladder mt">
              {children.map((child) => (
                <TaskCard
                  key={child.requirement_key}
                  row={child}
                  children={[]}
                  isOperator={isOperator}
                  onAssign={onAssign}
                  onUnassign={onUnassign}
                  onOpenAssignment={onOpenAssignment}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}
