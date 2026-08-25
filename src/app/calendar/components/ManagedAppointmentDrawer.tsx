"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Btn, CellChip, Field, Input, Panel, Select, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useAuthedApi } from "@/hooks/useApi";
import { outcomeLabel, type RepAppointment, type RepAppointmentOutcome } from "@/lib/repAppointments";

export type ManagedAppointmentMode = "details" | "edit" | "reschedule" | "outcome" | "cancel";

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function resultTone(status: string | null): "ok" | "warn" | "bad" | "mut" {
  if (!status) return "mut";
  if (["sent", "connected", "scheduled"].includes(status)) return "ok";
  if (["failed", "provider_unavailable"].includes(status)) return "bad";
  return "warn";
}

export function ManagedAppointmentDrawer({
  appointment,
  mode,
  canSetOutcome,
  onClose,
}: {
  appointment: RepAppointment | null;
  mode: ManagedAppointmentMode;
  canSetOutcome: boolean;
  onClose: () => void;
}) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  const [title, setTitle] = useState(appointment?.title ?? "");
  const [kind, setKind] = useState(appointment?.kind ?? "callback");
  const [startsAt, setStartsAt] = useState(appointment ? toLocalInput(appointment.starts_at) : "");
  const [duration, setDuration] = useState(String(appointment?.duration_min ?? 20));
  const [timezone, setTimezone] = useState(appointment?.timezone ?? "America/New_York");
  const [name, setName] = useState(appointment?.invitee_name ?? "");
  const [email, setEmail] = useState(appointment?.invitee_email ?? "");
  const [phone, setPhone] = useState(appointment?.invitee_phone ?? "");
  const [company, setCompany] = useState(appointment?.company ?? "");
  const [program, setProgram] = useState(appointment?.program_name ?? "");
  const [amount, setAmount] = useState(appointment?.requested_amount ?? "");
  const [address, setAddress] = useState(appointment?.full_address ?? "");
  const [notes, setNotes] = useState(appointment?.notes ?? "");
  const [joinUrl, setJoinUrl] = useState(appointment?.join_url ?? "");
  const [outcome, setOutcome] = useState<RepAppointmentOutcome>(appointment?.outcome ?? "not_converted");
  const [outcomeNote, setOutcomeNote] = useState(appointment?.outcome_note ?? "");
  const [destination, setDestination] = useState<"field_desk" | "ai_intake">("field_desk");
  const [variant, setVariant] = useState<"dealer" | "real_estate">("dealer");
  const [notifyClient, setNotifyClient] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [confirmOutcomeReopen, setConfirmOutcomeReopen] = useState(false);

  useEffect(() => {
    if (!appointment) return;
    setTitle(appointment.title);
    setKind(appointment.kind);
    setStartsAt(toLocalInput(appointment.starts_at));
    setDuration(String(appointment.duration_min));
    setTimezone(appointment.timezone);
    setName(appointment.invitee_name);
    setEmail(appointment.invitee_email ?? "");
    setPhone(appointment.invitee_phone ?? "");
    setCompany(appointment.company ?? "");
    setProgram(appointment.program_name ?? "");
    setAmount(appointment.requested_amount ?? "");
    setAddress(appointment.full_address ?? "");
    setNotes(appointment.notes ?? "");
    setJoinUrl(appointment.join_url ?? "");
    setOutcome(appointment.outcome ?? "not_converted");
    setOutcomeNote(appointment.outcome_note ?? "");
    setConfirmOutcomeReopen(false);
  }, [appointment]);

  const rescheduleChanges = Boolean(
    appointment && (startsAt !== toLocalInput(appointment.starts_at) || Number(duration) !== appointment.duration_min),
  );
  const outcomeWillReopen = Boolean(
    rescheduleChanges && appointment?.outcome && ["not_converted", "did_not_show"].includes(appointment.outcome),
  );

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["rep-appointments-admin"] });
    await qc.invalidateQueries({ queryKey: ["calendar"] });
  };

  const update = useMutation({
    mutationFn: () => apiCall<RepAppointment>(`/dealer-os/appointments/${appointment?.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: title.trim(), kind, starts_at: new Date(startsAt).toISOString(), duration_min: Number(duration), timezone,
        invitee_name: name.trim(), invitee_email: email.trim() || null, invitee_phone: phone.trim() || null,
        company: company.trim() || null, program_name: program.trim() || null, requested_amount: amount.trim() || null,
        full_address: address.trim() || null, notes: notes.trim() || null, join_url: joinUrl.trim() || null,
        reopen_outcome: outcomeWillReopen ? confirmOutcomeReopen : false,
      }),
    }),
    onSuccess: async () => { await refresh(); onClose(); },
  });

  const cancel = useMutation({
    mutationFn: () => apiCall<RepAppointment>(`/dealer-os/appointments/${appointment?.id}/cancel`, {
      method: "POST", body: JSON.stringify({ reason: cancelReason.trim() || null }),
    }),
    onSuccess: async () => { await refresh(); onClose(); },
  });

  const saveOutcome = useMutation({
    mutationFn: () => apiCall<RepAppointment>(`/dealer-os/appointments/${appointment?.id}/outcome`, {
      method: "PATCH",
      body: JSON.stringify({
        outcome,
        note: outcomeNote.trim() || null,
        conversion_target: outcome === "converted" ? destination : null,
        ai_variant: outcome === "converted" && destination === "ai_intake" ? variant : null,
        notify_client: outcome === "converted" && destination === "ai_intake" ? notifyClient : false,
      }),
    }),
    onSuccess: async () => { await refresh(); onClose(); },
  });

  const canSave = useMemo(
    () => Boolean(title.trim() && startsAt && name.trim() && (email.trim() || phone.trim()) && Number(duration) >= 15 && (!outcomeWillReopen || confirmOutcomeReopen)),
    [confirmOutcomeReopen, duration, email, name, outcomeWillReopen, phone, startsAt, title],
  );
  if (!appointment) return null;

  if (mode === "details") {
    const statuses = [
      ["Google", appointment.google_sync_status], ["Email confirmation", appointment.confirmation_email_status],
      ["Email reminder", appointment.email_reminder_status], ["SMS confirmation", appointment.confirmation_sms_status],
      ["SMS reminder", appointment.sms_reminder_status],
      ["Rep notification", appointment.rep_notification_status],
      ["Rep reminder", appointment.rep_reminder_status],
    ] as const;
    return (
      <Drawer open onClose={onClose} title="Appointment details" sub={`${new Date(appointment.starts_at).toLocaleString()} · ${appointment.duration_min} minutes`} width="lg">
        <div className="grid">
          <Panel title={appointment.title} actions={<CellChip tone={appointment.status === "cancelled" ? "bad" : "ok"}>{appointment.status}</CellChip>}>
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
              <Detail label="Client" value={appointment.invitee_name} />
              <Detail label="Contact" value={[appointment.invitee_email, appointment.invitee_phone].filter(Boolean).join(" · ")} />
              <Detail label="Company" value={appointment.company} />
              <Detail label="Program / amount" value={[appointment.program_name, appointment.requested_amount].filter(Boolean).join(" · ")} />
              <Detail label="Address" value={appointment.full_address} />
              <Detail label="Timezone" value={appointment.timezone} />
            </div>
            {appointment.notes ? <div className="mt"><Detail label="Notes" value={appointment.notes} /></div> : null}
            {appointment.outcome ? <div className="mt"><CellChip tone={appointment.outcome === "converted" ? "ok" : appointment.outcome === "not_converted" ? "bad" : "warn"}>{outcomeLabel(appointment.outcome)}</CellChip></div> : null}
          </Panel>
          <Panel title="Delivery and reminders">
            <div className="row" style={{ flexWrap: "wrap" }}>{statuses.filter((row) => row[1]).map(([label, status]) => <CellChip key={label} tone={resultTone(status)}>{label}: {status?.replaceAll("_", " ")}</CellChip>)}</div>
            {appointment.delivery_error ? <StatusError text={appointment.delivery_error} /> : null}
          </Panel>
          <div className="row">
            {appointment.join_url ? <a className="btn pri" href={appointment.join_url} target="_blank" rel="noreferrer">Join meeting</a> : null}
            {appointment.dealer_id ? <a className="btn" href={`https://rep.qualifiedcommercial.com/applications/${appointment.dealer_id}`}>Open Field Desk file</a> : null}
            {appointment.converted_intake_id ? <Link className="btn" href={`/admin/ai-underwriter-leads?intake=${appointment.converted_intake_id}`}>Open AI intake</Link> : null}
          </div>
        </div>
      </Drawer>
    );
  }

  if (mode === "cancel") {
    return (
      <Drawer open onClose={onClose} title="Cancel and archive" sub="The appointment disappears from active calendars, but its audit, delivery, and conversion history remain." width="md" footer={<><Btn onClick={onClose}>Keep appointment</Btn><span className="sp"/><Btn className="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>{cancel.isPending ? "Cancelling..." : "Cancel and archive"}</Btn></>}>
        <Field label="Cancellation reason"><Textarea rows={5} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Optional internal reason" /></Field>
        {cancel.isError ? <StatusError text={errorText(cancel.error)} /> : null}
      </Drawer>
    );
  }

  if (mode === "outcome") {
    return (
      <Drawer open onClose={onClose} title="Set appointment outcome" sub="Outcome colors synchronize to this calendar and Franco's Google Calendar." width="md" footer={<><Btn onClick={onClose}>Cancel</Btn><span className="sp"/><Btn variant="pri" onClick={() => saveOutcome.mutate()} disabled={!canSetOutcome || saveOutcome.isPending}>{saveOutcome.isPending ? "Saving..." : "Save outcome"}</Btn></>}>
        <div className="grid">
          <Field label="Outcome" req><Select value={outcome} onChange={(event) => setOutcome(event.target.value as RepAppointmentOutcome)}><option value="not_converted">Not converted</option><option value="did_not_show">Did not show</option><option value="converted">Converted</option></Select></Field>
          <Field label="Outcome note"><Textarea rows={4} value={outcomeNote} onChange={(event) => setOutcomeNote(event.target.value)} /></Field>
          {outcome === "converted" ? <Panel title="Conversion destination" sub="A converted appointment can create only one destination.">
            <div className="grid">
              <Field label="Destination"><Select value={destination} onChange={(event) => setDestination(event.target.value as typeof destination)}><option value="field_desk">Field Desk draft</option><option value="ai_intake">AI intake</option></Select></Field>
              {destination === "ai_intake" ? <><Field label="AI intake type"><Select value={variant} onChange={(event) => setVariant(event.target.value as typeof variant)}><option value="dealer">Dealer</option><option value="real_estate">Real estate</option></Select></Field><label className="row"><input type="checkbox" checked={notifyClient} onChange={(event) => setNotifyClient(event.target.checked)} />Notify client with secure access instructions</label></> : null}
            </div>
          </Panel> : null}
          {saveOutcome.isError ? <StatusError text={errorText(saveOutcome.error)} /> : null}
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer open onClose={onClose} title={mode === "reschedule" ? "Reschedule appointment" : "Edit appointment"} sub="Changes synchronize to the client, originating rep, local calendar, and Franco's Google Calendar." width="lg" footer={<><Btn onClick={onClose}>Cancel</Btn><span className="sp"/><Btn variant="pri" onClick={() => update.mutate()} disabled={!canSave || update.isPending}>{update.isPending ? "Synchronizing..." : "Save and synchronize"}</Btn></>}>
      <div className="grid">
        <Panel title="Meeting">
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
            <Field label="Title" req><Input value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
            <Field label="Type"><Select value={kind} onChange={(event) => setKind(event.target.value)}><option value="callback">Callback</option><option value="program_intro">Program intro</option><option value="underwriting_review">Underwriting review</option></Select></Field>
            <Field label="Date and time" req><Input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></Field>
            <Field label="Duration"><Select value={duration} onChange={(event) => setDuration(event.target.value)}>{[15,20,25,30,45,60,90].map((value) => <option key={value} value={value}>{value} minutes</option>)}</Select></Field>
            <Field label="Timezone"><Input value={timezone} onChange={(event) => setTimezone(event.target.value)} /></Field>
          </div>
          <div className="sub mt">Rescheduling uses live Franco FreeBusy and buffer validation. The current event is excluded from its own conflict check.</div>
          {outcomeWillReopen ? (
            <label className="warnline row mt">
              <input type="checkbox" checked={confirmOutcomeReopen} onChange={(event) => setConfirmOutcomeReopen(event.target.checked)} />
              Confirm that this reschedule reopens the {outcomeLabel(appointment.outcome)?.toLowerCase()} outcome.
            </label>
          ) : null}
        </Panel>
        <Panel title="Client and funding context">
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
            <Field label="Client name" req><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
            <Field label="Email"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
            <Field label="Phone"><Input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>
            <Field label="Company"><Input value={company} onChange={(event) => setCompany(event.target.value)} /></Field>
            <Field label="Program"><Input value={program} onChange={(event) => setProgram(event.target.value)} /></Field>
            <Field label="Requested amount"><Input value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
          </div>
          <div className="grid mt"><Field label="Full address"><Input value={address} onChange={(event) => setAddress(event.target.value)} /></Field><Field label="Notes"><Textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field><Field label="Join link"><Input type="url" value={joinUrl} onChange={(event) => setJoinUrl(event.target.value)} /></Field></div>
        </Panel>
        {update.isError ? <StatusError text={errorText(update.error)} /> : null}
      </div>
    </Drawer>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><div className="lbl">{label}</div><div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{value || "Not provided"}</div></div>;
}

function StatusError({ text }: { text: string }) {
  return <div className="warnline" style={{ color: "var(--danger)" }}>{text}</div>;
}

function errorText(error: unknown): string {
  if (error && typeof error === "object" && "body" in error) {
    const body = (error as { body?: { detail?: unknown } }).body;
    if (typeof body?.detail === "string") return body.detail;
  }
  return error instanceof Error ? error.message : "The appointment action could not be completed.";
}
