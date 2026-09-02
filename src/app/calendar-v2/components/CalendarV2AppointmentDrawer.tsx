"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { Btn, CellChip, Field, Input, Panel, Select, StatusLine, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { apiErrorMessage } from "@/components/email/EmailComposer";
import { useAuthedApi } from "@/hooks/useApi";
import { CalendarFileCombobox } from "./CalendarFileCombobox";
import {
  appointmentCrmLabel,
  appointmentRsvpLabel,
  appointmentRsvpTone,
  type ApplyAppointmentOutcomeRequest,
  type ApplyAppointmentOutcomeResult,
  type AppointmentFileAction,
  type AppointmentFileOption,
  type AppointmentOutcomeDefinition,
  type AppointmentWorkspace,
  type RepAppointment,
} from "@/lib/repAppointments";

type WorkspaceTab = "overview" | "notes" | "outcome" | "file" | "edit";

const TAB_LABELS: Record<WorkspaceTab, string> = {
  overview: "Overview",
  notes: "Notes",
  outcome: "Outcome",
  file: "File",
  edit: "Edit",
};

const DOC_OPTIONS = [
  ["tax_returns", "Business tax returns"],
  ["profit_and_loss", "Current year P&L"],
  ["bank_statements", "Recent bank statements"],
  ["debt_schedule", "Business debt schedule"],
  ["entity_documents", "Entity documents"],
] as const;

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function money(value: number | string | null): string {
  if (value == null || value === "") return "Not provided";
  if (typeof value === "string") return value;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function originLabel(origin: string | null): string {
  switch (origin) {
    case "field_desk": return "Field desk";
    case "calendar": return "Calendar";
    case "public": return "Public booking page";
    case "intake": return "AI intake";
    default: return "Not recorded";
  }
}

function precallLabel(precall: NonNullable<AppointmentWorkspace["appointment"]["precall"]>): string {
  if (precall.status === "complete") return "Complete";
  if (precall.status === "stopped") return `Stopped${precall.stop_reason ? ` (${precall.stop_reason.replaceAll("_", " ")})` : ""}`;
  if (precall.status === "disabled") return "Off";
  const ready = precall.readiness;
  return ready ? `${ready.done_count} of 3 done` : "In progress";
}

function statusTone(status: string): "ok" | "warn" | "bad" | "mut" | "acc" | "pet" {
  if (["completed", "converted", "confirmed", "sent", "connected"].includes(status)) return "ok";
  if (["failed", "cancelled", "declined", "not_qualified"].includes(status)) return "bad";
  if (["pending", "needs_action", "follow_up", "no_show"].includes(status)) return "warn";
  return "mut";
}

function formatWhen(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CalendarV2AppointmentDrawer({
  appointmentId,
  initialTab = "overview",
  onClose,
  onChanged,
}: {
  appointmentId: string;
  initialTab?: WorkspaceTab;
  onClose: () => void;
  onChanged: () => void;
}) {
  const apiCall = useAuthedApi();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const workspace = useQuery({
    queryKey: ["calendar-v2-appointment", appointmentId],
    queryFn: () => apiCall<AppointmentWorkspace>(`/dealer-os/appointments/${appointmentId}/workspace`),
  });
  const outcomes = useQuery({
    queryKey: ["calendar-v2-outcomes"],
    queryFn: () => apiCall<AppointmentOutcomeDefinition[]>("/calendar/outcomes"),
    enabled: Boolean(workspace.data?.capabilities.can_manage_outcomes),
  });
  const visibleTabs = useMemo<WorkspaceTab[]>(() => {
    const capabilities = workspace.data?.capabilities;
    if (!capabilities) return ["overview"];
    return [
      "overview",
      capabilities.can_add_notes ? "notes" : null,
      capabilities.can_manage_outcomes ? "outcome" : null,
      capabilities.can_link_files || capabilities.can_start_application ? "file" : null,
      capabilities.can_edit ? "edit" : null,
    ].filter((value): value is WorkspaceTab => value !== null);
  }, [workspace.data?.capabilities]);

  useEffect(() => {
    if (!visibleTabs.includes(tab)) setTab("overview");
  }, [tab, visibleTabs]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["calendar-v2-appointment", appointmentId] }),
      queryClient.invalidateQueries({ queryKey: ["calendar-v2-workspace"] }),
    ]);
    onChanged();
  };

  const appointment = workspace.data?.appointment;
  const joinAction = appointment?.join_url ? (
    <a className="btn pri" href={appointment.join_url} target="_blank" rel="noreferrer">
      <Icon name="external" size={14} /> Join meeting
    </a>
  ) : (
    <button className="btn pri" type="button" disabled title="No meeting link is attached to this appointment">
      <Icon name="external" size={14} /> Join meeting
    </button>
  );

  return (
    <Drawer
      open
      fullscreen
      onClose={onClose}
      title={appointment?.title ?? "Appointment workspace"}
      sub={appointment ? `${formatWhen(appointment.starts_at)} · ${appointment.duration_min} minutes · ${appointment.timezone}` : "Loading appointment..."}
      headerActions={joinAction}
      bodyClass="calendar-v2-workspace-body"
    >
      {workspace.isLoading ? <div className="calendar-v2-loading">Loading appointment workspace...</div> : null}
      {workspace.isError ? <StatusLine tone="bad">{apiErrorMessage(workspace.error, "The appointment workspace could not be loaded.")}</StatusLine> : null}
      {workspace.data ? (
        <div className="calendar-v2-workspace">
          <nav className="calendar-v2-workspace-tabs" aria-label="Appointment workspace">
            {visibleTabs.map((value) => (
              <button key={value} type="button" className={tab === value ? "on" : ""} onClick={() => setTab(value)}>
                {TAB_LABELS[value]}
              </button>
            ))}
          </nav>
          <main className="calendar-v2-workspace-main">
            {tab === "overview" ? <OverviewTab workspace={workspace.data} onTab={setTab} /> : null}
            {tab === "notes" && workspace.data.capabilities.can_add_notes ? <NotesTab workspace={workspace.data} apiCall={apiCall} refresh={refresh} /> : null}
            {tab === "outcome" && workspace.data.capabilities.can_manage_outcomes ? (
              <OutcomeTab
                workspace={workspace.data}
                outcomes={outcomes.data ?? []}
                apiCall={apiCall}
                refresh={refresh}
                onOpenFile={() => setTab("file")}
              />
            ) : null}
            {tab === "file" && (workspace.data.capabilities.can_link_files || workspace.data.capabilities.can_start_application) ? (
              <FileTab workspace={workspace.data} apiCall={apiCall} refresh={refresh} onOutcome={() => setTab("outcome")} />
            ) : null}
            {tab === "edit" && workspace.data.capabilities.can_edit ? <EditTab workspace={workspace.data} apiCall={apiCall} refresh={refresh} onClose={onClose} /> : null}
          </main>
        </div>
      ) : null}
    </Drawer>
  );
}

