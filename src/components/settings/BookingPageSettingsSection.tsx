"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { withAlpha } from "@/lib/color";
import { Icon } from "@/components/design-system/Icon";
import {
  activeScheduleDays,
  AdvanceBookingWindowControls,
  scheduleBounds,
  WeeklyScheduleEditor,
} from "@/components/calendar/BookingAvailabilityControls";
import { Btn, CG, CellChip, Input, PageHeader, Panel, Row, Select, StatusLine, Textarea, cx } from "@/components/ds";
import {
  useBookingSettings,
  useCurrentUser,
  useGoogleConnection,
  useStartGoogleOAuth,
  useUpdateBookingSettings,
  useUploadBookingAsset,
} from "@/hooks/useApi";
import type { BookingBlockedInterval, BookingDaySchedule, PrecallStepSettings, UserBookingSettings } from "@/lib/types";

const WEEKDAYS = [
  { id: 0, label: "Sun" },
  { id: 1, label: "Mon" },
  { id: 2, label: "Tue" },
  { id: 3, label: "Wed" },
  { id: 4, label: "Thu" },
  { id: 5, label: "Fri" },
  { id: 6, label: "Sat" },
];

const REMINDER_TIMES = [
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 120, label: "2 hours before" },
  { value: 240, label: "4 hours before" },
  { value: 720, label: "12 hours before" },
  { value: 1440, label: "24 hours before" },
  { value: 2880, label: "48 hours before" },
  { value: 4320, label: "3 days before" },
  { value: 10080, label: "1 week before" },
];

function defaultBookingSettings(): UserBookingSettings {
  return {
    id: "",
    user_id: "",
    enabled: false,
    slug: null,
    title: null,
    intro: null,
    primary_color: "#1b4b9e",
    background_color: "#ffffff",
    duration_min: 20,
    buffer_before_min: 5,
    buffer_after_min: 5,
    confirmation_email_enabled: true,
    confirmation_sms_enabled: true,
    reminder_email_enabled: true,
    reminder_email_minutes_before: 1440,
    reminder_email_minutes: [1440],
    reminder_sms_enabled: true,
    reminder_sms_minutes_before: 120,
    reminder_sms_minutes: [120],
    reminder_sms_messages: {},
    reminder_email_messages: {},
    confirmation_messages: {},
    precall_enabled: true,
    precall_messages: {},
    google_meet_enabled: true,
    timezone: "America/New_York",
    available_days: [1, 2, 3, 4, 5],
    weekly_schedule: [
      { weekday: 0, intervals: [] },
      { weekday: 1, intervals: [{ start_time: "09:00", end_time: "17:00" }] },
      { weekday: 2, intervals: [{ start_time: "09:00", end_time: "17:00" }] },
      { weekday: 3, intervals: [{ start_time: "09:00", end_time: "17:00" }] },
      { weekday: 4, intervals: [{ start_time: "09:00", end_time: "17:00" }] },
      { weekday: 5, intervals: [{ start_time: "09:00", end_time: "17:00" }] },
      { weekday: 6, intervals: [] },
    ],
    advance_booking_window_enabled: false,
    minimum_notice_days: 2,
    maximum_advance_days: 5,
    blocked_intervals: [],
    booking_questions: {},
    no_show_follow_up_enabled: true,
    morning_digest_enabled: false,
    missing_outcome_reminder_hours: 24,
    start_time: "09:00",
    end_time: "17:00",
    logo_s3_key: null,
    profile_photo_s3_key: null,
    logo_url: null,
    profile_photo_url: null,
    created_at: null,
    updated_at: null,
  };
}

