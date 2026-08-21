"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { Icon } from "@/components/design-system/Icon";
import {
  Btn,
  CellChip,
  IconBtn,
  Input,
  Kpi,
  PageHeader,
  Panel,
  Seg,
  Tag,
  Textarea,
  type ChipTone,
} from "@/components/ds";
import {
  useAITasks,
  useBookingSettings,
  useCalendar,
  useCalendarActivity,
  useCurrentUser,
  useDeleteCalendarEvent,
  useDocuments,
  useLoans,
  useUpdateCalendarEvent,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import type { AITask, CalendarActivityItem, CalendarEvent, Document, Loan, UserBookingSettings } from "@/lib/types";
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
const DEFAULT_DAY_START_MINUTE = 8 * 60;
const DEFAULT_DAY_END_MINUTE = 20 * 60;

export default function CalendarPage() {
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
  const { data: bookingSettings } = useBookingSettings();
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
      {/* The window switch is a filter, not a tab strip: it narrows the same
          agenda rather than swapping views, so it announces with aria-pressed.
          Seg is generic over a string union, so the numeric Window values are
          carried across the boundary as strings and coerced back. */}
      <PageHeader
        title="Calendar"
        lede={`${visibleEvents.length} events · next ${windowDays}d`}
        actions={
          <>
            <Seg<string>
              value={String(windowDays)}
              onChange={(v) => setWindowDays(Number(v) as Window)}
              ariaLabel="Agenda window"
              as="filter"
              options={WINDOWS.map((w) => ({ value: String(w.id), label: w.label }))}
            />
            {!isClient && (
              <Btn variant="pri" onClick={() => setCreateOpen(true)}>
                <Icon name="plus" size={14} /> New event
              </Btn>
            )}
          </>
        }
      />
      {!isClient && <EventModal open={createOpen} onClose={() => setCreateOpen(false)} />}

      <div className="cg">
        <div className="s8" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <TodayTimeline
            events={todayEvents}
            nowTs={nowTs}
            canCancel={canCancelEvents}
            canDelete={canDeleteEvents}
          />

          {upcomingDays.length > 0 ? (
            upcomingDays.map((day) => (
              <Panel key={day} title={formatDayHeader(day)}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {byUpcomingDay[day].map((ev) => (
                    <CompactEventRow
                      key={ev.id}
                      ev={ev}
                      canCancel={canCancelEvents}
                      canDelete={canDeleteEvents}
                    />
                  ))}
                </div>
              </Panel>
            ))
          ) : (
            <Panel>
              <div className="sub" style={{ textAlign: "center" }}>
                No upcoming events after today in the next {windowDays} days.
              </div>
            </Panel>
          )}
        </div>

        <div className="s4" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {isClient ? (
            <ClientActivityFeed rows={activity} />
          ) : (
            <>
              <CalendarShareCard booking={bookingSettings ?? null} />
              <TodosRail todos={todos} windowDays={windowDays} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CalendarShareCard({ booking }: { booking: UserBookingSettings | null }) {
  const [copied, setCopied] = useState<"url" | "message" | null>(null);
  const bookingPath = booking?.enabled && booking.slug ? `/book/${booking.slug}` : null;
  const bookingUrl = bookingPath && typeof window !== "undefined" ? `${window.location.origin}${bookingPath}` : bookingPath;
  const inviteText = bookingUrl
    ? `Book a meeting with me here:\n${bookingUrl}`
    : "";

  const copyText = async (value: string, kind: "url" | "message") => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1600);
  };

  return (
    <Panel
      title="Booking link"
      actions={
        bookingUrl ? (
          <IconBtn
            onClick={() => copyText(bookingUrl, "url")}
            title="Copy booking link"
            aria-label="Copy booking link"
            // Dynamic, state-derived: the button turns green for the ~1.6s the
            // "copied" flag is up. `.btn` owns the resting colour.
            style={copied === "url" ? { color: "var(--ok)" } : undefined}
          >
            <Icon name={copied === "url" ? "check" : "link"} size={13} />
          </IconBtn>
        ) : null
      }
    >
      {bookingUrl ? (
        <>
          <div className="sub">
            Copy this page into email, SMS, or chat. Booked calls land on this calendar.
          </div>
          <div className="row mt">
            <Input
              grow
              readOnly
              value={bookingUrl}
              onFocus={(event) => event.currentTarget.select()}
              onClick={(event) => event.currentTarget.select()}
            />
            <Btn onClick={() => copyText(bookingUrl, "url")}>
              <Icon name={copied === "url" ? "check" : "link"} size={12} />
              {copied === "url" ? "Copied" : "Copy URL"}
            </Btn>
          </div>
          <Textarea
            className="mt"
            readOnly
            value={inviteText}
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.currentTarget.select()}
            rows={3}
            style={{ width: "100%", resize: "none" }}
          />
          <div className="row mt">
            <Btn onClick={() => copyText(inviteText, "message")}>
              <Icon name={copied === "message" ? "check" : "send"} size={12} />
              {copied === "message" ? "Copied message" : "Copy message"}
            </Btn>
            <Link href={bookingPath ?? "/calendar"} target="_blank" className="btn">
              <Icon name="external" size={12} /> Open
            </Link>
            <Link href="/booking-settings" className="btn">
              <Icon name="gear" size={12} /> Configure
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="sub">
            Your public booking page is not enabled yet. Configure it once, then the share link will appear here.
          </div>
          <div className="row mt">
            <Link href="/booking-settings" className="btn pri">
              <Icon name="cal" size={12} /> Configure booking page
            </Link>
          </div>
        </>
      )}
    </Panel>
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
    <Panel
      title="Today"
      sub={`Real-time agenda · current line fixed at ${formatClock(new Date(nowTs))}`}
      actions={<Tag>{events.length} item{events.length === 1 ? "" : "s"}</Tag>}
      // The body is an absolutely-positioned time canvas, not a padded card
      // body: every child is placed by computed pixel offsets.
      noPad
    >
      <div
        style={{
          height: "min(680px, calc(100vh - 230px))",
          minHeight: 420,
          position: "relative",
          overflow: "hidden",
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
          <span className="cellchip c-bad" style={{ marginLeft: 12 }}>
            {formatClock(new Date(nowTs))}
          </span>
          <div style={{ height: 2, flex: 1, background: "var(--danger)" }} />
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
                  background: "var(--line)",
                }}
              >
                <div className="lbl num" style={{ position: "absolute", top: -8, left: 16, width: 48 }}>
                  {formatHour(hour.minute)}
                </div>
              </div>
            ))}

            <div style={{ position: "absolute", left: 76, right: 14, top: 0, bottom: 0 }}>
              {layout.items.length === 0 ? (
                <div
                  className="sub"
                  style={{
                    position: "absolute",
                    top: Math.max(24, layout.currentOffset + 28),
                    left: 0,
                    right: 0,
                    border: "1px dashed var(--line2)",
                    borderRadius: 12,
                    padding: 14,
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
    </Panel>
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
  const event = item.event;
  const update = useUpdateCalendarEvent();
  const remove = useDeleteCalendarEvent();
  const state = eventTone(event);
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
        boxShadow: "var(--sh2)",
        opacity: isCancelled ? 0.58 : 1,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span className="num" style={{ color: state.fg, fontSize: 11, fontWeight: 800 }}>
          {formatClock(new Date(event.starts_at))}
        </span>
        {event.duration_min ? <span className="sub">{event.duration_min}m</span> : null}
        <span className="sp" />
        {event.priority === "high" && !isDone && !isCancelled ? (
          <span className="repdot" style={{ background: "var(--danger)" }} />
        ) : null}
      </div>
      <div
        style={{
          color: "var(--ink)",
          fontWeight: 750,
          fontSize: 13,
          lineHeight: 1.2,
          textDecoration: isDone || isCancelled ? "line-through" : "none",
        }}
      >
        {event.title}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, marginTop: "auto" }}>
        {/* `.cellchip` owns the pill shape only; the tone is data-derived, so
            the two colours stay inline rather than picking a `.c-*` that would
            vanish against the same-tone block behind it. */}
        <span className="cellchip" style={{ background: "var(--surface)", color: state.fg }}>
          {event.kind}
        </span>
        {event.source === "ai" ? <CellChip tone="acc">AI</CellChip> : null}
        {event.who ? (
          <span
            className="sub"
            style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {event.who}
          </span>
        ) : null}
        <span className="sp" />
        {/* Deliberately NOT `.btn.sm` / IconBtn: a block can be as short as
            MIN_EVENT_HEIGHT (56px) with `overflow: hidden`, and a 30px control
            pushes these actions out of the box entirely. */}
        {canCancel && !isCancelled ? (
          <button onClick={cancelEvent} style={miniAction()} title="Cancel event" aria-label="Cancel event">
            Cancel
          </button>
        ) : null}
        {canDelete ? (
          <button onClick={deleteEvent} style={miniIconAction()} title="Delete event" aria-label="Delete event">
            <Icon name="x" size={11} />
          </button>
        ) : null}
      </div>
    </Link>
  );
}