function OverviewTab({ workspace, onTab }: { workspace: AppointmentWorkspace; onTab: (tab: WorkspaceTab) => void }) {
  const appointment = workspace.appointment;
  const recent = workspace.activities.slice(0, 5);
  return (
    <div className="calendar-v2-workspace-grid">
      <section className="calendar-v2-primary-column">
        <Panel title="Meeting and relationship">
          <div className="calendar-v2-detail-grid">
            <Detail label="Attendee" value={appointment.invitee_name} />
            <Detail label="Company" value={appointment.company} />
            <Detail label="Email" value={appointment.invitee_email} />
            <Detail label="Phone" value={appointment.invitee_phone} />
            <Detail label="Program" value={appointment.program_name} />
            <Detail label="Requested" value={appointment.requested_amount} />
            <Detail label="Address" value={appointment.full_address} wide />
            <Detail label="Meeting mode" value={appointment.meeting_mode?.replace("_", " ")} />
            <Detail label="Location" value={appointment.location} />
          </div>
        </Panel>
        <Panel title="Booking notes">
          <p className="calendar-v2-prose">{appointment.notes || "No preparation notes were captured with the booking."}</p>
        </Panel>
        <Panel title="Recent relationship activity" actions={workspace.capabilities.can_add_notes ? <Btn size="sm" onClick={() => onTab("notes")}>Open notes</Btn> : null}>
          <ActivityList rows={recent} empty="No activity has been logged yet." />
        </Panel>
      </section>
      <aside className="calendar-v2-context-column">
        <Panel title="Appointment state">
          <div className="calendar-v2-status-stack">
            <StatusRow label="Origin" value={originLabel(appointment.origin)} tone="mut" />
            <StatusRow label="CRM" value={appointmentCrmLabel(appointment.crm_status)} tone={statusTone(appointment.crm_status)} />
            <StatusRow label="Client RSVP" value={appointmentRsvpLabel(appointment)} tone={appointmentRsvpTone(appointment)} />
            <StatusRow label="Google" value={appointment.google_sync_status || "Unavailable"} tone={statusTone(appointment.google_sync_status || "")} />
            {appointment.precall ? <StatusRow label="Pre-call prep" value={precallLabel(appointment.precall)} tone={appointment.precall.status === "complete" ? "ok" : appointment.precall.status === "stopped" ? "warn" : "mut"} /> : null}
            <StatusRow label="Email" value={appointment.confirmation_email_status || "Not sent"} tone={statusTone(appointment.confirmation_email_status || "")} />
            <StatusRow label="SMS" value={appointment.confirmation_sms_status || "Not sent"} tone={statusTone(appointment.confirmation_sms_status || "")} />
          </div>
          {appointment.delivery_error ? <StatusLine tone="bad">{appointment.delivery_error}</StatusLine> : null}
        </Panel>
        <Panel title="File readiness" actions={workspace.capabilities.can_link_files || workspace.capabilities.can_start_application ? <Btn size="sm" onClick={() => onTab("file")}>Manage file</Btn> : null}>
          {workspace.application ? (
            <div className="calendar-v2-linked-summary">
              <CellChip tone="acc">AI Intake</CellChip>
              <strong>{workspace.application.vertical.replace("_", " ")}</strong>
              <span>{workspace.application.underwriting_status.replaceAll("_", " ")}</span>
              {workspace.application.blockers.slice(0, 3).map((blocker) => <small key={blocker}>{blocker}</small>)}
            </div>
          ) : workspace.funding_file ? (
            <div className="calendar-v2-linked-summary">
              <CellChip tone="pet">Funding Loan</CellChip>
              <strong>{workspace.funding_file.entity_name || workspace.funding_file.deal_id}</strong>
              <span>{workspace.funding_file.stage.replaceAll("_", " ")} · {money(workspace.funding_file.amount)}</span>
            </div>
          ) : (
            <div className="calendar-v2-empty-compact">No file is linked. Use Outcome or File to choose the destination explicitly.</div>
          )}
        </Panel>
      </aside>
    </div>
  );
}

