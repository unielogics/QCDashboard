"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { Btn, Input, Panel, Seg, Select } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useClients, useCreateEvent, useCurrentUser, useLoans, useUsers } from "@/hooks/useApi";
import { AITaskPriority, AITaskPriorityOptions, CalendarEventKind } from "@/lib/enums.generated";
import type { Role, CalendarEventKind as CalendarEventKindType } from "@/lib/enums.generated";
import { parseIntStrict } from "@/lib/formCoerce";

type MeetingTemplateId = "client" | "agent" | "underwriting" | "partner" | "external";
type AttendeeMode = "client" | "agent" | "team" | "partner" | "external";

const MEETING_TEMPLATES: {
  id: MeetingTemplateId;
  label: string;
  sub: string;
  kind: CalendarEventKindType;
  attendeeMode: AttendeeMode;
  title: string;
  icon: string;
}[] = [
  {
    id: "client",
    label: "Client meeting",
    sub: "Borrower, prospect, or existing client",
    kind: CalendarEventKind.CALL,
    attendeeMode: "client",
    title: "Client meeting",
    icon: "clients",
  },
  {
    id: "agent",
    label: "Agent check-in",
    sub: "Broker, agent, or relationship owner",
    kind: CalendarEventKind.CALL,
    attendeeMode: "agent",
    title: "Agent check-in",
    icon: "user",
  },
  {
    id: "underwriting",
    label: "Underwriting review",
    sub: "Internal file review or team huddle",
    kind: CalendarEventKind.MILESTONE,
    attendeeMode: "team",
    title: "Underwriting review",
    icon: "docCheck",
  },
  {
    id: "partner",
    label: "Partner / lender call",
    sub: "Capital partner, lender, title, escrow, vendor",
    kind: CalendarEventKind.CALL,
    attendeeMode: "partner",
    title: "Partner call",
    icon: "building",
  },
  {
    id: "external",
    label: "External meeting",
    sub: "Anyone else in the transaction chain",
    kind: CalendarEventKind.CALL,
    attendeeMode: "external",
    title: "External meeting",
    icon: "link",
  },
];

const ATTENDEE_MODES: { id: AttendeeMode; label: string }[] = [
  { id: "client", label: "Clients" },
  { id: "agent", label: "Agents" },
  { id: "team", label: "Team" },
  { id: "partner", label: "Partners" },
  { id: "external", label: "External" },
];

