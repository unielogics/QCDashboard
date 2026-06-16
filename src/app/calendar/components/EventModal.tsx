"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useClients, useCreateEvent, useCurrentUser, useLoans, useUsers } from "@/hooks/useApi";
import { useUI } from "@/store/ui";
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
  const { t } = useTheme();
  const collapsed = useUI((s) => s.sidebarCollapsed);
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
  const sidebarLeft = collapsed ? 68 : 232;

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
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: sidebarLeft,
        background: t.bg,
        zIndex: 220,
        display: "flex",
        flexDirection: "column",
        borderLeft: `1px solid ${t.line}`,
      }}
    >
      <div style={{ padding: "18px 24px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, color: t.brand, fontWeight: 900, letterSpacing: 1.6, textTransform: "uppercase" }}>
            Calendar
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: t.ink, marginTop: 3 }}>New event</div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 36,
            height: 36,
            border: `1px solid ${t.line}`,
            borderRadius: 9,
            background: t.surface,
            color: t.ink2,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="x" size={15} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.9fr) minmax(420px, 1.1fr)", gap: 18, maxWidth: 1260, margin: "0 auto" }}>
          <section style={panelStyle(t)}>
            <SectionTitle title="Meeting type" sub="Pick the workflow first. You can still edit every field before saving." />
            <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
              {MEETING_TEMPLATES.map((tpl) => {
                const active = tpl.id === templateId;
                return (
                  <button
                    key={tpl.id}
                    onClick={() => applyTemplate(tpl.id)}
                    style={{
                      border: `1px solid ${active ? t.brand : t.line}`,
                      background: active ? t.brandSoft : t.surface2,
                      color: "inherit",
                      borderRadius: 12,
                      padding: 12,
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      gap: 11,
                      alignItems: "flex-start",
                    }}
                  >
                    <span style={{ width: 32, height: 32, borderRadius: 9, background: active ? t.brand : t.surface, color: active ? t.inverse : t.ink3, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon name={tpl.icon} size={15} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 900, color: active ? t.brand : t.ink }}>{tpl.label}</span>
                      <span style={{ display: "block", fontSize: 12, color: t.ink3, marginTop: 3, lineHeight: 1.35 }}>{tpl.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section style={panelStyle(t)}>
            <SectionTitle title="Event details" sub="Schedule with clients, agents, internal users, lenders, vendors, or free-form external contacts." />
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 14, marginTop: 14 }}>
              <Field t={t} label="Title" required>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Meeting title" style={inputStyle(t)} />
              </Field>
              <Field t={t} label="Event kind">
                <select value={kind} onChange={(e) => setKind(e.target.value as CalendarEventKindType)} style={inputStyle(t)}>
                  {Object.values(CalendarEventKind).map((value) => (
                    <option key={value} value={value}>{humanize(value)}</option>
                  ))}
                </select>
              </Field>
            </div>

            {!defaultLoanId && (
              <div style={{ marginTop: 14 }}>
                <Field t={t} label="Loan context">
                  <select value={loanId} onChange={(e) => setLoanId(e.target.value)} style={inputStyle(t)}>
                    <option value="">No loan / general meeting</option>
                    {loans.map((l) => (
                      <option key={l.id} value={l.id}>{l.deal_id} - {l.address}</option>
                    ))}
                  </select>
                </Field>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 14, marginTop: 14 }}>
              <Field t={t} label="Starts at" required>
                <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={inputStyle(t)} />
              </Field>
              <Field t={t} label="Duration">
                <input value={durationMin} onChange={(e) => setDurationMin(e.target.value)} placeholder="30" style={inputStyle(t)} />
              </Field>
              <Field t={t} label="Priority">
                <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} style={inputStyle(t)}>
                  <option value="">Normal</option>
                  {AITaskPriorityOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div style={{ marginTop: 18 }}>
              <SectionTitle title="Attendee" sub="Search known records or type any outside name/email for people who are not in the system yet." compact />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0" }}>
                {ATTENDEE_MODES.map((mode) => {
                  const active = attendeeMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => {
                        setAttendeeMode(mode.id);
                        setWho("");
                        setWhoOpen(false);
                      }}
                      style={{
                        border: `1px solid ${active ? t.brand : t.line}`,
                        background: active ? t.brandSoft : t.surface2,
                        color: active ? t.brand : t.ink3,
                        borderRadius: 999,
                        padding: "6px 10px",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 850,
                      }}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ position: "relative" }}>
                <input
                  value={who}
                  onChange={(e) => {
                    setWho(e.target.value);
                    setWhoOpen(true);
                  }}
                  onFocus={() => setWhoOpen(true)}
                  placeholder={attendeePlaceholder(attendeeMode)}
                  style={inputStyle(t)}
                />
                {whoOpen && attendeeMatches.length > 0 ? (
                  <div
                    style={{
                      position: "absolute",
                      zIndex: 20,
                      left: 0,
                      right: 0,
                      top: "100%",
                      marginTop: 5,
                      borderRadius: 10,
                      border: `1px solid ${t.line}`,
                      background: t.surface,
                      boxShadow: t.shadowLg,
                      overflow: "hidden",
                    }}
                  >
                    {attendeeMatches.map((row) => (
                      <button
                        key={row.id}
                        onClick={() => {
                          setWho(row.value);
                          setWhoOpen(false);
                        }}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          width: "calc(100% - 24px)",
                          padding: "10px 12px",
                          borderBottom: `1px solid ${t.line}`,
                        }}
                      >
                        <Icon name="user" size={13} />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: "block", fontSize: 12.5, color: t.ink, fontWeight: 850, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                            {row.label}
                          </span>
                          <span style={{ display: "block", fontSize: 11, color: t.ink3, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                            {row.sub}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
              <Field t={t} label="Meeting link / location">
                <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Google Meet, phone number, office, etc." style={inputStyle(t)} />
              </Field>
              <Field t={t} label="Notes">
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Agenda or private context" style={inputStyle(t)} />
              </Field>
            </div>

            {error ? <div style={{ color: t.danger, fontSize: 12, fontWeight: 800, marginTop: 12 }}>{error}</div> : null}
          </section>
        </div>
      </div>

      <div style={{ padding: "14px 24px", borderTop: `1px solid ${t.line}`, display: "flex", justifyContent: "flex-end", gap: 10, background: t.surface }}>
        <button onClick={onClose} style={qcBtn(t)}>Cancel</button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || createEvent.isPending}
          style={{ ...qcBtnPrimary(t), opacity: canSubmit && !createEvent.isPending ? 1 : 0.5, cursor: canSubmit && !createEvent.isPending ? "pointer" : "not-allowed" }}
        >
          <Icon name="cal" size={13} />
          {createEvent.isPending ? "Creating..." : "Create event"}
        </button>
      </div>
    </div>
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

function SectionTitle({ title, sub, compact }: { title: string; sub: string; compact?: boolean }) {
  const { t } = useTheme();
  return (
    <div>
      <div style={{ fontSize: compact ? 12 : 13, fontWeight: 900, color: t.ink, letterSpacing: compact ? 0.2 : 0 }}>{title}</div>
      <div style={{ fontSize: compact ? 11.5 : 12, color: t.ink3, marginTop: 3, lineHeight: 1.45 }}>{sub}</div>
    </div>
  );
}

function Field({ t, label, required, children }: { t: ReturnType<typeof useTheme>["t"]; label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase" }}>
        {label} {required ? <span style={{ color: t.danger }}>*</span> : null}
      </span>
      {children}
    </label>
  );
}

function panelStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    border: `1px solid ${t.line}`,
    background: t.surface,
    borderRadius: 14,
    padding: 16,
    boxShadow: "0 10px 28px rgba(0,0,0,0.08)",
    minWidth: 0,
  };
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 9,
    border: `1px solid ${t.line}`,
    background: t.surface2,
    color: t.ink,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  };
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
