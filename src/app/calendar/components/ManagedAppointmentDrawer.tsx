"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn, CellChip, Field, Input, Panel, Select, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { AddressInput, formatAddressParts } from "@/components/property/GoogleAddressInput";
import { ProgramSelect } from "@/components/calendar/ProgramSelect";
import { useAuthedApi } from "@/hooks/useApi";
import {
  appointmentCrmLabel,
  appointmentRsvpLabel,
  appointmentRsvpTone,
  outcomeLabel,
  type AppointmentApplicationStartResult,
  type AppointmentCrmStatus,
  type AppointmentWorkspace,
  type RepAppointment,
  type RepAppointmentOutcome,
} from "@/lib/repAppointments";

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
  onModeChange,
  onClose,
}: {
  appointment: RepAppointment | null;
  mode: ManagedAppointmentMode;
  canSetOutcome: boolean;
  onModeChange?: (mode: ManagedAppointmentMode) => void;
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
  const [programKey, setProgramKey] = useState(appointment?.program_key ?? "general_funding_discussion");
  const [program, setProgram] = useState(appointment?.program_name ?? "");
  const [amount, setAmount] = useState(appointment?.requested_amount ?? "");
  const [address, setAddress] = useState(appointment?.full_address ?? "");
  const [notes, setNotes] = useState(appointment?.notes ?? "");
  const [joinUrl, setJoinUrl] = useState(appointment?.join_url ?? "");
  const [outcome, setOutcome] = useState<RepAppointmentOutcome>(appointment?.outcome ?? "not_converted");
  const [outcomeNote, setOutcomeNote] = useState(appointment?.outcome_note ?? "");
  const [destination, setDestination] = useState<"field_desk" | "ai_intake">("field_desk");
  const [variant, setVariant] = useState<IntakeVariant>("dealer");
  const [legacyRoomPin, setLegacyRoomPin] = useState("");
  const [legacyRoomPinConfirm, setLegacyRoomPinConfirm] = useState("");
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
    setProgramKey(appointment.program_key ?? "general_funding_discussion");
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
        company: company.trim() || null, program_key: programKey, program_name: program.trim() || null,
        requested_amount: amount.trim() || null,
        full_address: address.trim() || null, notes: notes.trim() || null, join_url: joinUrl.trim() || null,
        reopen_outcome: outcomeWillReopen ? confirmOutcomeReopen : false,
      }),
    }),
    onSuccess: async () => { await refresh(); onClose(); },
  });

  const cancel = useMutation({
    mutationFn: () => apiCall<RepAppointment>(`/dealer-os/appointments/${appointment?.id}/cancel`, {
      method: "POST", body: JSON.stringify({ reason: cancelReason.trim() }),
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
        secure_room_pin: outcome === "converted" && destination === "ai_intake" ? legacyRoomPin : null,
        notify_client: outcome === "converted" && destination === "ai_intake" ? notifyClient : false,
      }),
    }),
    onSuccess: async () => { await refresh(); onClose(); },
  });

  const canSave = useMemo(
    () => Boolean(title.trim() && startsAt && name.trim() && (email.trim() || phone.trim()) && Number(duration) >= 15 && (!outcomeWillReopen || confirmOutcomeReopen)),
    [confirmOutcomeReopen, duration, email, name, outcomeWillReopen, phone, startsAt, title],
  );
  const legacyOutcomeReady = outcome !== "converted"
    || destination !== "ai_intake"
    || (/^\d{6}$/.test(legacyRoomPin) && legacyRoomPin === legacyRoomPinConfirm);
  if (!appointment) return null;

  if (mode === "details") {
    return (
      <AppointmentWorkspaceDrawer
        appointment={appointment}
        onClose={onClose}
        onModeChange={onModeChange}
        onRefresh={refresh}
      />
    );
  }

  if (mode === "cancel") {
    return (
      <Drawer open onClose={onClose} title="Cancel and archive" sub="The appointment disappears from active calendars, but its audit, delivery, and conversion history remain." width="md" footer={<><Btn onClick={onClose}>Keep appointment</Btn><span className="sp"/><Btn className="danger" onClick={() => cancel.mutate()} disabled={!cancelReason.trim() || cancel.isPending}>{cancel.isPending ? "Cancelling..." : "Cancel and archive"}</Btn></>}>
        <Field label="Cancellation reason" req><Textarea rows={5} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Record why this appointment is being cancelled" /></Field>
        {cancel.isError ? <StatusError text={errorText(cancel.error)} /> : null}
      </Drawer>
    );
  }

  if (mode === "outcome") {
    return (
      <Drawer open onClose={onClose} title="Set appointment outcome" sub="Outcome colors synchronize to this calendar and Franco's Google Calendar." width="md" footer={<><Btn onClick={onClose}>Cancel</Btn><span className="sp"/><Btn variant="pri" onClick={() => saveOutcome.mutate()} disabled={!canSetOutcome || !legacyOutcomeReady || saveOutcome.isPending}>{saveOutcome.isPending ? "Saving..." : "Save outcome"}</Btn></>}>
        <div className="grid">
          <Field label="Outcome" req><Select value={outcome} onChange={(event) => setOutcome(event.target.value as RepAppointmentOutcome)}><option value="not_converted">Not converted</option><option value="did_not_show">Did not show</option><option value="converted">Converted</option></Select></Field>
          <Field label="Outcome note"><Textarea rows={4} value={outcomeNote} onChange={(event) => setOutcomeNote(event.target.value)} /></Field>
          {outcome === "converted" ? <Panel title="Conversion destination" sub="A converted appointment can create only one destination.">
            <div className="grid">
              <Field label="Destination"><Select value={destination} onChange={(event) => setDestination(event.target.value as typeof destination)}><option value="field_desk">Field Desk draft</option><option value="ai_intake">AI intake</option></Select></Field>
              {destination === "ai_intake" ? <>
                <Field label="AI intake type"><Select value={variant} onChange={(event) => setVariant(event.target.value as IntakeVariant)}><option value="dealer">Dealer</option><option value="real_estate">Real estate</option><option value="main_street">Main Street</option><option value="mca_refinance">MCA refinance</option></Select></Field>
                <div className="appointment-workspace-pin-grid"><Field label="Six-digit room PIN" req><Input inputMode="numeric" maxLength={6} value={legacyRoomPin} onChange={(event) => setLegacyRoomPin(event.target.value.replace(/\D/g, "").slice(0, 6))} /></Field><Field label="Confirm PIN" req><Input inputMode="numeric" maxLength={6} value={legacyRoomPinConfirm} onChange={(event) => setLegacyRoomPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 6))} /></Field></div>
                {legacyRoomPinConfirm && legacyRoomPin !== legacyRoomPinConfirm ? <StatusError text="The room PIN entries do not match." /> : null}
                <label className="row"><input type="checkbox" checked={notifyClient} onChange={(event) => setNotifyClient(event.target.checked)} />Notify client with secure access instructions</label>
              </> : null}
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
            <Field label="Program"><ProgramSelect programKey={programKey} programName={program} onChange={(next) => { setProgramKey(next.key); setProgram(next.name); }} /></Field>
            <Field label="Requested amount"><Input value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
          </div>
          <div className="grid mt"><AddressInput label="Full address" value={address ? { full: address } : null} onChange={(next) => setAddress(formatAddressParts(next))} /><Field label="Notes"><Textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field><Field label="Join link"><Input type="url" value={joinUrl} onChange={(event) => setJoinUrl(event.target.value)} /></Field></div>
        </Panel>
        {update.isError ? <StatusError text={errorText(update.error)} /> : null}
      </div>
    </Drawer>
  );
}

