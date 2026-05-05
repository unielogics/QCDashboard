"use client";

// Loan participants — frontend-managed thread membership.
// Source of truth for the Fintech Orchestrator's PII / CC / BCC routing.
// Super-admin participants are picked from a dropdown of operator users
// (no free-text email) so the audit-CC list can't drift from real accounts.

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import {
  useCreateParticipant,
  useDeleteParticipant,
  useLoanParticipants,
  useUpdateParticipant,
  useUsers,
} from "@/hooks/useApi";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import type { LoanParticipant, LoanParticipantUpdate, ParticipantRole, UserRow } from "@/lib/types";

const ROLES: { v: ParticipantRole; l: string; tone: string }[] = [
  { v: "lender", l: "Lender", tone: "Hidden from broker/client by default" },
  { v: "broker", l: "Broker", tone: "Receives notifications; visibly CC'd on outbound" },
  { v: "client", l: "Client", tone: "Sees simplified messages; visibly CC'd on outbound" },
  { v: "super_admin", l: "Super Admin", tone: "Silently BCC'd on every outbound (audit trail)" },
];

interface DraftState {
  email: string;
  display_name: string;
  company: string;
  role: ParticipantRole;
  user_id: string;  // populated when role=super_admin
}
const EMPTY_DRAFT: DraftState = {
  email: "",
  display_name: "",
  company: "",
  role: "lender",
  user_id: "",
};

