"use client";

/**
 * Every client-facing booking message, in the order the client receives them.
 *
 * The old layout stacked confirmations, the pre-call block and two reminder
 * schedules in one column, with each reminder's subject and body expanding
 * inline — so the panel grew past the fold and there was no way to see the
 * sequence as a sequence. Here the left column IS the sequence and the right
 * column edits one message at a time.
 *
 * The host never has to start from a blank box: every message can be drafted by
 * the assistant and then edited, and can be sent to the host as a test before it
 * ever reaches a client.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { Btn, CellChip, Input, Row, Select, StatusLine, cx } from "@/components/ds";
import { useBookingPlaceholders, useDraftBookingTemplate, useTestSendBookingMessage } from "@/hooks/useApi";
import type { PrecallStepSettings, UserBookingSettings } from "@/lib/types";

type Channel = "email" | "sms";

/** One editable message: where it reads and writes in the settings object. */
type Slot = {
  id: string;
  /** The drafting kind the backend knows. */
  kind: string;
  label: string;
  channel: Channel;
  /** When the client gets it, in plain words. */
  when: string;
  group: string;
  subject?: string;
  body: string;
  authored: boolean;
  /** Reminder rows carry their timing so they can be retimed or removed. */
  minutes?: number;
  setSubject?: (value: string) => void;
  setBody: (value: string) => void;
  hint?: string;
};

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

function timingLabel(minutes: number): string {
  const hit = REMINDER_TIMES.find((t) => t.value === minutes);
  if (hit) return hit.label;
  if (minutes % 1440 === 0) return `${minutes / 1440} days before`;
  if (minutes % 60 === 0) return `${minutes / 60} hours before`;
  return `${minutes} minutes before`;
}