export function BookingPageSettingsSection({ embedded = false }: { embedded?: boolean }) {
  const { data: user } = useCurrentUser();
  const settingsQ = useBookingSettings();
  const update = useUpdateBookingSettings();
  const uploadLogo = useUploadBookingAsset("logo");
  const uploadProfile = useUploadBookingAsset("profile-photo");
  const google = useGoogleConnection();
  const startGoogle = useStartGoogleOAuth();
  const [draft, setDraft] = useState<UserBookingSettings | null>(null);
  const [originalJson, setOriginalJson] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [localLogoUrl, setLocalLogoUrl] = useState<string | null>(null);
  const [localProfileUrl, setLocalProfileUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsQ.data) return;
    setDraft(settingsQ.data);
    setOriginalJson(JSON.stringify(settingsQ.data));
    setLocalLogoUrl(null);
    setLocalProfileUrl(null);
  }, [settingsQ.data]);

  useEffect(() => {
    if (!settingsQ.isError || draft) return;
    const fallback = defaultBookingSettings();
    setDraft(fallback);
    setOriginalJson(JSON.stringify(fallback));
  }, [settingsQ.isError, draft]);

  const dirty = useMemo(() => (draft ? JSON.stringify(draft) !== originalJson : false), [draft, originalJson]);
  const bookingPath = draft?.slug ? `/book/${draft.slug}` : "/booking-settings";
  const publicUrl = typeof window === "undefined" ? bookingPath : `${window.location.origin}${bookingPath}`;
  const logoUrl = localLogoUrl || draft?.logo_url || null;
  const profileUrl = localProfileUrl || draft?.profile_photo_url || null;

  const patch = (next: Partial<UserBookingSettings>) => {
    setDraft((current) => (current ? { ...current, ...next } : current));
  };

  const setSchedule = (weeklySchedule: BookingDaySchedule[]) => {
    if (!draft) return;
    patch({
      weekly_schedule: weeklySchedule,
      available_days: activeScheduleDays(weeklySchedule),
      ...scheduleBounds(weeklySchedule, draft.start_time, draft.end_time),
    });
  };

  const onSave = async () => {
    if (!draft) return;
    setFeedback(null);
    try {
      const saved = await update.mutateAsync(draft);
      setDraft(saved);
      setOriginalJson(JSON.stringify(saved));
      setFeedback("Booking page settings saved.");
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Could not save booking settings.");
    }
  };

  const onUpload = async (asset: "logo" | "profile-photo", event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !draft) return;
    setFeedback(null);
    try {
      const result = asset === "logo" ? await uploadLogo.mutateAsync(file) : await uploadProfile.mutateAsync(file);
      if (result.kind === "s3") {
        if (asset === "logo") patch({ logo_s3_key: result.s3_key, logo_url: URL.createObjectURL(file) });
        else patch({ profile_photo_s3_key: result.s3_key, profile_photo_url: URL.createObjectURL(file) });
        setFeedback("Image uploaded. Save settings to publish it.");
      } else {
        if (asset === "logo") setLocalLogoUrl(result.data_url);
        else setLocalProfileUrl(result.data_url);
        setFeedback("S3 is not configured here, so this image is preview-only until production upload is available.");
      }
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Image upload failed.");
    }
  };

  const copyUrl = async () => {
    if (!draft?.slug) return;
    await navigator.clipboard.writeText(publicUrl);
    setFeedback("Public URL copied.");
  };

  const reminderValues = (channel: "email" | "sms") => {
    if (!draft) return [];
    const values = channel === "email" ? draft.reminder_email_minutes : draft.reminder_sms_minutes;
    const fallback = channel === "email" ? draft.reminder_email_minutes_before : draft.reminder_sms_minutes_before;
    return values?.length ? values : [fallback];
  };

  const setReminderValues = (channel: "email" | "sms", values: number[]) => {
    const normalized = Array.from(new Set(values)).sort((a, b) => b - a);
    if (channel === "email") {
      patch({ reminder_email_minutes: normalized, reminder_email_minutes_before: normalized[0] ?? 1440 });
    } else {
      // Messages are keyed by minutes, so a removed reminder leaves its text
      // behind. Drop it here rather than letting it reappear if that timing is
      // added back later; the backend prunes orphans too.
      const kept = new Set(normalized.map(String));
      const messages = Object.fromEntries(
        Object.entries(draft?.reminder_sms_messages ?? {}).filter(([key]) => kept.has(key)),
      );
      patch({
        reminder_sms_minutes: normalized,
        reminder_sms_minutes_before: normalized[0] ?? 120,
        reminder_sms_messages: messages,
      });
    }
  };

  /** Retime a reminder without losing what it says. */
  const retimeSmsReminder = (index: number, value: number) => {
    const current = reminderValues("sms");
    const previous = current[index];
    const next = [...current];
    next[index] = value;
    const messages = { ...(draft?.reminder_sms_messages ?? {}) };
    const carried = messages[String(previous)];
    if (carried !== undefined) {
      delete messages[String(previous)];
      messages[String(value)] = carried;
    }
    const normalized = Array.from(new Set(next)).sort((a, b) => b - a);
    const kept = new Set(normalized.map(String));
    patch({
      reminder_sms_minutes: normalized,
      reminder_sms_minutes_before: normalized[0] ?? 120,
      reminder_sms_messages: Object.fromEntries(
        Object.entries(messages).filter(([key]) => kept.has(key)),
      ),
    });
  };

  const setEmailReminderMessage = (minutes: number, field: "subject" | "body", value: string) => {
    const messages = { ...(draft?.reminder_email_messages ?? {}) };
    const current = messages[String(minutes)] ?? { subject: "", body: "" };
    messages[String(minutes)] = { ...current, [field]: value };
    patch({ reminder_email_messages: messages });
  };
  const setConfirmationMessage = (key: string, value: string) => {
    patch({ confirmation_messages: { ...(draft?.confirmation_messages ?? {}), [key]: value } });
  };
  const setPrecallText = (key: "precall_block" | "reminder_precall_line", value: string) => {
    patch({ precall_messages: { ...(draft?.precall_messages ?? {}), [key]: value } });
  };
  const setPrecallStep = (step: "nudge_1" | "nudge_2", next: Partial<PrecallStepSettings>) => {
    const current = draft?.precall_messages ?? {};
    patch({ precall_messages: { ...current, [step]: { ...(current[step] ?? {}), ...next } } });
  };
  const setSmsReminderMessage = (minutes: number, message: string) => {
    const messages = { ...(draft?.reminder_sms_messages ?? {}) };
    if (message.trim()) messages[String(minutes)] = message;
    else delete messages[String(minutes)];
    patch({ reminder_sms_messages: messages });
  };

  const addReminder = (channel: "email" | "sms") => {
    const current = reminderValues(channel);
    const preferred = channel === "email" ? [2880, 1440, 120, 60, 30] : [1440, 120, 60, 30, 15];
    const next = preferred.find((value) => !current.includes(value))
      ?? REMINDER_TIMES.find((option) => !current.includes(option.value))?.value;
    if (next) setReminderValues(channel, [...current, next]);
  };

  const connectCalendar = async () => {
    setFeedback(null);
    try {
      const { auth_url } = await startGoogle.mutateAsync("calendar");
      window.location.href = auth_url;
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Could not start Google Calendar connection.");
    }
  };

  if (settingsQ.isLoading || !draft) {
    return <div className="sub">Loading booking settings...</div>;
  }

  const invalidWindow = draft.advance_booking_window_enabled
    && draft.maximum_advance_days < draft.minimum_notice_days;

  const actions = (
    <>
      {draft.slug ? (
        <Link href={bookingPath} target="_blank" className="btn">
          <Icon name="external" size={13} /> Preview page
        </Link>
      ) : null}
      <Btn variant="pri" onClick={onSave} disabled={!dirty || update.isPending || invalidWindow}>
        <Icon name="check" size={14} /> {update.isPending ? "Saving..." : "Save changes"}
      </Btn>
    </>
  );

  return (
    <div className="grid">
      {embedded ? (
        <div className="settings-section-head">
          <div className="grid" style={{ gap: 5 }}>
            <Row>
              <div className="lbl">Account settings</div>
              <CellChip tone={draft.enabled ? "ok" : "mut"}>{draft.enabled ? "Published" : "Not published"}</CellChip>
            </Row>
            <h2>Booking page</h2>
            <div className="sub">Manage your public scheduling page, meeting availability, and client-facing identity.</div>
          </div>
          <Row>{actions}</Row>
        </div>
      ) : (
        <div>
          <div className="lbl">Account settings</div>
          <PageHeader
            title="Booking page"
            lede={`Manage public scheduling for ${user?.name || "your account"}.`}
            actions={actions}
          />
        </div>
      )}

      {feedback ? (
        <FeedbackLine ok={/saved|copied|uploaded/i.test(feedback)}>{feedback}</FeedbackLine>
      ) : null}
      {settingsQ.isError ? (
        <StatusLine tone="warn">Booking settings are temporarily unavailable. The form is in preview mode and unsaved changes will require the service to recover.</StatusLine>
      ) : null}

      <div className="booking-settings-workspace">
        <div className="grid">
          <Panel title="Publishing">
            <div className="grid">
              <ToggleRow
                label="Enable public booking page"
                description="When enabled, visitors can book open times directly onto your calendar."
                checked={draft.enabled}
                onChange={(enabled) => patch({ enabled, slug: draft.slug || normalizeSlug(user?.name || user?.email || "booking") })}
              />
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 150px", gap: 10 }}>
                <Field label="Public URL slug">
                  <Input value={draft.slug ?? ""} onChange={(e) => patch({ slug: normalizeSlug(e.target.value) || null })} />
                </Field>
                <Field label="Meeting length">
                  <Select value={draft.duration_min} onChange={(e) => patch({ duration_min: Number(e.target.value) })}>
                    {[15, 20, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
                  </Select>
                </Field>
              </div>
              <Row>
                <Input grow readOnly value={publicUrl} onFocus={(e) => e.currentTarget.select()} />
                <Btn onClick={copyUrl} disabled={!draft.slug}>
                  <Icon name="link" size={13} /> Copy
                </Btn>
              </Row>
            </div>
          </Panel>

          <Panel title="Brand identity">
            {/* 1fr 1fr, so a genuine 6 + 6 of the cockpit grid. */}
            <CG>
              <UploadCard
                className="s6"
                title="Logo"
                description="Use your firm or personal logo for the top of the page."
                imageUrl={logoUrl}
                inputId="booking-logo-upload"
                onChange={(e) => void onUpload("logo", e)}
              />
              <UploadCard
                className="s6"
                title="Profile photo"
                description="Add a professional agent, officer, or account photo."
                imageUrl={profileUrl}
                inputId="booking-profile-upload"
                onChange={(e) => void onUpload("profile-photo", e)}
                circle
              />
            </CG>
          </Panel>

          <Panel title="Page content">
            <div className="grid">
              <Field label="Page title">
                <Input value={draft.title ?? ""} onChange={(e) => patch({ title: e.target.value || null })} placeholder={`Book a meeting with ${user?.name || "me"}`} />
              </Field>
              <Field label="Intro text">
                {/* `resize` is not on `.field`, and restricting it to vertical is
                    the affordance the original shipped. */}
                <Textarea value={draft.intro ?? ""} onChange={(e) => patch({ intro: e.target.value || null })} rows={3} style={{ resize: "vertical" }} />
              </Field>
              <CG>
                <Field label="Accent color" className="s6">
                  {/* `.field` owns the frame; only the swatch height is inline. */}
                  <input type="color" className="field" value={draft.primary_color} onChange={(e) => patch({ primary_color: e.target.value })} style={{ height: 42 }} />
                </Field>
              </CG>
            </div>
          </Panel>

          <Panel title="Availability">
            <div className="grid">
              <Field label="Timezone"><Input value={draft.timezone} onChange={(e) => patch({ timezone: e.target.value || "America/New_York" })} /></Field>
              <WeeklyScheduleEditor
                value={draft.weekly_schedule}
                defaultStart={draft.start_time}
                defaultEnd={draft.end_time}
                durationMin={draft.duration_min}
                onChange={setSchedule}
              />
              <BlockedTimeEditor
                intervals={(draft.blocked_intervals ?? []).filter((interval) => interval.weekday != null)}
                weeklySchedule={draft.weekly_schedule}
                onChange={(blocked_intervals) => patch({
                  blocked_intervals: [
                    ...blocked_intervals,
                    ...(draft.blocked_intervals ?? []).filter((interval) => interval.on_date),
                  ],
                })}
                onError={setFeedback}
              />
            </div>
          </Panel>

          {user?.role === "super_admin" ? (
            <Panel title="Team calendar controls">
              <div className="grid">
                <StatusLine tone="ok">
                  Field Desk bookings use this primary super-admin calendar. Agent identity,
                  program, requested amount and property/business address are written into each
                  calendar event.
                </StatusLine>
                <AdvanceBookingWindowControls
                  enabled={draft.advance_booking_window_enabled}
                  minimumDays={draft.minimum_notice_days}
                  maximumDays={draft.maximum_advance_days}
                  onChange={patch}
                />
                <CG>
                  <Field label="Buffer before" className="s6">
                    <Select value={draft.buffer_before_min} onChange={(e) => patch({ buffer_before_min: Number(e.target.value) })}>
                      {[0, 5, 10, 15, 20, 30].map((m) => <option key={m} value={m}>{m} min</option>)}
                    </Select>
                  </Field>
                  <Field label="Buffer after" className="s6">
                    <Select value={draft.buffer_after_min} onChange={(e) => patch({ buffer_after_min: Number(e.target.value) })}>
                      {[0, 5, 10, 15, 20, 30].map((m) => <option key={m} value={m}>{m} min</option>)}
                    </Select>
                  </Field>
                </CG>
                <ToggleRow
                  label="Create Google Meet"
                  description="Create meetings on the connected primary Google Calendar and include the Meet link in confirmations."
                  checked={draft.google_meet_enabled}
                  onChange={(google_meet_enabled) => patch({ google_meet_enabled })}
                />
                <div className="filerow">
                  <div className="sp">
                    <b>Primary Google account</b>
                    <div className="sub">
                      {google.data?.calendar_connected
                        ? `Connected to ${google.data.google_email || "Google Calendar"}`
                        : google.data?.oauth_configured === false
                          ? google.data.oauth_configuration_message || "Google OAuth is not configured in production."
                          : "Connect Franco's personal Google account to put every rep booking on that calendar and create Google Meet links."}
                    </div>
                  </div>
                  <CellChip tone={google.data?.calendar_connected ? "ok" : "warn"}>
                    {google.data?.calendar_connected ? "Connected" : "Action required"}
                  </CellChip>
                  {!google.data?.calendar_connected ? (
                    <Btn size="sm" onClick={() => void connectCalendar()} disabled={startGoogle.isPending || google.data?.oauth_configured === false}>
                      {google.data?.oauth_configured === false ? "Setup required" : startGoogle.isPending ? "Opening..." : "Connect"}
                    </Btn>
                  ) : null}
                </div>
                <div className="grid" style={{ gap: 14, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
                  <div>
                    <h3 style={{ margin: 0 }}>Booking confirmations</h3>
                    <div className="sub" style={{ marginTop: 4 }}>Sent immediately after a meeting is booked.</div>
                  </div>
                  <CG>
                    <div className="s6">
                      <ToggleRow
                        label="Email confirmation"
                        description="Send the calendar invitation and meeting details."
                        checked={draft.confirmation_email_enabled}
                        onChange={(confirmation_email_enabled) => patch({ confirmation_email_enabled })}
                      />
                    </div>
                    <div className="s6">
                      <ToggleRow
                        label="SMS confirmation"
                        description="Only sent with affirmative transactional SMS consent."
                        checked={draft.confirmation_sms_enabled}
                        onChange={(confirmation_sms_enabled) => patch({ confirmation_sms_enabled })}
                      />
                    </div>
                  </CG>
                  <MessageTemplates
                    title="Confirmation wording"
                    hint="Leave a field blank to keep the standard wording. The room link and PIN are filled in from the draft file the booking opens."
                    fields={[
                      { key: "email_subject", label: "Confirmation email subject", rows: 1, maxLength: 160 },
                      { key: "email_body", label: "Confirmation email body", rows: 6, maxLength: 4000, placeholder: "Replaces the whole email body. The calendar invitation still attaches." },
                      { key: "sms", label: "Confirmation SMS", rows: 3, maxLength: 400, pin: true, placeholder: "Qualified Commercial: your call with {rep} is confirmed for {time}. Your secure room PIN is {pin}. Get ready before the call: {room_link}" },
                      { key: "pin_email_subject", label: "PIN email subject (no SMS consent)", rows: 1, maxLength: 160, pin: true },
                      { key: "pin_email_body", label: "PIN email body (no SMS consent)", rows: 4, maxLength: 4000, pin: true },
                    ]}
                    values={draft.confirmation_messages ?? {}}
                    onChange={setConfirmationMessage}
                  />
                </div>

                <div className="grid" style={{ gap: 14, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
                  <div>
                    <h3 style={{ margin: 0 }}>Pre-call prep</h3>
                    <div className="sub" style={{ marginTop: 4 }}>
                      Every booking opens a draft file with a secure room. The client confirms who owns the business, connects the bank and authorizes a soft credit check before the call; these messages nudge them until it is done.
                    </div>
                  </div>
                  <ToggleRow
                    label="Open a draft file and run the pre-call sequence"
                    description="Turning this off books calls exactly as before: no draft file, no room link, no nudges."
                    checked={draft.precall_enabled}
                    onChange={(precall_enabled) => patch({ precall_enabled })}
                  />
                  <div style={{ opacity: draft.precall_enabled ? 1 : 0.55 }}>
                    <Field label="“Before your call” block (appended to the confirmation email)">
                      <Textarea rows={5} maxLength={2000} value={draft.precall_messages?.precall_block ?? ""} onChange={(e) => setPrecallText("precall_block", e.target.value)} placeholder="Before your call — about 10 minutes: 1. Confirm who owns {business}. 2. Connect the business bank. 3. Authorize a soft credit check. Open your secure room: {room_link}" style={{ resize: "vertical" }} />
                    </Field>
                    <Field label="Line added to reminders while something is still open">
                      <Input maxLength={300} value={draft.precall_messages?.reminder_precall_line ?? ""} onChange={(e) => setPrecallText("reminder_precall_line", e.target.value)} placeholder="Still needed before your call: {missing} → {room_link}" />
                    </Field>
                    <CG>
                      <PrecallStepEditor
                        className="s6"
                        title="Nudge 1 — after booking"
                        timing="after_hours"
                        timingLabel="Hours after booking"
                        timingDefault={24}
                        note="Only when the call is at least 36 hours away. Texts wait for 9am–8pm local."
                        value={draft.precall_messages?.nudge_1 ?? {}}
                        onChange={(next) => setPrecallStep("nudge_1", next)}
                        defaults={{ email_subject: "Before your call with {rep}: {done} done", sms: "Qualified Commercial: before your call {date}, please {missing}: {room_link} (PIN sent earlier)." }}
                      />
                      <PrecallStepEditor
                        className="s6"
                        title="Nudge 2 — before the call"
                        timing="before_hours"
                        timingLabel="Hours before the call"
                        timingDefault={24}
                        note="Falls back to 4 hours before for calls booked at short notice; never inside the last hour."
                        value={draft.precall_messages?.nudge_2 ?? {}}
                        onChange={(next) => setPrecallStep("nudge_2", next)}
                        defaults={{ email_subject: "Your call with {rep} is coming up — {done} done", sms: "Qualified Commercial: your call with {rep} is {time}. Finish {missing} now so we can talk real numbers: {room_link}" }}
                      />
                    </CG>
                    <PlaceholderHelp />
                  </div>
                </div>

                <div className="grid" style={{ gap: 18, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
                  <div>
                    <h3 style={{ margin: 0 }}>Reminder schedule</h3>
                    <div className="sub" style={{ marginTop: 4 }}>Add up to five independent reminders for each delivery channel.</div>
                  </div>
                  <CG>
                    <ReminderSchedule
                      className="s6"
                      channel="Email"
                      description="Delivered to the booking email address."
                      enabled={draft.reminder_email_enabled}
                      values={reminderValues("email")}
                      onToggle={(reminder_email_enabled) => patch({ reminder_email_enabled })}
                      onAdd={() => addReminder("email")}
                      onChange={(index, value) => {
                        const next = [...reminderValues("email")];
                        next[index] = value;
                        setReminderValues("email", next);
                      }}
                      onRemove={(index) => setReminderValues("email", reminderValues("email").filter((_, rowIndex) => rowIndex !== index))}
                      emailMessages={draft.reminder_email_messages ?? {}}
                      onEmailMessageChange={setEmailReminderMessage}
                    />
                    <ReminderSchedule
                      className="s6"
                      channel="SMS"
                      description="Consent-gated and delivered to the booking phone number."
                      enabled={draft.reminder_sms_enabled}
                      values={reminderValues("sms")}
                      onToggle={(reminder_sms_enabled) => patch({ reminder_sms_enabled })}
                      onAdd={() => addReminder("sms")}
                      onChange={retimeSmsReminder}
                      onRemove={(index) => setReminderValues("sms", reminderValues("sms").filter((_, rowIndex) => rowIndex !== index))}
                      messages={draft.reminder_sms_messages ?? {}}
                      onMessageChange={setSmsReminderMessage}
                    />
                  </CG>
                </div>
              </div>
            </Panel>
          ) : null}
        </div>

        <BookingPreview settings={draft} hostName={user?.name || "Qualified Commercial"} logoUrl={logoUrl} profileUrl={profileUrl} />
      </div>
    </div>
  );
}

/**
 * Two-tone status line. This used to hand-roll its box because the sheet had no
 * block-level success surface; `.statusline` (and `StatusLine`) is now exactly
 * that class — a `.cellchip` that wraps — so the geometry has one owner again.
 */
function FeedbackLine({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <StatusLine tone={ok ? "ok" : "warn"}>{children}</StatusLine>;
}

function BlockedTimeEditor({
  intervals,
  weeklySchedule,
  onChange,
  onError,
}: {
  intervals: BookingBlockedInterval[];
  weeklySchedule: BookingDaySchedule[];
  onChange: (intervals: BookingBlockedInterval[]) => void;
  onError: (message: string | null) => void;
}) {
  const availableDays = useMemo(() => activeScheduleDays(weeklySchedule), [weeklySchedule]);
  const [selectedDays, setSelectedDays] = useState<number[]>(() => [...availableDays]);
  const [newStart, setNewStart] = useState("14:00");
  const [newEnd, setNewEnd] = useState("16:00");
  const [newLabel, setNewLabel] = useState("Break");

  useEffect(() => {
    setSelectedDays([...availableDays]);
  }, [availableDays]);

  const toggleBlockedDay = (weekday: number) => {
    setSelectedDays((current) => (
      current.includes(weekday)
        ? current.filter((day) => day !== weekday)
        : [...current, weekday].sort((a, b) => a - b)
    ));
  };

  const addBlockedTime = () => {
    if (!selectedDays.length) {
      onError("Select at least one day for the blocked time.");
      return;
    }
    const start = timeToMinutes(newStart);
    const end = timeToMinutes(newEnd);
    if (start === null || end === null || end <= start) {
      onError("Blocked time must end after it starts.");
      return;
    }
    const outsideDay = selectedDays.find((weekday) => {
      const day = weeklySchedule.find((item) => item.weekday === weekday);
      return !day?.intervals.some((range) => {
        const rangeStart = timeToMinutes(range.start_time);
        const rangeEnd = timeToMinutes(range.end_time);
        return rangeStart !== null && rangeEnd !== null && start >= rangeStart && end <= rangeEnd;
      });
    });
    if (outsideDay !== undefined) {
      onError(`Blocked time must stay inside one ${weekdayName(outsideDay)} schedule range.`);
      return;
    }
    const conflictDay = selectedDays.find((weekday) => intervals.some((interval) => (
      interval.weekday === weekday
      && start < (timeToMinutes(interval.end_time) ?? 0)
      && end > (timeToMinutes(interval.start_time) ?? 0)
    )));
    if (conflictDay !== undefined) {
      onError(`${weekdayName(conflictDay)} already has a blocked time that overlaps this range.`);
      return;
    }

    const additions = selectedDays.map((weekday) => ({
      weekday,
      start_time: newStart,
      end_time: newEnd,
      label: newLabel.trim() || null,
    }));
    onChange([...intervals, ...additions].sort(compareBlockedIntervals));
    onError(null);
  };

  const updateInterval = (index: number, patch: Partial<BookingBlockedInterval>) => {
    onChange(intervals.map((interval, rowIndex) => (
      rowIndex === index ? { ...interval, ...patch } : interval
    )));
  };

  return (
    <section className="booking-block-editor" aria-labelledby="booking-blocked-times-title">
      <div className="booking-block-editor-head">
        <div>
          <h3 id="booking-blocked-times-title">Blocked times</h3>
          <div className="sub">Recurring breaks are removed from public and team booking availability.</div>
        </div>
        <CellChip tone={intervals.length ? "warn" : "mut"}>{intervals.length} scheduled</CellChip>
      </div>

      <div className="booking-block-compose">
        <Field label="Apply on" className="booking-block-days">
          <div className="seg" aria-label="Days for new blocked time">
            {WEEKDAYS.map((day) => (
              <button
                key={day.id}
                type="button"
                className={selectedDays.includes(day.id) ? "on" : ""}
                aria-pressed={selectedDays.includes(day.id)}
                onClick={() => toggleBlockedDay(day.id)}
              >
                {day.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Start">
          <Input type="time" value={newStart} onChange={(event) => setNewStart(event.target.value)} />
        </Field>
        <Field label="End">
          <Input type="time" value={newEnd} onChange={(event) => setNewEnd(event.target.value)} />
        </Field>
        <Field label="Label">
          <Input value={newLabel} maxLength={80} placeholder="Break" onChange={(event) => setNewLabel(event.target.value)} />
        </Field>
        <Btn type="button" onClick={addBlockedTime} disabled={!selectedDays.length}>
          <Icon name="plus" size={13} /> Add blocked time
        </Btn>
      </div>

      {intervals.length ? (
        <div className="booking-block-list">
          {intervals.map((interval, index) => (
            <div className="booking-block-row" key={index}>
              <div className="booking-block-day-label">
                <b>{weekdayName(interval.weekday ?? 0)}</b>
                {!availableDays.includes(interval.weekday ?? 0) ? <span className="sub">Inactive day</span> : null}
              </div>
              <Field label="Start">
                <Input
                  type="time"
                  value={interval.start_time}
                  onChange={(event) => updateInterval(index, { start_time: event.target.value })}
                />
              </Field>
              <Field label="End">
                <Input
                  type="time"
                  value={interval.end_time}
                  onChange={(event) => updateInterval(index, { end_time: event.target.value })}
                />
              </Field>
              <Field label="Label">
                <Input
                  value={interval.label ?? ""}
                  maxLength={80}
                  placeholder="Blocked"
                  onChange={(event) => updateInterval(index, { label: event.target.value || null })}
                />
              </Field>
              <Btn
                type="button"
                aria-label={`Remove ${weekdayName(interval.weekday ?? 0)} blocked time`}
                title="Remove blocked time"
                onClick={() => onChange(intervals.filter((_, rowIndex) => rowIndex !== index))}
              >
                <Icon name="trash" size={14} />
              </Btn>
            </div>
          ))}
        </div>
      ) : (
        <div className="sub">No recurring breaks are configured.</div>
      )}
    </section>
  );
}

function timeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function weekdayName(weekday: number): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekday] ?? "Day";
}

function compareBlockedIntervals(left: BookingBlockedInterval, right: BookingBlockedInterval): number {
  return (left.weekday ?? 7) - (right.weekday ?? 7) || left.start_time.localeCompare(right.start_time);
}

function BookingPreview({ settings, hostName, logoUrl, profileUrl }: { settings: UserBookingSettings; hostName: string; logoUrl: string | null; profileUrl: string | null }) {
  // Mirrors the real /book/[slug] page. That page is now itself on the plain-CSS
  // classes, so the parts of it that ARE the design system — the `.chip` pills,
  // the `.panel` around the time picker — are the same classes here. The parts
  // that are bespoke to a public page stay bespoke here too: the hero type, the
  // device frame, and the slot tiles, which are a PICTURE of buttons and must
  // not carry `.btn`'s cursor:pointer and pretend to be clickable.
  //
  // This component tracks /book/[slug], not this stylesheet. If that file's
  // layout changes, this one changes with it.
  //
  // These two must be a concrete hex, not a var(): `withAlpha()` composites
  // against real channel values, and `onAccentPreview()` decides black-or-white
  // text by measuring contrast — neither can read a CSS variable from JS. They
  // are the accent and ink from :root in globals.css, written out.
  const BRAND = "#1b4b9e";
  const INK = "#0f1720";
  const accent = settings.primary_color || BRAND;
  return (
    // The device frame: the public page's own ground (--bg), pinned beside the
    // editor, wearing the host's accent as its top rule. Bespoke because it is
    // a picture of a page, not a surface in this one.
    <div style={{ position: "sticky", top: 18, borderRadius: "var(--r)", border: "1px solid var(--line)", borderTop: `3px solid ${accent}`, background: "var(--bg)", padding: 20, boxShadow: "var(--sh2)" }}>
      {logoUrl ? <img src={logoUrl} alt="" style={{ maxHeight: 30, maxWidth: 170, objectFit: "contain", marginBottom: 14 }} /> : <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 14 }}>Qualified Commercial</div>}

      {/* Same `.chip` pair the real page renders, accent tint and all. */}
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="chip" style={{ background: withAlpha(accent, 0.1), color: accent, borderColor: withAlpha(accent, 0.25) }}>{settings.duration_min} minutes</span>
        <span className="chip">{settings.timezone.replace(/_/g, " ")}</span>
      </div>

      {/* Hero type, scaled down. The real page clamps to 44px; this is the
          same shape at preview size. */}
      <h2 style={{ marginBottom: 8, fontSize: 24, lineHeight: 1.12 }}>{settings.title || `Book a meeting with ${hostName}`}</h2>
      <p style={{ color: "var(--muted)", lineHeight: 1.6, fontSize: 13.5, margin: 0 }}>{settings.intro || "Choose a time that works for you. You will receive a calendar invitation after booking."}</p>

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
        {/* The host disc, at the preview's 34px rather than the page's 42px. */}
        <div style={{ width: 34, height: 34, borderRadius: 999, border: "1px solid var(--line)", background: withAlpha(accent, 0.12), color: accent, overflow: "hidden", display: "grid", placeItems: "center", flexShrink: 0 }}>
          {profileUrl ? <img src={profileUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="user" size={17} />}
        </div>
        <span style={{ fontWeight: 700 }}>{hostName}</span>
      </div>

      <div className="panel">
        <div className="panel-h"><h2>Pick a time</h2></div>
        <div className="panel-b">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {[settings.start_time, "10:30", "11:00", "13:00", "14:30", "15:00"].map((label, index) => (
              // NOT `.btn`: these are a picture of the slot buttons, and `.btn`
              // carries cursor:pointer, which would advertise a click the
              // preview cannot honour. Colours are the host's, so inline.
              <div key={`${label}-${index}`} style={{ textAlign: "center", padding: "8px 4px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, border: `1px solid ${index === 0 ? accent : "var(--line2)"}`, background: index === 0 ? accent : "var(--surface)", color: index === 0 ? onAccentPreview(accent, INK) : "var(--ink)" }}>{label}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Same luminance rule the public page uses, so the preview cannot lie about contrast. */
function onAccentPreview(hex: string, inkFallback: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return "#FFFFFF";
  const int = parseInt(m[1], 16);
  const chan = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
  return L > 0.45 ? inkFallback : "#FFFFFF";
}

function UploadCard({ title, description, imageUrl, inputId, onChange, circle, className }: { title: string; description: string; imageUrl: string | null; inputId: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void; circle?: boolean; className?: string }) {
  return (
    <div className={cx("card", className)}>
      {/* Dashed image well — bespoke geometry, and the radius is derived from
          the `circle` prop, so it stays inline. */}
      <div style={{ width: 82, height: 82, borderRadius: circle ? 41 : 12, border: "1px dashed var(--line2)", background: "var(--sunken2)", display: "grid", placeItems: "center", overflow: "hidden", marginBottom: 10 }}>
        {imageUrl ? <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="upload" size={24} />}
      </div>
      <div><b>{title}</b></div>
      <div className="sub" style={{ margin: "4px 0 10px" }}>{description}</div>
      <input id={inputId} type="file" accept="image/png,image/jpeg" onChange={onChange} style={{ display: "none" }} />
      {/* `.btn` already carries cursor:pointer and text-decoration:none. */}
      <label htmlFor={inputId} className="btn">
        <Icon name="upload" size={13} /> Upload
      </label>
    </div>
  );
}

/**
 * Stays a real <label> rather than `ds/Field`, which renders a <div>: the
 * implicit label association is what makes clicking the caption focus the
 * control, and losing it would be a regression, not a restyle.
 */
function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className} style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <span className="lbl">{label}</span>
      {children}
    </label>
  );
}

function ReminderSchedule({
  channel,
  description,
  enabled,
  values,
  onToggle,
  onAdd,
  onChange,
  onRemove,
  className,
  messages,
  onMessageChange,
  emailMessages,
  onEmailMessageChange,
}: {
  channel: "Email" | "SMS";
  description: string;
  enabled: boolean;
  values: number[];
  onToggle: (enabled: boolean) => void;
  onAdd: () => void;
  onChange: (index: number, value: number) => void;
  onRemove: (index: number) => void;
  className?: string;
  /** Per-reminder SMS text, keyed by minutes-before. */
  messages?: Record<string, string>;
  onMessageChange?: (minutes: number, message: string) => void;
  /** Per-reminder email subject/body, keyed by minutes-before. */
  emailMessages?: Record<string, { subject: string; body: string }>;
  onEmailMessageChange?: (minutes: number, field: "subject" | "body", value: string) => void;
}) {
  return (
    <section className={className} style={{ minWidth: 0, padding: 16, border: "1px solid var(--line)", borderRadius: 8 }}>
      <div className="grid" style={{ gap: 14 }}>
        <ToggleRow
          label={`${channel} reminders`}
          description={description}
          checked={enabled}
          onChange={onToggle}
        />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Btn type="button" size="sm" onClick={onAdd} disabled={!enabled || values.length >= 5}>
            <Icon name="plus" size={13} /> Add reminder
          </Btn>
        </div>
        <div className="grid" style={{ gap: 9, opacity: enabled ? 1 : 0.55 }}>
          {values.map((value, index) => (
            <div key={`${channel}-${index}`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 38px", gap: 8, alignItems: "end" }}>
              <Field label={`${channel} reminder ${index + 1}`}>
                <Select disabled={!enabled} value={value} onChange={(event) => onChange(index, Number(event.target.value))}>
                  {REMINDER_TIMES.map((option) => (
                    <option key={option.value} value={option.value} disabled={values.includes(option.value) && option.value !== value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Btn
                type="button"
                size="sm"
                aria-label={`Remove ${channel.toLowerCase()} reminder ${index + 1}`}
                title={values.length === 1 ? "Keep at least one reminder time" : "Remove reminder"}
                disabled={!enabled || values.length === 1}
                onClick={() => onRemove(index)}
                style={{ width: 38, height: 38, padding: 0 }}
              >
                <Icon name="trash" size={14} />
              </Btn>
              {onMessageChange ? (
                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="Message">
                    <Textarea
                      disabled={!enabled}
                      rows={2}
                      maxLength={400}
                      value={messages?.[String(value)] ?? ""}
                      placeholder="Qualified Commercial reminder: your meeting, {time}."
                      onChange={(event) => onMessageChange(value, event.target.value)}
                      style={{ resize: "vertical" }}
                    />
                  </Field>
                  <span className="sub" style={{ display: "block", marginTop: 4 }}>
                    Leave blank for the standard reminder. Use{" "}
                    <code>{"{time}"}</code>, <code>{"{name}"}</code>, <code>{"{rep}"}</code>,{" "}
                    <code>{"{join_link}"}</code>, <code>{"{room_link}"}</code>, <code>{"{precall}"}</code>. &ldquo;Reply STOP to opt out.&rdquo; is added
                    automatically.
                  </span>
                </div>
              ) : null}
              {onEmailMessageChange ? (
                <div style={{ gridColumn: "1 / -1", display: "grid", gap: 8 }}>
                  <Field label="Subject">
                    <Input disabled={!enabled} maxLength={160} value={emailMessages?.[String(value)]?.subject ?? ""} placeholder={`Reminder: your meeting`} onChange={(event) => onEmailMessageChange(value, "subject", event.target.value)} />
                  </Field>
                  <Field label="Body">
                    <Textarea disabled={!enabled} rows={4} maxLength={4000} value={emailMessages?.[String(value)]?.body ?? ""} placeholder="Leave blank for the standard reminder email." onChange={(event) => onEmailMessageChange(value, "body", event.target.value)} style={{ resize: "vertical" }} />
                  </Field>
                  <span className="sub" style={{ display: "block" }}>
                    Blank keeps the standard email, which lists what is still open before the call. Placeholders: <code>{"{time}"}</code>, <code>{"{name}"}</code>, <code>{"{rep}"}</code>, <code>{"{join_link}"}</code>, <code>{"{room_link}"}</code>, <code>{"{precall}"}</code>.
                  </span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const PLACEHOLDERS: Array<[string, string]> = [
  ["{name}", "client's full name"], ["{first}", "first name"], ["{rep}", "host or rep"], ["{business}", "business name"],
  ["{date}", "call date"], ["{time}", "call date and time"], ["{join_link}", "video link"], ["{room_link}", "secure room link"],
  ["{missing}", "what is still needed"], ["{done}", "e.g. 1 of 3"], ["{precall}", "ready-made ‘still needed’ line"],
  ["{pin}", "room PIN — confirmation SMS and PIN email only"],
];

function PlaceholderHelp() {
  return (
    <div className="sub" style={{ lineHeight: 1.7 }}>
      Placeholders: {PLACEHOLDERS.map(([token, meaning], index) => (
        <span key={token}>{index ? ", " : ""}<code>{token}</code> {meaning}</span>
      ))}. Every SMS ends with “Reply STOP to opt out.”; every pre-call email carries a one-tap stop link.
    </div>
  );
}

function MessageTemplates({ title, hint, fields, values, onChange }: {
  title: string;
  hint: string;
  fields: Array<{ key: string; label: string; rows: number; maxLength: number; placeholder?: string; pin?: boolean }>;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="grid" style={{ gap: 10 }}>
      <div>
        <b style={{ fontSize: 13 }}>{title}</b>
        <div className="sub" style={{ marginTop: 3 }}>{hint}</div>
      </div>
      {fields.map((field) => (
        <Field key={field.key} label={field.label}>
          {field.rows === 1
            ? <Input maxLength={field.maxLength} value={values[field.key] ?? ""} placeholder={field.placeholder} onChange={(e) => onChange(field.key, e.target.value)} />
            : <Textarea rows={field.rows} maxLength={field.maxLength} value={values[field.key] ?? ""} placeholder={field.placeholder} onChange={(e) => onChange(field.key, e.target.value)} style={{ resize: "vertical" }} />}
        </Field>
      ))}
      <PlaceholderHelp />
    </div>
  );
}

function PrecallStepEditor({ className, title, timing, timingLabel, timingDefault, note, value, onChange, defaults }: {
  className?: string;
  title: string;
  timing: "after_hours" | "before_hours";
  timingLabel: string;
  timingDefault: number;
  note: string;
  value: PrecallStepSettings;
  onChange: (next: Partial<PrecallStepSettings>) => void;
  defaults: { email_subject: string; sms: string };
}) {
  return (
    <section className={className} style={{ minWidth: 0, padding: 16, border: "1px solid var(--line)", borderRadius: 8 }}>
      <div className="grid" style={{ gap: 10 }}>
        <div>
          <b style={{ fontSize: 13 }}>{title}</b>
          <div className="sub" style={{ marginTop: 3 }}>{note}</div>
        </div>
        <CG>
          <Field label={timingLabel} className="s6">
            <Input type="number" min={1} max={240} value={value[timing] ?? timingDefault} onChange={(e) => onChange({ [timing]: Number(e.target.value) || timingDefault })} />
          </Field>
          <Field label="Channels" className="s6">
            <Select value={value.channel ?? "both"} onChange={(e) => onChange({ channel: e.target.value as PrecallStepSettings["channel"] })}>
              <option value="both">Email and SMS</option>
              <option value="email">Email only</option>
              <option value="sms">SMS only</option>
            </Select>
          </Field>
        </CG>
        <Field label="Email subject"><Input maxLength={160} value={value.email_subject ?? ""} placeholder={defaults.email_subject} onChange={(e) => onChange({ email_subject: e.target.value })} /></Field>
        <Field label="Email body"><Textarea rows={4} maxLength={4000} value={value.email_body ?? ""} placeholder="Blank keeps the standard wording." onChange={(e) => onChange({ email_body: e.target.value })} style={{ resize: "vertical" }} /></Field>
        <Field label="SMS"><Textarea rows={3} maxLength={400} value={value.sms ?? ""} placeholder={defaults.sms} onChange={(e) => onChange({ sms: e.target.value })} style={{ resize: "vertical" }} /></Field>
      </div>
    </section>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={cx("pick", checked && "on")} style={{ justifyContent: "space-between", textAlign: "left" }}>
      <span>
        <span style={{ display: "block", fontWeight: 650 }}>{label}</span>
        <span className="sub" style={{ display: "block", marginTop: 3 }}>{description}</span>
      </span>
      {/* The switch itself has no class in the system — bespoke geometry, and
          the track colour is driven by state. */}
      <span style={{ width: 46, height: 26, borderRadius: 999, background: checked ? "var(--accent)" : "var(--line2)", padding: 3, flexShrink: 0 }}>
        <span style={{ display: "block", width: 20, height: 20, borderRadius: 999, background: "#fff", transform: checked ? "translateX(20px)" : "translateX(0)", transition: "transform .16s ease" }} />
      </span>
    </button>
  );
}

function normalizeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 64);
}
