"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useAITasks,
  useCalendar,
  useCalendarActivity,
  useCurrentUser,
  useDeleteCalendarEvent,
  useDocuments,
  useLoans,
  useUpdateCalendarEvent,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import type { AITask, CalendarActivityItem, CalendarEvent, Document, Loan } from "@/lib/types";
import { EventModal } from "./components/EventModal";

type Window = 7 | 30 | 90;
const WINDOWS: { id: Window; label: string }[] = [
  { id: 7, label: "7 days" },
  { id: 30, label: "30 days" },
  { id: 90, label: "90 days" },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const PX_PER_MINUTE = 2.25;
const MIN_EVENT_HEIGHT = 56;
const NOW_LINE_RATIO = 0.4;

export default function CalendarPage() {
  const { t } = useTheme();
  const [windowDays, setWindowDays] = useState<Window>(7);
  const [createOpen, setCreateOpen] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const { data: user } = useCurrentUser();
  const isClient = user?.role === Role.CLIENT;
  const isRegionalManager = user?.role === Role.REGIONAL_MANAGER;

  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const queryWindow = useMemo(() => {
    const today = startOfLocalDay(new Date(nowTs));
    return {
      from: new Date(today.getTime() - DAY_MS).toISOString(),
      to: new Date(today.getTime() + (windowDays + 1) * DAY_MS).toISOString(),
    };
  }, [nowTs, windowDays]);

  const activityWindow = useMemo(() => {
    const today = startOfLocalDay(new Date(nowTs));
    return {
      from: new Date(today.getTime() - 30 * DAY_MS).toISOString(),
      to: new Date(today.getTime() + DAY_MS).toISOString(),
      limit: 60,
    };
  }, [nowTs]);

  const { data: events = [] } = useCalendar(queryWindow);
  const { data: activity = [] } = useCalendarActivity(activityWindow);
  const { data: tasks = [] } = useAITasks();
  const { data: docs = [] } = useDocuments();
  const { data: loans = [] } = useLoans();

  const now = nowTs;
  const horizon = now + windowDays * DAY_MS;
  const visibleEvents = useMemo(
    () =>
      events
        .filter((e) => {
          const ts = new Date(e.starts_at).getTime();
          return ts >= now - DAY_MS && ts <= horizon;
        })
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    [events, now, horizon],
  );

  const todayEvents = useMemo(
    () => visibleEvents.filter((e) => isSameLocalDay(new Date(e.starts_at), new Date(now))),
    [visibleEvents, now],
  );

  const byUpcomingDay = useMemo(() => {
    const acc: Record<string, CalendarEvent[]> = {};
    for (const ev of visibleEvents) {
      const starts = new Date(ev.starts_at);
      if (isSameLocalDay(starts, new Date(now))) continue;
      if (starts.getTime() < startOfLocalDay(new Date(now)).getTime()) continue;
      const k = localDateKey(starts);
      (acc[k] ||= []).push(ev);
    }
    return acc;
  }, [visibleEvents, now]);
  const upcomingDays = Object.keys(byUpcomingDay).sort();

  const todos = useMemo(
    () => buildTodos(tasks, docs, loans, now, horizon),
    [tasks, docs, loans, now, horizon],
  );

  const canDeleteEvents = !isClient && !isRegionalManager;
  const canCancelEvents = !isClient;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>Calendar</h1>
        <Pill>{visibleEvents.length} events · next {windowDays}d</Pill>
        <div style={{ display: "inline-flex", gap: 4, marginLeft: 6 }}>
          {WINDOWS.map((w) => {
            const active = w.id === windowDays;
            return (
              <button
                key={w.id}
                onClick={() => setWindowDays(w.id)}
                style={{
                  ...qcBtn(t),
                  padding: "6px 12px",
                  fontSize: 12,
                  background: active ? t.ink : t.surface,
                  color: active ? t.inverse : t.ink2,
                  border: active ? "none" : `1px solid ${t.lineStrong}`,
                }}
              >
                {w.label}
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        {!isClient && (
          <button onClick={() => setCreateOpen(true)} style={qcBtnPrimary(t)}>
            <Icon name="plus" size={14} /> New event
          </button>
        )}
      </div>
      {!isClient && <EventModal open={createOpen} onClose={() => setCreateOpen(false)} />}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.55fr) minmax(320px, 0.75fr)",
          gap: 14,
          alignItems: "flex-start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <TodayTimeline
            events={todayEvents}
            nowTs={nowTs}
            canCancel={canCancelEvents}
            canDelete={canDeleteEvents}
          />

          {upcomingDays.length > 0 ? (
            upcomingDays.map((day) => (
              <Card key={day} pad={16}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 1.4,
                    color: t.ink3,
                    textTransform: "uppercase",
                  }}
                >
                  {formatDayHeader(day)}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  {byUpcomingDay[day].map((ev) => (
                    <CompactEventRow
                      key={ev.id}
                      ev={ev}
                      canCancel={canCancelEvents}
                      canDelete={canDeleteEvents}
                    />
                  ))}
                </div>
              </Card>
            ))
          ) : (
            <Card pad={16}>
              <div style={{ fontSize: 13, color: t.ink3, textAlign: "center" }}>
                No upcoming events after today in the next {windowDays} days.
              </div>
            </Card>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          {isClient ? (
            <ClientActivityFeed rows={activity} />
          ) : (
            <TodosRail todos={todos} windowDays={windowDays} />
          )}
        </div>
      </div>
    </div>
  );
}

function TodayTimeline({
  events,
  nowTs,
  canCancel,
  canDelete,
}: {
  events: CalendarEvent[];
  nowTs: number;
  canCancel: boolean;
  canDelete: boolean;
}) {
  const { t } = useTheme();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const layout = useMemo(() => buildTimelineLayout(events, new Date(nowTs)), [events, nowTs]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const align = () => {
      const fixedLineY = el.clientHeight * NOW_LINE_RATIO;
      const target = Math.max(0, Math.min(layout.currentOffset - fixedLineY, el.scrollHeight - el.clientHeight));
      el.scrollTo({ top: target, behavior: "smooth" });
    };
    align();
    const id = window.setTimeout(align, 80);
    return () => window.clearTimeout(id);
  }, [layout.currentOffset, layout.rangeStart, layout.rangeEnd, events.length]);

  return (
    <Card pad={0}>
      <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <SectionLabel>Today</SectionLabel>
          <div style={{ fontSize: 12, color: t.ink3, marginTop: 2 }}>
            Real-time agenda · current line fixed at {formatClock(new Date(nowTs))}
          </div>
        </div>
        <Pill>{events.length} item{events.length === 1 ? "" : "s"}</Pill>
      </div>

      <div
        style={{
          height: "min(680px, calc(100vh - 230px))",
          minHeight: 420,
          position: "relative",
          overflow: "hidden",
          background: t.surface,
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${NOW_LINE_RATIO * 100}%`,
            zIndex: 4,
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
          }}
        >
          <div
            style={{
              marginLeft: 12,
              padding: "2px 8px",
              borderRadius: 999,
              background: "rgba(239,68,68,0.16)",
              color: "#ef4444",
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: 0.3,
              border: "1px solid rgba(239,68,68,0.35)",
            }}
          >
            {formatClock(new Date(nowTs))}
          </div>
          <div style={{ height: 2, flex: 1, background: "#ef4444", boxShadow: "0 0 0 1px rgba(239,68,68,0.12)" }} />
        </div>

        <div ref={scrollRef} style={{ height: "100%", overflowY: "auto", overflowX: "hidden" }}>
          <div style={{ height: layout.height, minHeight: "100%", position: "relative" }}>
            {layout.hours.map((hour) => (
              <div
                key={hour.minute}
                style={{
                  position: "absolute",
                  top: hour.top,
                  left: 0,
                  right: 0,
                  height: 1,
                  background: t.line,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -8,
                    left: 16,
                    width: 48,
                    fontSize: 11,
                    color: t.ink4,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatHour(hour.minute)}
                </div>
              </div>
            ))}

            <div style={{ position: "absolute", left: 76, right: 14, top: 0, bottom: 0 }}>
              {layout.items.length === 0 ? (
                <div
                  style={{
                    position: "absolute",
                    top: Math.max(24, layout.currentOffset + 28),
                    left: 0,
                    right: 0,
                    border: `1px dashed ${t.lineStrong}`,
                    borderRadius: 12,
                    padding: 14,
                    color: t.ink3,
                    fontSize: 13,
                    textAlign: "center",
                  }}
                >
                  Nothing scheduled today.
                </div>
              ) : null}

              {layout.items.map((item) => (
                <TimelineEventBlock
                  key={item.event.id}
                  item={item}
                  canCancel={canCancel}
                  canDelete={canDelete}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function TimelineEventBlock({
  item,
  canCancel,
  canDelete,
}: {
  item: TimelineItem;
  canCancel: boolean;
  canDelete: boolean;
}) {
  const { t } = useTheme();
  const event = item.event;
  const update = useUpdateCalendarEvent();
  const remove = useDeleteCalendarEvent();
  const state = eventTone(event, t);
  const isDone = event.status === "done";
  const isCancelled = event.status === "cancelled";
  const href = eventHref(event);
  const top = item.top;
  const left = `${(item.column / item.columnCount) * 100}%`;
  const width = `calc(${100 / item.columnCount}% - 8px)`;

  const toggleDone = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    update.mutate({ id: event.id, patch: { status: isDone ? "pending" : "done" } });
  };
  const cancelEvent = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    update.mutate({ id: event.id, patch: { status: "cancelled" } });
  };
  const deleteEvent = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${event.title}"? Use cancel when you need an audit trail.`)) return;
    remove.mutate(event.id);
  };

  return (
    <Link
      href={href}
      onClick={(e) => {
        if (isDocumentDue(event) && !isDone && !isCancelled) return;
        toggleDone(e);
      }}
      style={{
        position: "absolute",
        top,
        left,
        width,
        minWidth: item.columnCount > 2 ? 150 : undefined,
        height: item.height,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "9px 10px",
        borderRadius: 10,
        border: `1px solid ${state.fg}`,
        background: state.bg,
        color: "inherit",
        textDecoration: "none",
        boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
        opacity: isCancelled ? 0.58 : 1,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ color: state.fg, fontSize: 11, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
          {formatClock(new Date(event.starts_at))}
        </span>
        {event.duration_min ? <span style={{ color: t.ink3, fontSize: 10 }}>{event.duration_min}m</span> : null}
        <span style={{ flex: 1 }} />
        {event.priority === "high" && !isDone && !isCancelled ? <span style={{ width: 7, height: 7, borderRadius: 99, background: t.danger }} /> : null}
      </div>
      <div style={{ color: t.ink, fontWeight: 850, fontSize: 13, lineHeight: 1.2, textDecoration: isDone || isCancelled ? "line-through" : "none" }}>
        {event.title}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, marginTop: "auto" }}>
        <Pill bg={t.surface} color={state.fg}>{event.kind}</Pill>
        {event.source === "ai" ? <Pill bg={t.brandSoft} color={t.brand}>AI</Pill> : null}
        {event.who ? (
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: t.ink3 }}>
            {event.who}
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        {canCancel && !isCancelled ? (
          <button onClick={cancelEvent} style={miniAction(t)} title="Cancel event" aria-label="Cancel event">
            Cancel
          </button>
        ) : null}
        {canDelete ? (
          <button onClick={deleteEvent} style={{ ...miniIconAction(t), color: t.ink4 }} title="Delete event" aria-label="Delete event">
            <Icon name="x" size={11} />
          </button>
        ) : null}
      </div>
    </Link>
  );
}

function CompactEventRow({ ev, canCancel, canDelete }: { ev: CalendarEvent; canCancel: boolean; canDelete: boolean }) {
  const { t } = useTheme();
  const update = useUpdateCalendarEvent();
  const remove = useDeleteCalendarEvent();
  const state = eventTone(ev, t);
  const isDone = ev.status === "done";
  const isCancelled = ev.status === "cancelled";

  const onToggleDone = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    update.mutate({ id: ev.id, patch: { status: isDone ? "pending" : "done" } });
  };
  const onCancel = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    update.mutate({ id: ev.id, patch: { status: "cancelled" } });
  };
  const onDelete = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${ev.title}"? Use cancel when you need an audit trail.`)) return;
    remove.mutate(ev.id);
  };

  return (
    <Link
      href={eventHref(ev)}
      onClick={(e) => {
        if (isDocumentDue(ev) && !isDone && !isCancelled) return;
        onToggleDone(e);
      }}
      style={{
        display: "flex",
        gap: 12,
        padding: 10,
        borderRadius: 12,
        border: `1px solid ${state.fg}`,
        background: state.bg,
        alignItems: "center",
        textDecoration: "none",
        color: "inherit",
        opacity: isCancelled ? 0.6 : 1,
      }}
    >
      <div style={{ minWidth: 70, fontSize: 12, fontWeight: 800, color: state.fg, fontFeatureSettings: '"tnum"', letterSpacing: 0.3 }}>
        {formatClock(new Date(ev.starts_at))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: t.ink, textDecoration: isDone || isCancelled ? "line-through" : "none" }}>
          {ev.title}
        </div>
        <div style={{ fontSize: 11.5, color: t.ink3, display: "flex", gap: 6, alignItems: "center" }}>
          {state.label ? <span style={{ fontWeight: 800, color: state.fg, letterSpacing: 0.4 }}>{state.label}</span> : null}
          {state.label && ev.who ? <span>·</span> : null}
          {ev.who ?? (state.label ? "" : "-")}
          {ev.duration_min ? <> · {ev.duration_min}m</> : null}
        </div>
      </div>
      <Pill>{ev.kind}</Pill>
      {canCancel && !isCancelled ? (
        <button onClick={onCancel} style={miniAction(t)} title="Cancel event" aria-label="Cancel event">
          Cancel
        </button>
      ) : null}
      {canDelete ? (
        <button onClick={onDelete} title="Delete event" aria-label="Delete event" style={miniIconAction(t)}>
          <Icon name="x" size={12} />
        </button>
      ) : null}
    </Link>
  );
}