function CompactEventRow({ ev, canCancel, canDelete }: { ev: CalendarEvent; canCancel: boolean; canDelete: boolean }) {
  const update = useUpdateCalendarEvent();
  const remove = useDeleteCalendarEvent();
  const state = eventTone(ev);
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
      className="row"
      style={{
        padding: 10,
        borderRadius: 12,
        border: `1px solid ${state.fg}`,
        background: state.bg,
        textDecoration: "none",
        color: "inherit",
        opacity: isCancelled ? 0.6 : 1,
      }}
    >
      <div className="num" style={{ minWidth: 70, fontSize: 12, fontWeight: 800, color: state.fg }}>
        {formatClock(new Date(ev.starts_at))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 750,
            color: "var(--ink)",
            textDecoration: isDone || isCancelled ? "line-through" : "none",
          }}
        >
          {ev.title}
        </div>
        <div className="sub" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {state.label ? <span style={{ fontWeight: 800, color: state.fg }}>{state.label}</span> : null}
          {state.label && ev.who ? <span>·</span> : null}
          {ev.who ?? (state.label ? "" : "-")}
          {ev.duration_min ? <> · {ev.duration_min}m</> : null}
        </div>
      </div>
      <CellChip tone="mut">{ev.kind}</CellChip>
      {canCancel && !isCancelled ? (
        <Btn size="sm" onClick={onCancel} title="Cancel event" aria-label="Cancel event">
          Cancel
        </Btn>
      ) : null}
      {canDelete ? (
        <IconBtn onClick={onDelete} title="Delete event" aria-label="Delete event">
          <Icon name="x" size={12} />
        </IconBtn>
      ) : null}
    </Link>
  );
}

