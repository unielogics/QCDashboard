"use client";

import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useClients, useCreateEvent, useLoans, useUsers } from "@/hooks/useApi";
import { CalendarEventKind, AITaskPriority, CalendarEventKindOptions, AITaskPriorityOptions } from "@/lib/enums.generated";
import { parseIntStrict } from "@/lib/formCoerce";

export function EventModal({ open, onClose, defaultLoanId }: { open: boolean; onClose: () => void; defaultLoanId?: string }) {
  const { t } = useTheme();
  const { data: loans = [] } = useLoans();
  const { data: clients = [] } = useClients();
  const { data: users = [] } = useUsers();
  const createEvent = useCreateEvent();

  const [loanId, setLoanId] = useState<string>(defaultLoanId ?? "");
  const [kind, setKind] = useState<typeof CalendarEventKind[keyof typeof CalendarEventKind]>(CalendarEventKind.CALL);
  const [title, setTitle] = useState("");
  const [who, setWho] = useState("");
  const [whoOpen, setWhoOpen] = useState(false);
  const [startsAt, setStartsAt] = useState<string>(() => {
    const d = new Date();
    const nextQuarter = Math.ceil((d.getMinutes() + 5) / 15) * 15;
    d.setMinutes(nextQuarter, 0, 0);
    return toDatetimeLocal(d);
  });
  const [durationMin, setDurationMin] = useState("30");
  const [priority, setPriority] = useState<typeof AITaskPriority[keyof typeof AITaskPriority] | "">("");
  const [error, setError] = useState<string | null>(null);
  const attendeeMatches = useMemo(() => {
    const q = who.trim().toLowerCase();
    if (q.length < 2) return [];
    const clientRows = clients.map((c) => ({
      id: `client-${c.id}`,
      label: c.name,
      sub: [c.email, c.phone].filter(Boolean).join(" · ") || "Client",
      value: c.email ? `${c.name} <${c.email}>` : c.name,
    }));
    const userRows = users.map((u) => ({
      id: `user-${u.id}`,
      label: u.name || u.email,
      sub: `${u.role} · ${u.email}`,
      value: u.email ? `${u.name || u.email} <${u.email}>` : u.name,
    }));
    return [...clientRows, ...userRows]
      .filter((row) => `${row.label} ${row.sub}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [clients, users, who]);

  if (!open) return null;

  const targetLoan = defaultLoanId ?? loanId;
  const canSubmit = title.trim().length > 0 && !!startsAt;

  const handleSubmit = async () => {
    setError(null);
    if (!canSubmit) return;
    try {
      const isoLocal = new Date(startsAt).toISOString();
      await createEvent.mutateAsync({
        loan_id: targetLoan || null,
        kind,
        title: title.trim(),
        who: who.trim() || null,
        starts_at: isoLocal,
        duration_min: parseIntStrict(durationMin) || null,
        priority: priority || null,
      });
      setTitle("");
      setWho("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create event.");
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(15,20,28,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 32,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 560, background: t.surface, borderRadius: 16,
          border: `1px solid ${t.line}`, boxShadow: t.shadowLg,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: t.ink, letterSpacing: -0.3 }}>New event</div>
          <button onClick={onClose} aria-label="Close" style={{ width: 28, height: 28, border: `1px solid ${t.line}`, borderRadius: 7, background: "transparent", color: t.ink2, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="x" size={13} />
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <Field t={t} label="Title" required>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. UW review — Highline rent roll" style={inputStyle(t)} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field t={t} label="Kind">
              <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} style={inputStyle(t)}>
                {CalendarEventKindOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field t={t} label="Priority (optional)">
              <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} style={inputStyle(t)}>
                <option value="">—</option>
                {AITaskPriorityOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
          </div>
          {!defaultLoanId && (
            <Field t={t} label="Loan (optional)">
              <select value={loanId} onChange={(e) => setLoanId(e.target.value)} style={inputStyle(t)}>
                <option value="">No loan</option>
                {loans.map((l) => (
                  <option key={l.id} value={l.id}>{l.deal_id} — {l.address}</option>
                ))}
              </select>
            </Field>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
            <Field t={t} label="Starts at" required>
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={inputStyle(t)} />
            </Field>
            <Field t={t} label="Duration (min)">
              <input value={durationMin} onChange={(e) => setDurationMin(e.target.value)} placeholder="30" style={inputStyle(t)} />
            </Field>
          </div>
          <Field t={t} label="Who (optional)">
            <div style={{ position: "relative" }}>
              <input
                value={who}
                onChange={(e) => {
                  setWho(e.target.value);
                  setWhoOpen(true);
                }}
                onFocus={() => setWhoOpen(true)}
                placeholder="Search name/email or enter a new email"
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
                        padding: "9px 12px",
                        borderBottom: `1px solid ${t.line}`,
                      }}
                    >
                      <Icon name="user" size={13} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: "block", fontSize: 12.5, color: t.ink, fontWeight: 800, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
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
            <div style={{ fontSize: 11, color: t.ink3, marginTop: 6 }}>
              Existing users and clients are searchable. A new email can be typed and saved on the event.
            </div>
          </Field>
          {error && <div style={{ color: t.danger, fontSize: 12, fontWeight: 700 }}>{error}</div>}
        </div>

        <div style={{ padding: "12px 20px", borderTop: `1px solid ${t.line}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={qcBtn(t)}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || createEvent.isPending}
            style={{ ...qcBtnPrimary(t), opacity: canSubmit && !createEvent.isPending ? 1 : 0.5, cursor: canSubmit && !createEvent.isPending ? "pointer" : "not-allowed" }}
          >
            <Icon name="cal" size={13} />
            {createEvent.isPending ? "Creating…" : "Create event"}
          </button>
        </div>
      </div>
    </div>
  );
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Field({ t, label, required, children }: { t: ReturnType<typeof useTheme>["t"]; label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 6 }}>
        {label} {required && <span style={{ color: t.danger }}>*</span>}
      </div>
      {children}
    </div>
  );
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
  };
}
