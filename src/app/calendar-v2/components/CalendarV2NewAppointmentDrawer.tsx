"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { Btn, CellChip, Field, Input, Panel, Select, StatusLine, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { apiErrorMessage } from "@/components/email/EmailComposer";
import { useAuthedApi } from "@/hooks/useApi";
import type { AppointmentFileOption, RepAppointment } from "@/lib/repAppointments";

const APPOINTMENT_TYPES = [
  ["intro_call", "Intro call"],
  ["underwriting_review", "Underwriting review"],
  ["document_review", "Document review"],
  ["signing", "Signing"],
  ["lender_call", "Lender call"],
] as const;

function toLocalInput(value: Date): string {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

export function CalendarV2NewAppointmentDrawer({
  open,
  initialDate,
  onClose,
  onCreated,
}: {
  open: boolean;
  initialDate: Date;
  onClose: () => void;
  onCreated: (appointment: RepAppointment) => void;
}) {
  const apiCall = useAuthedApi();
  const [kind, setKind] = useState("intro_call");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [duration, setDuration] = useState("30");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"video" | "phone" | "in_person">("video");
  const [location, setLocation] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [reason, setReason] = useState("");
  const [fileQuery, setFileQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState<AppointmentFileOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const base = new Date(initialDate);
    if (base.getHours() === 0 && base.getMinutes() === 0) base.setHours(9, 0, 0, 0);
    setKind("intro_call");
    setTitle("");
    setStartsAt(toLocalInput(base));
    setDuration("30");
    setName("");
    setCompany("");
    setEmail("");
    setPhone("");
    setAddress("");
    setAmount("");
    setMode("video");
    setLocation("");
    setJoinUrl("");
    setReason("");
    setFileQuery("");
    setSelectedFile(null);
    setSaving(false);
    setError(null);
  }, [initialDate, open]);

  const fileOptions = useQuery({
    queryKey: ["calendar-v2-file-options", fileQuery],
    queryFn: () => apiCall<{ items: AppointmentFileOption[] }>(
      `/dealer-os/calendar/file-options?q=${encodeURIComponent(fileQuery)}&limit=12`,
    ),
    enabled: open && fileQuery.trim().length >= 2,
    staleTime: 15_000,
  });

  const canSave = useMemo(
    () => Boolean(name.trim() && startsAt && (email.trim() || phone.trim())),
    [email, name, phone, startsAt],
  );

  const create = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      const appointment = await apiCall<RepAppointment>("/dealer-os/appointments", {
        method: "POST",
        body: JSON.stringify({
          kind,
          title: title.trim() || null,
          starts_at: new Date(startsAt).toISOString(),
          duration_min: Number(duration),
          invitee_name: name.trim(),
          company: company.trim() || null,
          invitee_email: email.trim() || null,
          invitee_phone: phone.trim() || null,
          full_address: address.trim() || null,
          requested_amount: amount.trim() || null,
          meeting_mode: mode,
          location: location.trim() || null,
          join_url: joinUrl.trim() || null,
          notes: reason.trim() || null,
          program_key: "general_funding_discussion",
          program_name: "General funding discussion / Not decided yet",
          transactional_sms_consent: false,
        }),
      });
      if (selectedFile) {
        await apiCall(`/dealer-os/appointments/${appointment.id}/file-link`, {
          method: "PATCH",
          body: JSON.stringify({
            kind: selectedFile.kind,
            file_id: selectedFile.id,
            confirm: true,
          }),
        });
      }
      onCreated(appointment);
    } catch (nextError) {
      setError(apiErrorMessage(nextError, "The appointment could not be created."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New appointment"
      sub="Create the meeting, capture the booking context, and optionally attach an exact existing file."
      width="xl"
      footer={(
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <span className="sp" />
          <Btn variant="pri" onClick={create} disabled={!canSave || saving}>
            <Icon name="cal" size={14} /> {saving ? "Checking calendar..." : "Create appointment"}
          </Btn>
        </>
      )}
    >
      <div className="calendar-v2-form-stack">
        <Panel title="Meeting">
          <div className="calendar-v2-form-grid">
            <Field label="Appointment type" req>
              <Select value={kind} onChange={(event) => setKind(event.target.value)}>
                {APPOINTMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Title">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Generated from type and attendee when blank" />
            </Field>
            <Field label="Date and time" req>
              <Input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
            </Field>
            <Field label="Duration" req>
              <Select value={duration} onChange={(event) => setDuration(event.target.value)}>
                {[15, 20, 30, 45, 60, 90].map((value) => <option key={value} value={value}>{value} minutes</option>)}
              </Select>
            </Field>
            <Field label="Meeting mode">
              <Select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
                <option value="video">Video</option>
                <option value="phone">Phone</option>
                <option value="in_person">In person</option>
              </Select>
            </Field>
            <Field label={mode === "video" ? "Meeting link" : "Location / instructions"}>
              {mode === "video" ? (
                <Input value={joinUrl} onChange={(event) => setJoinUrl(event.target.value)} placeholder="Google Meet is generated when configured" />
              ) : (
                <Input value={location} onChange={(event) => setLocation(event.target.value)} />
              )}
            </Field>
          </div>
        </Panel>

        <Panel title="Contact and booking context">
          <div className="calendar-v2-form-grid">
            <Field label="Contact name" req><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
            <Field label="Company"><Input value={company} onChange={(event) => setCompany(event.target.value)} /></Field>
            <Field label="Email"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
            <Field label="Phone"><Input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>
            <Field label="Business / property address"><Input value={address} onChange={(event) => setAddress(event.target.value)} /></Field>
            <Field label="Requested amount"><Input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="$250,000" /></Field>
          </div>
          <Field label="Reason and preparation notes">
            <Textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What the client wants to accomplish and what should be reviewed before the call" />
          </Field>
        </Panel>

        <Panel title="Attach an existing file" sub="Optional. Search is scoped to files you are authorized to access.">
          <Field label="Search by person, company, email, phone, QC reference, or file ID">
            <Input value={fileQuery} onChange={(event) => setFileQuery(event.target.value)} placeholder="Start typing to find an exact file" />
          </Field>
          {selectedFile ? (
            <div className="calendar-v2-selected-file">
              <div><strong>{selectedFile.label}</strong><span>{selectedFile.subtitle}</span></div>
              <CellChip tone="acc">{selectedFile.kind === "intake" ? "AI Intake" : "Funding Loan"}</CellChip>
              <Btn size="sm" onClick={() => setSelectedFile(null)}>Remove</Btn>
            </div>
          ) : null}
          {!selectedFile && fileQuery.trim().length >= 2 ? (
            <div className="calendar-v2-file-results">
              {fileOptions.isLoading ? <div className="sub">Searching authorized files...</div> : null}
              {fileOptions.data?.items.map((item) => (
                <button key={`${item.kind}:${item.id}`} type="button" onClick={() => setSelectedFile(item)}>
                  <span><strong>{item.label}</strong><small>{item.subtitle}</small></span>
                  <CellChip tone={item.kind === "intake" ? "acc" : "pet"}>{item.kind === "intake" ? "AI Intake" : item.status}</CellChip>
                </button>
              ))}
              {fileOptions.data && fileOptions.data.items.length === 0 ? <div className="sub">No authorized files match that search.</div> : null}
            </div>
          ) : null}
        </Panel>
        {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
      </div>
    </Drawer>
  );
}
