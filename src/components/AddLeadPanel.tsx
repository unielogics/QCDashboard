"use client";

// AddLeadPanel — right-side panel for an Agent to add a Lead. The Lead is
// owned by the Agent on creation (`agent_id` set server-side from the JWT).
// Optional follow-up: invite the Lead via Clerk so they can run Smart Intake
// (handled by InviteBorrowerPanel after the Lead row exists).

import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { RightPanel } from "@/components/design-system/RightPanel";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useCreateLead } from "@/hooks/useApi";
import type { LeadSource } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (leadId: string) => void;
}

const SOURCE_OPTIONS: { value: LeadSource; label: string }[] = [
  { value: "agent_added", label: "Added by Agent" },
  { value: "referral", label: "Referral" },
  { value: "self_signup", label: "Self-signup" },
];

export function AddLeadPanel({ open, onClose, onCreated }: Props) {
  const { t } = useTheme();
  const create = useCreateLead();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState<LeadSource>("agent_added");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setPhone("");
      setSource("agent_added");
      setNotes("");
      setErr(null);
    }
  }, [open]);

  // Email and phone are optional at lead-creation time; the Agent may have
  // only one contact channel. Name is the only required field.
  const valid = name.trim().length > 0 && (email.trim() === "" || /\S+@\S+\.\S+/.test(email));

  const submit = async () => {
    setErr(null);
    try {
      const lead = await create.mutateAsync({
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        source,
        notes: notes.trim() || null,
      });
      onCreated?.(lead.id);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create lead");
    }
  };

  return (
    <RightPanel
      open={open}
      onClose={onClose}
      eyebrow="My Funnel"
      title="Add Lead"
      ariaLabel="Add a new lead"
      footer={
        <>
          <button onClick={onClose} style={qcBtn(t)} disabled={create.isPending}>Cancel</button>
          <button
            onClick={submit}
            disabled={!valid || create.isPending}
            style={{
              ...qcBtnPrimary(t),
              opacity: valid && !create.isPending ? 1 : 0.5,
              cursor: valid && !create.isPending ? "pointer" : "not-allowed",
            }}
          >
            <Icon name="plus" size={13} /> {create.isPending ? "Creating…" : "Create lead"}
          </button>
        </>
      }
    >
      <Field t={t} label="Name" required>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Avery Park"
          style={inputStyle(t)}
          autoFocus
        />
      </Field>
      <Field t={t} label="Email">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="avery@example.com"
          type="email"
          style={inputStyle(t)}
        />
      </Field>
      <Field t={t} label="Phone">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
          type="tel"
          style={inputStyle(t)}
        />
      </Field>

      <div>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: t.ink3,
            letterSpacing: 1.0,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Source
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {SOURCE_OPTIONS.map((opt) => {
            const active = source === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setSource(opt.value)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: `1px solid ${active ? t.petrol : t.line}`,
                  background: active ? t.petrolSoft : t.surface2,
                }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    border: `2px solid ${active ? t.petrol : t.lineStrong}`,
                    background: active ? t.petrol : "transparent",
                    flexShrink: 0,
                  }}
                />
                <div style={{ fontSize: 13, fontWeight: 600, color: t.ink }}>{opt.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      <Field t={t} label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Initial context — property goals, timeline, anything you want the AI to remember."
          rows={4}
          style={{ ...inputStyle(t), resize: "vertical", minHeight: 90, fontFamily: "inherit" }}
        />
      </Field>

      {err && <Pill bg={t.dangerBg} color={t.danger}>{err}</Pill>}

      <div style={{ fontSize: 11, color: t.ink3, lineHeight: 1.5 }}>
        The Lead is owned by you. Once created, you can invite the Lead to the platform —
        on Smart Intake completion they convert into a Borrower with their{" "}
        <code style={{ background: t.chip, padding: "1px 4px", borderRadius: 4 }}>lead_id</code>{" "}
        preserved for funnel attribution.
      </div>
    </RightPanel>
  );
}

function Field({
  t,
  label,
  required,
  children,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: t.ink3,
          letterSpacing: 1.0,
          textTransform: "uppercase",
          marginBottom: 6,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {label}
        {required && <span style={{ color: t.danger }}>*</span>}
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
    background: t.surface2,
    border: `1px solid ${t.line}`,
    color: t.ink,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
  };
}
