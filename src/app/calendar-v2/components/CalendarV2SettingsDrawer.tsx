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
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import { appointmentCrmLabel, type AppointmentOutcomeDefinition, type AppointmentOutcomeEffect } from "@/lib/repAppointments";
import type { BookingBlockedInterval, TeamBookingSettings, UserBookingSettings } from "@/lib/types";

type SettingsTab = "outcomes" | "availability" | "booking_pages" | "precall" | "messages" | "delivery";

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; icon: "flag" | "cal" | "link" | "check" | "bell" | "shield" }> = [
  { id: "outcomes", label: "Outcomes", icon: "flag" },
  { id: "availability", label: "Availability", icon: "cal" },
  { id: "booking_pages", label: "Booking pages", icon: "link" },
  { id: "precall", label: "Pre-call automation", icon: "check" },
  { id: "messages", label: "Messages", icon: "bell" },
  { id: "delivery", label: "Delivery health", icon: "shield" },
];

const PRECALL_VARIANTS = [
  ["dealer", "Dealer financing"],
  ["real_estate", "Real estate"],
  ["main_street", "Main Street business"],
  ["mca_refinance", "MCA refinance"],
] as const;

const POLICY_FIELDS = new Set<keyof UserBookingSettings>([
  "duration_min", "buffer_before_min", "buffer_after_min", "confirmation_email_enabled",
  "confirmation_sms_enabled", "reminder_email_enabled", "reminder_email_minutes",
  "reminder_email_minutes_before", "reminder_email_messages", "reminder_sms_enabled",
  "reminder_sms_minutes", "reminder_sms_minutes_before", "reminder_sms_messages",
  "confirmation_messages", "precall_enabled",
  "precall_messages", "precall_default_variant", "precall_allowed_variants",
  "precall_allow_vertical_choice", "google_meet_enabled", "timezone", "available_days",
  "weekly_schedule", "advance_booking_window_enabled", "minimum_notice_days", "maximum_advance_days",
  "blocked_intervals", "booking_questions", "no_show_follow_up_enabled", "morning_digest_enabled",
  "missing_outcome_reminder_hours", "start_time", "end_time",
]);

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
  const currentUser = useCurrentUser();
  const apiCall = useAuthedApi();
  const queryClient = useQueryClient();
  const isSuperAdmin = currentUser.data?.role === "super_admin";
  const team = useQuery({
    queryKey: ["calendar-v2-team-booking-settings"],
    queryFn: () => apiCall<TeamBookingSettings[]>("/me/booking-settings/team"),
    enabled: open && isSuperAdmin,
  });
  const [selectedUserId, setSelectedUserId] = useState("");
  const [tab, setTab] = useState<SettingsTab>(canManageOutcomeCatalog ? "outcomes" : "availability");
  const tabs = SETTINGS_TABS.filter((item) => item.id === "outcomes" ? canManageOutcomeCatalog : isSuperAdmin);
  const selected = team.data?.find((row) => row.user_id === selectedUserId) ?? team.data?.find((row) => row.is_firm_default) ?? team.data?.[0] ?? null;
  useEffect(() => {
    if (!selectedUserId && team.data?.length) {
      setSelectedUserId(team.data.find((row) => row.is_firm_default)?.user_id ?? team.data[0].user_id);
    }
  }, [selectedUserId, team.data]);
  useEffect(() => {
    const allowed = tab === "outcomes" ? canManageOutcomeCatalog : isSuperAdmin;
    if (!allowed) setTab(canManageOutcomeCatalog ? "outcomes" : "availability");
  }, [canManageOutcomeCatalog, isSuperAdmin, tab]);
  return (
    <Drawer open={open} onClose={onClose} title="Calendar settings" sub="Firm and rep booking policy, preparation automation, messages, and delivery readiness." width="xl" bodyClass="calendar-v2-settings-body">
      <div className="calendar-v2-settings">
        <nav className="calendar-v2-settings-nav" aria-label="Calendar settings">
          {tabs.map((item) => <button key={item.id} type="button" className={tab === item.id ? "on" : ""} onClick={() => setTab(item.id)}><Icon name={item.icon} size={16} />{item.label}</button>)}
        </nav>
        <div className="calendar-v2-settings-main">
          {tab === "outcomes" && canManageOutcomeCatalog ? <OutcomesSettings /> : null}
          {tab !== "outcomes" && isSuperAdmin ? (
            <>
              <BookingPolicySelector rows={team.data ?? []} selectedId={selected?.user_id ?? ""} onChange={setSelectedUserId} loading={team.isLoading} />
              {selected ? <BookingSettingsForm key={`${selected.user_id}-${selected.settings.updated_at ?? "new"}`} tab={tab} target={selected} onSaved={() => queryClient.invalidateQueries({ queryKey: ["calendar-v2-team-booking-settings"] })} /> : <div className="calendar-v2-loading">Loading firm and rep booking policies...</div>}
            </>
          ) : null}
          {tab !== "outcomes" && !isSuperAdmin ? <StatusLine tone="warn">Only a super admin can change firm or rep booking automation.</StatusLine> : null}
        </div>
      </div>
    </Drawer>
  );
}

