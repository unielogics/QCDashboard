"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type DateClickArg, type EventResizeDoneArg } from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { DatesSetArg, EventClickArg, EventContentArg, EventDropArg, EventInput } from "@fullcalendar/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { Btn, CellChip, IconBtn, StatusLine } from "@/components/ds";
import { apiErrorMessage } from "@/components/email/EmailComposer";
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import type {
  AppointmentWorkspace,
  CalendarWorkspace,
  CalendarWorkspaceEvent,
  RepAppointment,
} from "@/lib/repAppointments";
import { CalendarV2AppointmentDrawer } from "./components/CalendarV2AppointmentDrawer";
import { CalendarV2NewAppointmentDrawer } from "./components/CalendarV2NewAppointmentDrawer";
import { CalendarV2SettingsDrawer } from "./components/CalendarV2SettingsDrawer";

type CalendarView = "dayGridMonth" | "timeGridWeek" | "listMonth";

const VIEW_OPTIONS: Array<{ value: CalendarView; label: string }> = [
  { value: "dayGridMonth", label: "Month" },
  { value: "timeGridWeek", label: "Week" },
  { value: "listMonth", label: "List" },
];

const TYPE_COLORS: Record<string, string> = {
  intro_call: "blue",
  underwriting_review: "violet",
  document_review: "amber",
  signing: "green",
  lender_call: "gray",
};

const TYPE_LABELS: Record<string, string> = {
  intro_call: "Intro call",
  underwriting_review: "Underwriting review",
  document_review: "Document review",
  signing: "Signing",
  lender_call: "Lender call",
};

