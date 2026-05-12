"use client";

// Schedule tab — full 30-day calendar grid with event chips per day,
// plus a "Next 7 days" task list to the side. Unified view across
// showings, open houses, listing prep, CMA, and photography.
//
// Events are AgentTask rows scoped to this deal whose category is one
// of the schedule-class categories. Same backing model the Tasks tab
// uses, just filtered.

import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useClientTasks,
  useCreateAgentTask,
  useCompleteAgentTask,
  useDeleteAgentTask,
  usePromoteAgentTaskToAi,
  type AgentTaskCreateBody,
} from "@/hooks/useApi";
import type { AgentTask, AgentTaskCategory } from "@/lib/types";

const SCHEDULE_CATEGORIES: AgentTaskCategory[] = [
  "showing",
  "open_house",
  "listing_prep",
  "cma",
  "photography",
];

const CATEGORY_LABELS: Record<AgentTaskCategory, string> = {
  buyer_workflow: "Buyer workflow",
  seller_workflow: "Seller workflow",
  funding_prep: "Funding prep",
  showing: "Showing",
  open_house: "Open house",
  listing_prep: "Listing prep",
  cma: "CMA",
  photography: "Photography",
  document_collection: "Document collection",
  other: "Other",
};

const CATEGORY_COLOR: Record<AgentTaskCategory, { fg: keyof PaletteHints; bg: keyof PaletteHints }> = {
  buyer_workflow: { fg: "brand", bg: "brandSoft" },
  seller_workflow: { fg: "brand", bg: "brandSoft" },
  funding_prep: { fg: "warn", bg: "warnBg" },
  showing: { fg: "brand", bg: "brandSoft" },
  open_house: { fg: "warn", bg: "warnBg" },
  listing_prep: { fg: "ink2", bg: "chip" },
  cma: { fg: "ink2", bg: "chip" },
  photography: { fg: "ink2", bg: "chip" },
  document_collection: { fg: "ink2", bg: "chip" },
  other: { fg: "ink2", bg: "chip" },
};

type PaletteHints = { brand: string; brandSoft: string; warn: string; warnBg: string; ink2: string; chip: string };