export function EventModal({ open, onClose, defaultLoanId }: { open: boolean; onClose: () => void; defaultLoanId?: string }) {
  const { data: currentUser } = useCurrentUser();
  const { data: loans = [] } = useLoans();
  const { data: clients = [] } = useClients();
  const { data: users = [] } = useUsers();
  const createEvent = useCreateEvent();

  const [templateId, setTemplateId] = useState<MeetingTemplateId>("client");
  const activeTemplate = MEETING_TEMPLATES.find((x) => x.id === templateId) ?? MEETING_TEMPLATES[0];
  const [loanId, setLoanId] = useState<string>(defaultLoanId ?? "");
  const [kind, setKind] = useState<CalendarEventKindType>(activeTemplate.kind);
  const [title, setTitle] = useState(activeTemplate.title);
  const [attendeeMode, setAttendeeMode] = useState<AttendeeMode>(activeTemplate.attendeeMode);
  const [who, setWho] = useState("");
  const [whoOpen, setWhoOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [startsAt, setStartsAt] = useState<string>(() => {
    const d = new Date();
    const nextQuarter = Math.ceil((d.getMinutes() + 5) / 15) * 15;
    d.setMinutes(nextQuarter, 0, 0);
    return toDatetimeLocal(d);
  });
  const [durationMin, setDurationMin] = useState("30");
  const [priority, setPriority] = useState<typeof AITaskPriority[keyof typeof AITaskPriority] | "">("");
  const [error, setError] = useState<string | null>(null);

  // Drawer carries Escape-to-close of its own; this stays so the affordance
  // does not depend on which dialog shell wraps the form.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const attendeeMatches = useMemo(() => {
    const q = who.trim().toLowerCase();
    if (q.length < 2 || attendeeMode === "external" || attendeeMode === "partner") return [];

    const clientRows = clients.map((c) => ({
      id: `client-${c.id}`,
      label: c.name,
      sub: [c.email, c.phone].filter(Boolean).join(" · ") || "Client",
      value: c.email ? `${c.name} <${c.email}>` : c.name,
      mode: "client" as AttendeeMode,
    }));
    const agentRows = users
      .filter((u) => u.role === "broker")
      .map((u) => ({
        id: `agent-${u.id}`,
        label: u.name || u.email,
        sub: `Agent · ${u.email}`,
        value: u.email ? `${u.name || u.email} <${u.email}>` : u.name,
        mode: "agent" as AttendeeMode,
      }));
    const teamRows = users
      .filter((u) => u.role !== "client" && u.role !== "broker")
      .map((u) => ({
        id: `team-${u.id}`,
        label: u.name || u.email,
        sub: `${humanRole(u.role)} · ${u.email}`,
        value: u.email ? `${u.name || u.email} <${u.email}>` : u.name,
        mode: "team" as AttendeeMode,
      }));

    return [...clientRows, ...agentRows, ...teamRows]
      .filter((row) => row.mode === attendeeMode)
      .filter((row) => `${row.label} ${row.sub}`.toLowerCase().includes(q))
      .slice(0, 10);
  }, [attendeeMode, clients, users, who]);

  if (!open) return null;

  const targetLoan = defaultLoanId ?? loanId;
  const canSubmit = title.trim().length > 0 && !!startsAt;

  const applyTemplate = (id: MeetingTemplateId) => {
    const next = MEETING_TEMPLATES.find((x) => x.id === id) ?? MEETING_TEMPLATES[0];
    setTemplateId(id);
    setKind(next.kind);
    setAttendeeMode(next.attendeeMode);
    if (!title.trim() || MEETING_TEMPLATES.some((x) => x.title === title.trim())) {
      setTitle(next.title);
    }
    setWhoOpen(false);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!canSubmit) return;
    try {
      await createEvent.mutateAsync({
        loan_id: targetLoan || null,
        kind,
        title: title.trim(),
        description: buildDescription(activeTemplate.label, location, notes),
        who: who.trim() || null,
        starts_at: new Date(startsAt).toISOString(),
        duration_min: parseIntStrict(durationMin) || null,
        priority: priority || null,
        owner_user_id: targetLoan ? null : currentUser?.id ?? null,
      });
      setTitle(activeTemplate.title);
      setWho("");
      setLocation("");
      setNotes("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create event.");
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New event"
      sub="Calendar"
      width="xl"
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <span className="sp" />
          <Btn variant="pri" onClick={handleSubmit} disabled={!canSubmit || createEvent.isPending}>
            <Icon name="cal" size={13} />
            {createEvent.isPending ? "Creating..." : "Create event"}
          </Btn>
        </>
      }
    >
      <div className="cg">
        <Panel
          className="s5"
          title="Meeting type"
          sub="Pick the workflow first. You can still edit every field before saving."
        >
          {/* `.pick + .pick` spaces the list, so no wrapper gap here. */}
          <div>
            {MEETING_TEMPLATES.map((tpl) => {
              const active = tpl.id === templateId;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl.id)}
                  className={active ? "pick on" : "pick"}
                  style={{ width: "100%", textAlign: "left" }}
                >
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 9,
                      background: active ? "var(--accent)" : "var(--sunken)",
                      color: active ? "#fff" : "var(--muted)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={tpl.icon} size={15} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 650, color: active ? "var(--accent)" : "var(--ink)" }}>
                      {tpl.label}
                    </span>
                    <span className="sub" style={{ display: "block", marginTop: 3 }}>
                      {tpl.sub}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel
          className="s7"
          title="Event details"
          sub="Schedule with clients, agents, internal users, lenders, vendors, or free-form external contacts."
        >
          <div className="grid" style={{ gridTemplateColumns: "1.2fr 0.8fr" }}>
            <Field label="Title" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Meeting title" />
            </Field>
            <Field label="Event kind">
              <Select value={kind} onChange={(e) => setKind(e.target.value as CalendarEventKindType)}>
                {Object.values(CalendarEventKind).map((value) => (
                  <option key={value} value={value}>{humanize(value)}</option>
                ))}
              </Select>
            </Field>
          </div>

          {!defaultLoanId && (
            <div className="mt">
              <Field label="Loan context">
                <Select value={loanId} onChange={(e) => setLoanId(e.target.value)}>
                  <option value="">No loan / general meeting</option>
                  {loans.map((l) => (
                    <option key={l.id} value={l.id}>{l.deal_id} - {l.address}</option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          <div className="grid mt" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
            <Field label="Starts at" required>
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </Field>
            <Field label="Duration">
              <Input value={durationMin} onChange={(e) => setDurationMin(e.target.value)} placeholder="30" />
            </Field>
            <Field label="Priority">
              <Select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
                <option value="">Normal</option>
                {AITaskPriorityOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="mt">
            <div className="lbl">Attendee</div>
            <div className="sub" style={{ marginTop: 3 }}>
              Search known records or type any outside name/email for people who are not in the system yet.
            </div>
            <div className="row mt">
              <Seg<AttendeeMode>
                value={attendeeMode}
                onChange={(mode) => {
                  setAttendeeMode(mode);
                  setWho("");
                  setWhoOpen(false);
                }}
                ariaLabel="Attendee type"
                as="filter"
                options={ATTENDEE_MODES.map((mode) => ({ value: mode.id, label: mode.label }))}
              />
            </div>
            {/* display:grid so the input fills the row — `.field` sets no width
                — and so the typeahead's containing block is the input itself. */}
            <div className="mt" style={{ position: "relative", display: "grid" }}>
              <Input
                value={who}
                onChange={(e) => {
                  setWho(e.target.value);
                  setWhoOpen(true);
                }}
                onFocus={() => setWhoOpen(true)}
                placeholder={attendeePlaceholder(attendeeMode)}
              />
              {whoOpen && attendeeMatches.length > 0 ? (
                // `.popmenu` anchors right; left:0 stretches it under the input.
                <div className="popmenu" style={{ left: 0 }}>
                  {attendeeMatches.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="mi"
                      onClick={() => {
                        setWho(row.value);
                        setWhoOpen(false);
                      }}
                    >
                      <Icon name="user" size={13} /> {row.label}
                      <small>{row.sub}</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid mt" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Meeting link / location">
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Google Meet, phone number, office, etc." />
            </Field>
            <Field label="Notes">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Agenda or private context" />
            </Field>
          </div>

          {error ? (
            <div className="sub mt" style={{ color: "var(--danger)", fontWeight: 700 }}>
              {error}
            </div>
          ) : null}
        </Panel>
      </div>
    </Drawer>
  );
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildDescription(template: string, location: string, notes: string): string | null {
  const parts = [`Meeting type: ${template}`];
  if (location.trim()) parts.push(`Location/link: ${location.trim()}`);
  if (notes.trim()) parts.push(`Notes: ${notes.trim()}`);
  return parts.length ? parts.join("\n") : null;
}

/**
 * A real `<label>` rather than `ds/Field`, which renders a `<div>`: these
 * controls have no `id`, so the wrapping label is the only thing associating
 * the caption with the input. Dropping it would silently un-name every field
 * for a screen reader.
 */
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
      <span className="lbl">
        {label} {required ? <span style={{ color: "var(--danger)" }}>*</span> : null}
      </span>
      {children}
    </label>
  );
}

function attendeePlaceholder(mode: AttendeeMode): string {
  if (mode === "client") return "Search clients or type a borrower email";
  if (mode === "agent") return "Search agents or type an agent email";
  if (mode === "team") return "Search underwriting, regional, or super-admin users";
  if (mode === "partner") return "Enter lender, title, escrow, vendor, or partner contact";
  return "Enter any outside name or email";
}

function humanRole(role: Role): string {
  return String(role).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