function startOfDay(value: Date): Date {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function defaultCreateTime(value = new Date()): Date {
  const result = new Date(value);
  result.setSeconds(0, 0);
  const minutes = result.getMinutes();
  result.setMinutes(Math.ceil(minutes / 15) * 15);
  if (result.getTime() < Date.now()) result.setMinutes(result.getMinutes() + 15);
  return result;
}

function eventDurationMinutes(start: Date | null, end: Date | null): number {
  if (!start) return 30;
  if (!end) return 30;
  return Math.max(15, Math.round((end.getTime() - start.getTime()) / 60_000));
}

function formatEventTime(value: Date): string {
  return value.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function classNamesForEvent(event: CalendarWorkspaceEvent): string[] {
  return [
    "calendar-v2-event",
    `calendar-v2-event-${event.color || TYPE_COLORS[event.kind] || "blue"}`,
    event.event_type === "internal" ? "calendar-v2-event-internal" : "calendar-v2-event-appointment",
    event.has_outcome ? "calendar-v2-event-complete" : "",
  ].filter(Boolean);
}

export default function CalendarV2Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const apiCall = useAuthedApi();
  const queryClient = useQueryClient();
  const calendarRef = useRef<FullCalendar | null>(null);
  const pushedAppointmentRef = useRef(false);
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const appointmentId = searchParams.get("appointment");
  const allowed = user?.role === Role.SUPER_ADMIN || user?.role === Role.LOAN_EXEC || user?.role === Role.FIELD_REP;

  const [view, setView] = useState<CalendarView>("dayGridMonth");
  const [title, setTitle] = useState("");
  const [range, setRange] = useState(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { from: first.toISOString(), to: last.toISOString() };
  });
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(() => new Set(Object.keys(TYPE_LABELS)));
  const [includeInternal, setIncludeInternal] = useState(false);
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [newAppointmentOpen, setNewAppointmentOpen] = useState(false);
  const [newAppointmentDate, setNewAppointmentDate] = useState(() => defaultCreateTime());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mutationMessage, setMutationMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const workspace = useQuery({
    queryKey: ["calendar-v2-workspace", range.from, range.to, includeInternal, includeCancelled],
    queryFn: () => apiCall<CalendarWorkspace>(
      `/calendar/workspace?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&include_internal=${includeInternal ? "true" : "false"}&include_cancelled=${includeCancelled ? "true" : "false"}`,
    ),
    enabled: Boolean(allowed),
    staleTime: 15_000,
  });

  const monthRange = useMemo(() => {
    const first = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1);
    const next = new Date(focusDate.getFullYear(), focusDate.getMonth() + 1, 1);
    return { from: first.toISOString(), to: next.toISOString() };
  }, [focusDate]);

  const monthlyWorkspace = useQuery({
    queryKey: ["calendar-v2-month-metrics", monthRange.from, monthRange.to, includeCancelled],
    queryFn: () => apiCall<CalendarWorkspace>(
      `/calendar/workspace?from=${encodeURIComponent(monthRange.from)}&to=${encodeURIComponent(monthRange.to)}&include_internal=false&include_cancelled=${includeCancelled ? "true" : "false"}`,
    ),
    enabled: Boolean(allowed),
    staleTime: 15_000,
  });

  const deepLinkedWorkspace = useQuery({
    queryKey: ["calendar-v2-deep-link", appointmentId],
    queryFn: () => apiCall<AppointmentWorkspace>(`/dealer-os/appointments/${appointmentId}/workspace`),
    enabled: Boolean(allowed && appointmentId),
    retry: false,
  });

  useEffect(() => {
    if (!appointmentId || !deepLinkedWorkspace.data) return;
    const startsAt = new Date(deepLinkedWorkspace.data.appointment.starts_at);
    setFocusDate(startsAt);
    calendarRef.current?.getApi().gotoDate(startsAt);
  }, [appointmentId, deepLinkedWorkspace.data]);

  const visibleEvents = useMemo(
    () => (workspace.data?.events ?? []).filter((event) => (
      event.event_type === "internal" || enabledTypes.has(event.kind)
    )),
    [enabledTypes, workspace.data?.events],
  );

  const calendarEvents = useMemo<EventInput[]>(() => visibleEvents.map((event) => ({
    id: event.id,
    title: event.title,
    start: event.starts_at,
    end: event.ends_at,
    editable: event.event_type === "appointment" && event.can_edit && Boolean(workspace.data?.capabilities.can_drag),
    startEditable: event.event_type === "appointment" && event.can_edit,
    durationEditable: event.event_type === "appointment" && event.can_edit,
    classNames: classNamesForEvent(event),
    extendedProps: event,
  })), [visibleEvents, workspace.data?.capabilities.can_drag]);

  const refreshWorkspace = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["calendar-v2-workspace"] });
  }, [queryClient]);

  const onDatesSet = useCallback((info: DatesSetArg) => {
    setTitle(info.view.title);
    setRange({ from: info.start.toISOString(), to: info.end.toISOString() });
    setFocusDate(info.view.currentStart);
    setView(info.view.type as CalendarView);
  }, []);

  const changeView = (next: CalendarView) => {
    calendarRef.current?.getApi().changeView(next);
    setView(next);
  };

  const movePeriod = (direction: "prev" | "next" | "today") => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (direction === "prev") api.prev();
    else if (direction === "next") api.next();
    else api.today();
  };

  const openAppointment = (id: string) => {
    pushedAppointmentRef.current = true;
    const next = new URLSearchParams(searchParams.toString());
    next.set("appointment", id);
    router.push(`/calendar-v2?${next.toString()}`, { scroll: false });
  };

  const closeAppointment = () => {
    if (pushedAppointmentRef.current) {
      pushedAppointmentRef.current = false;
      router.back();
      return;
    }
    const next = new URLSearchParams(searchParams.toString());
    next.delete("appointment");
    router.replace(next.size ? `/calendar-v2?${next.toString()}` : "/calendar-v2", { scroll: false });
  };

  const onEventClick = (info: EventClickArg) => {
    const event = info.event.extendedProps as CalendarWorkspaceEvent;
    if (event.event_type === "appointment" && event.appointment_id) openAppointment(event.appointment_id);
  };

  const patchEventTime = async (
    event: EventDropArg["event"],
    revert: () => void,
  ) => {
    const record = event.extendedProps as CalendarWorkspaceEvent;
    if (record.event_type !== "appointment" || !record.appointment_id || !event.start) {
      revert();
      return;
    }
    setMutationMessage(null);
    try {
      await apiCall<RepAppointment>(`/dealer-os/appointments/${record.appointment_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          starts_at: event.start.toISOString(),
          duration_min: eventDurationMinutes(event.start, event.end),
        }),
      });
      setMutationMessage({ tone: "ok", text: "Appointment updated and calendar synchronization completed." });
      await refreshWorkspace();
    } catch (error) {
      revert();
      setMutationMessage({ tone: "bad", text: apiErrorMessage(error, "The appointment could not be moved.") });
    }
  };

  const onEventDrop = (info: EventDropArg) => void patchEventTime(info.event, info.revert);
  const onEventResize = (info: EventResizeDoneArg) => void patchEventTime(info.event, info.revert);

  const onDateClick = (info: DateClickArg) => {
    if (!workspace.data?.capabilities.can_create) return;
    setNewAppointmentDate(defaultCreateTime(info.date));
    setNewAppointmentOpen(true);
  };

  const onCreated = (appointment: RepAppointment) => {
    setNewAppointmentOpen(false);
    setMutationMessage({ tone: "ok", text: "Appointment created. Delivery and synchronization status are available in the workspace." });
    void refreshWorkspace();
    openAppointment(appointment.id);
  };

  const toggleType = (kind: string) => {
    setEnabledTypes((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  if (userLoading) return <div className="calendar-v2-state">Loading calendar access...</div>;
  if (!allowed) {
    return (
      <div className="calendar-v2-state">
        <Icon name="lock" size={24} />
        <h1>Operator calendar access required</h1>
        <p>Calendar V2 is available to super admins, underwriters, and assigned field representatives.</p>
      </div>
    );
  }

  return (
    <div className="calendar-v2-page">
      <header className="calendar-v2-header">
        <div>
          <div className="calendar-v2-eyebrow">Appointment CRM</div>
          <h1>Calendar</h1>
          <p>Meetings, decisions, notes, and file actions in one working surface.</p>
        </div>
        <div className="calendar-v2-header-actions">
          <Btn onClick={() => setSettingsOpen(true)}><Icon name="gear" size={14} /> Settings</Btn>
          <Btn variant="pri" onClick={() => { setNewAppointmentDate(defaultCreateTime()); setNewAppointmentOpen(true); }}>
            <Icon name="plus" size={14} /> New appointment
          </Btn>
        </div>
      </header>

      {mutationMessage ? (
        <StatusLine tone={mutationMessage.tone}>{mutationMessage.text}</StatusLine>
      ) : null}

      <div className="calendar-v2-layout">
        <aside className="calendar-v2-rail">
          <Btn variant="pri" className="calendar-v2-new-button" onClick={() => { setNewAppointmentDate(defaultCreateTime()); setNewAppointmentOpen(true); }}>
            <Icon name="plus" size={15} /> New appointment
          </Btn>
          <MiniCalendar
            focusDate={focusDate}
            onSelect={(date) => {
              setFocusDate(date);
              calendarRef.current?.getApi().gotoDate(date);
            }}
          />
          <section className="calendar-v2-rail-section">
            <div className="calendar-v2-rail-heading"><span>Appointment types</span><button type="button" onClick={() => setEnabledTypes(new Set(Object.keys(TYPE_LABELS)))}>All</button></div>
            <div className="calendar-v2-filter-list">
              {(monthlyWorkspace.data?.appointment_types ?? Object.keys(TYPE_LABELS).map((key) => ({ key, label: TYPE_LABELS[key], count: 0 }))).map((item) => (
                <label key={item.key}>
                  <input type="checkbox" checked={enabledTypes.has(item.key)} onChange={() => toggleType(item.key)} />
                  <i className={`calendar-v2-dot calendar-v2-dot-${TYPE_COLORS[item.key] ?? "blue"}`} />
                  <span>{item.label}</span>
                  <b>{item.count}</b>
                </label>
              ))}
            </div>
          </section>
          <section className="calendar-v2-rail-section">
            <div className="calendar-v2-rail-heading"><span>Display</span></div>
            <label className="calendar-v2-switch-row">
              <span><Icon name="layers" size={14} /> Internal events</span>
              <input type="checkbox" checked={includeInternal} onChange={(event) => setIncludeInternal(event.target.checked)} />
            </label>
            <label className="calendar-v2-switch-row">
              <span><Icon name="eye" size={14} /> Cancelled</span>
              <input type="checkbox" checked={includeCancelled} onChange={(event) => setIncludeCancelled(event.target.checked)} />
            </label>
          </section>
          <section className="calendar-v2-metrics" aria-label="Calendar metrics">
            <div><span>Appointments</span><strong>{monthlyWorkspace.data?.metrics.appointments ?? 0}</strong></div>
            <div><span>Awaiting outcome</span><strong className={(monthlyWorkspace.data?.metrics.awaiting_outcome ?? 0) > 0 ? "warn" : ""}>{monthlyWorkspace.data?.metrics.awaiting_outcome ?? 0}</strong></div>
            <div><span>Files created</span><strong>{monthlyWorkspace.data?.metrics.files_created ?? 0}</strong></div>
            <div><span>Outcomes logged</span><strong>{monthlyWorkspace.data?.metrics.outcome_logged ?? 0}</strong></div>
          </section>
        </aside>

        <main className="calendar-v2-calendar-shell">
          <div className="calendar-v2-toolbar">
            <div className="calendar-v2-period-controls">
              <Btn size="sm" onClick={() => movePeriod("today")}>Today</Btn>
              <IconBtn aria-label="Previous period" onClick={() => movePeriod("prev")}><Icon name="chevL" size={16} /></IconBtn>
              <IconBtn aria-label="Next period" onClick={() => movePeriod("next")}><Icon name="chevR" size={16} /></IconBtn>
              <h2>{title}</h2>
            </div>
            <div className="calendar-v2-toolbar-summary">
              <CellChip tone="mut">{workspace.data?.metrics.appointments ?? 0} appointments</CellChip>
              {(workspace.data?.metrics.awaiting_outcome ?? 0) > 0 ? <CellChip tone="warn">{workspace.data?.metrics.awaiting_outcome} awaiting outcome</CellChip> : null}
            </div>
            <div className="calendar-v2-view-switch" role="group" aria-label="Calendar view">
              {VIEW_OPTIONS.map((option) => (
                <button key={option.value} type="button" className={view === option.value ? "on" : ""} onClick={() => changeView(option.value)}>{option.label}</button>
              ))}
            </div>
          </div>

          {workspace.isError ? <StatusLine tone="bad">{apiErrorMessage(workspace.error, "Calendar data could not be loaded.")}</StatusLine> : null}
          <div className={`calendar-v2-fullcalendar${workspace.isFetching ? " loading" : ""}`}>
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={false}
              firstDay={0}
              weekends
              nowIndicator
              navLinks
              selectable={Boolean(workspace.data?.capabilities.can_create)}
              editable={Boolean(workspace.data?.capabilities.can_drag)}
              eventResizableFromStart
              eventDurationEditable
              eventStartEditable
              eventOverlap={false}
              dayMaxEvents={4}
              slotMinTime="07:00:00"
              slotMaxTime="20:00:00"
              slotDuration="00:30:00"
              snapDuration="00:15:00"
              allDaySlot={false}
              height="100%"
              events={calendarEvents}
              datesSet={onDatesSet}
              dateClick={onDateClick}
              eventClick={onEventClick}
              eventDrop={onEventDrop}
              eventResize={onEventResize}
              eventContent={renderEventContent}
              eventAllow={(_dropInfo, draggedEvent) => {
                if (!draggedEvent) return false;
                const record = draggedEvent.extendedProps as CalendarWorkspaceEvent;
                return record.event_type === "appointment" && record.can_edit;
              }}
              noEventsContent="No appointments match these filters."
              views={{
                dayGridMonth: { dayHeaderFormat: { weekday: "short" } },
                timeGridWeek: { dayHeaderFormat: { weekday: "short", month: "short", day: "numeric" } },
                listMonth: { listDayFormat: { weekday: "long", month: "long", day: "numeric" } },
              }}
            />
          </div>
        </main>
      </div>

      <CalendarV2NewAppointmentDrawer
        open={newAppointmentOpen}
        initialDate={newAppointmentDate}
        onClose={() => setNewAppointmentOpen(false)}
        onCreated={onCreated}
      />
      <CalendarV2SettingsDrawer open={settingsOpen} onClose={() => { setSettingsOpen(false); void refreshWorkspace(); }} />
      {appointmentId ? (
        <CalendarV2AppointmentDrawer
          appointmentId={appointmentId}
          onClose={closeAppointment}
          onChanged={() => void refreshWorkspace()}
        />
      ) : null}
    </div>
  );
}

function renderEventContent(info: EventContentArg) {
  const record = info.event.extendedProps as CalendarWorkspaceEvent;
  return (
    <div className="calendar-v2-event-content">
      <div className="calendar-v2-event-time">
        <span>{info.timeText || (info.event.start ? formatEventTime(info.event.start) : "")}</span>
        {record.has_outcome ? <Icon name="check" size={11} /> : null}
      </div>
      <strong>{record.title}</strong>
      <small>{[record.invitee_name, record.company].filter(Boolean).join(" · ") || (record.event_type === "internal" ? "Internal" : TYPE_LABELS[record.kind])}</small>
    </div>
  );
}

function MiniCalendar({ focusDate, onSelect }: { focusDate: Date; onSelect: (date: Date) => void }) {
  const year = focusDate.getFullYear();
  const month = focusDate.getMonth();
  const first = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const value = new Date(gridStart);
    value.setDate(gridStart.getDate() + index);
    return value;
  });
  const today = startOfDay(new Date()).getTime();
  const selected = startOfDay(focusDate).getTime();

  const move = (delta: number) => onSelect(new Date(year, month + delta, 1));
  return (
    <section className="calendar-v2-mini">
      <header>
        <strong>{focusDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong>
        <span>
          <IconBtn aria-label="Previous month" onClick={() => move(-1)}><Icon name="chevL" size={13} /></IconBtn>
          <IconBtn aria-label="Next month" onClick={() => move(1)}><Icon name="chevR" size={13} /></IconBtn>
        </span>
      </header>
      <div className="calendar-v2-mini-weekdays">{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="calendar-v2-mini-days">
        {days.map((date) => {
          const key = startOfDay(date).getTime();
          return (
            <button
              key={date.toISOString()}
              type="button"
              className={`${date.getMonth() === month ? "" : "outside"}${key === today ? " today" : ""}${key === selected ? " selected" : ""}`}
              onClick={() => onSelect(date)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </section>
  );
}