export function ParticipantsCard({ loanId }: { loanId: string }) {
  const { t } = useTheme();
  const profile = useActiveProfile();
  const { data: participants = [], isLoading } = useLoanParticipants(loanId);
  const create = useCreateParticipant();
  const update = useUpdateParticipant();
  const remove = useDeleteParticipant();

  // /users only resolves for super-admin caller; if it 401s the dropdown
  // falls back to free-text. We swallow errors in the hook below.
  const { data: usersList = [], isError: usersErr } = useUsers();
  const superAdmins: UserRow[] = (usersList ?? []).filter((u) => u.role === Role.SUPER_ADMIN);

  const canEdit = profile.role !== Role.CLIENT;
  const isSuperAdmin = profile.role === Role.SUPER_ADMIN;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setDraft(EMPTY_DRAFT);
    setError(null);
    setOpen(false);
  };

  const submitNew = async () => {
    setError(null);
    let payloadEmail = draft.email.trim();
    let displayName = draft.display_name.trim();
    let userId: string | undefined = undefined;

    if (draft.role === "super_admin") {
      // Lock to a real operator user — no free text allowed.
      if (!isSuperAdmin || superAdmins.length === 0) {
        setError("No super-admin users available. Ask an admin to seed one.");
        return;
      }
      if (!draft.user_id) {
        setError("Pick a super-admin user.");
        return;
      }
      const picked = superAdmins.find((u) => u.id === draft.user_id);
      if (!picked) {
        setError("Selected user not found.");
        return;
      }
      payloadEmail = picked.email;
      displayName = picked.name;
      userId = picked.id;
    } else if (!payloadEmail.includes("@")) {
      setError("Email looks invalid.");
      return;
    }

    try {
      await create.mutateAsync({
        loanId,
        email: payloadEmail,
        role: draft.role,
        display_name: displayName || undefined,
        company: draft.company.trim() || undefined,
        user_id: userId,
      });
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add participant.");
    }
  };

  return (
    <Card pad={0}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionLabel>Thread participants · {participants.length}</SectionLabel>
        {canEdit && (
          <button
            onClick={() => setOpen((v) => !v)}
            style={{
              padding: "6px 12px", borderRadius: 8, background: t.brand, color: t.inverse,
              fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}
          >
            <Icon name="plus" size={12} /> Add
          </button>
        )}
      </div>

      {open && canEdit && (
        <div style={{ padding: 14, borderBottom: `1px solid ${t.line}`, background: t.surface2 }}>
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, marginBottom: 12 }}>
            <FieldSelect
              t={t}
              label="Role"
              value={draft.role}
              onChange={(v) => setDraft((d) => ({ ...d, role: v as ParticipantRole, email: "", display_name: "", company: "", user_id: "" }))}
              options={ROLES.map((r) => ({ value: r.v, label: r.l }))}
            />
            <div style={{ alignSelf: "end", fontSize: 11, color: t.ink3, paddingBottom: 6 }}>
              {ROLES.find((r) => r.v === draft.role)?.tone}
            </div>
          </div>

          {draft.role === "super_admin" ? (
            <SuperAdminPicker
              t={t}
              users={superAdmins}
              usersErr={usersErr}
              isSuperAdmin={isSuperAdmin}
              value={draft.user_id}
              onChange={(id) => setDraft((d) => ({ ...d, user_id: id }))}
            />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <FieldInput
                t={t}
                label="Email"
                value={draft.email}
                onChange={(v) => setDraft((d) => ({ ...d, email: v }))}
                placeholder={draft.role === "lender" ? "sarah@jpmchase.com" : "name@example.com"}
              />
              <FieldInput
                t={t}
                label="Display name"
                value={draft.display_name}
                onChange={(v) => setDraft((d) => ({ ...d, display_name: v }))}
                placeholder={draft.role === "lender" ? "Sarah Thompson" : "Jane Smith"}
              />
              <FieldInput
                t={t}
                label="Company (optional)"
                value={draft.company}
                onChange={(v) => setDraft((d) => ({ ...d, company: v }))}
                placeholder={draft.role === "lender" ? "JP Morgan" : "—"}
              />
            </div>
          )}

          {error && <div style={{ color: t.danger, fontSize: 11.5, fontWeight: 700, marginTop: 8 }}>{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button onClick={reset} style={qcBtn(t)}>Cancel</button>
            <button onClick={submitNew} disabled={create.isPending} style={{ ...qcBtnPrimary(t), opacity: create.isPending ? 0.6 : 1 }}>
              <Icon name="plus" size={12} /> {create.isPending ? "Adding…" : "Add participant"}
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: 4 }}>
        {isLoading && <div style={{ padding: 16, fontSize: 13, color: t.ink3 }}>Loading…</div>}
        {!isLoading && participants.length === 0 && (
          <div style={{ padding: 16, fontSize: 13, color: t.ink3 }}>
            No participants on this thread yet. Add the lender, broker, client, and any super-admin emails above — these drive who gets emailed and who&apos;s hidden from whom.
          </div>
        )}
        {participants.map((p) => (
          <ParticipantRow
            key={p.id}
            t={t}
            participant={p}
            canEdit={canEdit}
            onUpdate={(patch) => update.mutate({ loanId, participantId: p.id, ...patch })}
            onRemove={() => {
              if (confirm(`Remove ${p.display_name ?? p.email} from this thread?`)) {
                remove.mutate({ loanId, participantId: p.id });
              }
            }}
          />
        ))}
      </div>
    </Card>
  );
}

function ParticipantRow({
  t,
  participant: p,
  canEdit,
  onUpdate,
  onRemove,
}: {
  t: ReturnType<typeof useTheme>["t"];
  participant: LoanParticipant;
  canEdit: boolean;
  onUpdate: (patch: LoanParticipantUpdate) => void;
  onRemove: () => void;
}) {
  const roleColor = p.role === "lender" ? t.warn : p.role === "broker" ? t.brand : p.role === "super_admin" ? t.petrol : t.ink2;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 2fr) 110px minmax(0, 1.4fr) 90px 90px 36px",
      gap: 12, padding: "12px 14px", borderBottom: `1px solid ${t.line}`, alignItems: "center", fontSize: 12.5,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.display_name || p.email}
        </div>
        <div style={{ fontSize: 11, color: t.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.email}{p.company ? ` · ${p.company}` : ""}
        </div>
      </div>
      <Pill bg={p.role === "lender" ? t.warnBg : p.role === "broker" ? t.brandSoft : p.role === "super_admin" ? t.petrolSoft : t.chip} color={roleColor}>
        {p.role.replace(/_/g, " ")}
      </Pill>
      <ToggleField
        t={t}
        label="Hide identity"
        title="Strip name/email/company from anything shown to broker/client (One-Way Mirror)"
        value={p.hide_identity}
        disabled={!canEdit}
        onChange={(v) => onUpdate({ hide_identity: v })}
      />
      <ToggleField
        t={t}
        label="CC"
        title="Visibly CC'd on outbound mail"
        value={p.cc_outbound}
        disabled={!canEdit}
        onChange={(v) => onUpdate({ cc_outbound: v })}
      />
      <ToggleField
        t={t}
        label="BCC"
        title="Silently BCC'd on every outbound mail (audit trail)"
        value={p.bcc_outbound}
        disabled={!canEdit}
        onChange={(v) => onUpdate({ bcc_outbound: v })}
      />
      {canEdit ? (
        <button
          onClick={onRemove}
          aria-label="Remove participant"
          style={{ background: "transparent", border: "none", color: t.ink3, cursor: "pointer", padding: 4 }}
          title="Remove"
        >
          <Icon name="x" size={13} />
        </button>
      ) : <div />}
    </div>
  );
}