const FILTERS: { id: "all" | AgentTaskCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "showing", label: "Showings" },
  { id: "open_house", label: "Open houses" },
  { id: "listing_prep", label: "Listing prep" },
  { id: "cma", label: "CMA" },
  { id: "photography", label: "Photography" },
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ScheduleTab({ clientId, dealId }: { clientId: string; dealId: string }) {
  const { t } = useTheme();
  const [filter, setFilter] = useState<"all" | AgentTaskCategory>("all");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [createOpen, setCreateOpen] = useState<{ at?: Date } | null>(null);
  const { data: tasks = [], isLoading } = useClientTasks(clientId, { dealId });
  const complete = useCompleteAgentTask(clientId);
  const del = useDeleteAgentTask(clientId);
  const promote = usePromoteAgentTaskToAi(clientId);

  const scheduleTasks = useMemo(
    () => tasks.filter((t) => SCHEDULE_CATEGORIES.includes(t.category) && t.due_at),
    [tasks],
  );
  const filtered = useMemo(
    () => (filter === "all" ? scheduleTasks : scheduleTasks.filter((t) => t.category === filter)),
    [scheduleTasks, filter],
  );

  // Build 30-day grid: 6 rows × 5 columns starting from the Monday
  // of the anchor week. Anchor = today by default; arrow buttons
  // move it ±30 days so the user can scan future / past weeks.
  const grid = useMemo(() => buildGrid(anchor), [anchor]);
  const eventsByDay = useMemo(() => {
    const m = new Map<string, AgentTask[]>();
    for (const tk of filtered) {
      if (!tk.due_at) continue;
      const k = isoDate(new Date(tk.due_at));
      const arr = m.get(k) ?? [];
      arr.push(tk);
      m.set(k, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? ""));
    }
    return m;
  }, [filtered]);

  // Next 7 days task list (right rail)
  const today = startOfDay(new Date());
  const next7 = useMemo(() => {
    const horizon = addDays(today, 7).getTime();
    return filtered
      .filter((tk) => {
        const ts = tk.due_at ? new Date(tk.due_at).getTime() : 0;
        return ts >= today.getTime() && ts <= horizon;
      })
      .sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? ""));
  }, [filtered, today]);

  const monthLabel = grid[0]
    ? new Date(grid[0][0]).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : "";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 14, alignItems: "flex-start" }}>
      {/* Calendar */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <SectionLabel>{monthLabel}</SectionLabel>
          <div style={{ display: "inline-flex", gap: 4, marginLeft: 6 }}>
            <NavBtn t={t} onClick={() => setAnchor(addDays(anchor, -30))} icon="chevL" />
            <NavBtn t={t} onClick={() => setAnchor(startOfDay(new Date()))} label="Today" />
            <NavBtn t={t} onClick={() => setAnchor(addDays(anchor, 30))} icon="chevR" />
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 999,
                  border: `1px solid ${filter === f.id ? t.brand : t.line}`,
                  background: filter === f.id ? t.brandSoft : t.surface,
                  color: filter === f.id ? t.brand : t.ink2,
                  cursor: "pointer",
                }}
              >
                {f.label}
              </button>
            ))}
            <button
              onClick={() => setCreateOpen({})}
              style={{
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 6,
                border: "none",
                background: t.brand,
                color: t.inverse,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon name="plus" size={11} /> New event
            </button>
          </div>
        </div>

        <Card pad={0}>
          {/* Weekday header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              borderBottom: `1px solid ${t.line}`,
              background: t.surface2,
            }}
          >
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div
                key={d}
                style={{
                  padding: "8px 10px",
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: t.ink3,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                }}
              >
                {d}
              </div>
            ))}
          </div>
          {/* Grid */}
          <div style={{ display: "grid", gridTemplateRows: `repeat(${grid.length}, minmax(96px, 1fr))` }}>
            {grid.map((week, wIdx) => (
              <div key={wIdx} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                {week.map((dayIso, dIdx) => {
                  const date = new Date(dayIso);
                  const isToday = sameDay(date, today);
                  const inMonth = grid[0] && date.getMonth() === new Date(grid[Math.floor(grid.length / 2)][3]).getMonth();
                  const events = eventsByDay.get(dayIso) ?? [];
                  return (
                    <button
                      key={dayIso}
                      onClick={() => setCreateOpen({ at: date })}
                      style={{
                        minHeight: 96,
                        textAlign: "left",
                        padding: "6px 8px",
                        background: isToday ? t.brandSoft : inMonth ? t.surface : t.surface2,
                        border: "none",
                        borderRight: dIdx < 6 ? `1px solid ${t.line}` : "none",
                        borderBottom: wIdx < grid.length - 1 ? `1px solid ${t.line}` : "none",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11.5,
                          fontWeight: isToday ? 800 : 700,
                          color: isToday ? t.brand : inMonth ? t.ink : t.ink3,
                          letterSpacing: 0,
                        }}
                      >
                        {date.getDate()}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minHeight: 0 }}>
                        {events.slice(0, 3).map((ev) => (
                          <EventChip key={ev.id} task={ev} t={t} />
                        ))}
                        {events.length > 3 ? (
                          <div style={{ fontSize: 10, color: t.ink3, fontWeight: 700 }}>
                            +{events.length - 3} more
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Right rail — Next 7 days */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, position: "sticky", top: 14 }}>
        <SectionLabel>Next 7 days · {next7.length}</SectionLabel>
        {isLoading ? (
          <Card pad={12}>
            <div style={{ color: t.ink3, fontSize: 12 }}>Loading…</div>
          </Card>
        ) : next7.length === 0 ? (
          <Card pad={12}>
            <div style={{ fontSize: 12, color: t.ink3 }}>
              No upcoming events. Click a date on the calendar or “New event” to schedule one.
            </div>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {next7.map((task) => (
              <UpcomingCard
                key={task.id}
                task={task}
                t={t}
                onComplete={() => complete.mutate(task.id)}
                onDelete={() => { if (confirm(`Delete "${task.title}"?`)) del.mutate(task.id); }}
                onPromote={() => promote.mutate(task.id)}
                promoting={promote.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {createOpen ? (
        <NewEventModal
          clientId={clientId}
          dealId={dealId}
          initialAt={createOpen.at}
          onClose={() => setCreateOpen(null)}
        />
      ) : null}
    </div>
  );
}

function buildGrid(anchor: Date): string[][] {
  // Start at the Monday of the week containing the 1st of the
  // anchor month — a standard month-view calendar layout.
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  // 0=Sun..6=Sat; we want Monday-start.
  const back = (first.getDay() + 6) % 7;
  const start = addDays(first, -back);
  // 5 rows for short months, 6 for long — always render 6 to keep
  // grid height stable.
  const rows: string[][] = [];
  for (let r = 0; r < 6; r++) {
    const week: string[] = [];
    for (let c = 0; c < 7; c++) {
      week.push(isoDate(addDays(start, r * 7 + c)));
    }
    rows.push(week);
  }
  return rows;
}

function EventChip({ task, t }: { task: AgentTask; t: ReturnType<typeof useTheme>["t"] }) {
  const palette = CATEGORY_COLOR[task.category] ?? CATEGORY_COLOR.other;
  const bg = (t as unknown as PaletteHints)[palette.bg];
  const fg = (t as unknown as PaletteHints)[palette.fg];
  const time = task.due_at
    ? new Date(task.due_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "";
  return (
    <div
      style={{
        padding: "1px 6px",
        borderRadius: 4,
        background: bg,
        color: fg,
        fontSize: 10.5,
        fontWeight: 700,
        lineHeight: 1.3,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
      title={`${task.title} · ${time}`}
    >
      {time ? `${time} · ` : ""}
      {task.title}
    </div>
  );
}

function UpcomingCard({
  task,
  t,
  onComplete,
  onDelete,
  onPromote,
  promoting,
}: {
  task: AgentTask;
  t: ReturnType<typeof useTheme>["t"];
  onComplete: () => void;
  onDelete: () => void;
  onPromote: () => void;
  promoting: boolean;
}) {
  const when = task.due_at ? new Date(task.due_at) : null;
  const isDone = task.status === "done" || task.status === "cancelled";
  const canPromote = task.owner_type === "ai" && !task.ai_assignment_id;
  return (
    <Card pad={10} style={{ opacity: isDone ? 0.6 : 1 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {when ? (
          <div
            style={{
              width: 48,
              textAlign: "center",
              padding: "4px 0",
              borderRadius: 6,
              background: t.surface2,
              border: `1px solid ${t.line}`,
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: 9.5, color: t.ink3, fontWeight: 700, textTransform: "uppercase" }}>
              {when.toLocaleDateString(undefined, { month: "short" })}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: t.ink, lineHeight: 1 }}>
              {when.getDate()}
            </div>
            <div style={{ fontSize: 9.5, color: t.ink3, fontWeight: 600 }}>
              {when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </div>
          </div>
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: t.ink,
                textDecoration: isDone ? "line-through" : "none",
              }}
            >
              {task.title}
            </span>
            <Pill>{CATEGORY_LABELS[task.category]}</Pill>
          </div>
          {task.description ? (
            <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 3 }}>{task.description}</div>
          ) : null}
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {canPromote ? (
              <button
                onClick={onPromote}
                disabled={promoting}
                style={btnPrimary(t, promoting)}
              >
                {promoting ? "Promoting…" : "Promote to AI"}
              </button>
            ) : null}
            {!isDone ? (
              <button onClick={onComplete} style={btnSecondary(t)}>Complete</button>
            ) : null}
            <button onClick={onDelete} style={{ ...btnSecondary(t), color: t.danger }}>
              Delete
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function NavBtn({
  t,
  onClick,
  icon,
  label,
}: {
  t: ReturnType<typeof useTheme>["t"];
  onClick: () => void;
  icon?: "chevL" | "chevR";
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: 700,
        borderRadius: 6,
        border: `1px solid ${t.line}`,
        background: t.surface,
        color: t.ink2,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {icon ? <Icon name={icon} size={11} /> : null}
      {label ?? null}
    </button>
  );
}

function NewEventModal({
  clientId,
  dealId,
  initialAt,
  onClose,
}: {
  clientId: string;
  dealId: string;
  initialAt: Date | undefined;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const create = useCreateAgentTask(clientId);
  const [body, setBody] = useState<AgentTaskCreateBody>({
    title: "",
    category: "showing",
    visibility: "team_visible",
    owner_type: "human",
    priority: "medium",
    deal_id: dealId,
  });
  const [dateStr, setDateStr] = useState<string>(() => {
    const seed = initialAt ?? new Date();
    seed.setMinutes(0, 0, 0);
    // Format YYYY-MM-DDThh:mm for <input type=datetime-local>
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${seed.getFullYear()}-${pad(seed.getMonth() + 1)}-${pad(seed.getDate())}T${pad(seed.getHours())}:${pad(seed.getMinutes())}`;
  });
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!body.title.trim()) {
      setErr("Title is required");
      return;
    }
    setErr(null);
    try {
      await create.mutateAsync({
        ...body,
        due_at: dateStr ? new Date(dateStr).toISOString() : null,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.surface,
          border: `1px solid ${t.line}`,
          borderRadius: 10,
          padding: 20,
          minWidth: 440,
          maxWidth: 520,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: t.ink }}>New schedule event</div>
        <Field label="Type">
          <select
            value={body.category ?? "showing"}
            onChange={(e) => setBody({ ...body, category: e.target.value as AgentTaskCategory })}
            style={inputStyle(t)}
          >
            {SCHEDULE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </Field>
        <Field label="Title">
          <input
            value={body.title}
            onChange={(e) => setBody({ ...body, title: e.target.value })}
            placeholder='e.g. "Open house 123 Main St"'
            style={inputStyle(t)}
          />
        </Field>
        <Field label="Date & time">
          <input
            type="datetime-local"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            style={inputStyle(t)}
          />
        </Field>
        <Field label="Description (location, attendees, talking points)">
          <textarea
            value={body.description ?? ""}
            onChange={(e) => setBody({ ...body, description: e.target.value })}
            rows={3}
            style={{ ...inputStyle(t), fontFamily: "inherit", resize: "vertical" }}
          />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Owner">
            <select
              value={body.owner_type ?? "human"}
              onChange={(e) => setBody({ ...body, owner_type: e.target.value as "human" | "ai" | "shared" })}
              style={inputStyle(t)}
            >
              <option value="human">Me</option>
              <option value="ai">AI</option>
              <option value="shared">Shared</option>
            </select>
          </Field>
          <Field label="Priority">
            <select
              value={body.priority ?? "medium"}
              onChange={(e) => setBody({ ...body, priority: e.target.value as "low" | "medium" | "high" })}
              style={inputStyle(t)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </Field>
        </div>
        {err ? <div style={{ fontSize: 12, color: t.danger }}>{err}</div> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnSecondary(t)}>Cancel</button>
          <button onClick={save} disabled={create.isPending} style={btnPrimary(t, create.isPending)}>
            {create.isPending ? "Saving…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 11, color: t.ink3, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</span>
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%",
    padding: 8,
    fontSize: 13,
    borderRadius: 6,
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink,
    boxSizing: "border-box",
  };
}

function btnPrimary(t: ReturnType<typeof useTheme>["t"], disabled: boolean): React.CSSProperties {
  return {
    padding: "5px 10px",
    fontSize: 11,
    fontWeight: 700,
    borderRadius: 6,
    border: "none",
    background: t.brand,
    color: t.inverse,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

function btnSecondary(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    padding: "5px 10px",
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 6,
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink,
    cursor: "pointer",
  };
}
