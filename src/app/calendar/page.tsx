"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useAITasks,
  useCalendar,
  useCurrentUser,
  useDeleteCalendarEvent,
  useDocuments,
  useLoans,
  useUpdateCalendarEvent,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import type { AITask, CalendarEvent, Document, Loan } from "@/lib/types";
import { EventModal } from "./components/EventModal";

type Window = 7 | 30 | 90;
const WINDOWS: { id: Window; label: string }[] = [
  { id: 7, label: "7 days" },
  { id: 30, label: "30 days" },
  { id: 90, label: "90 days" },
];

export default function CalendarPage() {
  const { t } = useTheme();
  const [windowDays, setWindowDays] = useState<Window>(7);
  const [createOpen, setCreateOpen] = useState(false);
  const { data: events = [] } = useCalendar();
  const { data: tasks = [] } = useAITasks();
  const { data: docs = [] } = useDocuments();
  const { data: loans = [] } = useLoans();
  const { data: user } = useCurrentUser();
  const isClient = user?.role === Role.CLIENT;

  const now = Date.now();
  const horizon = now + windowDays * 24 * 60 * 60 * 1000;

  const visibleEvents = useMemo(
    () =>
      events
        .filter((e) => {
          const ts = new Date(e.starts_at).getTime();
          return ts >= now - 24 * 60 * 60 * 1000 && ts <= horizon;
        })
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    [events, now, horizon],
  );

  const byDay = visibleEvents.reduce<Record<string, CalendarEvent[]>>((acc, ev) => {
    const k = new Date(ev.starts_at).toISOString().slice(0, 10);
    (acc[k] ||= []).push(ev);
    return acc;
  }, {});
  const days = Object.keys(byDay).sort();

  const todos = useMemo(
    () => buildTodos(tasks, docs, loans, now, horizon),
    [tasks, docs, loans, now, horizon],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
        {/* Borrowers don't create calendar events — closings/inspections
            are scheduled by operators. Hide both the trigger and the modal. */}
        {!isClient && (
          <button onClick={() => setCreateOpen(true)} style={qcBtnPrimary(t)}>
            <Icon name="plus" size={14} /> New event
          </button>
        )}
      </div>
      {!isClient && <EventModal open={createOpen} onClose={() => setCreateOpen(false)} />}

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, alignItems: "flex-start" }}>
        {/* Left — events grouped by day */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          {days.length === 0 ? (
            <Card pad={20}>
              <div style={{ fontSize: 13, color: t.ink3, textAlign: "center" }}>
                No events in the next {windowDays} days. Create one with <strong>+ New event</strong>{" "}
                or pick a longer window.
              </div>
            </Card>
          ) : (
            days.map((day) => (
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
                  {new Date(day).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  {byDay[day].map((ev) => (
                    <EventRow key={ev.id} ev={ev} canDelete={!isClient} />
                  ))}
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Right — todos rail (AI tasks + due docs in the same window) */}
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
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: t.ink,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {todo.title}
                    </div>
                    <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                      {todo.sub}
                    </div>
                  </div>
                  <Pill
                    bg={
                      todo.urgency === "overdue"
                        ? t.dangerBg
                        : todo.urgency === "today"
                          ? t.warnBg
                          : t.chip
                    }
                    color={
                      todo.urgency === "overdue"
                        ? t.danger
                        : todo.urgency === "today"
                          ? t.warn
                          : t.ink2
                    }
                  >
                    {todo.urgency}
                  </Pill>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// Single calendar row with inline status controls. Borrowers see only
// the "✓ Done" toggle (backend enforces). Operators additionally get
// a small delete affordance for typo / demo cleanup; cancellation
// (preferred over delete because it preserves audit) lives in the
// Done dropdown — mark "✓" twice to flip done→cancelled.
function EventRow({ ev, canDelete }: { ev: CalendarEvent; canDelete: boolean }) {
  const { t } = useTheme();
  const update = useUpdateCalendarEvent();
  const remove = useDeleteCalendarEvent();
  const link = ev.loan_id ? `/loans/${ev.loan_id}` : "/calendar";
  const isDone = ev.status === "done";
  const isCancelled = ev.status === "cancelled";
  const isOverdue = !isDone && !isCancelled && new Date(ev.starts_at).getTime() < Date.now();

  // Status color: green=done, red=overdue, yellow=pending, gray=cancelled.
  // The whole pill carries the signal so the user reads completion
  // state at a glance.
  const statusFg = isCancelled
    ? t.ink3
    : isDone
      ? t.profit
      : isOverdue
        ? t.danger
        : t.warn;
  const statusBg = isCancelled
    ? t.surface2
    : isDone
      ? t.profitBg
      : isOverdue
        ? t.dangerBg
        : t.warnBg;

  const onToggleDone = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    update.mutate({
      id: ev.id,
      patch: { status: isDone ? "pending" : "done" },
    });
  };

  const onDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${ev.title}"? Use status=cancelled to preserve audit trail.`)) return;
    remove.mutate(ev.id);
  };

  return (
    <Link
      href={link}
      onClick={onToggleDone}
      style={{
        display: "flex",
        gap: 12,
        padding: 10,
        borderRadius: 14,
        border: `1px solid ${statusFg}`,
        background: statusBg,
        alignItems: "center",
        textDecoration: "none",
        color: "inherit",
        opacity: isCancelled ? 0.6 : 1,
      }}
    >
      <div
        style={{
          minWidth: 70,
          fontSize: 12,
          fontWeight: 700,
          color: statusFg,
          fontFeatureSettings: '"tnum"',
          letterSpacing: 0.3,
        }}
      >
        {new Date(ev.starts_at).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: t.ink,
            textDecoration: isDone || isCancelled ? "line-through" : "none",
          }}
        >
          {ev.title}
        </div>
        <div style={{ fontSize: 11.5, color: t.ink3, display: "flex", gap: 6, alignItems: "center" }}>
          {isOverdue ? (
            <span style={{ fontWeight: 700, color: t.danger, letterSpacing: 0.5 }}>OVERDUE</span>
          ) : null}
          {isOverdue && ev.who ? <span>·</span> : null}
          {ev.who ?? (isOverdue ? "" : "—")}
          {ev.duration_min ? <> · {ev.duration_min}m</> : null}
        </div>
      </div>
      {ev.source === "ai" && <Pill bg={t.brandSoft} color={t.brand}>AI</Pill>}
      {ev.source === "auto" && <Pill bg={t.petrolSoft} color={t.petrol}>auto</Pill>}
      {ev.priority === "high" && !isDone && !isCancelled && <Pill bg={t.dangerBg} color={t.danger}>high</Pill>}
      <Pill>{ev.kind}</Pill>
      {canDelete && (
        <button
          onClick={onDelete}
          title="Delete event"
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            border: "none",
            background: "transparent",
            color: t.ink4,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="x" size={12} />
        </button>
      )}
    </Link>
  );
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
  const dayMs = 24 * 60 * 60 * 1000;
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
    // Surface a doc as a todo when it's been pending for a while
    const ageDays = (now - requested) / dayMs;
    if (ageDays < -1 || requested > horizon) continue;
    const urgency: Todo["urgency"] =
      ageDays > 7 ? "overdue" : ageDays > 3 ? "today" : "soon";
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
