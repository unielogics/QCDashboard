"use client";

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useCreateEvent, useLoans } from "@/hooks/useApi";
import { CalendarEventKind, AITaskPriority, CalendarEventKindOptions, AITaskPriorityOptions } from "@/lib/enums.generated";
import { parseIntStrict } from "@/lib/formCoerce";

export function EventModal({ open, onClose, defaultLoanId }: { open: boolean; onClose: () => void; defaultLoanId?: string }) {
  const { t } = useTheme();
  const { data: loans = [] } = useLoans();
  const createEvent = useCreateEvent();

  const [loanId, setLoanId] = useState<string>(defaultLoanId ?? "");
  const [kind, setKind] = useState<typeof CalendarEventKind[keyof typeof CalendarEventKind]>(CalendarEventKind.CALL);
  const [title, setTitle] = useState("");
  const [who, setWho] = useState("");
  const [startsAt, setStartsAt] = useState<string>(() => {
    // Default: tomorrow at 10am, formatted for datetime-local input
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [durationMin, setDurationMin] = useState("30");
  const [priority, setPriority] = useState<typeof AITaskPriority[keyof typeof AITaskPriority] | "">("");
  const [error, setError] = useState<string | null>(null);

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
            <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Marisol Vega" style={inputStyle(t)} />
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