function ClientActivityFeed({ rows }: { rows: CalendarActivityItem[] }) {
  return (
    <Panel title="Account activity">
      {rows.length === 0 ? (
        <div className="sub">No recent borrower-visible activity.</div>
      ) : (
        // `.pick + .pick` supplies the row spacing, so no wrapper gap here.
        <div>
          {rows.slice(0, 18).map((row) => (
            <Link key={row.id} href={row.loan_id ? `/loans/${row.loan_id}` : "/calendar"} className="pick">
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: "var(--accent-100)",
                  color: "var(--accent)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name={activityIcon(row.kind)} size={13} />
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 650, lineHeight: 1.25 }}>
                  {row.summary || humanize(row.kind)}
                </span>
                <span className="sub" style={{ display: "block", marginTop: 2 }}>
                  {humanize(row.kind)} ·{" "}
                  {new Date(row.occurred_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

function TodosRail({ todos, windowDays }: { todos: Todo[]; windowDays: Window }) {
  const groups = groupTodos(todos, windowDays);
  const counts = useMemo(
    () => ({
      overdue: todos.filter((x) => x.urgency === "overdue").length,
      today: todos.filter((x) => x.urgency === "today").length,
      upcoming: todos.filter((x) => x.urgency === "soon" || x.urgency === "later").length,
    }),
    [todos],
  );

  return (
    <Panel
      title={`Todos · next ${windowDays}d`}
      actions={
        <Link href="/ai-inbox" className="linky">
          AI inbox <Icon name="arrowR" size={11} />
        </Link>
      }
    >
      {/* Three equal tiles, held at three across even in the narrow rail —
          `.kpis` auto-fit would break them to 2 + 1. */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <TodoMetric label="Overdue" value={counts.overdue} tone="overdue" />
        <TodoMetric label="Today" value={counts.today} tone="today" />
        <TodoMetric label="Upcoming" value={counts.upcoming} tone="soon" />
      </div>

      {todos.length === 0 ? (
        <div className="sub mt">Nothing pending in this window.</div>
      ) : (
        groups.map((group) => (
          <div key={group.key} className="mt">
            <div className="row" style={{ marginBottom: 7 }}>
              <span className="repdot" style={{ background: todoAccent(group.tone) }} />
              <span className="lbl">{group.label}</span>
              <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
              <span className="sub num">{group.items.length}</span>
            </div>
            {group.items.map((todo) => (
              <Link
                key={todo.key}
                href={todo.href}
                className="pick"
                // Urgency is carried by the left edge as well as the chip, so
                // the rail scans by colour. Data-derived, hence inline.
                style={{ borderLeft: `3px solid ${todoAccent(todo.urgency)}` }}
              >
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12.5,
                      fontWeight: 650,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {todo.title}
                  </span>
                  <span className="sub" style={{ display: "block", marginTop: 2 }}>
                    {todo.sub}
                  </span>
                </span>
                <CellChip tone={urgencyTone(todo.urgency)}>{todo.urgency}</CellChip>
              </Link>
            ))}
          </div>
        ))
      )}
    </Panel>
  );
}

function TodoMetric({ label, value, tone }: { label: string; value: number; tone: Todo["urgency"] }) {
  // The figure keeps its urgency colour — it is the fastest read in the rail.
  return <Kpi label={label} value={<span style={{ color: todoAccent(tone) }}>{value}</span>} />;
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

  const minMinute = Math.min(DEFAULT_DAY_START_MINUTE, nowMinute, ...raw.map((x) => x.startMinute));
  const maxMinute = Math.max(DEFAULT_DAY_END_MINUTE, nowMinute + 30, ...raw.map((x) => x.endMinute));
  const rangeStart = Math.max(0, Math.floor(minMinute / 60) * 60);
  const rangeEnd = Math.min(24 * 60, Math.ceil(maxMinute / 60) * 60);
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
    currentOffset: clampNumber((nowMinute - rangeStart) * PX_PER_MINUTE, 0, height),
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

/** Tone of an event block. The colours are the same values the theme shim
 *  returned, read straight off globals.css instead. */
function eventTone(ev: CalendarEvent): { fg: string; bg: string; label: string } {
  const isDone = ev.status === "done";
  const isCancelled = ev.status === "cancelled";
  const isOverdue = !isDone && !isCancelled && new Date(ev.starts_at).getTime() < Date.now();
  if (isCancelled) return { fg: "var(--muted)", bg: "var(--sunken)", label: "CANCELLED" };
  if (isDone) return { fg: "var(--ok)", bg: "var(--ok-tint)", label: "DONE" };
  if (isOverdue) return { fg: "var(--danger)", bg: "var(--danger-tint)", label: "OVERDUE" };
  return { fg: "var(--warn)", bg: "var(--warn-tint)", label: "" };
}

function eventHref(ev: CalendarEvent): string {
  if (isDocumentDue(ev)) return `/vault?fulfill=${ev.external_ref_id}`;
  return ev.loan_id ? `/loans/${ev.loan_id}` : "/calendar";
}

function isDocumentDue(ev: CalendarEvent): boolean {
  return ev.external_ref_kind === "document_due" && !!ev.external_ref_id;
}

/** Compact action inside a timeline block — see the note at the call site for
 *  why these are not `.btn.sm`. */
function miniAction(): CSSProperties {
  return {
    border: "1px solid var(--line)",
    background: "var(--surface)",
    color: "var(--ink2)",
    borderRadius: 6,
    padding: "2px 6px",
    fontSize: 10,
    fontWeight: 800,
    cursor: "pointer",
    flexShrink: 0,
  };
}

function miniIconAction(): CSSProperties {
  return {
    width: 22,
    height: 22,
    borderRadius: 6,
    border: "1px solid var(--line)",
    background: "var(--surface)",
    color: "var(--faint)",
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

interface TodoGroup {
  key: string;
  label: string;
  tone: Todo["urgency"];
  items: Todo[];
}

function groupTodos(todos: Todo[], windowDays: Window): TodoGroup[] {
  const specs: TodoGroup[] = [
    { key: "overdue", label: "Needs attention", tone: "overdue", items: [] },
    { key: "today", label: "Due today", tone: "today", items: [] },
    { key: "upcoming", label: `Next ${windowDays} days`, tone: "soon", items: [] },
  ];
  for (const todo of todos) {
    if (todo.urgency === "overdue") specs[0].items.push(todo);
    else if (todo.urgency === "today") specs[1].items.push(todo);
    else specs[2].items.push(todo);
  }
  return specs.filter((group) => group.items.length > 0);
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

function todoAccent(urgency: Todo["urgency"]): string {
  return urgency === "overdue"
    ? "var(--danger)"
    : urgency === "today"
      ? "var(--warn)"
      : urgency === "soon"
        ? "var(--petrol)"
        : "var(--line)";
}

function urgencyTone(urgency: Todo["urgency"]): ChipTone {
  return urgency === "overdue" ? "bad" : urgency === "today" ? "warn" : "mut";
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
