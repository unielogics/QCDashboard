"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import {
  activeScheduleDays,
  AdvanceBookingWindowControls,
  scheduleBounds,
  WeeklyScheduleEditor,
} from "@/components/calendar/BookingAvailabilityControls";
import { Btn, CellChip, Field, Input, Panel, Select, StatusLine, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { apiErrorMessage } from "@/components/email/EmailComposer";
import { useAuthedApi, useBookingSettings, useCurrentUser, useUpdateBookingSettings } from "@/hooks/useApi";
import { appointmentCrmLabel, type AppointmentOutcomeDefinition, type AppointmentOutcomeEffect } from "@/lib/repAppointments";
import type { BookingBlockedInterval, UserBookingSettings } from "@/lib/types";

type SettingsTab = "outcomes" | "hours" | "booking" | "reminders";

const WEEKDAYS = [
  [0, "Sun"], [1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"],
] as const;

const EFFECTS: Array<[AppointmentOutcomeEffect, string]> = [
  ["log_activity", "Log activity"],
  ["file_action", "Update or create a file"],
  ["schedule_follow_up", "Schedule follow-up"],
  ["request_documents", "Request documents"],
  ["send_no_show_rebooking", "Send no-show rebooking"],
  ["close_enquiry", "Close enquiry"],
];

export function CalendarV2SettingsDrawer({
  open,
  canManageOutcomeCatalog,
  onClose,
}: {
  open: boolean;
  canManageOutcomeCatalog: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>(canManageOutcomeCatalog ? "outcomes" : "hours");
  const tabs: SettingsTab[] = canManageOutcomeCatalog
    ? ["outcomes", "hours", "booking", "reminders"]
    : ["hours", "booking", "reminders"];
  useEffect(() => {
    if (!canManageOutcomeCatalog && tab === "outcomes") setTab("hours");
  }, [canManageOutcomeCatalog, tab]);
  return (
    <Drawer open={open} onClose={onClose} title="Calendar settings" sub="Shared outcomes, availability, booking behavior, and reminders." width="xl" bodyClass="calendar-v2-settings-body">
      <div className="calendar-v2-settings">
        <nav className="calendar-v2-settings-nav" aria-label="Calendar settings">
          {tabs.map((value) => <button key={value} type="button" className={tab === value ? "on" : ""} onClick={() => setTab(value)}><Icon name={value === "outcomes" ? "flag" : value === "hours" ? "cal" : value === "booking" ? "link" : "bell"} size={16} />{value[0].toUpperCase() + value.slice(1)}</button>)}
        </nav>
        <div className="calendar-v2-settings-main">
          {tab === "outcomes" && canManageOutcomeCatalog ? <OutcomesSettings /> : null}
          {tab === "hours" ? <BookingSettingsForm tab="hours" /> : null}
          {tab === "booking" ? <BookingSettingsForm tab="booking" /> : null}
          {tab === "reminders" ? <BookingSettingsForm tab="reminders" /> : null}
        </div>
      </div>
    </Drawer>
  );
}

function OutcomesSettings() {
  const apiCall = useAuthedApi();
  const queryClient = useQueryClient();
  const outcomes = useQuery({
    queryKey: ["calendar-v2-outcomes", "all"],
    queryFn: () => apiCall<AppointmentOutcomeDefinition[]>("/calendar/outcomes?include_inactive=true"),
  });
  const [newName, setNewName] = useState("");
  const [newStatus, setNewStatus] = useState("follow_up");
  const [newColor, setNewColor] = useState("blue");
  const [newEffects, setNewEffects] = useState<AppointmentOutcomeEffect[]>(["log_activity"]);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["calendar-v2-outcomes"] }),
    queryClient.invalidateQueries({ queryKey: ["calendar-v2-outcomes", "all"] }),
  ]);
  const create = useMutation({
    mutationFn: () => apiCall("/calendar/outcomes", { method: "POST", body: JSON.stringify({ name: newName.trim(), description: null, color: newColor, target_crm_status: newStatus, effects: newEffects, active: true, sort_order: outcomes.data?.length ?? 0 }) }),
    onSuccess: async () => { setNewName(""); setNewEffects(["log_activity"]); setError(null); await refresh(); },
    onError: (nextError) => setError(apiErrorMessage(nextError, "The outcome could not be created.")),
  });
  const patchOutcome = async (item: AppointmentOutcomeDefinition, patch: Partial<AppointmentOutcomeDefinition>) => {
    setError(null);
    try {
      await apiCall(`/calendar/outcomes/${item.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await refresh();
    } catch (nextError) {
      setError(apiErrorMessage(nextError, "The outcome could not be updated."));
    }
  };
  const move = async (item: AppointmentOutcomeDefinition, direction: -1 | 1) => {
    const rows = [...(outcomes.data ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const index = rows.findIndex((row) => row.id === item.id);
    const other = rows[index + direction];
    if (!other) return;
    await Promise.all([
      patchOutcome(item, { sort_order: other.sort_order }),
      patchOutcome(other, { sort_order: item.sort_order }),
    ]);
  };
  return (
    <div className="calendar-v2-settings-stack">
      <div><h3>Personal outcomes</h3><p className="sub">Only you see and use these definitions. Effects are constrained to approved workflow actions.</p></div>
      <div className="calendar-v2-outcome-editor-list">
        {(outcomes.data ?? []).sort((a, b) => a.sort_order - b.sort_order).map((item) => <OutcomeEditor key={item.id} item={item} onPatch={(patch) => patchOutcome(item, patch)} onMove={(direction) => move(item, direction)} />)}
      </div>
      <Panel title="Add outcome">
        <div className="calendar-v2-form-grid">
          <Field label="Name" req><Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Outcome name" /></Field>
          <Field label="CRM status"><Select value={newStatus} onChange={(event) => setNewStatus(event.target.value)}><CrmStatusOptions /></Select></Field>
          <Field label="Color"><Select value={newColor} onChange={(event) => setNewColor(event.target.value)}><ColorOptions /></Select></Field>
        </div>
        <div className="calendar-v2-check-grid">{EFFECTS.map(([effect, label]) => <label key={effect} className="calendar-v2-check"><input type="checkbox" checked={newEffects.includes(effect)} onChange={(event) => setNewEffects((current) => event.target.checked ? [...current, effect] : current.filter((value) => value !== effect))} />{label}</label>)}</div>
        <Btn variant="pri" onClick={() => create.mutate()} disabled={!newName.trim() || !newEffects.length || create.isPending}><Icon name="plus" size={14} />Add outcome</Btn>
      </Panel>
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
    </div>
  );
}

function OutcomeEditor({ item, onPatch, onMove }: { item: AppointmentOutcomeDefinition; onPatch: (patch: Partial<AppointmentOutcomeDefinition>) => Promise<void>; onMove: (direction: -1 | 1) => Promise<void> }) {
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [status, setStatus] = useState(item.target_crm_status);
  const [color, setColor] = useState(item.color);
  const [effects, setEffects] = useState(item.effects);
  return (
    <div className={`calendar-v2-outcome-editor${item.active ? "" : " disabled"}`}>
      <div className="calendar-v2-outcome-editor-top"><i style={{ background: `var(--calendar-${color}, var(--accent))` }} /><Input value={name} onChange={(event) => setName(event.target.value)} /><CellChip tone={item.active ? "ok" : "mut"}>{item.active ? "Enabled" : "Disabled"}</CellChip><Btn size="sm" aria-label="Move up" onClick={() => onMove(-1)}><Icon name="chevU" size={13} /></Btn><Btn size="sm" aria-label="Move down" onClick={() => onMove(1)}><Icon name="chevD" size={13} /></Btn></div>
      <div className="calendar-v2-form-grid"><Field label="CRM status"><Select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><CrmStatusOptions /></Select></Field><Field label="Color"><Select value={color} onChange={(event) => setColor(event.target.value)}><ColorOptions /></Select></Field></div>
      <Field label="Description"><Textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
      <div className="calendar-v2-check-grid">{EFFECTS.map(([effect, label]) => <label key={effect} className="calendar-v2-check"><input type="checkbox" checked={effects.includes(effect)} onChange={(event) => setEffects((current) => event.target.checked ? [...current, effect] : current.filter((value) => value !== effect))} />{label}</label>)}</div>
      <div className="row"><Btn variant="pri" size="sm" onClick={() => onPatch({ name, description: description || null, target_crm_status: status, color, effects })}>Save</Btn><Btn size="sm" onClick={() => onPatch({ active: !item.active })}>{item.active ? "Disable" : "Enable"}</Btn></div>
    </div>
  );
}

function BookingSettingsForm({ tab }: { tab: Exclude<SettingsTab, "outcomes"> }) {
  const currentUser = useCurrentUser();
  const booking = useBookingSettings();
  const update = useUpdateBookingSettings();
  const [draft, setDraft] = useState<UserBookingSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (booking.data) setDraft(booking.data); }, [booking.data]);
  if (!draft) return <div className="calendar-v2-loading">Loading booking settings...</div>;
  const save = async () => {
    setError(null);
    try { await update.mutateAsync(draft); } catch (nextError) { setError(apiErrorMessage(nextError, "Calendar settings could not be saved.")); }
  };
  const set = <K extends keyof UserBookingSettings>(key: K, value: UserBookingSettings[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);
  const setSchedule = (weeklySchedule: UserBookingSettings["weekly_schedule"]) => {
    const bounds = scheduleBounds(weeklySchedule, draft.start_time, draft.end_time);
    setDraft((current) => current ? {
      ...current,
      weekly_schedule: weeklySchedule,
      available_days: activeScheduleDays(weeklySchedule),
      ...bounds,
    } : current);
  };
  const invalidWindow = draft.advance_booking_window_enabled
    && draft.maximum_advance_days < draft.minimum_notice_days;
  const recurring = draft.blocked_intervals.filter((row) => row.weekday != null);
  const exceptions = draft.blocked_intervals.filter((row) => row.on_date);
  const replaceBlock = (index: number, next: BookingBlockedInterval, dated: boolean) => {
    const target = dated ? exceptions : recurring;
    const updated = target.map((row, rowIndex) => rowIndex === index ? next : row);
    set("blocked_intervals", dated ? [...recurring, ...updated] : [...updated, ...exceptions]);
  };
  const removeBlock = (index: number, dated: boolean) => {
    const target = dated ? exceptions : recurring;
    const updated = target.filter((_, rowIndex) => rowIndex !== index);
    set("blocked_intervals", dated ? [...recurring, ...updated] : [...updated, ...exceptions]);
  };
  return (
    <div className="calendar-v2-settings-stack">
      {tab === "hours" ? <>
        <div><h3>Hours and blocked periods</h3><p className="sub">The same rules prevent public bookings, manual creation, drag, and resize conflicts.</p></div>
        <Panel title="Meeting defaults">
          <div className="calendar-v2-form-grid"><Field label="Timezone"><Input value={draft.timezone} onChange={(event) => set("timezone", event.target.value)} /></Field><Field label="Default duration"><Select value={draft.duration_min} onChange={(event) => set("duration_min", Number(event.target.value))}>{[15,20,30,45,60,90].map((value) => <option key={value} value={value}>{value} minutes</option>)}</Select></Field><Field label="Buffer before"><Select value={draft.buffer_before_min} onChange={(event) => set("buffer_before_min", Number(event.target.value))}>{[0,5,10,15,30].map((value) => <option key={value} value={value}>{value} minutes</option>)}</Select></Field><Field label="Buffer after"><Select value={draft.buffer_after_min} onChange={(event) => set("buffer_after_min", Number(event.target.value))}>{[0,5,10,15,30].map((value) => <option key={value} value={value}>{value} minutes</option>)}</Select></Field></div>
        </Panel>
        <Panel title="Weekly schedule">
          <WeeklyScheduleEditor
            value={draft.weekly_schedule}
            defaultStart={draft.start_time}
            defaultEnd={draft.end_time}
            durationMin={draft.duration_min}
            onChange={setSchedule}
          />
        </Panel>
        <Panel title="Recurring weekday breaks" actions={<Btn size="sm" onClick={() => set("blocked_intervals", [...draft.blocked_intervals, defaultRecurringBreak(draft)])}><Icon name="plus" size={13} />Add break</Btn>}>
          <div className="calendar-v2-block-list">{recurring.map((row, index) => <div key={`${row.weekday}-${index}`}><Select value={row.weekday ?? 1} onChange={(event) => replaceBlock(index, { ...row, weekday: Number(event.target.value), on_date: null }, false)}>{WEEKDAYS.map(([day,label]) => <option key={day} value={day}>{label}</option>)}</Select><Input type="time" value={row.start_time} onChange={(event) => replaceBlock(index, { ...row, start_time: event.target.value }, false)} /><span>to</span><Input type="time" value={row.end_time} onChange={(event) => replaceBlock(index, { ...row, end_time: event.target.value }, false)} /><Input value={row.label ?? ""} onChange={(event) => replaceBlock(index, { ...row, label: event.target.value || null }, false)} placeholder="Break label" /><Btn size="sm" aria-label="Remove break" onClick={() => removeBlock(index, false)}><Icon name="trash" size={13} /></Btn></div>)}</div>
        </Panel>
        <Panel title="One-date exceptions" actions={<Btn size="sm" onClick={() => set("blocked_intervals", [...draft.blocked_intervals, { weekday: null, on_date: new Date().toISOString().slice(0, 10), start_time: "09:00", end_time: "17:00", label: "Unavailable" }])}><Icon name="plus" size={13} />Add exception</Btn>}>
          <div className="calendar-v2-block-list">{exceptions.map((row, index) => <div key={`${row.on_date}-${index}`}><Input type="date" value={row.on_date ?? ""} onChange={(event) => replaceBlock(index, { ...row, weekday: null, on_date: event.target.value }, true)} /><Input type="time" value={row.start_time} onChange={(event) => replaceBlock(index, { ...row, start_time: event.target.value }, true)} /><span>to</span><Input type="time" value={row.end_time} onChange={(event) => replaceBlock(index, { ...row, end_time: event.target.value }, true)} /><Input value={row.label ?? ""} onChange={(event) => replaceBlock(index, { ...row, label: event.target.value || null }, true)} /><Btn size="sm" aria-label="Remove exception" onClick={() => removeBlock(index, true)}><Icon name="trash" size={13} /></Btn></div>)}</div>
        </Panel>
      </> : null}
      {tab === "booking" ? <>
        <div><h3>Public booking</h3><p className="sub">Control the public page and the information collected before the meeting.</p></div>
        <Panel title="Booking page">
          <label className="calendar-v2-toggle"><span><strong>Public booking enabled</strong><small>Clients can select only validated available times.</small></span><input type="checkbox" checked={draft.enabled} onChange={(event) => set("enabled", event.target.checked)} /></label>
          <div className="calendar-v2-form-grid"><Field label="Public URL slug"><Input value={draft.slug ?? ""} onChange={(event) => set("slug", event.target.value || null)} /></Field><Field label="Page title"><Input value={draft.title ?? ""} onChange={(event) => set("title", event.target.value || null)} /></Field></div>
          <Field label="Introduction"><Textarea rows={4} value={draft.intro ?? ""} onChange={(event) => set("intro", event.target.value || null)} /></Field>
          <label className="calendar-v2-toggle"><span><strong>Create Google Meet</strong><small>Add the meeting link to confirmations and the appointment workspace.</small></span><input type="checkbox" checked={draft.google_meet_enabled} onChange={(event) => set("google_meet_enabled", event.target.checked)} /></label>
        </Panel>
        <Panel title="Requested booking fields">
          {/* The mobile number is not one of the optional questions any more: the
              server refuses a booking without one and the room PIN is texted to
              it. The stored `booking_questions.phone` value is left alone and
              still saved, it simply cannot take the field off the page. */}
          <div className="calendar-v2-check-grid">{Object.entries({ business_name: "Business name", phone: "Mobile number", requested_amount: "Requested amount", bank_statement: "Bank statement prompt" }).map(([key,label]) => key === "phone" ? <label key={key} className="calendar-v2-check"><input type="checkbox" checked disabled />{label} (always asked)</label> : <label key={key} className="calendar-v2-check"><input type="checkbox" checked={Boolean(draft.booking_questions[key])} onChange={(event) => set("booking_questions", { ...draft.booking_questions, [key]: event.target.checked })} />{label}</label>)}</div>
        </Panel>
        {currentUser.data?.role === "super_admin" ? (
          <Panel title="Field Desk booking window">
            <AdvanceBookingWindowControls
              enabled={draft.advance_booking_window_enabled}
              minimumDays={draft.minimum_notice_days}
              maximumDays={draft.maximum_advance_days}
              onChange={(patch) => setDraft((current) => current ? { ...current, ...patch } : current)}
            />
          </Panel>
        ) : null}
      </> : null}
      {tab === "reminders" ? <>
        <div><h3>Confirmations and reminders</h3><p className="sub">Client delivery state is visible inside each appointment workspace.</p></div>
        <Panel title="Client delivery">
          <ToggleRow label="Email confirmation" detail="Send immediately after booking." checked={draft.confirmation_email_enabled} onChange={(value) => set("confirmation_email_enabled", value)} />
          <ToggleRow label="SMS confirmation" detail="Requires transaction SMS consent." checked={draft.confirmation_sms_enabled} onChange={(value) => set("confirmation_sms_enabled", value)} />
          <ToggleRow label="Email reminders" detail="Use the configured reminder schedule." checked={draft.reminder_email_enabled} onChange={(value) => set("reminder_email_enabled", value)} />
          <ToggleRow label="SMS reminders" detail="Consent-gated reminder delivery." checked={draft.reminder_sms_enabled} onChange={(value) => set("reminder_sms_enabled", value)} />
          <ToggleRow label="No-show follow-up" detail="Allow no-show outcomes to send the rebooking link." checked={draft.no_show_follow_up_enabled} onChange={(value) => set("no_show_follow_up_enabled", value)} />
        </Panel>
        <Panel title="Operator reminders">
          <ToggleRow label="Morning digest" detail="Include upcoming appointments and missing outcomes." checked={draft.morning_digest_enabled} onChange={(value) => set("morning_digest_enabled", value)} />
          <Field label="Missing outcome reminder"><Select value={draft.missing_outcome_reminder_hours} onChange={(event) => set("missing_outcome_reminder_hours", Number(event.target.value))}>{[4,12,24,48,72].map((value) => <option key={value} value={value}>{value} hours after meeting</option>)}</Select></Field>
        </Panel>
      </> : null}
      <div className="calendar-v2-settings-save"><Btn variant="pri" onClick={save} disabled={update.isPending || invalidWindow}><Icon name="check" size={14} />{update.isPending ? "Saving..." : "Save calendar settings"}</Btn>{update.isSuccess ? <CellChip tone="ok">Saved</CellChip> : null}</div>
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
    </div>
  );
}

function defaultRecurringBreak(settings: UserBookingSettings): BookingBlockedInterval {
  const schedule = settings.weekly_schedule ?? [];
  const day = schedule.find((item) => item.intervals.length)?.weekday ?? 1;
  const range = schedule.find((item) => item.weekday === day)?.intervals[0];
  const rangeStart = range ? clockMinutes(range.start_time) : null;
  const rangeEnd = range ? clockMinutes(range.end_time) : null;
  const preferredStart = 14 * 60;
  const preferredEnd = 16 * 60;
  const start = rangeStart !== null && rangeEnd !== null && preferredStart >= rangeStart && preferredEnd <= rangeEnd
    ? preferredStart
    : rangeStart ?? preferredStart;
  const end = rangeEnd !== null ? Math.min(rangeEnd, start + 60) : preferredEnd;
  return {
    weekday: day,
    on_date: null,
    start_time: clockValue(start),
    end_time: clockValue(Math.max(start + 1, end)),
    label: "Break",
  };
}

function clockMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
}

function clockValue(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function ToggleRow({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="calendar-v2-toggle"><span><strong>{label}</strong><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function CrmStatusOptions() {
  return <>{["scheduled","confirmed","completed","follow_up","no_show","not_qualified","converted","cancelled"].map((status) => <option key={status} value={status}>{appointmentCrmLabel(status as Parameters<typeof appointmentCrmLabel>[0])}</option>)}</>;
}

function ColorOptions() {
  return <>{["blue","green","amber","red","violet","gray"].map((color) => <option key={color} value={color}>{color[0].toUpperCase() + color.slice(1)}</option>)}</>;
}
