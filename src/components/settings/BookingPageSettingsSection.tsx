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
import { Btn, CG, CellChip, IconBtn, Input, PageHeader, Panel, Row, Select, StatusLine, Textarea, cx } from "@/components/ds";
import { BookingMessagesWorkspace } from "@/components/settings/BookingMessagesWorkspace";
import {
  useBookingSettings,
  useCurrentUser,
  useGoogleConnection,
  useStartGoogleOAuth,
  useUpdateBookingSettings,
  useUpdateProfile,
  useUploadBookingAsset,
} from "@/hooks/useApi";
import type { BookingBlockedInterval, BookingDaySchedule, BookingVideo, PrecallStepSettings, UserBookingSettings } from "@/lib/types";

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
    precall_videos: [],
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

/** An operator's own contact details.
 *
 * Both production agreements name the relationship manager and the phone
 * notice is served to, and `rm_phone` has been required to send stage one all
 * along — with nowhere in the system to read one from, because an operator's
 * phone lives only in Clerk. Filled in here once, it travels with the person
 * onto every package they are named on.
 */
function YourContactDetails() {
  const { data: user } = useCurrentUser();
  const update = useUpdateProfile();
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched || !user) return;
    setPhone(user.phone ?? "");
    setTitle(user.title ?? "");
  }, [user, touched]);
  const dirty = touched && (phone !== (user?.phone ?? "") || title !== (user?.title ?? ""));
  const missingPhone = Boolean(user) && !(user?.phone ?? "").trim();

  return (
    <Panel title="Your contact details">
      <div className="grid" style={{ gap: 10 }}>
        <div className="sub">
          Both production agreements name you as the relationship manager and print the phone notice is served to.
          Filled in once here, it arrives on every package you are named on.
        </div>
        {missingPhone && !dirty ? (
          <StatusLine tone="warn">A phone number is needed before a production package naming you can be sent.</StatusLine>
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10 }}>
          <Field label="Phone">
            <Input value={phone} placeholder="(973) 555-0148"
              onChange={(e) => { setTouched(true); setPhone(e.target.value); }} />
          </Field>
          <Field label="Title">
            <Input value={title} placeholder="Senior Underwriter"
              onChange={(e) => { setTouched(true); setTitle(e.target.value); }} />
          </Field>
        </div>
        <Row>
          <Btn disabled={!dirty || update.isPending}
            onClick={() => update.mutate({ phone: phone.trim() || null, title: title.trim() || null },
              { onSuccess: () => setTouched(false) })}>
            {update.isPending ? "Saving…" : "Save"}
          </Btn>
          {update.isError ? <span className="sub">That could not be saved.</span> : null}
        </Row>
      </div>
    </Panel>
  );
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
  // The preview used to hold a permanent 390px column. It opens on demand now,
  // so the settings themselves get the full width.
  const [previewOpen, setPreviewOpen] = useState(false);

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


  const setPrecallText = (key: "precall_block" | "reminder_precall_line", value: string) => {
    patch({ precall_messages: { ...(draft?.precall_messages ?? {}), [key]: value } });
  };
  const setPrecallStep = (step: "nudge_1" | "nudge_2", next: Partial<PrecallStepSettings>) => {
    const current = draft?.precall_messages ?? {};
    patch({ precall_messages: { ...current, [step]: { ...(current[step] ?? {}), ...next } } });
  };

  const setVideos = (precall_videos: BookingVideo[]) => {
    // precall_video_url is the field that existed before the library and is
    // still what the renderer falls back to when the list is empty. Mirroring
    // the primary into it keeps {video} rendering the same thing from either
    // side, and keeps a host who set one before the library from losing it.
    patch({ precall_videos, precall_video_url: precall_videos[0]?.url.trim() || null });
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

  const videos = videoLibrary(draft);
  // The backend refuses a bad key or link with a 422. Holding Save until the
  // list is valid turns that into an inline sentence instead of a failed save.
  const videoIssues = videoProblems(videos);

  const actions = (
    <>
      <Btn onClick={() => setPreviewOpen((v) => !v)}>
        <Icon name="eye" size={13} /> {previewOpen ? "Hide preview" : "Preview"}
      </Btn>
      {draft.slug ? (
        <Link href={bookingPath} target="_blank" className="btn">
          <Icon name="external" size={13} /> Open live page
        </Link>
      ) : null}
      <Btn variant="pri" onClick={onSave} disabled={!dirty || update.isPending || invalidWindow || videoIssues.length > 0}>
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
          <YourContactDetails />

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
                    <h3 style={{ margin: 0 }}>Client messages</h3>
                    <div className="sub" style={{ marginTop: 4 }}>
                      Everything the client receives, in the order they receive it. Pick one to edit it, draft it with
                      the assistant, or send yourself a test. Blank means the standard wording is used.
                    </div>
                  </div>

                  <CG>
                    <div className="s3">
                      <ToggleRow
                        label="Confirmation email"
                        description="The calendar invitation and meeting details."
                        checked={draft.confirmation_email_enabled}
                        onChange={(confirmation_email_enabled) => patch({ confirmation_email_enabled })}
                      />
                    </div>
                    <div className="s3">
                      <ToggleRow
                        label="Confirmation text"
                        description="Only with affirmative texting consent."
                        checked={draft.confirmation_sms_enabled}
                        onChange={(confirmation_sms_enabled) => patch({ confirmation_sms_enabled })}
                      />
                    </div>
                    <div className="s3">
                      <ToggleRow
                        label="Reminder emails"
                        description="To the booking email address."
                        checked={draft.reminder_email_enabled}
                        onChange={(reminder_email_enabled) => patch({ reminder_email_enabled })}
                      />
                    </div>
                    <div className="s3">
                      <ToggleRow
                        label="Reminder texts"
                        description="Consent-gated, to the booking number."
                        checked={draft.reminder_sms_enabled}
                        onChange={(reminder_sms_enabled) => patch({ reminder_sms_enabled })}
                      />
                    </div>
                  </CG>

                  <ToggleRow
                    label="Open a draft file and run the pre-call sequence"
                    description="Every booking opens a secure room so the client can confirm owners, connect the bank through Plaid and authorize the soft credit check before the call. Turning this off books calls with no room and no nudges."
                    checked={draft.precall_enabled}
                    onChange={(precall_enabled) => patch({ precall_enabled })}
                  />

                  <VideoLibraryEditor
                    videos={videos}
                    issues={videoIssues}
                    usage={videoTokenUsage(draft)}
                    onChange={setVideos}
                    onNotice={setFeedback}
                  />

                  <CG>
                    <Field label="Line added while something is still open" className="s6">
                      <Input
                        maxLength={300}
                        value={draft.precall_messages?.reminder_precall_line ?? ""}
                        onChange={(e) => setPrecallText("reminder_precall_line", e.target.value)}
                        placeholder="Still needed before your call: {missing} → {room_link}"
                      />
                      <div className="sub" style={{ marginTop: 4 }}>
                        What {"{precall}"} expands to. It disappears once the client has finished every step.
                      </div>
                    </Field>
                  </CG>

                  <div style={{ opacity: draft.precall_enabled ? 1 : 0.6 }}>
                    <BookingMessagesWorkspace draft={draft} patch={patch} canEdit={user?.role === "super_admin"} />
                  </div>
                </div>
              </div>
            </Panel>
          ) : null}
        </div>
      </div>

      {previewOpen ? (
        <>
          <button
            type="button"
            className="booking-preview-scrim"
            aria-label="Close the booking page preview"
            onClick={() => setPreviewOpen(false)}
          />
          <aside className="booking-preview-panel" aria-label="Booking page preview">
            <header>
              <div className="grid" style={{ gap: 2 }}>
                <b>Booking page preview</b>
                <span className="sub">Follows your unsaved changes.</span>
              </div>
              <Row>
                {draft.slug ? (
                  <Link href={bookingPath} target="_blank" className="btn sm">
                    <Icon name="external" size={12} /> Open the live page
                  </Link>
                ) : null}
                <Btn size="sm" onClick={() => setPreviewOpen(false)}>Close</Btn>
              </Row>
            </header>
            <div>
              <BookingPreview settings={draft} hostName={user?.name || "Qualified Commercial"} logoUrl={logoUrl} profileUrl={profileUrl} />
            </div>
          </aside>
        </>
      ) : null}
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

