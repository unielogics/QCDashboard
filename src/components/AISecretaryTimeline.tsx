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

import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import {
  DS_CATEGORY_META,
  type DSDealSecretaryView,
  type DSRequirementCategory,
  type DSTaskRow,
  type DSTimelineState,
} from "@/lib/types";

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
  const { t } = useTheme();
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
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* "+ New task" — ad-hoc one-off work not in the playbook.
          Lands as a real CRS row so it shows on the timeline. */}
      {onCreateCustomTask ? (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {adhoc ? (
            <div style={{
              flex: 1,
              border: `1px solid ${t.line}`,
              borderRadius: 11,
              background: t.surface,
              padding: 11,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}>
              <input
                value={adhoc.label}
                onChange={(e) => setAdhoc({ ...adhoc, label: e.target.value })}
                autoFocus
                placeholder="e.g. Follow up about tenant leaving on the 1st"
                style={{
                  padding: "9px 11px", borderRadius: 8,
                  background: t.surface2, color: t.ink,
                  border: `1px solid ${t.line}`, fontSize: 13,
                  outline: "none", fontFamily: "inherit",
                }}
              />
              <input
                value={adhoc.objective}
                onChange={(e) => setAdhoc({ ...adhoc, objective: e.target.value })}
                placeholder="What needs to happen (optional)"
                style={{
                  padding: "9px 11px", borderRadius: 8,
                  background: t.surface2, color: t.ink,
                  border: `1px solid ${t.line}`, fontSize: 12.5,
                  outline: "none", fontFamily: "inherit",
                }}
              />
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: t.ink3, fontWeight: 700 }}>Owner:</span>
                {(["human", "ai"] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setAdhoc({ ...adhoc, owner: o })}
                    style={{
                      padding: "5px 10px", borderRadius: 7,
                      background: adhoc.owner === o ? t.brandSoft : t.surface2,
                      border: `1px solid ${adhoc.owner === o ? t.brand : t.line}`,
                      color: adhoc.owner === o ? t.brand : t.ink2,
                      fontSize: 11, fontWeight: 800,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {o === "ai" ? "AI handles" : "Human handles"}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => setAdhoc(null)}
                  style={{
                    padding: "6px 11px", borderRadius: 8,
                    background: t.surface2, color: t.ink2,
                    border: `1px solid ${t.line}`,
                    fontSize: 11, fontWeight: 800, cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating || !adhoc.label.trim()}
                  style={{
                    padding: "6px 13px", borderRadius: 8,
                    background: t.brand, color: t.inverse,
                    border: "none",
                    fontSize: 11, fontWeight: 900,
                    cursor: creating || !adhoc.label.trim() ? "not-allowed" : "pointer",
                    opacity: creating || !adhoc.label.trim() ? 0.55 : 1,
                    fontFamily: "inherit",
                  }}
                >
                  {creating ? "Adding…" : "Add task"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdhoc({ label: "", owner: "human", objective: "" })}
              style={{
                padding: "8px 14px", borderRadius: 9,
                background: t.surface2, color: t.ink2,
                border: `1px dashed ${t.line}`,
                fontSize: 12, fontWeight: 800,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              + New task
            </button>
          )}
        </div>
      ) : null}

      <Section
        title="Next up"
        eyebrow={`${buckets.next_up.length} ready`}
        accent={t.brand}
        bg={t.brandSoft}
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
        accent={t.warn}
        bg={t.warnBg}
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
        accent={t.ink3}
        bg={t.surface2}
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
        accent={t.profit}
        bg={t.profitBg}
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
  title, eyebrow, accent, bg, children, emptyHint, collapsibleDefault,
}: {
  title: string;
  eyebrow: string;
  accent: string;
  bg: string;
  children: React.ReactNode;
  emptyHint: string;
  collapsibleDefault?: boolean;
}) {
  const { t } = useTheme();
  const childArr = Array.isArray(children) ? children : [children];
  const isEmpty = !childArr.some(Boolean);
  const [collapsed, setCollapsed] = useState<boolean>(!!collapsibleDefault);
  return (
    <section style={{ border: `1px solid ${t.line}`, borderRadius: 12, background: t.surface, padding: 12 }}>
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          marginBottom: isEmpty || collapsed ? 0 : 10,
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: 999,
          background: accent,
        }} />
        <span style={{ fontSize: 13, fontWeight: 900, color: t.ink, letterSpacing: 0.2 }}>
          {title}
        </span>
        <span style={{
          fontSize: 10.5, fontWeight: 800,
          padding: "2px 7px", borderRadius: 4,
          background: bg, color: accent,
          letterSpacing: 0.4, textTransform: "uppercase",
        }}>
          {eyebrow}
        </span>
        <span style={{ flex: 1 }} />
        {!isEmpty ? (
          <span style={{ fontSize: 11, color: t.ink3 }}>
            {collapsed ? "Show" : "Hide"}
          </span>
        ) : null}
      </button>
      {collapsed ? null : isEmpty ? (
        <div style={{ fontSize: 12, color: t.ink3, padding: "8px 0 4px" }}>
          {emptyHint}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
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
  const { t } = useTheme();
  const cat = DS_CATEGORY_META[row.category as DSRequirementCategory]?.short ?? row.category;
  const isAI = row.owner_type === "ai";
  const isLocked = row.owner_type === "funding_locked" && !isOperator;
  const canControl = isOperator || row.can_agent_override;
  const ownerAccent = isAI ? t.brand : isLocked ? t.ink3 : t.ink2;
  const ownerBg = isAI ? t.brandSoft : isLocked ? t.surface2 : t.surface;
  return (
    <div style={{
      border: `1px solid ${isAI ? t.brand : t.line}`,
      borderRadius: 11,
      background: t.surface,
      padding: 11,
      opacity: faded ? 0.7 : 1,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 9.5, fontWeight: 800,
              padding: "1px 6px", borderRadius: 4,
              background: t.chip, color: t.ink3,
              letterSpacing: 0.4, textTransform: "uppercase",
            }}>
              {cat}
            </span>
            {row.required_level === "required" ? (
              <span style={{ fontSize: 9.5, fontWeight: 900, padding: "1px 5px", borderRadius: 4, background: t.dangerBg, color: t.danger }}>REQ</span>
            ) : row.required_level === "recommended" ? (
              <span style={{ fontSize: 9.5, fontWeight: 900, padding: "1px 5px", borderRadius: 4, background: t.warnBg, color: t.warn }}>REC</span>
            ) : null}
            {isLocked ? (
              <span style={{ fontSize: 9.5, fontWeight: 900, padding: "1px 5px", borderRadius: 4, background: t.surface2, color: t.ink3 }}>🔒 LOCKED</span>
            ) : null}
            <span style={{ fontSize: 10, color: t.ink3 }}>{statusLabel(row.status)}</span>
          </div>
          <div style={{ marginTop: 5, fontSize: 13, fontWeight: 800, color: t.ink, lineHeight: 1.25 }}>
            {row.label}
          </div>
          {row.objective_text ? (
            <div style={{ marginTop: 3, fontSize: 11.5, color: t.ink3, lineHeight: 1.4 }}>
              {row.objective_text}
            </div>
          ) : null}
          {row.link_url ? (
            <a
              href={row.link_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                marginTop: 6,
                fontSize: 11.5, fontWeight: 700, color: t.brand,
                textDecoration: "none",
              }}
            >
              {row.link_kind === "docusign" ? "✍ " : "🔗 "}
              {row.link_label ?? "Open link"}
            </a>
          ) : null}
          {row.blocked_by && row.blocked_by.length > 0 ? (
            <div style={{ marginTop: 6, fontSize: 10.5, color: t.ink3 }}>
              Waiting on: {row.blocked_by.join(", ")}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch" }}>
          <button
            type="button"
            disabled={!canControl}
            onClick={() => isAI ? onUnassign(row.requirement_key) : onAssign(row.requirement_key)}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              background: ownerBg,
              color: ownerAccent,
              border: `1px solid ${isAI ? t.brand : t.line}`,
              fontSize: 11, fontWeight: 900,
              cursor: canControl ? "pointer" : "not-allowed",
              opacity: canControl ? 1 : 0.5,
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            {isAI ? "AI handles" : isLocked ? "🔒 Funding" : row.owner_type === "shared" ? "Shared" : "Human handles"}
          </button>
          {isAI && row.assignment_id && onOpenAssignment ? (
            <button
              type="button"
              onClick={() => onOpenAssignment(row)}
              style={{
                padding: "5px 10px",
                borderRadius: 7,
                background: t.surface2,
                color: t.ink2,
                border: `1px solid ${t.line}`,
                fontSize: 10.5, fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Notes
            </button>
          ) : null}
        </div>
      </div>

      {/* Nested sub-tasks if this card is a parent */}
      {children.length > 0 ? (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: `1px dashed ${t.line}`,
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: t.ink3, letterSpacing: 0.6, textTransform: "uppercase" }}>
            Sub-tasks
          </div>
          {children.map((child) => (
            <div key={child.requirement_key} style={{ marginLeft: 10 }}>
              <TaskCard
                row={child}
                children={[]}
                isOperator={isOperator}
                onAssign={onAssign}
                onUnassign={onUnassign}
                onOpenAssignment={onOpenAssignment}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}