export function BookingMessagesWorkspace({
  draft,
  patch,
  canEdit,
}: {
  draft: UserBookingSettings;
  patch: (next: Partial<UserBookingSettings>) => void;
  canEdit: boolean;
}) {
  const [selected, setSelected] = useState<string>("confirmation_email");
  const placeholdersQ = useBookingPlaceholders();
  const drafter = useDraftBookingTemplate();
  const tester = useTestSendBookingMessage();
  const [instruction, setInstruction] = useState("");
  const [testTo, setTestTo] = useState("");
  const [testOpen, setTestOpen] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "warn" | "bad"; text: string } | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const confirmations = draft.confirmation_messages ?? {};
  const precall = draft.precall_messages ?? {};

  const setConfirmation = (key: string, value: string) =>
    patch({ confirmation_messages: { ...confirmations, [key]: value } });

  const setPrecall = (key: "precall_block" | "reminder_precall_line", value: string) =>
    patch({ precall_messages: { ...precall, [key]: value } });

  const setStep = (step: "nudge_1" | "nudge_2", field: keyof PrecallStepSettings, value: string) =>
    patch({ precall_messages: { ...precall, [step]: { ...(precall[step] ?? {}), [field]: value } } });

  const emailMinutes = useMemo(
    () => [...(draft.reminder_email_minutes ?? [])].sort((a, b) => b - a),
    [draft.reminder_email_minutes],
  );
  const smsMinutes = useMemo(
    () => [...(draft.reminder_sms_minutes ?? [])].sort((a, b) => b - a),
    [draft.reminder_sms_minutes],
  );

  const setEmailReminder = (minutes: number, field: "subject" | "body", value: string) => {
    const messages = { ...(draft.reminder_email_messages ?? {}) };
    const current = messages[String(minutes)] ?? { subject: "", body: "" };
    messages[String(minutes)] = { ...current, [field]: value };
    patch({ reminder_email_messages: messages });
  };

  const setSmsReminder = (minutes: number, value: string) => {
    const messages = { ...(draft.reminder_sms_messages ?? {}) };
    if (value.trim()) messages[String(minutes)] = value;
    else delete messages[String(minutes)];
    patch({ reminder_sms_messages: messages });
  };

  /** Retime a reminder and carry its text to the new slot.
   *  Email retiming used to drop the authored subject and body on the floor. */
  const retime = (channel: Channel, from: number, to: number) => {
    const list = channel === "email" ? emailMinutes : smsMinutes;
    if (list.includes(to)) return;
    const next = [...list.filter((m) => m !== from), to].sort((a, b) => b - a);
    if (channel === "email") {
      const messages = { ...(draft.reminder_email_messages ?? {}) };
      const carried = messages[String(from)];
      delete messages[String(from)];
      if (carried) messages[String(to)] = carried;
      patch({
        reminder_email_minutes: next,
        reminder_email_minutes_before: next[0] ?? 1440,
        reminder_email_messages: messages,
      });
    } else {
      const messages = { ...(draft.reminder_sms_messages ?? {}) };
      const carried = messages[String(from)];
      delete messages[String(from)];
      if (carried) messages[String(to)] = carried;
      patch({
        reminder_sms_minutes: next,
        reminder_sms_minutes_before: next[0] ?? 120,
        reminder_sms_messages: messages,
      });
    }
  };

  const removeReminder = (channel: Channel, minutes: number) => {
    const list = channel === "email" ? emailMinutes : smsMinutes;
    const next = list.filter((m) => m !== minutes);
    if (channel === "email") {
      const messages = { ...(draft.reminder_email_messages ?? {}) };
      delete messages[String(minutes)];
      patch({
        reminder_email_minutes: next,
        reminder_email_minutes_before: next[0] ?? 1440,
        reminder_email_messages: messages,
      });
    } else {
      const messages = { ...(draft.reminder_sms_messages ?? {}) };
      delete messages[String(minutes)];
      patch({
        reminder_sms_minutes: next,
        reminder_sms_minutes_before: next[0] ?? 120,
        reminder_sms_messages: messages,
      });
    }
  };

  const addReminder = (channel: Channel) => {
    const list = channel === "email" ? emailMinutes : smsMinutes;
    if (list.length >= 5) return;
    const ladder = channel === "email" ? [1440, 2880, 4320, 720, 10080] : [120, 1440, 60, 240, 30];
    const next = ladder.find((m) => !list.includes(m)) ?? REMINDER_TIMES.map((t) => t.value).find((m) => !list.includes(m));
    if (!next) return;
    const merged = [...list, next].sort((a, b) => b - a);
    if (channel === "email") patch({ reminder_email_minutes: merged, reminder_email_minutes_before: merged[0] });
    else patch({ reminder_sms_minutes: merged, reminder_sms_minutes_before: merged[0] });
    setSelected(`reminder_email_${next}`.replace("email", channel));
  };

  const slots: Slot[] = useMemo(() => {
    const out: Slot[] = [
      {
        id: "confirmation_email",
        kind: "confirmation_email",
        label: "Confirmation email",
        channel: "email",
        when: "As soon as they book",
        group: "When they book",
        subject: confirmations.email_subject ?? "",
        body: confirmations.email_body ?? "",
        authored: Boolean((confirmations.email_body ?? "").trim()),
        setSubject: (v) => setConfirmation("email_subject", v),
        setBody: (v) => setConfirmation("email_body", v),
        hint: "The before your call block is appended to this email.",
      },
      {
        id: "confirmation_sms",
        kind: "confirmation_sms",
        label: "Confirmation text",
        channel: "sms",
        when: "As soon as they book, with consent",
        group: "When they book",
        body: confirmations.sms ?? "",
        authored: Boolean((confirmations.sms ?? "").trim()),
        setBody: (v) => setConfirmation("sms", v),
        hint: "Only sent when they gave affirmative texting consent on the booking form.",
      },
      {
        id: "pin_email",
        kind: "pin_email",
        label: "Room PIN email",
        channel: "email",
        when: "When they did not consent to texts",
        group: "When they book",
        subject: confirmations.pin_email_subject ?? "",
        body: confirmations.pin_email_body ?? "",
        authored: Boolean((confirmations.pin_email_body ?? "").trim()),
        setSubject: (v) => setConfirmation("pin_email_subject", v),
        setBody: (v) => setConfirmation("pin_email_body", v),
        hint: "The PIN travels on its own so it is never in the same message as the room link.",
      },
      {
        id: "precall_block",
        kind: "precall_block",
        label: "Before your call block",
        channel: "email",
        when: "Appended to the confirmation email",
        group: "When they book",
        body: precall.precall_block ?? "",
        authored: Boolean((precall.precall_block ?? "").trim()),
        setBody: (v) => setPrecall("precall_block", v),
        hint: "This is where the video and the link to their room belong.",
      },
      {
        id: "nudge_1_email",
        kind: "nudge_1_email",
        label: "First nudge email",
        channel: "email",
        when: `About ${precall.nudge_1?.after_hours ?? 24} hours after booking`,
        group: "Getting them ready",
        subject: precall.nudge_1?.email_subject ?? "",
        body: precall.nudge_1?.email_body ?? "",
        authored: Boolean((precall.nudge_1?.email_body ?? "").trim()),
        setSubject: (v) => setStep("nudge_1", "email_subject", v),
        setBody: (v) => setStep("nudge_1", "email_body", v),
      },
      {
        id: "nudge_1_sms",
        kind: "nudge_1_sms",
        label: "First nudge text",
        channel: "sms",
        when: `About ${precall.nudge_1?.after_hours ?? 24} hours after booking`,
        group: "Getting them ready",
        body: precall.nudge_1?.sms ?? "",
        authored: Boolean((precall.nudge_1?.sms ?? "").trim()),
        setBody: (v) => setStep("nudge_1", "sms", v),
      },
      {
        id: "nudge_2_email",
        kind: "nudge_2_email",
        label: "Second nudge email",
        channel: "email",
        when: `About ${precall.nudge_2?.before_hours ?? 24} hours before the call`,
        group: "Getting them ready",
        subject: precall.nudge_2?.email_subject ?? "",
        body: precall.nudge_2?.email_body ?? "",
        authored: Boolean((precall.nudge_2?.email_body ?? "").trim()),
        setSubject: (v) => setStep("nudge_2", "email_subject", v),
        setBody: (v) => setStep("nudge_2", "email_body", v),
      },
      {
        id: "nudge_2_sms",
        kind: "nudge_2_sms",
        label: "Second nudge text",
        channel: "sms",
        when: `About ${precall.nudge_2?.before_hours ?? 24} hours before the call`,
        group: "Getting them ready",
        body: precall.nudge_2?.sms ?? "",
        authored: Boolean((precall.nudge_2?.sms ?? "").trim()),
        setBody: (v) => setStep("nudge_2", "sms", v),
      },
    ];

    emailMinutes.forEach((minutes) => {
      const message = (draft.reminder_email_messages ?? {})[String(minutes)] ?? { subject: "", body: "" };
      out.push({
        id: `reminder_email_${minutes}`,
        kind: "reminder_email",
        label: "Reminder email",
        channel: "email",
        when: timingLabel(minutes),
        group: "Reminders",
        minutes,
        subject: message.subject ?? "",
        body: message.body ?? "",
        authored: Boolean((message.body ?? "").trim()),
        setSubject: (v) => setEmailReminder(minutes, "subject", v),
        setBody: (v) => setEmailReminder(minutes, "body", v),
      });
    });
    smsMinutes.forEach((minutes) => {
      out.push({
        id: `reminder_sms_${minutes}`,
        kind: "reminder_sms",
        label: "Reminder text",
        channel: "sms",
        when: timingLabel(minutes),
        group: "Reminders",
        minutes,
        body: (draft.reminder_sms_messages ?? {})[String(minutes)] ?? "",
        authored: Boolean(((draft.reminder_sms_messages ?? {})[String(minutes)] ?? "").trim()),
        setBody: (v) => setSmsReminder(minutes, v),
      });
    });
    return out;
  }, [draft, confirmations, precall, emailMinutes, smsMinutes]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = slots.find((s) => s.id === selected) ?? slots[0];
  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, Slot[]>();
    slots.forEach((s) => {
      if (!byGroup.has(s.group)) {
        byGroup.set(s.group, []);
        order.push(s.group);
      }
      byGroup.get(s.group)!.push(s);
    });
    return order.map((g) => ({ group: g, items: byGroup.get(g)! }));
  }, [slots]);

  // A message removed under the cursor (a deleted reminder) must not strand the editor.
  useEffect(() => {
    if (!slots.some((s) => s.id === selected) && slots.length) setSelected(slots[0].id);
  }, [slots, selected]);

  const placeholders = placeholdersQ.data?.placeholders ?? [];
  const usable = placeholders.filter((p) => !p.pin_only || active?.id === "pin_email" || active?.id === "confirmation_sms");

  const insert = (token: string) => {
    if (!canEdit || !active) return;
    const el = bodyRef.current;
    if (!el) {
      active.setBody(`${active.body}${active.body.endsWith(" ") || !active.body ? "" : " "}${token}`);
      return;
    }
    const start = el.selectionStart ?? active.body.length;
    const end = el.selectionEnd ?? start;
    active.setBody(`${active.body.slice(0, start)}${token}${active.body.slice(end)}`);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  async function draftWithAI() {
    if (!active || !canEdit) return;
    setNote(null);
    try {
      const out = await drafter.mutateAsync({
        kind: active.kind,
        instruction: instruction.trim() || null,
        current_subject: active.subject || null,
        current_body: active.body || null,
      });
      if (out.subject && active.setSubject) active.setSubject(out.subject);
      active.setBody(out.body);
      setInstruction("");
      setNote(
        out.fallback
          ? { tone: "warn", text: "The assistant was unavailable, so this is the wording currently in force. Edit it and save." }
          : { tone: "ok", text: "Drafted. Edit anything you want, then save." },
      );
    } catch (err) {
      setNote({ tone: "bad", text: err instanceof Error ? err.message : "The draft could not be generated." });
    }
  }

  async function sendTest() {
    if (!active) return;
    setNote(null);
    try {
      const out = await tester.mutateAsync({
        channel: active.channel,
        subject: active.subject || null,
        body: active.body,
        to: testTo.trim() || null,
      });
      setNote(
        out.ok
          ? { tone: "ok", text: `Test ${active.channel === "sms" ? "text" : "email"} sent to ${out.to}.` }
          : { tone: "warn", text: out.detail || "The test could not be sent." },
      );
      if (out.ok) setTestOpen(false);
    } catch (err) {
      setNote({ tone: "bad", text: err instanceof Error ? err.message : "The test could not be sent." });
    }
  }

  if (!active) return null;

  return (
    <div className="bkmsg">
      <aside className="bkmsg-rail" aria-label="Client messages">
        {groups.map(({ group, items }) => (
          <div key={group} className="bkmsg-group">
            <div className="bkmsg-grouphd">
              <span>{group}</span>
              {group === "Reminders" && canEdit ? (
                <span className="bkmsg-add">
                  <button type="button" onClick={() => addReminder("email")} disabled={emailMinutes.length >= 5}>
                    + Email
                  </button>
                  <button type="button" onClick={() => addReminder("sms")} disabled={smsMinutes.length >= 5}>
                    + Text
                  </button>
                </span>
              ) : null}
            </div>
            {items.map((slot) => (
              <button
                key={slot.id}
                type="button"
                className={cx("bkmsg-item", slot.id === active.id && "on")}
                onClick={() => { setSelected(slot.id); setTestOpen(false); setNote(null); }}
              >
                <span className={cx("bkmsg-ch", slot.channel)}>
                  <Icon name={slot.channel === "sms" ? "chat" : "mail"} size={12} />
                </span>
                <span className="bkmsg-item-b">
                  <b>{slot.label}</b>
                  <small>{slot.when}</small>
                </span>
                {slot.authored ? <span className="bkmsg-dot" title="You have written this one" /> : null}
              </button>
            ))}
          </div>
        ))}
      </aside>

      <div className="bkmsg-editor">
        <header className="bkmsg-hd">
          <div>
            <Row>
              <h4>{active.label}</h4>
              <CellChip tone={active.channel === "sms" ? "acc" : "mut"}>{active.channel === "sms" ? "Text" : "Email"}</CellChip>
              <CellChip tone={active.authored ? "ok" : "mut"}>{active.authored ? "Your wording" : "Using the default"}</CellChip>
            </Row>
            <div className="sub">{active.when}{active.hint ? ` · ${active.hint}` : ""}</div>
          </div>
          {active.minutes !== undefined && canEdit ? (
            <Row>
              <Select
                value={String(active.minutes)}
                onChange={(e) => retime(active.channel, active.minutes!, Number(e.target.value))}
                aria-label="When this reminder sends"
              >
                {REMINDER_TIMES.map((t) => (
                  <option
                    key={t.value}
                    value={t.value}
                    disabled={(active.channel === "email" ? emailMinutes : smsMinutes).includes(t.value) && t.value !== active.minutes}
                  >
                    {t.label}
                  </option>
                ))}
              </Select>
              <Btn onClick={() => removeReminder(active.channel, active.minutes!)}>Remove</Btn>
            </Row>
          ) : null}
        </header>

        {note ? <StatusLine tone={note.tone === "ok" ? "ok" : note.tone === "bad" ? "bad" : "warn"}>{note.text}</StatusLine> : null}

        {active.setSubject ? (
          <label className="bkmsg-field">
            <span className="lbl">Subject</span>
            <Input
              value={active.subject ?? ""}
              onChange={(e) => active.setSubject?.(e.target.value)}
              placeholder="Leave blank to use the default"
              disabled={!canEdit}
            />
          </label>
        ) : null}

        <label className="bkmsg-field">
          <span className="lbl">{active.channel === "sms" ? "Message" : "Body"}</span>
          {/* The design-system Textarea does not forward a ref, and inserting a
              placeholder at the cursor needs one. This is the same element it wraps. */}
          <textarea
            ref={bodyRef}
            className="field"
            rows={active.channel === "sms" ? 4 : 12}
            value={active.body}
            onChange={(e) => active.setBody(e.target.value)}
            placeholder="Leave blank to use the default wording"
            disabled={!canEdit}
            maxLength={active.channel === "sms" ? 400 : 4000}
          />
        </label>

        {active.channel === "sms" ? (
          <div className="sub">
            {active.body.length}/320 characters. The opt-out line is added for you, and texts only go to clients who
            consented.
          </div>
        ) : null}

        <div className="bkmsg-tokens">
          <span className="lbl">Insert</span>
          {usable.map((p) => (
            <button key={p.token} type="button" className="bkmsg-token" onClick={() => insert(p.token)} title={p.description} disabled={!canEdit}>
              {p.token}
            </button>
          ))}
          {placeholdersQ.isError ? <span className="sub">Placeholder list unavailable.</span> : null}
        </div>

        <div className="bkmsg-actions">
          <Input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Tell the assistant what this one should say (optional)"
            disabled={!canEdit}
          />
          <Btn variant="pri" onClick={draftWithAI} disabled={!canEdit || drafter.isPending}>
            <Icon name="spark" size={13} /> {drafter.isPending ? "Drafting..." : "Draft with AI"}
          </Btn>
          <Btn onClick={() => { setTestOpen((v) => !v); setNote(null); }}>
            <Icon name="mail" size={13} /> Send me a test
          </Btn>
        </div>

        {testOpen ? (
          <div className="bkmsg-test">
            <Input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder={active.channel === "sms" ? "Mobile number for the test" : "Leave blank to send to yourself"}
            />
            <Btn variant="pri" onClick={sendTest} disabled={tester.isPending || !active.body.trim()}>
              {tester.isPending ? "Sending..." : "Send test"}
            </Btn>
            <span className="sub">
              {active.channel === "sms"
                ? "Texts are sent through the live provider, so a test uses real delivery."
                : "Sent from your firm address, marked as a test."}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