const VIDEO_LIMIT = 12;

/**
 * The host's video library.
 *
 * This row used to be a single URL, so the one video it held had to serve every
 * message. A host wants a short library — the bank connection, the soft credit
 * check, a program walkthrough — and to drop whichever one fits into a given
 * email or text.
 *
 * The first entry is the primary: it is what {video} renders, which is why the
 * order is editable and why the first row says so rather than leaving the host
 * to work it out from a hint elsewhere.
 */
function VideoLibraryEditor({
  videos,
  issues,
  usage,
  onChange,
  onNotice,
}: {
  videos: BookingVideo[];
  issues: string[];
  /** Token -> how many of the host's own messages already use it. */
  usage: Record<string, number>;
  onChange: (videos: BookingVideo[]) => void;
  onNotice: (message: string | null) => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const addVideo = () => {
    const label = newLabel.trim().slice(0, 80);
    const url = newUrl.trim();
    if (!label) {
      onNotice("Name the video so you can tell it apart when you insert it.");
      return;
    }
    if (!isVideoUrl(url)) {
      onNotice("A video link must start with http:// or https://.");
      return;
    }
    if (videos.length >= VIDEO_LIMIT) {
      onNotice(`The library holds ${VIDEO_LIMIT} videos.`);
      return;
    }
    // The key is derived from the name so the host never has to invent one, and
    // it stays editable below because it is what their messages point at.
    const key = uniqueVideoKey(normalizeVideoKey(label) || "video", videos.map((video) => video.key));
    onChange([...videos, { key, label, url }]);
    setNewLabel("");
    setNewUrl("");
    onNotice(null);
  };

  const updateVideo = (index: number, next: Partial<BookingVideo>) => {
    onChange(videos.map((video, rowIndex) => (rowIndex === index ? { ...video, ...next } : video)));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= videos.length) return;
    const next = [...videos];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const copyToken = async (token: string) => {
    await navigator.clipboard.writeText(token);
    onNotice(`${token} copied. Paste it into any message, or click it in the Insert row.`);
  };

  // A token whose key no longer exists renders as literal text in a client's
  // email. Naming it here is the difference between a warning and a host
  // finding {video_bank} in a sent message.
  const dangling = Object.keys(usage)
    .filter((token) => token !== "{video}" && !videos.some((video) => `{video_${video.key}}` === token))
    .sort();

  return (
    <section className="bkvid" aria-labelledby="booking-videos-title">
      <div className="booking-block-editor-head">
        <div>
          <h3 id="booking-videos-title">Videos to watch before the call</h3>
          <div className="sub">
            Add as many as you need, then drop any of them into an email or a text with its token. The first one is
            what {"{video}"} renders, so it is the one an older message already points at.
          </div>
        </div>
        <CellChip tone={videos.length ? "ok" : "mut"}>{videos.length} of {VIDEO_LIMIT}</CellChip>
      </div>

      {videos.length ? (
        <div className="bkvid-list">
          {videos.map((video, index) => {
            const token = video.key ? `{video_${video.key}}` : "";
            const used = usage[token] ?? 0;
            return (
              // Keyed by position, not by video.key: the key is the field being
              // edited, so keying on it would remount the input mid-keystroke.
              <div className="bkvid-row" key={index}>
                <div className="bkvid-rank">
                  <b>{index + 1}</b>
                  {index === 0 ? <CellChip tone="acc">Primary</CellChip> : null}
                </div>
                <Field label="Name" className="bkvid-name">
                  <Input
                    value={video.label}
                    maxLength={80}
                    placeholder="How the bank connection works"
                    onChange={(event) => updateVideo(index, { label: event.target.value })}
                  />
                </Field>
                <Field label="Token key" className="bkvid-key">
                  <Input
                    value={video.key}
                    maxLength={24}
                    placeholder="bank"
                    onChange={(event) => updateVideo(index, { key: typingVideoKey(event.target.value) })}
                    onBlur={() => updateVideo(index, { key: normalizeVideoKey(video.key) })}
                  />
                </Field>
                <Field label="Link" className="bkvid-url">
                  <Input
                    value={video.url}
                    maxLength={500}
                    placeholder="https://youtu.be/8-fOGmSBzPo"
                    onChange={(event) => updateVideo(index, { url: event.target.value })}
                  />
                </Field>
                <div className="bkvid-tools">
                  <IconBtn aria-label={`Move ${video.label || "this video"} up`} title="Move up" onClick={() => move(index, -1)} disabled={index === 0}>
                    <span aria-hidden="true">&uarr;</span>
                  </IconBtn>
                  <IconBtn aria-label={`Move ${video.label || "this video"} down`} title="Move down" onClick={() => move(index, 1)} disabled={index === videos.length - 1}>
                    <span aria-hidden="true">&darr;</span>
                  </IconBtn>
                  <IconBtn
                    aria-label={`Remove ${video.label || "this video"}`}
                    title="Remove video"
                    onClick={() => onChange(videos.filter((_, rowIndex) => rowIndex !== index))}
                  >
                    <Icon name="trash" size={14} />
                  </IconBtn>
                </div>
                <div className="bkvid-meta">
                  {/* `.bkmsg-token` is the same pill the message editor's Insert
                      row uses, because this IS that token. */}
                  <button
                    type="button"
                    className="bkmsg-token"
                    title="Copy this token"
                    onClick={() => void copyToken(token)}
                    disabled={!token}
                  >
                    {token || "{video_...}"}
                  </button>
                  {index === 0 ? <span className="sub">Also answers to {"{video}"}.</span> : null}
                  <span className="sub">
                    {used === 0
                      ? "Not used in any message yet."
                      : `Used in ${used} ${used === 1 ? "message" : "messages"}. Changing the key here stops those messages finding it.`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="sub">
          No videos yet. Until you add one, {"{video}"} renders the firm&apos;s standard video.
        </div>
      )}

      <div className="bkvid-compose">
        <Field label="Name">
          <Input
            value={newLabel}
            maxLength={80}
            placeholder="Soft credit check, explained"
            onChange={(event) => setNewLabel(event.target.value)}
          />
        </Field>
        <Field label="Link">
          <Input
            value={newUrl}
            maxLength={500}
            placeholder="https://youtu.be/8-fOGmSBzPo"
            onChange={(event) => setNewUrl(event.target.value)}
          />
        </Field>
        <Btn type="button" onClick={addVideo} disabled={videos.length >= VIDEO_LIMIT}>
          <Icon name="plus" size={13} /> Add video
        </Btn>
      </div>

      {issues.length ? <StatusLine tone="bad">{issues.join(" ")}</StatusLine> : null}
      {dangling.length ? (
        <StatusLine tone="warn">
          {dangling.join(", ")} {dangling.length === 1 ? "is written into a message" : "are written into messages"} but
          no longer matches a video key. Put the key back or edit those messages, otherwise the client sees the token
          as plain text.
        </StatusLine>
      ) : null}
    </section>
  );
}

/**
 * What the editor shows.
 *
 * A host whose row predates the library still has their single URL in
 * precall_video_url. Showing it as the first entry (the same key and name the
 * backfill uses, so the two paths agree) means their first edit carries it into
 * the list rather than dropping it, and it does so without marking the form
 * dirty on load.
 */
function videoLibrary(settings: UserBookingSettings): BookingVideo[] {
  const stored = settings.precall_videos ?? [];
  if (stored.length) return stored;
  const legacy = (settings.precall_video_url ?? "").trim();
  return legacy ? [{ key: "intro", label: "Before your call", url: legacy }] : [];
}

/** What a key may look like mid-keystroke: everything the backend allows, plus
 *  a trailing underscore. Stripping that on every keystroke would make
 *  "bank_statement" impossible to type, so it comes off on blur instead. */
function typingVideoKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+/, "").slice(0, 24);
}

/** The key shape the backend accepts. Underscores rather than the dashes the
 *  public URL slug uses, because this one lives inside a {video_key} token. */
function normalizeVideoKey(value: string): string {
  return typingVideoKey(value).replace(/_+$/, "");
}

function uniqueVideoKey(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base.slice(0, 24 - String(suffix).length - 1)}_${suffix}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return base;
}

function isVideoUrl(value: string): boolean {
  return /^https?:\/\/\S/i.test(value.trim());
}

/** The key rule as the backend states it, so the two cannot drift. */
const VIDEO_KEY_RULE = /^[a-z0-9](?:[a-z0-9_]*[a-z0-9])?$/;

/** The same rules the backend enforces, said in the host's words before they
 *  press Save rather than as a 422 afterwards. */
function videoProblems(videos: BookingVideo[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  videos.forEach((video, index) => {
    const where = video.label.trim() || `Video ${index + 1}`;
    if (!video.label.trim()) problems.push(`${where} needs a name.`);
    if (!video.key) problems.push(`${where} needs a token key.`);
    else if (!VIDEO_KEY_RULE.test(video.key)) {
      problems.push(`${where} key takes lowercase letters, numbers and underscores, and has to start and end with a letter or a number.`);
    } else if (seen.has(video.key)) problems.push(`Two videos share the key ${video.key}. Each one needs its own.`);
    seen.add(video.key);
    if (!isVideoUrl(video.url)) problems.push(`${where} needs a link starting with http:// or https://.`);
  });
  if (videos.length > VIDEO_LIMIT) problems.push(`The library holds ${VIDEO_LIMIT} videos.`);
  return problems;
}

/**
 * Every {video…} token the host's own messages already use, and how many
 * messages use each one.
 *
 * Renaming a key is only safe when nothing points at it, so the editor reads
 * this rather than trying to remember what the key used to be: a token with no
 * matching video is dangling no matter how it got that way.
 */
function videoTokenUsage(settings: UserBookingSettings): Record<string, number> {
  const steps = ["nudge_1", "nudge_2"] as const;
  const texts: string[] = [
    ...Object.values(settings.confirmation_messages ?? {}),
    settings.precall_messages?.precall_block ?? "",
    settings.precall_messages?.reminder_precall_line ?? "",
    ...steps.flatMap((step) => {
      const item = settings.precall_messages?.[step] ?? {};
      return [item.email_subject ?? "", item.email_body ?? "", item.sms ?? ""];
    }),
    ...Object.values(settings.reminder_email_messages ?? {}).flatMap((message) => [
      message?.subject ?? "",
      message?.body ?? "",
    ]),
    ...Object.values(settings.reminder_sms_messages ?? {}),
  ];
  const usage: Record<string, number> = {};
  texts.forEach((text) => {
    // Counted once per message, not once per mention: the number is answering
    // "how many messages break if I rename this".
    const seen = new Set<string>();
    for (const match of String(text ?? "").matchAll(/\{video(?:_[a-z0-9_]+)?\}/g)) seen.add(match[0]);
    seen.forEach((token) => { usage[token] = (usage[token] ?? 0) + 1; });
  });
  return usage;
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


const PLACEHOLDERS: Array<[string, string]> = [
  ["{name}", "client's full name"], ["{first}", "first name"], ["{rep}", "host or rep"], ["{business}", "business name"],
  ["{date}", "call date"], ["{time}", "call date and time"], ["{join_link}", "video link"], ["{room_link}", "secure room link"],
  ["{missing}", "what is still needed"], ["{done}", "e.g. 1 of 3"], ["{precall}", "ready-made ‘still needed’ line"],
  ["{pin}", "room PIN — confirmation SMS and PIN email only"],
];


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