function BookingPolicySelector({ rows, selectedId, onChange, loading }: { rows: TeamBookingSettings[]; selectedId: string; onChange: (value: string) => void; loading: boolean }) {
  return <div className="calendar-v2-policy-selector"><div><span className="lbl">Booking page owner</span><strong>{rows.find((row) => row.user_id === selectedId)?.is_firm_default ? "Firm default policy" : "Rep-specific policy"}</strong></div><Select aria-label="Booking page owner" value={selectedId} onChange={(event) => onChange(event.target.value)} disabled={loading}>{rows.map((row) => <option key={row.user_id} value={row.user_id}>{row.is_firm_default ? `Firm · ${row.name}` : `${row.name} · ${row.role.replaceAll("_", " ")}`}</option>)}</Select></div>;
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

function BookingSettingsForm({ tab, target, onSaved }: { tab: Exclude<SettingsTab, "outcomes">; target: TeamBookingSettings; onSaved: () => Promise<unknown> | unknown }) {
  const apiCall = useAuthedApi();
  const [draft, setDraft] = useState<UserBookingSettings>(target.settings);
  const [error, setError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: () => apiCall<TeamBookingSettings>(`/me/booking-settings/team/${target.user_id}`, { method: "PUT", body: JSON.stringify(draft) }),
    onSuccess: async (saved) => { setDraft(saved.settings); setError(null); await onSaved(); },
    onError: (nextError) => setError(apiErrorMessage(nextError, "Calendar settings could not be saved.")),
  });
  const inherited = draft.inherit_firm_policy && !target.is_firm_default;
  const value = <K extends keyof UserBookingSettings>(key: K): UserBookingSettings[K] => (
    inherited && !draft.firm_policy_overrides.includes(String(key)) ? target.effective_settings[key] : draft[key]
  );
  const set = <K extends keyof UserBookingSettings>(key: K, next: UserBookingSettings[K]) => setDraft((current) => ({
    ...current,
    [key]: next,
    firm_policy_overrides: inherited && POLICY_FIELDS.has(key)
      ? Array.from(new Set([...current.firm_policy_overrides, String(key)]))
      : current.firm_policy_overrides,
  }));
  const schedule = value("weekly_schedule");
  const blocked = value("blocked_intervals");
  const recurring = blocked.filter((row) => row.weekday != null);
  const exceptions = blocked.filter((row) => row.on_date);
  const setSchedule = (nextSchedule: UserBookingSettings["weekly_schedule"]) => {
    const bounds = scheduleBounds(nextSchedule, value("start_time"), value("end_time"));
    set("weekly_schedule", nextSchedule);
    set("available_days", activeScheduleDays(nextSchedule));
    set("start_time", bounds.start_time);
    set("end_time", bounds.end_time);
  };
  const replaceBlock = (index: number, next: BookingBlockedInterval, dated: boolean) => {
    const rows = dated ? exceptions : recurring;
    const updated = rows.map((row, rowIndex) => rowIndex === index ? next : row);
    set("blocked_intervals", dated ? [...recurring, ...updated] : [...updated, ...exceptions]);
  };
  const removeBlock = (index: number, dated: boolean) => {
    const rows = dated ? exceptions : recurring;
    const updated = rows.filter((_, rowIndex) => rowIndex !== index);
    set("blocked_intervals", dated ? [...recurring, ...updated] : [...updated, ...exceptions]);
  };
  const invalidWindow = value("advance_booking_window_enabled") && value("maximum_advance_days") < value("minimum_notice_days");
  const updatePrecallStep = (step: "nudge_1" | "nudge_2", patch: Record<string, unknown>) => set("precall_messages", {
    ...value("precall_messages"),
    [step]: { ...(value("precall_messages")[step] ?? {}), ...patch },
  });
  return <div className="calendar-v2-settings-stack">
    <Panel title="Policy source" actions={target.is_firm_default ? <CellChip tone="acc">Firm default</CellChip> : <CellChip tone={inherited ? "ok" : "warn"}>{inherited ? "Inheriting firm" : "Independent"}</CellChip>}>
      {target.is_firm_default ? <p className="sub">Changes here become the firm policy available to every rep calendar.</p> : <>
        <ToggleRow label="Inherit firm booking policy" detail="Firm availability, preparation, messages, and reminders apply unless a field is customized here." checked={draft.inherit_firm_policy} onChange={(next) => setDraft((current) => ({ ...current, inherit_firm_policy: next, firm_policy_overrides: next ? current.firm_policy_overrides : [] }))} />
        {inherited ? <div className="calendar-v2-policy-overrides"><span>{draft.firm_policy_overrides.length ? `${draft.firm_policy_overrides.length} customized setting${draft.firm_policy_overrides.length === 1 ? "" : "s"}` : "No rep overrides"}</span>{draft.firm_policy_overrides.length ? <Btn size="sm" onClick={() => setDraft((current) => ({ ...current, firm_policy_overrides: [] }))}>Use all firm defaults</Btn> : null}</div> : null}
      </>}
    </Panel>

    {tab === "availability" ? <>
      <div><h3>Availability</h3><p className="sub">Per-day schedules, recurring breaks, date exceptions, buffers, and booking-window rules share the same conflict engine.</p></div>
      <Panel title="Meeting defaults"><div className="calendar-v2-form-grid"><Field label="Timezone"><Input value={value("timezone")} onChange={(event) => set("timezone", event.target.value)} /></Field><Field label="Default duration"><Select value={value("duration_min")} onChange={(event) => set("duration_min", Number(event.target.value))}>{[15,20,30,45,60,90].map((row) => <option key={row} value={row}>{row} minutes</option>)}</Select></Field><Field label="Buffer before"><Select value={value("buffer_before_min")} onChange={(event) => set("buffer_before_min", Number(event.target.value))}>{[0,5,10,15,30].map((row) => <option key={row} value={row}>{row} minutes</option>)}</Select></Field><Field label="Buffer after"><Select value={value("buffer_after_min")} onChange={(event) => set("buffer_after_min", Number(event.target.value))}>{[0,5,10,15,30].map((row) => <option key={row} value={row}>{row} minutes</option>)}</Select></Field></div></Panel>
      <Panel title="Weekly schedule"><WeeklyScheduleEditor value={schedule} defaultStart={value("start_time")} defaultEnd={value("end_time")} durationMin={value("duration_min")} onChange={setSchedule} /></Panel>
      <Panel title="Recurring weekday breaks" actions={<Btn size="sm" onClick={() => set("blocked_intervals", [...blocked, defaultRecurringBreak({ ...draft, weekly_schedule: schedule, start_time: value("start_time"), end_time: value("end_time") })])}><Icon name="plus" size={13} />Add break</Btn>}><div className="calendar-v2-block-list">{recurring.map((row, index) => <div key={`${row.weekday}-${index}`}><Select value={row.weekday ?? 1} onChange={(event) => replaceBlock(index, { ...row, weekday: Number(event.target.value), on_date: null }, false)}>{WEEKDAYS.map(([day,label]) => <option key={day} value={day}>{label}</option>)}</Select><Input type="time" value={row.start_time} onChange={(event) => replaceBlock(index, { ...row, start_time: event.target.value }, false)} /><span>to</span><Input type="time" value={row.end_time} onChange={(event) => replaceBlock(index, { ...row, end_time: event.target.value }, false)} /><Input value={row.label ?? ""} onChange={(event) => replaceBlock(index, { ...row, label: event.target.value || null }, false)} placeholder="Break label" /><Btn size="sm" aria-label="Remove break" onClick={() => removeBlock(index, false)}><Icon name="trash" size={13} /></Btn></div>)}</div></Panel>
      <Panel title="One-date exceptions" actions={<Btn size="sm" onClick={() => set("blocked_intervals", [...blocked, { weekday: null, on_date: new Date().toISOString().slice(0, 10), start_time: "09:00", end_time: "17:00", label: "Unavailable" }])}><Icon name="plus" size={13} />Add exception</Btn>}><div className="calendar-v2-block-list">{exceptions.map((row, index) => <div key={`${row.on_date}-${index}`}><Input type="date" value={row.on_date ?? ""} onChange={(event) => replaceBlock(index, { ...row, weekday: null, on_date: event.target.value }, true)} /><Input type="time" value={row.start_time} onChange={(event) => replaceBlock(index, { ...row, start_time: event.target.value }, true)} /><span>to</span><Input type="time" value={row.end_time} onChange={(event) => replaceBlock(index, { ...row, end_time: event.target.value }, true)} /><Input value={row.label ?? ""} onChange={(event) => replaceBlock(index, { ...row, label: event.target.value || null }, true)} /><Btn size="sm" aria-label="Remove exception" onClick={() => removeBlock(index, true)}><Icon name="trash" size={13} /></Btn></div>)}</div></Panel>
    </> : null}

    {tab === "booking_pages" ? <>
      <div><h3>Booking pages</h3><p className="sub">Choose the public page, requested fields, meeting behavior, and how far ahead clients may book.</p></div>
      <Panel title="Public page"><ToggleRow label="Public booking enabled" detail="Clients can select only server-validated available times." checked={draft.enabled} onChange={(next) => set("enabled", next)} /><div className="calendar-v2-form-grid"><Field label="Public URL slug"><Input value={draft.slug ?? ""} onChange={(event) => set("slug", event.target.value || null)} /></Field><Field label="Page title"><Input value={draft.title ?? ""} onChange={(event) => set("title", event.target.value || null)} /></Field></div><Field label="Introduction"><Textarea rows={4} value={draft.intro ?? ""} onChange={(event) => set("intro", event.target.value || null)} /></Field><ToggleRow label="Create Google Meet" detail="Add the meeting link to confirmations and the appointment workspace." checked={value("google_meet_enabled")} onChange={(next) => set("google_meet_enabled", next)} /></Panel>
      <Panel title="Requested booking fields"><div className="calendar-v2-check-grid"><label className="calendar-v2-check"><input type="checkbox" checked disabled />Mobile number (always asked)</label>{Object.entries({ business_name: "Business name", requested_amount: "Requested amount", bank_statement: "Preferred bank evidence method" }).map(([key,label]) => <label key={key} className="calendar-v2-check"><input type="checkbox" checked={Boolean(value("booking_questions")[key])} onChange={(event) => set("booking_questions", { ...value("booking_questions"), [key]: event.target.checked })} />{label}</label>)}</div></Panel>
      <Panel title="Booking window"><AdvanceBookingWindowControls enabled={value("advance_booking_window_enabled")} minimumDays={value("minimum_notice_days")} maximumDays={value("maximum_advance_days")} onChange={(patch) => { if (patch.advance_booking_window_enabled !== undefined) set("advance_booking_window_enabled", patch.advance_booking_window_enabled); if (patch.minimum_notice_days !== undefined) set("minimum_notice_days", patch.minimum_notice_days); if (patch.maximum_advance_days !== undefined) set("maximum_advance_days", patch.maximum_advance_days); }} /></Panel>
      {draft.enabled && draft.slug ? <div className="calendar-v2-public-link"><span>Public URL</span><a href={`/book/${draft.slug}`} target="_blank" rel="noreferrer">{`/book/${draft.slug}`}</a></div> : null}
    </> : null}

    {tab === "precall" ? <>
      <div><h3>Pre-call automation</h3><p className="sub">Control when direct booking pages open an AI Intake draft and which preparation sequence is available.</p></div>
      <Panel title="Draft and secure room"><ToggleRow label="Preparation enabled" detail="Field Desk opens its draft; direct pages open an AI Intake draft; calendar appointments remain explicit." checked={value("precall_enabled")} onChange={(next) => set("precall_enabled", next)} /><div className="calendar-v2-form-grid"><Field label="Default application type"><Select value={value("precall_default_variant")} onChange={(event) => { const next = event.target.value as UserBookingSettings["precall_default_variant"]; set("precall_default_variant", next); if (!value("precall_allowed_variants").includes(next)) set("precall_allowed_variants", [...value("precall_allowed_variants"), next]); }}><VariantOptions /></Select></Field><label className="calendar-v2-toggle"><span><strong>Let client choose</strong><small>Show only the application types enabled below.</small></span><input type="checkbox" checked={value("precall_allow_vertical_choice")} onChange={(event) => set("precall_allow_vertical_choice", event.target.checked)} /></label></div><div className="calendar-v2-check-grid mt">{PRECALL_VARIANTS.map(([variant,label]) => <label key={variant} className="calendar-v2-check"><input type="checkbox" checked={value("precall_allowed_variants").includes(variant)} disabled={value("precall_default_variant") === variant} onChange={(event) => set("precall_allowed_variants", event.target.checked ? [...value("precall_allowed_variants"), variant] : value("precall_allowed_variants").filter((row) => row !== variant))} />{label}</label>)}</div></Panel>
      <Panel title="Readiness-aware sequence" sub="Nudges stop when ownership, banking evidence, and all required owner consents are complete."><div className="calendar-v2-sequence-grid"><SequenceStep title="First nudge" timingLabel="Hours after booking" timing={Number(value("precall_messages").nudge_1?.after_hours ?? 2)} channel={value("precall_messages").nudge_1?.channel ?? "email"} onTiming={(next) => updatePrecallStep("nudge_1", { after_hours: next })} onChannel={(next) => updatePrecallStep("nudge_1", { channel: next })} /><SequenceStep title="Meeting reminder" timingLabel="Hours before meeting" timing={Number(value("precall_messages").nudge_2?.before_hours ?? 24)} channel={value("precall_messages").nudge_2?.channel ?? "both"} onTiming={(next) => updatePrecallStep("nudge_2", { before_hours: next })} onChannel={(next) => updatePrecallStep("nudge_2", { channel: next })} /></div></Panel>
      <StatusLine tone="warn">SMS steps are always consent-gated. Owner credit is never run until that specific qualifying owner authorizes it.</StatusLine>
    </> : null}

    {tab === "messages" ? <>
      <div><h3>Messages</h3><p className="sub">Configure confirmations, appointment reminders, preparation nudges, and operator follow-up.</p></div>
      <Panel title="Delivery channels"><ToggleRow label="Email confirmation" detail="Send immediately after booking." checked={value("confirmation_email_enabled")} onChange={(next) => set("confirmation_email_enabled", next)} /><ToggleRow label="SMS confirmation" detail="Requires the client's transactional SMS consent." checked={value("confirmation_sms_enabled")} onChange={(next) => set("confirmation_sms_enabled", next)} /><ToggleRow label="Email reminders" detail="Send at each configured lead time." checked={value("reminder_email_enabled")} onChange={(next) => set("reminder_email_enabled", next)} /><ReminderMinutes label="Email schedule" values={value("reminder_email_minutes")} onChange={(next) => set("reminder_email_minutes", next)} /><ToggleRow label="SMS reminders" detail="Each reminder remains consent-gated." checked={value("reminder_sms_enabled")} onChange={(next) => set("reminder_sms_enabled", next)} /><ReminderMinutes label="SMS schedule" values={value("reminder_sms_minutes")} onChange={(next) => set("reminder_sms_minutes", next)} /></Panel>
      <Panel title="Confirmation copy"><div className="calendar-v2-form-grid"><Field label="Email subject"><Input value={value("confirmation_messages").email_subject ?? ""} onChange={(event) => set("confirmation_messages", { ...value("confirmation_messages"), email_subject: event.target.value })} placeholder="Blank uses the standard subject" /></Field><Field label="SMS"><Textarea rows={3} value={value("confirmation_messages").sms ?? ""} onChange={(event) => set("confirmation_messages", { ...value("confirmation_messages"), sms: event.target.value })} placeholder="Blank uses the standard confirmation" /></Field></div><Field label="Email body"><Textarea rows={5} value={value("confirmation_messages").email_body ?? ""} onChange={(event) => set("confirmation_messages", { ...value("confirmation_messages"), email_body: event.target.value })} placeholder="Supports {name}, {time}, {rep}, {join_link}, {room_link}, and {precall}" /></Field></Panel>
      <Panel title="Preparation copy"><Field label="Confirmation preparation block"><Textarea rows={4} value={value("precall_messages").precall_block ?? ""} onChange={(event) => set("precall_messages", { ...value("precall_messages"), precall_block: event.target.value })} placeholder="Before your call: ownership, business banking, and private owner credit authorization." /></Field><Field label="Dynamic reminder line"><Input value={value("precall_messages").reminder_precall_line ?? ""} onChange={(event) => set("precall_messages", { ...value("precall_messages"), reminder_precall_line: event.target.value })} placeholder="Still needed: {missing} · {room_link}" /></Field><NudgeCopy step="nudge_1" value={value("precall_messages").nudge_1 ?? {}} onChange={(patch) => updatePrecallStep("nudge_1", patch)} /><NudgeCopy step="nudge_2" value={value("precall_messages").nudge_2 ?? {}} onChange={(patch) => updatePrecallStep("nudge_2", patch)} /></Panel>
      <Panel title="Follow-up"><ToggleRow label="No-show rebooking" detail="Allow a reviewed no-show outcome to send the public booking link." checked={value("no_show_follow_up_enabled")} onChange={(next) => set("no_show_follow_up_enabled", next)} /><ToggleRow label="Morning digest" detail="Include upcoming appointments and missing outcomes." checked={value("morning_digest_enabled")} onChange={(next) => set("morning_digest_enabled", next)} /><Field label="Missing outcome reminder"><Select value={value("missing_outcome_reminder_hours")} onChange={(event) => set("missing_outcome_reminder_hours", Number(event.target.value))}>{[4,12,24,48,72].map((row) => <option key={row} value={row}>{row} hours after meeting</option>)}</Select></Field></Panel>
    </> : null}

    {tab === "delivery" ? <DeliveryHealth /> : null}
    {tab !== "delivery" ? <div className="calendar-v2-settings-save"><Btn variant="pri" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || invalidWindow}><Icon name="check" size={14} />{saveMutation.isPending ? "Saving..." : `Save ${target.is_firm_default ? "firm policy" : `${target.name}'s settings`}`}</Btn>{saveMutation.isSuccess ? <CellChip tone="ok">Saved</CellChip> : null}</div> : null}
    {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
  </div>;
}

function VariantOptions() {
  return <>{PRECALL_VARIANTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</>;
}

function SequenceStep({ title, timingLabel, timing, channel, onTiming, onChannel }: {
  title: string;
  timingLabel: string;
  timing: number;
  channel: "email" | "sms" | "both";
  onTiming: (value: number) => void;
  onChannel: (value: "email" | "sms" | "both") => void;
}) {
  return <div><strong>{title}</strong><div className="calendar-v2-form-grid"><Field label={timingLabel}><Input type="number" min={1} max={240} value={timing} onChange={(event) => onTiming(Math.max(1, Number(event.target.value)))} /></Field><Field label="Channel"><Select value={channel} onChange={(event) => onChannel(event.target.value as typeof channel)}><option value="email">Email</option><option value="sms">SMS</option><option value="both">Email and SMS</option></Select></Field></div></div>;
}

const REMINDER_TIMES = [10080, 4320, 2880, 1440, 720, 240, 120, 60, 30, 15];

function reminderTimeLabel(value: number): string {
  if (value % 1440 === 0) return `${value / 1440} day${value === 1440 ? "" : "s"} before`;
  if (value % 60 === 0) return `${value / 60} hour${value === 60 ? "" : "s"} before`;
  return `${value} minutes before`;
}

function ReminderMinutes({ label, values, onChange }: { label: string; values: number[]; onChange: (values: number[]) => void }) {
  const unused = REMINDER_TIMES.find((value) => !values.includes(value));
  return <div className="calendar-v2-reminder-times"><span className="lbl">{label}</span>{values.map((value, index) => <div key={`${value}-${index}`}><Select value={value} onChange={(event) => onChange(values.map((row, rowIndex) => rowIndex === index ? Number(event.target.value) : row))}>{REMINDER_TIMES.map((row) => <option key={row} value={row}>{reminderTimeLabel(row)}</option>)}</Select><Btn size="sm" aria-label={`Remove ${reminderTimeLabel(value)}`} disabled={values.length === 1} onClick={() => onChange(values.filter((_, rowIndex) => rowIndex !== index))}><Icon name="trash" size={13} /></Btn></div>)}{unused ? <Btn size="sm" onClick={() => onChange([...values, unused].sort((a, b) => b - a))}><Icon name="plus" size={13} />Add time</Btn> : null}</div>;
}

function NudgeCopy({ step, value, onChange }: {
  step: "nudge_1" | "nudge_2";
  value: NonNullable<UserBookingSettings["precall_messages"]["nudge_1"]>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  return <div className="calendar-v2-nudge-copy"><strong>{step === "nudge_1" ? "First preparation nudge" : "Meeting-relative preparation reminder"}</strong><div className="calendar-v2-form-grid"><Field label="Email subject"><Input value={value.email_subject ?? ""} onChange={(event) => onChange({ email_subject: event.target.value })} placeholder="Blank uses the standard subject" /></Field><Field label="SMS"><Textarea rows={3} value={value.sms ?? ""} onChange={(event) => onChange({ sms: event.target.value })} placeholder="Supports {name}, {time}, {missing}, and {room_link}" /></Field></div><Field label="Email body"><Textarea rows={4} value={value.email_body ?? ""} onChange={(event) => onChange({ email_body: event.target.value })} placeholder="Blank uses the readiness-aware standard message" /></Field></div>;
}

type IntegrationProvider = { configured: boolean; environment: string; endpoint: string | null; detail: string };
type IntegrationHealth = { isoftpull: IntegrationProvider; plaid: IntegrationProvider; sms: IntegrationProvider; messaging: IntegrationProvider; address: IntegrationProvider };

function DeliveryHealth() {
  const apiCall = useAuthedApi();
  const health = useQuery({ queryKey: ["calendar-v2-delivery-health"], queryFn: () => apiCall<IntegrationHealth>("/dealer-os/integrations/status") });
  if (health.isLoading) return <div className="calendar-v2-loading">Checking backend delivery providers...</div>;
  if (health.isError || !health.data) return <StatusLine tone="bad">{apiErrorMessage(health.error, "Delivery health could not be loaded.")}</StatusLine>;
  const rows: Array<[string, IntegrationProvider]> = [
    ["Email and inbox", health.data.messaging],
    ["AWS SMS", health.data.sms],
    ["Plaid", health.data.plaid],
    ["iSoftPull", health.data.isoftpull],
    ["Address provider", health.data.address],
  ];
  return <div className="calendar-v2-settings-stack"><div><h3>Delivery health</h3><p className="sub">Credential presence and runtime provider status come from the backend; secret values are never returned.</p></div><div className="calendar-v2-delivery-health">{rows.map(([label, provider]) => <section key={label}><div><strong>{label}</strong><small>{provider.environment}</small></div><CellChip tone={provider.configured ? "ok" : "bad"}>{provider.configured ? "Ready" : "Not ready"}</CellChip><p>{provider.detail}</p>{provider.endpoint ? <code>{provider.endpoint}</code> : null}</section>)}</div><StatusLine tone={health.data.sms.configured ? "ok" : "warn"}>{health.data.sms.configured ? "Production SMS is enabled on the configured backend provider." : "SMS is not production-ready. Email automation can continue; SMS attempts remain explicitly failed or skipped."}</StatusLine><Btn onClick={() => void health.refetch()}><Icon name="refresh" size={14} />Refresh provider status</Btn></div>;
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