type AppointmentWorkspaceTab = "overview" | "crm" | "application" | "delivery";
type IntakeVariant = "dealer" | "real_estate" | "main_street" | "mca_refinance";

const CRM_STATUSES: AppointmentCrmStatus[] = [
  "scheduled",
  "confirmed",
  "completed",
  "follow_up",
  "no_show",
  "not_qualified",
  "converted",
  "cancelled",
];

function AppointmentWorkspaceDrawer({
  appointment,
  onClose,
  onModeChange,
  onRefresh,
}: {
  appointment: RepAppointment;
  onClose: () => void;
  onModeChange?: (mode: ManagedAppointmentMode) => void;
  onRefresh: () => Promise<void>;
}) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  const queryKey = ["appointment-workspace", appointment.id] as const;
  const [tab, setTab] = useState<AppointmentWorkspaceTab>("overview");
  const [crmStatus, setCrmStatus] = useState<AppointmentCrmStatus>(appointment.crm_status ?? "scheduled");
  const [followUpAt, setFollowUpAt] = useState(appointment.follow_up_at ? toLocalInput(appointment.follow_up_at) : "");
  const [crmReason, setCrmReason] = useState("");
  const [confirmCrmChange, setConfirmCrmChange] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [variant, setVariant] = useState<IntakeVariant>("dealer");
  const [existingIntakeId, setExistingIntakeId] = useState("");
  const [roomPin, setRoomPin] = useState("");
  const [roomPinConfirm, setRoomPinConfirm] = useState("");
  const [notifyClient, setNotifyClient] = useState(false);
  const [confirmApplication, setConfirmApplication] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  const workspaceQuery = useQuery({
    queryKey,
    queryFn: () => apiCall<AppointmentWorkspace>(`/dealer-os/appointments/${appointment.id}/workspace`),
  });
  const workspace = workspaceQuery.data;
  const active = workspace?.appointment ?? appointment;

  useEffect(() => {
    setCrmStatus(active.crm_status ?? "scheduled");
    setFollowUpAt(active.follow_up_at ? toLocalInput(active.follow_up_at) : "");
  }, [active.crm_status, active.follow_up_at]);

  const refreshWorkspace = async (next?: AppointmentWorkspace) => {
    if (next) qc.setQueryData(queryKey, next);
    else await workspaceQuery.refetch();
    await onRefresh();
  };

  const crmMutation = useMutation({
    mutationFn: () => apiCall<AppointmentWorkspace>(`/dealer-os/appointments/${appointment.id}/crm`, {
      method: "PATCH",
      body: JSON.stringify({
        status: crmStatus,
        follow_up_at: crmStatus === "follow_up" && followUpAt ? new Date(followUpAt).toISOString() : null,
        reason: crmReason.trim() || null,
        confirm_terminal: confirmCrmChange,
      }),
    }),
    onSuccess: async (next) => {
      setCrmReason("");
      setConfirmCrmChange(false);
      setNotice({ tone: "ok", text: `CRM stage changed to ${appointmentCrmLabel(next.appointment.crm_status)}.` });
      await refreshWorkspace(next);
    },
  });

  const noteMutation = useMutation({
    mutationFn: () => apiCall(`/dealer-os/appointments/${appointment.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ body: noteBody.trim() }),
    }),
    onSuccess: async () => {
      setNoteBody("");
      setNotice({ tone: "ok", text: "Internal note added to the appointment activity." });
      await refreshWorkspace();
    },
  });

  const startApplication = useMutation({
    mutationFn: () => apiCall<AppointmentApplicationStartResult>(
      `/dealer-os/appointments/${appointment.id}/start-application`,
      {
        method: "POST",
        body: JSON.stringify({
          variant,
          secure_room_pin: existingIntakeId ? null : roomPin,
          notify_client: notifyClient,
          existing_intake_id: existingIntakeId || null,
        }),
      },
    ),
    onSuccess: async (result) => {
      setNotice({
        tone: result.room_delivery_status === "failed" ? "warn" : "ok",
        text: result.linked_existing
          ? "Existing application linked. Opening underwriting."
          : result.room_delivery_status === "failed"
            ? `Application created, but the optional client email failed: ${result.room_delivery_detail || "provider error"}`
            : "Application created. Opening underwriting.",
      });
      await refreshWorkspace();
      window.location.assign(result.href);
    },
  });

  const retryDelivery = useMutation({
    mutationFn: (action: "email_confirmation" | "sms_confirmation") => apiCall<{
      action: string;
      status: string;
      detail: string | null;
    }>(`/dealer-os/appointments/${appointment.id}/delivery/retry`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
    onSuccess: async (result) => {
      setNotice({
        tone: result.status === "sent" ? "ok" : "warn",
        text: `${humanizeStatus(result.action)}: ${humanizeStatus(result.status)}${result.detail ? ` - ${result.detail}` : ""}`,
      });
      await refreshWorkspace();
    },
  });

  const applicationHref = workspace?.application
    ? `/admin/ai-underwriter-leads?lead=${workspace.application.intake_id}&view=underwriting`
    : null;
  const selectedCandidate = workspace?.application_candidates.find((row) => row.intake_id === existingIntakeId) ?? null;
  const reopeningNotQualified = active.crm_status === "not_qualified" && crmStatus !== active.crm_status;
  const requiresCrmConfirmation = crmStatus === "not_qualified"
    || crmStatus === "cancelled"
    || reopeningNotQualified;
  const crmReady = crmStatus !== "follow_up" || Boolean(followUpAt);
  const terminalReady = !requiresCrmConfirmation || (confirmCrmChange && Boolean(crmReason.trim()));
  const pinReady = Boolean(existingIntakeId) || (/^\d{6}$/.test(roomPin) && roomPin === roomPinConfirm);
  const canStart = Boolean(
    workspace?.capabilities.can_start_application
    && active.invitee_email
    && confirmApplication
    && pinReady,
  );
  const headerActions = (
    <>
      {active.join_url ? (
        <a className="btn pri" href={active.join_url} target="_blank" rel="noreferrer">Join meeting</a>
      ) : (
        <Btn variant="pri" disabled title="No meeting link is stored for this appointment">Join meeting</Btn>
      )}
      {workspace?.capabilities.can_edit && onModeChange ? <Btn onClick={() => onModeChange("edit")}>Edit</Btn> : null}
      {workspace?.capabilities.can_edit && onModeChange ? <Btn onClick={() => onModeChange("reschedule")}>Reschedule</Btn> : null}
      {applicationHref ? <Link className="btn" href={applicationHref}>Open application</Link> : null}
    </>
  );

  return (
    <Drawer
      open
      onClose={onClose}
      fullscreen
      title={active.title}
      sub={`${new Date(active.starts_at).toLocaleString()} · ${active.duration_min} minutes · ${active.invitee_name}`}
      headerActions={headerActions}
      bodyClass="appointment-workspace-body"
      bodyStyle={{ padding: 0 }}
      ariaLabel={`Appointment workspace for ${active.invitee_name}`}
    >
      <div className="appointment-workspace">
        <div className="appointment-workspace-tabs" role="tablist" aria-label="Appointment workspace">
          {(["overview", "crm", "application", "delivery"] as AppointmentWorkspaceTab[]).map((value) => (
            <button
              type="button"
              key={value}
              className={tab === value ? "on" : ""}
              onClick={() => setTab(value)}
              role="tab"
              aria-selected={tab === value}
            >
              {value === "crm" ? "CRM" : value[0].toUpperCase() + value.slice(1)}
              {value === "crm" ? <span>{appointmentCrmLabel(active.crm_status)}</span> : null}
            </button>
          ))}
        </div>

        {notice ? <div className={`appointment-workspace-notice ${notice.tone}`}>{notice.text}</div> : null}
        {workspaceQuery.isLoading ? <div className="appointment-workspace-loading">Loading appointment workspace...</div> : null}
        {workspaceQuery.isError ? <StatusError text={errorText(workspaceQuery.error)} /> : null}

        {!workspaceQuery.isLoading && tab === "overview" ? (
          <section className="appointment-workspace-section" aria-labelledby="appointment-overview-heading">
            <div className="appointment-workspace-section-head">
              <div>
                <div className="lbl">Overview</div>
                <h3 id="appointment-overview-heading">Meeting and client context</h3>
              </div>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <CellChip tone={appointmentRsvpTone(active)}>{appointmentRsvpLabel(active)}</CellChip>
                <CellChip tone={crmTone(active.crm_status)}>{appointmentCrmLabel(active.crm_status)}</CellChip>
              </div>
            </div>
            <div className="appointment-workspace-info-grid">
              <Detail label="Client" value={active.invitee_name} />
              <Detail label="Company" value={active.company} />
              <Detail label="Email" value={active.invitee_email} />
              <Detail label="Phone" value={active.invitee_phone} />
              <Detail label="Program" value={active.program_name} />
              <Detail label="Requested amount" value={active.requested_amount} />
              <Detail label="Address" value={active.full_address} />
              <Detail label="Timezone" value={active.timezone} />
            </div>
            <div className="appointment-workspace-band">
              <Detail label="Booking notes" value={active.notes} />
            </div>
            <div className="appointment-workspace-actions">
              {onModeChange && workspace?.capabilities.can_edit ? <Btn onClick={() => onModeChange("edit")}>Edit appointment</Btn> : null}
              {onModeChange && workspace?.capabilities.can_edit ? <Btn onClick={() => onModeChange("reschedule")}>Reschedule</Btn> : null}
              {active.dealer_id ? <a className="btn" href={`https://rep.qualifiedcommercial.com/applications/${active.dealer_id}`}>Open Field Desk file</a> : null}
            </div>
          </section>
        ) : null}

        {!workspaceQuery.isLoading && tab === "crm" ? (
          <section className="appointment-workspace-section" aria-labelledby="appointment-crm-heading">
            <div className="appointment-workspace-section-head">
              <div>
                <div className="lbl">CRM</div>
                <h3 id="appointment-crm-heading">Stage, follow-up, and internal activity</h3>
              </div>
              <CellChip tone={crmTone(active.crm_status)}>{appointmentCrmLabel(active.crm_status)}</CellChip>
            </div>
            <div className="appointment-workspace-split">
              <div className="appointment-workspace-form">
                <Field label="CRM stage" req>
                  <Select
                    value={crmStatus}
                    onChange={(event) => {
                      setCrmStatus(event.target.value as AppointmentCrmStatus);
                      setConfirmCrmChange(false);
                    }}
                    disabled={!workspace?.capabilities.can_manage_crm || active.crm_status === "converted" || active.crm_status === "cancelled"}
                  >
                    {CRM_STATUSES.filter((value) => value !== "converted").map((value) => (
                      <option key={value} value={value}>{appointmentCrmLabel(value)}</option>
                    ))}
                  </Select>
                </Field>
                {crmStatus === "follow_up" ? (
                  <Field label="Follow-up date and time" req>
                    <Input type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} />
                  </Field>
                ) : null}
                {requiresCrmConfirmation ? (
                  <>
                    <Field label={active.crm_status === "not_qualified" && crmStatus !== "not_qualified" ? "Reopen reason" : "Status reason"} req>
                      <Textarea rows={4} value={crmReason} onChange={(event) => setCrmReason(event.target.value)} />
                    </Field>
                    <label className="row appointment-workspace-confirm">
                      <input type="checkbox" checked={confirmCrmChange} onChange={(event) => setConfirmCrmChange(event.target.checked)} />
                      Confirm this reviewed status change and preserve the existing history.
                    </label>
                  </>
                ) : (
                  <Field label="Internal reason or context">
                    <Textarea rows={3} value={crmReason} onChange={(event) => setCrmReason(event.target.value)} placeholder="Optional context for the audit history" />
                  </Field>
                )}
                <Btn
                  variant="pri"
                  onClick={() => crmMutation.mutate()}
                  disabled={!workspace?.capabilities.can_manage_crm || !crmReady || !terminalReady || crmMutation.isPending || crmStatus === active.crm_status && (crmStatus !== "follow_up" || followUpAt === (active.follow_up_at ? toLocalInput(active.follow_up_at) : ""))}
                >
                  {crmMutation.isPending ? "Saving..." : "Save CRM stage"}
                </Btn>
                {crmMutation.isError ? <StatusError text={errorText(crmMutation.error)} /> : null}

                <div className="appointment-workspace-divider" />
                <Field label="Add internal note">
                  <Textarea aria-label="Internal note" rows={5} value={noteBody} onChange={(event) => setNoteBody(event.target.value)} placeholder="Meeting notes, follow-up context, or underwriting handoff" />
                </Field>
                <Btn onClick={() => noteMutation.mutate()} disabled={!workspace?.capabilities.can_add_notes || !noteBody.trim() || noteMutation.isPending}>
                  {noteMutation.isPending ? "Adding..." : "Add note"}
                </Btn>
                {noteMutation.isError ? <StatusError text={errorText(noteMutation.error)} /> : null}
              </div>

              <div className="appointment-workspace-timeline" aria-label="Appointment activity">
                <div className="lbl">Chronological activity</div>
                {workspace?.activities.length ? workspace.activities.map((item) => (
                  <article key={item.id}>
                    <span className="appointment-workspace-timeline-dot" />
                    <div>
                      <b>{activityLabel(item.event_type)}</b>
                      <div className="sub">{item.actor_name} · {new Date(item.created_at).toLocaleString()}</div>
                      {item.body ? <p>{item.body}</p> : null}
                    </div>
                  </article>
                )) : <div className="sub">No CRM activity has been recorded yet.</div>}
              </div>
            </div>
          </section>
        ) : null}

        {!workspaceQuery.isLoading && tab === "application" ? (
          <section className="appointment-workspace-section" aria-labelledby="appointment-application-heading">
            <div className="appointment-workspace-section-head">
              <div>
                <div className="lbl">Application</div>
                <h3 id="appointment-application-heading">AI intake and underwriting handoff</h3>
              </div>
              {workspace?.application ? <CellChip tone="ok">Linked</CellChip> : <CellChip tone="mut">Not started</CellChip>}
            </div>
            {workspace?.application ? (
              <div className="appointment-application-summary">
                <div className="appointment-workspace-info-grid">
                  <Detail label="Vertical" value={humanizeStatus(workspace.application.vertical)} />
                  <Detail label="Underwriting stage" value={humanizeStatus(workspace.application.underwriting_status)} />
                  <Detail label="Profile" value={workspace.application.profile_id} />
                  <Detail label="Funding loan" value={workspace.application.loan_id || "Not promoted yet"} />
                </div>
                {workspace.application.blockers.length ? (
                  <div className="appointment-workspace-band">
                    <div className="lbl">Readiness blockers</div>
                    <ul>{workspace.application.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
                  </div>
                ) : <div className="appointment-workspace-notice ok">The application profile is ready for the next available underwriting action.</div>}
                <Link className="btn pri" href={applicationHref ?? "/admin/ai-underwriter-leads"}>Open application in Underwriting</Link>
              </div>
            ) : workspace?.capabilities.can_start_application ? (
              <div className="appointment-workspace-split">
                <div className="appointment-workspace-form">
                  <Field label="Application vertical" req>
                    <Select value={variant} onChange={(event) => { setVariant(event.target.value as IntakeVariant); setExistingIntakeId(""); }}>
                      <option value="dealer">Dealer</option>
                      <option value="real_estate">Real estate</option>
                      <option value="main_street">Main Street</option>
                      <option value="mca_refinance">MCA refinance</option>
                    </Select>
                  </Field>
                  {workspace.application_candidates.length ? (
                    <Field label="Create new or explicitly reuse">
                      <Select
                        value={existingIntakeId}
                        onChange={(event) => {
                          const intakeId = event.target.value;
                          setExistingIntakeId(intakeId);
                          const candidate = workspace.application_candidates.find((row) => row.intake_id === intakeId);
                          if (candidate) setVariant(candidateVariant(candidate.variant));
                        }}
                      >
                        <option value="">Create a new application</option>
                        {workspace.application_candidates.map((row) => (
                          <option key={row.intake_id} value={row.intake_id}>
                            Reuse {row.business_name || row.full_name} · {humanizeStatus(row.status)} · {new Date(row.created_at).toLocaleDateString()}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : null}
                  {selectedCandidate ? (
                    <div className="appointment-workspace-band">
                      <b>Explicit reuse</b>
                      <div className="sub mt">This links the selected existing intake. No new room or client notification is created.</div>
                    </div>
                  ) : (
                    <>
                      <div className="appointment-workspace-pin-grid">
                        <Field label="Six-digit room PIN" req><Input inputMode="numeric" maxLength={6} value={roomPin} onChange={(event) => setRoomPin(event.target.value.replace(/\D/g, "").slice(0, 6))} /></Field>
                        <Field label="Confirm PIN" req><Input inputMode="numeric" maxLength={6} value={roomPinConfirm} onChange={(event) => setRoomPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 6))} /></Field>
                      </div>
                      {roomPinConfirm && roomPin !== roomPinConfirm ? <StatusError text="The room PIN entries do not match." /> : null}
                      <label className="row appointment-workspace-confirm">
                        <input type="checkbox" checked={notifyClient} onChange={(event) => setNotifyClient(event.target.checked)} />
                        Email the secure application room after creation. This is optional and off by default.
                      </label>
                    </>
                  )}
                  <label className="row appointment-workspace-confirm">
                    <input type="checkbox" checked={confirmApplication} onChange={(event) => setConfirmApplication(event.target.checked)} />
                    I reviewed the client identity, vertical, and {selectedCandidate ? "existing application selection" : "secure room PIN"}.
                  </label>
                  <Btn variant="pri" onClick={() => startApplication.mutate()} disabled={!canStart || startApplication.isPending}>
                    {startApplication.isPending ? "Starting application..." : selectedCandidate ? "Link and open application" : "Start application"}
                  </Btn>
                  {startApplication.isError ? <StatusError text={errorText(startApplication.error)} /> : null}
                </div>
                <div className="appointment-application-readiness">
                  <div className="lbl">Conversion review</div>
                  <Detail label="Client" value={active.invitee_name} />
                  <Detail label="Email" value={active.invitee_email} />
                  <Detail label="Phone" value={active.invitee_phone} />
                  <Detail label="Company" value={active.company} />
                  <Detail label="Program" value={active.program_name} />
                  <Detail label="Requested amount" value={active.requested_amount} />
                  {!active.invitee_email ? <StatusError text="Add the client email before starting an application." /> : null}
                </div>
              </div>
            ) : <div className="sub">You can review this appointment, but application conversion requires underwriter access.</div>}
          </section>
        ) : null}

        {!workspaceQuery.isLoading && tab === "delivery" ? (
          <section className="appointment-workspace-section" aria-labelledby="appointment-delivery-heading">
            <div className="appointment-workspace-section-head">
              <div>
                <div className="lbl">Delivery</div>
                <h3 id="appointment-delivery-heading">Invitations, RSVP, reminders, and provider results</h3>
              </div>
              <CellChip tone={appointmentRsvpTone(active)}>{appointmentRsvpLabel(active)}</CellChip>
            </div>
            <div className="appointment-delivery-list">
              {deliveryRows(active).map((row) => (
                <article key={row.label}>
                  <div>
                    <b>{row.label}</b>
                    <span>{row.recipient || "No recipient"}</span>
                  </div>
                  <CellChip tone={resultTone(row.status)}>{humanizeStatus(row.status || "not recorded")}</CellChip>
                  {row.retry && workspace?.capabilities.can_retry_delivery ? (
                    <Btn size="sm" onClick={() => retryDelivery.mutate(row.retry!)} disabled={retryDelivery.isPending || !row.canRetry} title={row.canRetry ? `Retry ${row.label.toLowerCase()}` : row.missingReason}>
                      Retry
                    </Btn>
                  ) : <span />}
                </article>
              ))}
            </div>
            {active.delivery_error ? <StatusError text={active.delivery_error} /> : null}
            {retryDelivery.isError ? <StatusError text={errorText(retryDelivery.error)} /> : null}
          </section>
        ) : null}
      </div>
    </Drawer>
  );
}

function crmTone(status: AppointmentCrmStatus): "ok" | "warn" | "bad" | "mut" | "acc" {
  if (status === "converted" || status === "completed") return "ok";
  if (status === "not_qualified" || status === "cancelled") return "bad";
  if (status === "follow_up" || status === "no_show") return "warn";
  if (status === "confirmed") return "acc";
  return "mut";
}

function activityLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanizeStatus(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function candidateVariant(value: string): IntakeVariant {
  if (value.includes("real_estate")) return "real_estate";
  if (value.includes("main_street")) return "main_street";
  if (value.includes("mca")) return "mca_refinance";
  return "dealer";
}

function maskEmail(value: string | null): string | null {
  if (!value) return null;
  const [local, domain] = value.split("@");
  if (!domain) return value;
  return `${local.slice(0, 2)}${"*".repeat(Math.max(2, local.length - 2))}@${domain}`;
}

function maskPhone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return value;
  return `***-***-${digits.slice(-4)}`;
}

function deliveryRows(appointment: RepAppointment): Array<{
  label: string;
  status: string | null;
  recipient: string | null;
  retry?: "email_confirmation" | "sms_confirmation";
  canRetry: boolean;
  missingReason?: string;
}> {
  return [
    { label: "Google synchronization", status: appointment.google_sync_status, recipient: appointment.join_url ? "Meeting link available" : "No meeting link", canRetry: false },
    { label: "Client RSVP", status: appointmentRsvpLabel(appointment), recipient: maskEmail(appointment.invitee_email), canRetry: false },
    { label: "Email confirmation", status: appointment.confirmation_email_status, recipient: maskEmail(appointment.invitee_email), retry: "email_confirmation", canRetry: Boolean(appointment.invitee_email), missingReason: "No client email is stored" },
    { label: "Email reminder", status: appointment.email_reminder_status, recipient: maskEmail(appointment.invitee_email), canRetry: false },
    { label: "SMS confirmation", status: appointment.confirmation_sms_status, recipient: maskPhone(appointment.invitee_phone), retry: "sms_confirmation", canRetry: Boolean(appointment.invitee_phone), missingReason: "No client phone is stored" },
    { label: "SMS reminder", status: appointment.sms_reminder_status, recipient: maskPhone(appointment.invitee_phone), canRetry: false },
    { label: "Rep notification", status: appointment.rep_notification_status, recipient: "Assigned representative", canRetry: false },
    { label: "Rep reminder", status: appointment.rep_reminder_status, recipient: "Assigned representative", canRetry: false },
  ];
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