function ClientActivityFeed({ rows }: { rows: CalendarActivityItem[] }) {
  const { t } = useTheme();
  return (
    <Card pad={14}>
      <SectionLabel>Account activity</SectionLabel>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: t.ink3, padding: "8px 0" }}>
          No recent borrower-visible activity.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {rows.slice(0, 18).map((row) => (
            <Link
              key={row.id}
              href={row.loan_id ? `/loans/${row.loan_id}` : "/calendar"}
              style={{
                display: "flex",
                gap: 10,
                padding: "9px 10px",
                borderRadius: 9,
                background: t.surface2,
                border: `1px solid ${t.line}`,
                color: "inherit",
                textDecoration: "none",
              }}
            >
              <div style={{ width: 26, height: 26, borderRadius: 8, background: t.brandSoft, color: t.brand, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={activityIcon(row.kind)} size={13} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, color: t.ink, fontWeight: 750, lineHeight: 1.25 }}>
                  {row.summary || humanize(row.kind)}
                </div>
                <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                  {humanize(row.kind)} · {new Date(row.occurred_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function TodosRail({ todos, windowDays }: { todos: Todo[]; windowDays: Window }) {
  const { t } = useTheme();
  return (
    <Card pad={14}>
      <SectionLabel
        action={
          <Link
            href="/ai-inbox"
            style={{
              color: t.petrol,
              fontWeight: 700,
              fontSize: 12,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            AI inbox <Icon name="arrowR" size={11} />
          </Link>
        }
      >
        Todos · next {windowDays}d
      </SectionLabel>

      {todos.length === 0 ? (
        <div style={{ fontSize: 12.5, color: t.ink3, padding: "8px 0" }}>
          Nothing pending in this window.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {todos.map((todo) => (
            <Link
              key={todo.key}
              href={todo.href}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 9,
                background: t.surface2,
                border: `1px solid ${t.line}`,
                borderLeft: `3px solid ${todoAccent(t, todo.urgency)}`,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {todo.title}
                </div>
                <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                  {todo.sub}
                </div>
              </div>
              <Pill
                bg={todo.urgency === "overdue" ? t.dangerBg : todo.urgency === "today" ? t.warnBg : t.chip}
                color={todo.urgency === "overdue" ? t.danger : todo.urgency === "today" ? t.warn : t.ink2}
              >
                {todo.urgency}
              </Pill>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

interface TimelineItem {
  event: CalendarEvent;
  startMinute: number;
  endMinute: number;
  top: number;
  height: number;
  column: number;
  columnCount: number;
}

function buildTimelineLayout(events: CalendarEvent[], now: Date) {
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const raw = events
    .map((event) => {
      const start = new Date(event.starts_at);
      const startMinute = start.getHours() * 60 + start.getMinutes();
      const duration = Math.max(15, event.duration_min ?? 30);
      return {
        event,
        startMinute,
        endMinute: Math.min(24 * 60, startMinute + duration),
      };
    })
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  const minMinute = Math.min(nowMinute, ...raw.map((x) => x.startMinute));
  const maxMinute = Math.max(nowMinute, ...raw.map((x) => x.endMinute));
  const rangeStart = Math.max(0, Math.floor(minMinute / 60) * 60 - 60);
  const rangeEnd = Math.min(24 * 60, Math.ceil(maxMinute / 60) * 60 + 60);
  const height = Math.max(420, (rangeEnd - rangeStart) * PX_PER_MINUTE);
  const items: TimelineItem[] = [];

  for (const cluster of clusterOverlaps(raw)) {
    const colEnds: number[] = [];
    const clusterItems = cluster.map((item) => {
      let column = colEnds.findIndex((end) => end <= item.startMinute);
      if (column === -1) {
        column = colEnds.length;
        colEnds.push(item.endMinute);
      } else {
        colEnds[column] = item.endMinute;
      }
      return { ...item, column };
    });
    const columnCount = Math.max(1, colEnds.length);
    for (const item of clusterItems) {
      items.push({
        ...item,
        top: (item.startMinute - rangeStart) * PX_PER_MINUTE,
        height: Math.max((item.endMinute - item.startMinute) * PX_PER_MINUTE, MIN_EVENT_HEIGHT),
        columnCount,
      });
    }
  }

  const hours = [];
  for (let minute = rangeStart; minute <= rangeEnd; minute += 60) {
    hours.push({ minute, top: (minute - rangeStart) * PX_PER_MINUTE });
  }

  return {
    rangeStart,
    rangeEnd,
    height,
    currentOffset: (nowMinute - rangeStart) * PX_PER_MINUTE,
    items,
    hours,
  };
}

function clusterOverlaps<T extends { startMinute: number; endMinute: number }>(items: T[]): T[][] {
  const clusters: T[][] = [];
  let active: T[] = [];
  let activeEnd = -1;
  for (const item of items) {
    if (active.length === 0 || item.startMinute < activeEnd) {
      active.push(item);
      activeEnd = Math.max(activeEnd, item.endMinute);
    } else {
      clusters.push(active);
      active = [item];
      activeEnd = item.endMinute;
    }
  }
  if (active.length) clusters.push(active);
  return clusters;
}

function eventTone(ev: CalendarEvent, t: ReturnType<typeof useTheme>["t"]) {
  const isDone = ev.status === "done";
  const isCancelled = ev.status === "cancelled";
  const isOverdue = !isDone && !isCancelled && new Date(ev.starts_at).getTime() < Date.now();
  if (isCancelled) return { fg: t.ink3, bg: t.surface2, label: "CANCELLED" };
  if (isDone) return { fg: t.profit, bg: t.profitBg, label: "DONE" };
  if (isOverdue) return { fg: t.danger, bg: t.dangerBg, label: "OVERDUE" };
  return { fg: t.warn, bg: t.warnBg, label: "" };
}

function eventHref(ev: CalendarEvent): string {
  if (isDocumentDue(ev)) return `/vault?fulfill=${ev.external_ref_id}`;
  return ev.loan_id ? `/loans/${ev.loan_id}` : "/calendar";
}

function isDocumentDue(ev: CalendarEvent): boolean {
  return ev.external_ref_kind === "document_due" && !!ev.external_ref_id;
}

function miniAction(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink2,
    borderRadius: 6,
    padding: "2px 6px",
    fontSize: 10,
    fontWeight: 800,
    cursor: "pointer",
    flexShrink: 0,
  };
}

function miniIconAction(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    width: 22,
    height: 22,
    borderRadius: 6,
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink4,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };
}

function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDayHeader(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatHour(minute: number): string {
  const d = new Date();
  d.setHours(Math.floor(minute / 60), 0, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
}

function activityIcon(kind: string): string {
  if (kind.startsWith("document")) return "doc";
  if (kind.startsWith("calendar")) return "cal";
  if (kind.startsWith("prequal")) return "docCheck";
  if (kind.startsWith("analysis")) return "calc";
  return "audit";
}

function humanize(kind: string): string {
  return kind.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Todo {
  key: string;
  title: string;
  sub: string;
  href: string;
  whenMs: number;
  urgency: "overdue" | "today" | "soon" | "later";
}

function buildTodos(
  tasks: AITask[],
  docs: Document[],
  loans: Loan[],
  now: number,
  horizon: number,
): Todo[] {
  const dayMs = DAY_MS;
  const dealById = Object.fromEntries(loans.map((l) => [l.id, l.deal_id] as const));
  const out: Todo[] = [];

  for (const task of tasks) {
    if (task.status !== "pending") continue;
    const created = new Date(task.created_at).getTime();
    if (created > horizon) continue;
    const ageH = (now - created) / (60 * 60 * 1000);
    const urgency: Todo["urgency"] =
      task.priority === "high" && ageH > 8
        ? "overdue"
        : task.priority === "high" && ageH > 2
          ? "today"
          : ageH < 24
            ? "today"
            : "soon";
    out.push({
      key: `task-${task.id}`,
      title: task.title,
      sub: `${task.source} · ${task.priority}${task.loan_id && dealById[task.loan_id] ? ` · ${dealById[task.loan_id]}` : ""}`,
      href: "/ai-inbox",
      whenMs: created,
      urgency,
    });
  }

  for (const d of docs) {
    if (d.status === "verified" || d.status === "received") continue;
    const requested = d.requested_on ? new Date(d.requested_on).getTime() : null;
    if (requested == null) continue;
    const ageDays = (now - requested) / dayMs;
    if (ageDays < -1 || requested > horizon) continue;
    const urgency: Todo["urgency"] = ageDays > 7 ? "overdue" : ageDays > 3 ? "today" : "soon";
    out.push({
      key: `doc-${d.id}`,
      title: d.name,
      sub: `Doc requested ${ageDays >= 0 ? `${Math.round(ageDays)}d ago` : "just now"}${dealById[d.loan_id] ? ` · ${dealById[d.loan_id]}` : ""}`,
      href: d.loan_id ? `/loans/${d.loan_id}` : "/documents",
      whenMs: requested,
      urgency,
    });
  }

  const order = { overdue: 0, today: 1, soon: 2, later: 3 } as const;
  return out
    .sort((a, b) => order[a.urgency] - order[b.urgency] || a.whenMs - b.whenMs)
    .slice(0, 12);
}

function todoAccent(t: ReturnType<typeof useTheme>["t"], urgency: Todo["urgency"]): string {
  return urgency === "overdue" ? t.danger : urgency === "today" ? t.warn : urgency === "soon" ? t.petrol : t.line;
}