function SuperAdminPicker({
  t,
  users,
  usersErr,
  isSuperAdmin,
  value,
  onChange,
}: {
  t: ReturnType<typeof useTheme>["t"];
  users: UserRow[];
  usersErr: boolean;
  isSuperAdmin: boolean;
  value: string;
  onChange: (id: string) => void;
}) {
  if (!isSuperAdmin) {
    return (
      <div style={{ fontSize: 12, color: t.warn, padding: "10px 12px", borderRadius: 9, background: t.warnBg }}>
        Only super-admins can attach another super-admin to a thread. Switch role to view the dropdown.
      </div>
    );
  }
  if (usersErr) {
    return (
      <div style={{ fontSize: 12, color: t.danger, padding: "10px 12px", borderRadius: 9, background: t.dangerBg }}>
        Couldn&apos;t load operator users (/users endpoint). Check that you&apos;re signed in as a super-admin.
      </div>
    );
  }
  if (users.length === 0) {
    return (
      <div style={{ fontSize: 12, color: t.ink3, padding: "10px 12px", borderRadius: 9, background: t.surface }}>
        No super-admin users seeded yet. Run <code style={{ background: t.chip, padding: "1px 5px", borderRadius: 4 }}>python -m app.seed</code> in qcbackend or have an admin create one.
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
        Pick a super-admin
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", padding: "8px 10px", borderRadius: 8, background: t.surface,
          border: `1px solid ${t.line}`, color: t.ink, fontSize: 12.5, fontFamily: "inherit",
        }}
      >
        <option value="">— select —</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name} · {u.email}</option>
        ))}
      </select>
      <div style={{ fontSize: 11, color: t.ink3, marginTop: 6 }}>
        This person will be silently BCC&apos;d on every outbound message for this loan (audit trail). Toggle CC instead if you want them visible.
      </div>
    </div>
  );
}

function FieldInput({ t, label, value, onChange, placeholder }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <input
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{
          width: "100%", padding: "8px 10px", borderRadius: 8, background: t.surface,
          border: `1px solid ${t.line}`, color: t.ink, fontSize: 12.5, fontFamily: "inherit", outline: "none",
        }}
      />
    </div>
  );
}

function FieldSelect({ t, label, value, onChange, options }: {
  t: ReturnType<typeof useTheme>["t"]; label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <select
        value={value} onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", padding: "8px 10px", borderRadius: 8, background: t.surface,
          border: `1px solid ${t.line}`, color: t.ink, fontSize: 12.5, fontFamily: "inherit",
        }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function ToggleField({ t, label, title, value, disabled, onChange }: {
  t: ReturnType<typeof useTheme>["t"]; label: string; title?: string; value: boolean; disabled?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      title={title}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 9px",
        borderRadius: 999, border: `1px solid ${value ? t.petrol : t.line}`,
        background: value ? t.petrolSoft : "transparent",
        color: value ? t.petrol : t.ink3, fontSize: 11, fontWeight: 700,
        cursor: disabled ? "default" : "pointer", whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: value ? t.petrol : t.ink4 }} />
      {label}
    </button>
  );
}