function NotesTab({ workspace, apiCall, refresh }: { workspace: AppointmentWorkspace; apiCall: ReturnType<typeof useAuthedApi>; refresh: () => Promise<void> }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => apiCall(`/dealer-os/appointments/${workspace.appointment.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ body: body.trim() }),
    }),
    onSuccess: async () => {
      setBody("");
      await refresh();
    },
    onError: (nextError) => setError(apiErrorMessage(nextError, "The note could not be saved.")),
  });
  const snippets = [
    "Client confirmed financing goals and timeline.",
    "Reviewed current documents and identified missing evidence.",
    "Discussed preliminary structure; no commitment was made.",
    "Follow-up required before underwriting can proceed.",
  ];
  return (
    <div className="calendar-v2-notes-layout">
      <Panel title="Add internal meeting note" sub="Stored once in the appointment history and projected into the linked file audit.">
        <div className="calendar-v2-snippets">
          {snippets.map((snippet) => <button key={snippet} type="button" onClick={() => setBody((current) => current ? `${current}\n${snippet}` : snippet)}>{snippet}</button>)}
        </div>
        <Field label="Note" req>
          <Textarea aria-label="Note" rows={8} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Record facts, decisions, risks, and the agreed next step" />
        </Field>
        <div className="row mt"><Btn variant="pri" onClick={() => save.mutate()} disabled={!body.trim() || save.isPending}><Icon name="note" size={14} />{save.isPending ? "Saving..." : "Add note"}</Btn></div>
        {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
      </Panel>
      <Panel title="Chronological appointment history">
        <ActivityList rows={workspace.activities} empty="No appointment activity yet." />
      </Panel>
    </div>
  );
}

function OutcomeTab({
  workspace,
  outcomes,
  apiCall,
  refresh,
  onOpenFile,
}: {
  workspace: AppointmentWorkspace;
  outcomes: AppointmentOutcomeDefinition[];
  apiCall: ReturnType<typeof useAuthedApi>;
  refresh: () => Promise<void>;
  onOpenFile: () => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [note, setNote] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [fileAction, setFileAction] = useState<AppointmentFileAction>(workspace.application || workspace.funding_file ? "update_linked" : "none");
  const [variant, setVariant] = useState<"dealer" | "real_estate" | "main_street" | "mca_refinance">("dealer");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [notifyClient, setNotifyClient] = useState(false);
  const [applyBookingData, setApplyBookingData] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [existingFile, setExistingFile] = useState<AppointmentFileOption | null>(null);
  const [documents, setDocuments] = useState<string[]>([]);
  const [result, setResult] = useState<ApplyAppointmentOutcomeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const selected = outcomes.find((item) => item.id === selectedId) ?? null;
  const effects = new Set(selected?.effects ?? []);
  useEffect(() => {
    if (!selected && outcomes.length) setSelectedId(outcomes[0].id);
  }, [outcomes, selected]);

  const apply = useMutation({
    mutationFn: () => {
      const body: ApplyAppointmentOutcomeRequest = {
        outcome_definition_id: selectedId,
        note: note.trim() || null,
        follow_up_at: followUpAt ? new Date(followUpAt).toISOString() : null,
        idempotency_key: idempotencyKey,
        confirm,
        file_action: fileAction,
        existing_file_kind: existingFile?.kind ?? null,
        existing_file_id: existingFile?.id ?? null,
        variant,
        secure_room_pin: pin || null,
        notify_client: notifyClient,
        apply_booking_data: applyBookingData,
        requested_document_keys: documents,
      };
      return apiCall<ApplyAppointmentOutcomeResult>(`/dealer-os/appointments/${workspace.appointment.id}/apply-outcome`, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: async (next) => {
      setResult(next);
      setError(null);
      setIdempotencyKey(crypto.randomUUID());
      await refresh();
    },
    onError: (nextError) => setError(apiErrorMessage(nextError, "The outcome could not be applied.")),
  });

  const needsConfirm = effects.has("file_action") || effects.has("close_enquiry");
  const pinReady = fileAction !== "create_ai_intake" || (/^\d{6}$/.test(pin) && pin === pinConfirm);
  const fileReady = !effects.has("file_action") || (
    fileAction !== "none" && (fileAction !== "link_existing" || Boolean(existingFile))
  );
  const ready = Boolean(selectedId && fileReady && pinReady && (!effects.has("schedule_follow_up") || followUpAt) && (!needsConfirm || (confirm && note.trim())));

  return (
    <div className="calendar-v2-outcome-layout">
      <Panel title="Choose outcome" sub="Your personal definitions can combine approved actions.">
        <div className="calendar-v2-outcome-options">
          {outcomes.map((item) => (
            <button key={item.id} type="button" className={selectedId === item.id ? "on" : ""} onClick={() => { setSelectedId(item.id); setResult(null); }}>
              <i style={{ background: `var(--calendar-${item.color}, var(--accent))` }} />
              <span><strong>{item.name}</strong><small>{item.description}</small></span>
              <CellChip tone={statusTone(item.target_crm_status)}>{appointmentCrmLabel(item.target_crm_status)}</CellChip>
            </button>
          ))}
        </div>
      </Panel>

      {selected ? (
        <Panel title="Required inputs" sub="Nothing is written until the reviewed action is confirmed.">
          <div className="calendar-v2-form-stack">
            <Field label="Meeting notes" req={needsConfirm}>
              <Textarea rows={5} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Facts, rationale, and agreed next step" />
            </Field>
            {effects.has("schedule_follow_up") ? <Field label="Follow-up date and time" req><Input type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} /></Field> : null}
            {effects.has("file_action") ? (
              <>
                <Field label="File action" req>
                  <Select aria-label="File action" value={fileAction} onChange={(event) => { setFileAction(event.target.value as AppointmentFileAction); setExistingFile(null); }}>
                    <option value="none">Choose an action</option>
                    {(workspace.application || workspace.funding_file) ? <option value="update_linked">Update linked file</option> : null}
                    <option value="link_existing">Link an existing file</option>
                    {workspace.draft_file ? <option value="promote_draft">Promote draft file {workspace.draft_file.case_ref ?? ""}</option> : null}
                    <option value="create_ai_intake">Create AI Intake</option>
                    {workspace.capabilities.can_create_funding_loan ? <option value="create_funding_loan">Create Funding Loan</option> : null}
                  </Select>
                </Field>
                {fileAction === "link_existing" ? (
                  <div className="calendar-v2-file-picker">
                    <CalendarFileCombobox
                      appointmentId={workspace.appointment.id}
                      value={existingFile}
                      onChange={setExistingFile}
                    />
                  </div>
                ) : null}
                {fileAction === "create_ai_intake" ? (
                  <div className="calendar-v2-form-grid">
                    <Field label="AI Intake type" req><Select value={variant} onChange={(event) => setVariant(event.target.value as typeof variant)}><option value="dealer">Dealer</option><option value="real_estate">Real estate</option><option value="main_street">Main Street</option><option value="mca_refinance">MCA refinance</option></Select></Field>
                    <Field label="Six-digit room PIN" req><Input inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} /></Field>
                    <Field label="Confirm room PIN" req><Input inputMode="numeric" maxLength={6} value={pinConfirm} onChange={(event) => setPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 6))} /></Field>
                    <label className="calendar-v2-check"><input type="checkbox" checked={notifyClient} onChange={(event) => setNotifyClient(event.target.checked)} />Notify the client with room access instructions</label>
                  </div>
                ) : null}
                {fileAction !== "none" ? <label className="calendar-v2-check"><input type="checkbox" checked={applyBookingData} onChange={(event) => setApplyBookingData(event.target.checked)} />Apply the reviewed booking contact, company, amount, purpose, and address to the destination file</label> : null}
              </>
            ) : null}
            {effects.has("request_documents") ? (
              <div><div className="lbl">Documents to request</div><div className="calendar-v2-check-grid">{DOC_OPTIONS.map(([key, label]) => <label key={key} className="calendar-v2-check"><input type="checkbox" checked={documents.includes(key)} onChange={(event) => setDocuments((current) => event.target.checked ? [...current, key] : current.filter((value) => value !== key))} />{label}</label>)}</div></div>
            ) : null}
            <div className="calendar-v2-action-preview">
              <div className="lbl">Action preview</div>
              <div>{selected.effects.map((effect) => <CellChip key={effect} tone="mut">{effect.replaceAll("_", " ")}</CellChip>)}</div>
              <p>CRM becomes <strong>{appointmentCrmLabel(selected.target_crm_status)}</strong>. External actions report their own result and can be retried without duplicating files.</p>
            </div>
            {needsConfirm ? <label className="calendar-v2-confirm"><input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} /><span><strong>Confirm reviewed outcome</strong><small>I reviewed the notes, destination, and proposed changes.</small></span></label> : null}
            <div className="row"><Btn variant="pri" onClick={() => apply.mutate()} disabled={!ready || apply.isPending}><Icon name="check" size={14} />{apply.isPending ? "Applying..." : "Apply outcome"}</Btn></div>
            {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
          </div>
        </Panel>
      ) : null}

      {result ? (
        <Panel title="Action results" actions={<CellChip tone={result.actions.some((item) => item.status === "failed") ? "warn" : "ok"}>{result.outcome_label}</CellChip>}>
          <div className="calendar-v2-result-list">
            {result.actions.map((item) => <div key={item.action}><Icon name={item.status === "completed" ? "check" : item.status === "failed" ? "alert" : "refresh"} size={16} /><span><strong>{item.action.replaceAll("_", " ")}</strong><small>{item.detail}</small></span><CellChip tone={statusTone(item.status)}>{item.status}</CellChip>{item.href ? <Link href={item.href}>Open</Link> : null}</div>)}
          </div>
          {(workspace.application || workspace.funding_file) ? <Btn size="sm" onClick={onOpenFile}>Review linked file</Btn> : null}
        </Panel>
      ) : null}
    </div>
  );
}

function FileTab({ workspace, apiCall, refresh, onOutcome }: { workspace: AppointmentWorkspace; apiCall: ReturnType<typeof useAuthedApi>; refresh: () => Promise<void>; onOutcome: () => void }) {
  const [selected, setSelected] = useState<AppointmentFileOption | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const link = useMutation({
    mutationFn: () => apiCall(`/dealer-os/appointments/${workspace.appointment.id}/file-link`, {
      method: "PATCH",
      body: JSON.stringify({ kind: selected?.kind, file_id: selected?.id, confirm }),
    }),
    onSuccess: async () => { setSelected(null); setConfirm(false); await refresh(); },
    onError: (nextError) => setError(apiErrorMessage(nextError, "The file could not be linked.")),
  });
  const appointment = workspace.appointment;
  const reviewRows = workspace.booking_data_review?.length
    ? workspace.booking_data_review
    : [
      ["contact", "Contact", appointment.invitee_name],
      ["company", "Company", appointment.company],
      ["email", "Email", appointment.invitee_email],
      ["phone", "Phone", appointment.invitee_phone],
      ["requested_amount", "Requested amount", appointment.requested_amount],
      ["program", "Program", appointment.program_name],
      ["address", "Address", appointment.full_address],
    ].map(([field, label, value]) => ({ field, label, current_value: null, proposed_value: value, status: "unlinked" as const, target_kind: null }));
  return (
    <div className="calendar-v2-file-layout">
      <Panel title="Linked file">
        {workspace.application ? <div className="calendar-v2-file-hero"><div><CellChip tone="acc">AI Intake</CellChip><h3>{workspace.application.vertical.replace("_", " ")}</h3><p>{workspace.application.underwriting_status.replaceAll("_", " ")}</p></div><Link className="btn pri" href={`/admin/ai-underwriter-leads?lead=${workspace.application.intake_id}&view=underwriting`}>Open application</Link></div> : null}
        {workspace.funding_file ? <div className="calendar-v2-file-hero"><div><CellChip tone="pet">Funding Loan</CellChip><h3>{workspace.funding_file.entity_name || workspace.funding_file.deal_id}</h3><p>{workspace.funding_file.stage.replaceAll("_", " ")} · {money(workspace.funding_file.amount)}</p></div><Link className="btn pri" href={`/loans/${workspace.funding_file.loan_id}`}>Open loan</Link></div> : null}
        {!workspace.application && !workspace.funding_file ? <div className="calendar-v2-empty-compact">No file is linked yet. Search below or create one through a reviewed Qualified outcome.</div> : null}
      </Panel>
      <Panel title="Booking data review" sub="These values are not copied into a file unless you explicitly confirm them in Outcome.">
        <div className="calendar-v2-diff-grid">
          {reviewRows.map((item) => (
            <div key={item.field} className={item.field === "address" ? "wide calendar-v2-booking-diff" : "calendar-v2-booking-diff"}>
              <header><span>{item.label}</span><CellChip tone={bookingReviewTone(item.status)}>{bookingReviewLabel(item.status)}</CellChip></header>
              <div><small>Current file</small><strong>{item.current_value || "Not set"}</strong></div>
              <div><small>Appointment</small><strong>{item.proposed_value || "Not provided"}</strong></div>
            </div>
          ))}
        </div>
        <Btn variant="pri" onClick={onOutcome}>Review file action in Outcome</Btn>
      </Panel>
      <Panel title="Link a different existing file" sub="Search results are permission scoped; selecting a result never fuzzy-merges records.">
        <CalendarFileCombobox
          appointmentId={workspace.appointment.id}
          value={selected}
          onChange={(item) => { setSelected(item); setConfirm(false); }}
          placeholder="Choose or search by person, company, contact, QC reference, or file ID"
        />
        {selected ? <label className="calendar-v2-confirm"><input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} /><span><strong>Confirm exact file link</strong><small>{selected.label} · {selected.subtitle}</small></span></label> : null}
        <div className="row mt"><Btn variant="pri" onClick={() => link.mutate()} disabled={!selected || !confirm || link.isPending}><Icon name="link" size={14} />{link.isPending ? "Linking..." : "Link selected file"}</Btn></div>
        {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
      </Panel>
    </div>
  );
}

function bookingReviewTone(status: string): "ok" | "warn" | "bad" | "mut" | "acc" {
  if (status === "matches") return "ok";
  if (status === "conflict") return "bad";
  if (status === "missing_in_file") return "warn";
  if (status === "unlinked") return "acc";
  return "mut";
}

function bookingReviewLabel(status: string): string {
  return ({
    matches: "Matches",
    missing_in_file: "Can add",
    conflict: "Review conflict",
    file_only: "File only",
    empty: "Empty",
    unlinked: "No file linked",
  } as Record<string, string>)[status] ?? status.replaceAll("_", " ");
}

function EditTab({ workspace, apiCall, refresh, onClose }: { workspace: AppointmentWorkspace; apiCall: ReturnType<typeof useAuthedApi>; refresh: () => Promise<void>; onClose: () => void }) {
  const appointment = workspace.appointment;
  const [title, setTitle] = useState(appointment.title);
  const [kind, setKind] = useState(appointment.kind);
  const [startsAt, setStartsAt] = useState(toLocalInput(appointment.starts_at));
  const [duration, setDuration] = useState(String(appointment.duration_min));
  const [name, setName] = useState(appointment.invitee_name);
  const [company, setCompany] = useState(appointment.company ?? "");
  const [email, setEmail] = useState(appointment.invitee_email ?? "");
  const [phone, setPhone] = useState(appointment.invitee_phone ?? "");
  const [amount, setAmount] = useState(appointment.requested_amount ?? "");
  const [address, setAddress] = useState(appointment.full_address ?? "");
  const [mode, setMode] = useState(appointment.meeting_mode ?? "video");
  const [joinUrl, setJoinUrl] = useState(appointment.join_url ?? "");
  const [location, setLocation] = useState(appointment.location ?? "");
  const [notes, setNotes] = useState(appointment.notes ?? "");
  const [reopen, setReopen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => apiCall<RepAppointment>(`/dealer-os/appointments/${appointment.id}`, { method: "PATCH", body: JSON.stringify({ title, kind, starts_at: new Date(startsAt).toISOString(), duration_min: Number(duration), invitee_name: name, company: company || null, invitee_email: email || null, invitee_phone: phone || null, requested_amount: amount || null, full_address: address || null, meeting_mode: mode, join_url: joinUrl || null, location: location || null, notes: notes || null, reopen_outcome: reopen }) }),
    onSuccess: refresh,
    onError: (nextError) => setError(apiErrorMessage(nextError, "The appointment could not be updated.")),
  });
  const cancel = useMutation({
    mutationFn: () => apiCall(`/dealer-os/appointments/${appointment.id}/cancel`, { method: "POST", body: JSON.stringify({ reason: cancelReason }) }),
    onSuccess: async () => { await refresh(); onClose(); },
    onError: (nextError) => setError(apiErrorMessage(nextError, "The appointment could not be cancelled.")),
  });
  const terminal = ["no_show", "not_qualified"].includes(appointment.crm_status);
  return (
    <div className="calendar-v2-edit-layout">
      <Panel title="Meeting">
        <div className="calendar-v2-form-grid">
          <Field label="Title" req><Input value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
          <Field label="Type"><Select value={kind} onChange={(event) => setKind(event.target.value)}><option value="intro_call">Intro call</option><option value="underwriting_review">Underwriting review</option><option value="document_review">Document review</option><option value="signing">Signing</option><option value="lender_call">Lender call</option></Select></Field>
          <Field label="Date and time" req><Input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></Field>
          <Field label="Duration"><Select value={duration} onChange={(event) => setDuration(event.target.value)}>{[15, 20, 30, 45, 60, 90].map((value) => <option key={value} value={value}>{value} minutes</option>)}</Select></Field>
          <Field label="Meeting mode"><Select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="video">Video</option><option value="phone">Phone</option><option value="in_person">In person</option></Select></Field>
          <Field label="Meeting link"><Input value={joinUrl} onChange={(event) => setJoinUrl(event.target.value)} /></Field>
          <Field label="Location / instructions"><Input value={location} onChange={(event) => setLocation(event.target.value)} /></Field>
        </div>
        {terminal ? <label className="calendar-v2-check"><input type="checkbox" checked={reopen} onChange={(event) => setReopen(event.target.checked)} />Confirm that rescheduling reopens the recorded terminal outcome</label> : null}
      </Panel>
      <Panel title="Contact and booking context">
        <div className="calendar-v2-form-grid">
          <Field label="Name" req><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Company"><Input value={company} onChange={(event) => setCompany(event.target.value)} /></Field>
          <Field label="Email"><Input value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
          <Field label="Phone"><Input value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>
          <Field label="Requested"><Input value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
          <Field label="Address"><Input value={address} onChange={(event) => setAddress(event.target.value)} /></Field>
        </div>
        <Field label="Preparation notes"><Textarea rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
        <div className="row mt"><Btn variant="pri" onClick={() => save.mutate()} disabled={!title.trim() || !name.trim() || !startsAt || save.isPending}><Icon name="check" size={14} />{save.isPending ? "Synchronizing..." : "Save and synchronize"}</Btn></div>
      </Panel>
      <Panel title="Cancel appointment" sub="Cancellation preserves notes, delivery records, outcomes, and file links.">
        <Field label="Cancellation reason" req><Textarea rows={3} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></Field>
        <Btn className="danger" onClick={() => cancel.mutate()} disabled={!cancelReason.trim() || cancel.isPending}>{cancel.isPending ? "Cancelling..." : "Cancel and archive"}</Btn>
      </Panel>
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
    </div>
  );
}

function Detail({ label, value, wide = false }: { label: string; value: string | null | undefined; wide?: boolean }) {
  return <div className={wide ? "wide" : ""}><span>{label}</span><strong>{value || "Not provided"}</strong></div>;
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: ReturnType<typeof statusTone> | ReturnType<typeof appointmentRsvpTone> }) {
  return <div><span>{label}</span><CellChip tone={tone}>{value}</CellChip></div>;
}

function ActivityList({ rows, empty }: { rows: AppointmentWorkspace["activities"]; empty: string }) {
  if (!rows.length) return <div className="calendar-v2-empty-compact">{empty}</div>;
  return <div className="calendar-v2-activity-list">{rows.map((row) => <div key={row.id}><span className="calendar-v2-activity-icon"><Icon name={row.event_type.includes("note") ? "note" : row.event_type.includes("outcome") ? "flag" : "cal"} size={14} /></span><div><strong>{row.event_type.replaceAll("_", " ")}</strong><p>{row.body || "Activity recorded"}</p><small>{row.actor_name} · {formatWhen(row.created_at)}</small></div></div>)}</div>;
}
