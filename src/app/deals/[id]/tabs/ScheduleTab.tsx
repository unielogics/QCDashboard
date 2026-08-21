"use client";

// Schedule tab — full 30-day calendar grid with event chips per day,
// plus a "Next 7 days" task list to the side. Unified view across
// showings, open houses, listing prep, CMA, and photography.
//
// Events are AgentTask rows scoped to this deal whose category is one
// of the schedule-class categories. Same backing model the Tasks tab
// uses, just filtered.

import { useMemo, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import {
  Btn,
  Card,
  Field,
  IconBtn,
  Input,
  Panel,
  Seg,
  Select,
  Sub,
  Tag,
  Textarea,
  cx,
  type ChipTone,
} from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
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

// Chips on the calendar carry the chip tone vocabulary rather than a second
// palette of their own, so "this one is time-sensitive" reads the same here as
// it does in a table.
const CATEGORY_TONE: Record<AgentTaskCategory, ChipTone> = {
  buyer_workflow: "acc",
  seller_workflow: "acc",
  funding_prep: "warn",
  showing: "acc",
  open_house: "warn",
  listing_prep: "mut",
  cma: "mut",
  photography: "mut",
  document_collection: "mut",
  other: "mut",
};

const FILTERS: { value: "all" | AgentTaskCategory; label: string }[] = [
  { value: "all", label: "All" },
  { value: "showing", label: "Showings" },
  { value: "open_house", label: "Open houses" },
  { value: "listing_prep", label: "Listing prep" },
  { value: "cma", label: "CMA" },
  { value: "photography", label: "Photography" },
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
    <div className="withrail">
      {/* Calendar */}
      <div className="grid" style={{ minWidth: 0 }}>
        <div className="pagebar" style={{ padding: 0 }}>
          <b style={{ fontSize: 15 }}>{monthLabel}</b>
          <IconBtn onClick={() => setAnchor(addDays(anchor, -30))} aria-label="Previous month">
            <Icon name="chevL" size={13} />
          </IconBtn>
          <Btn size="sm" onClick={() => setAnchor(startOfDay(new Date()))}>
            Today
          </Btn>
          <IconBtn onClick={() => setAnchor(addDays(anchor, 30))} aria-label="Next month">
            <Icon name="chevR" size={13} />
          </IconBtn>
          <span className="spacer" />
          <Seg as="filter" ariaLabel="Event type" value={filter} onChange={setFilter} options={FILTERS} />
          <Btn variant="pri" size="sm" onClick={() => setCreateOpen({})}>
            <Icon name="plus" size={11} /> New event
          </Btn>
        </div>

        <div className="cal">
          <div className="cal-hd">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="cal-b">
            {grid.map((week, wIdx) => (
              <div className="cal-w" key={wIdx}>
                {week.map((dayIso) => {
                  const date = new Date(dayIso);
                  const isToday = sameDay(date, today);
                  const inMonth =
                    grid[0] &&
                    date.getMonth() === new Date(grid[Math.floor(grid.length / 2)][3]).getMonth();
                  const events = eventsByDay.get(dayIso) ?? [];
                  return (
                    <button
                      key={dayIso}
                      type="button"
                      className={cx("cal-d", isToday && "today", !inMonth && "out")}
                      onClick={() => setCreateOpen({ at: date })}
                      aria-label={`Add an event on ${date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`}
                    >
                      <div className="cal-n">{date.getDate()}</div>
                      <div className="cal-evs">
                        {events.slice(0, 3).map((ev) => (
                          <EventChip key={ev.id} task={ev} />
                        ))}
                        {events.length > 3 ? (
                          <div className="cal-more">+{events.length - 3} more</div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right rail — Next 7 days */}
      <div className="railcol">
        <div className="row">
          <span className="lbl">Next 7 days</span>
          <Tag>{next7.length}</Tag>
        </div>
        {isLoading ? (
          <Card>
            <Sub>Loading…</Sub>
          </Card>
        ) : next7.length === 0 ? (
          <Card>
            <Sub>
              No upcoming events. Click a date on the calendar or “New event” to schedule one.
            </Sub>
          </Card>
        ) : (
          <div className="grid g8">
            {next7.map((task) => (
              <UpcomingCard
                key={task.id}
                task={task}
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
        <NewEventDrawer
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

function EventChip({ task }: { task: AgentTask }) {
  const tone = CATEGORY_TONE[task.category] ?? "mut";
  const time = task.due_at
    ? new Date(task.due_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "";
  return (
    <div className={cx("cal-ev", `c-${tone}`)} title={`${task.title} · ${time}`}>
      {time ? `${time} · ` : ""}
      {task.title}
    </div>
  );
}

function UpcomingCard({
  task,
  onComplete,
  onDelete,
  onPromote,
  promoting,
}: {
  task: AgentTask;
  onComplete: () => void;
  onDelete: () => void;
  onPromote: () => void;
  promoting: boolean;
}) {
  const when = task.due_at ? new Date(task.due_at) : null;
  const isDone = task.status === "done" || task.status === "cancelled";
  const canPromote = task.owner_type === "ai" && !task.ai_assignment_id;
  return (
    <Card style={{ padding: 11, opacity: isDone ? 0.6 : 1 }}>
      <div className="row" style={{ gap: 10, alignItems: "flex-start", flexWrap: "nowrap" }}>
        {when ? (
          <div className="datetile">
            <div className="m">{when.toLocaleDateString(undefined, { month: "short" })}</div>
            <div className="d">{when.getDate()}</div>
            <div className="h">
              {when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </div>
          </div>
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            <b
              style={{
                fontSize: 12.5,
                textDecoration: isDone ? "line-through" : "none",
              }}
            >
              {task.title}
            </b>
            <Tag>{CATEGORY_LABELS[task.category]}</Tag>
          </div>
          {task.description ? <Sub>{task.description}</Sub> : null}
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            {canPromote ? (
              <Btn variant="pri" size="sm" onClick={onPromote} disabled={promoting}>
                {promoting ? "Promoting…" : "Promote to AI"}
              </Btn>
            ) : null}
            {!isDone ? (
              <Btn size="sm" onClick={onComplete}>
                Complete
              </Btn>
            ) : null}
            <Btn size="sm" onClick={onDelete} className="danger">
              Delete
            </Btn>
          </div>
        </div>
      </div>
    </Card>
  );
}

function NewEventDrawer({
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
    <Drawer
      open
      onClose={onClose}
      width="md"
      title="New schedule event"
      footer={
        <>
          {err ? <span style={{ fontSize: 12, color: "var(--danger)" }}>{err}</span> : null}
          <span style={{ flex: 1 }} />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="pri" onClick={save} disabled={create.isPending}>
            {create.isPending ? "Saving…" : "Create"}
          </Btn>
        </>
      }
    >
      <div className="grid g10">
        <Field label="Type">
          <Select
            value={body.category ?? "showing"}
            onChange={(e) => setBody({ ...body, category: e.target.value as AgentTaskCategory })}
          >
            {SCHEDULE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Title">
          <Input
            value={body.title}
            onChange={(e) => setBody({ ...body, title: e.target.value })}
            placeholder='e.g. "Open house 123 Main St"'
          />
        </Field>
        <Field label="Date & time">
          <Input
            type="datetime-local"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
          />
        </Field>
        <Field label="Description" hint="Location, attendees, talking points.">
          <Textarea
            value={body.description ?? ""}
            onChange={(e) => setBody({ ...body, description: e.target.value })}
            rows={3}
          />
        </Field>
        <div className="fldgrid two">
          <Field label="Owner">
            <Select
              value={body.owner_type ?? "human"}
              onChange={(e) => setBody({ ...body, owner_type: e.target.value as "human" | "ai" | "shared" })}
            >
              <option value="human">Me</option>
              <option value="ai">AI</option>
              <option value="shared">Shared</option>
            </Select>
          </Field>
          <Field label="Priority">
            <Select
              value={body.priority ?? "medium"}
              onChange={(e) => setBody({ ...body, priority: e.target.value as "low" | "medium" | "high" })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </Field>
        </div>
      </div>
    </Drawer>
  );
}
