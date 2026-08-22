"use client";

// Loan participants — frontend-managed thread membership.
// Source of truth for the Fintech Orchestrator's PII / CC / BCC routing.
// Super-admin participants are picked from a dropdown of operator users
// (no free-text email) so the audit-CC list can't drift from real accounts.
//
// Restyled onto the plain-CSS design system. The field labels became real
// `<label>` elements on the way through: they used to be sibling `<div>`s,
// so none of these inputs had an accessible name.

import { useState, type ReactNode } from "react";
import { Btn, CellChip, Input, Panel, Select, StatusLine, Sub, type ChipTone } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
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
    <Panel
      title={`Thread participants · ${participants.length}`}
      actions={
        canEdit ? (
          <Btn size="sm" variant="pri" onClick={() => setOpen((v) => !v)}>
            <Icon name="plus" size={12} /> Add
          </Btn>
        ) : undefined
      }
      noPad
    >
      {open && canEdit && (
        /* Full-bleed composer strip inside a noPad panel — the inset and
           sunken ground belong to this block, not to a class. */
        <div style={{ padding: 14, borderBottom: "1px solid var(--line)", background: "var(--sunken2)" }}>
          {/* Bespoke split: a fixed 180px role picker beside its explanation. */}
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, marginBottom: 12 }}>
            <Labelled label="Role">
              <Select
                value={draft.role}
                onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as ParticipantRole, email: "", display_name: "", company: "", user_id: "" }))}
              >
                {ROLES.map((r) => (
                  <option key={r.v} value={r.v}>{r.l}</option>
                ))}
              </Select>
            </Labelled>
            <div className="sub" style={{ alignSelf: "end", paddingBottom: 6 }}>
              {ROLES.find((r) => r.v === draft.role)?.tone}
            </div>
          </div>

          {draft.role === "super_admin" ? (
            <SuperAdminPicker
              users={superAdmins}
              usersErr={usersErr}
              isSuperAdmin={isSuperAdmin}
              value={draft.user_id}
              onChange={(id) => setDraft((d) => ({ ...d, user_id: id }))}
            />
          ) : (
            <div className="fldgrid three">
              <Labelled label="Email">
                <Input
                  value={draft.email}
                  onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                  placeholder={draft.role === "lender" ? "sarah@jpmchase.com" : "name@example.com"}
                />
              </Labelled>
              <Labelled label="Display name">
                <Input
                  value={draft.display_name}
                  onChange={(e) => setDraft((d) => ({ ...d, display_name: e.target.value }))}
                  placeholder={draft.role === "lender" ? "Sarah Thompson" : "Jane Smith"}
                />
              </Labelled>
              <Labelled label="Company (optional)">
                <Input
                  value={draft.company}
                  onChange={(e) => setDraft((d) => ({ ...d, company: e.target.value }))}
                  placeholder={draft.role === "lender" ? "JP Morgan" : "—"}
                />
              </Labelled>
            </div>
          )}

          {error && <StatusLine tone="bad" className="mt">{error}</StatusLine>}
          <div className="row end mt">
            <Btn onClick={reset}>Cancel</Btn>
            <Btn variant="pri" onClick={submitNew} disabled={create.isPending}>
              <Icon name="plus" size={12} /> {create.isPending ? "Adding…" : "Add participant"}
            </Btn>
          </div>
        </div>
      )}

      <div>
        {isLoading && <div className="sub" style={{ padding: 16 }}>Loading…</div>}
        {!isLoading && participants.length === 0 && (
          <div className="sub" style={{ padding: 16 }}>
            No participants on this thread yet. Add the lender, broker, client, and any super-admin emails above — these drive who gets emailed and who&apos;s hidden from whom.
          </div>
        )}
        {participants.map((p) => (
          <ParticipantRow
            key={p.id}
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
    </Panel>
  );
}

const ROLE_TONE: Record<string, ChipTone> = {
  lender: "warn",
  broker: "acc",
  super_admin: "pet",
};

function ParticipantRow({
  participant: p,
  canEdit,
  onUpdate,
  onRemove,
}: {
  participant: LoanParticipant;
  canEdit: boolean;
  onUpdate: (patch: LoanParticipantUpdate) => void;
  onRemove: () => void;
}) {
  return (
    // Bespoke six-track row: identity / role / three toggles / remove.
    // Not `.cg` — that is the twelve-column PAGE grid.
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 2fr) 110px minmax(0, 1.4fr) 90px 90px 36px",
        gap: 12,
        padding: "12px 14px",
        borderBottom: "1px solid var(--line)",
        alignItems: "center",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="trunc" style={{ fontWeight: 700 }}>{p.display_name || p.email}</div>
        <div className="sub trunc">
          {p.email}{p.company ? ` · ${p.company}` : ""}
        </div>
      </div>
      <CellChip tone={ROLE_TONE[p.role] ?? "mut"}>{p.role.replace(/_/g, " ")}</CellChip>
      <ToggleField
        label="Hide identity"
        title="Strip name/email/company from anything shown to broker/client (One-Way Mirror)"
        value={p.hide_identity}
        disabled={!canEdit}
        onChange={(v) => onUpdate({ hide_identity: v })}
      />
      <ToggleField
        label="CC"
        title="Visibly CC'd on outbound mail"
        value={p.cc_outbound}
        disabled={!canEdit}
        onChange={(v) => onUpdate({ cc_outbound: v })}
      />
      <ToggleField
        label="BCC"
        title="Silently BCC'd on every outbound mail (audit trail)"
        value={p.bcc_outbound}
        disabled={!canEdit}
        onChange={(v) => onUpdate({ bcc_outbound: v })}
      />
      {canEdit ? (
        <Btn
          size="sm"
          className="iconbtn"
          onClick={onRemove}
          aria-label="Remove participant"
          title="Remove"
        >
          <Icon name="x" size={13} />
        </Btn>
      ) : <div />}
    </div>
  );
}

function SuperAdminPicker({
  users,
  usersErr,
  isSuperAdmin,
  value,
  onChange,
}: {
  users: UserRow[];
  usersErr: boolean;
  isSuperAdmin: boolean;
  value: string;
  onChange: (id: string) => void;
}) {
  if (!isSuperAdmin) {
    return (
      <StatusLine tone="warn">
        Only super-admins can attach another super-admin to a thread. Switch role to view the dropdown.
      </StatusLine>
    );
  }
  if (usersErr) {
    return (
      <StatusLine tone="bad">
        Couldn&apos;t load operator users (/users endpoint). Check that you&apos;re signed in as a super-admin.
      </StatusLine>
    );
  }
  if (users.length === 0) {
    return (
      <StatusLine>
        No super-admin users seeded yet. Run <code className="mono">python -m app.seed</code> in qcbackend or have an admin create one.
      </StatusLine>
    );
  }
  return (
    <div>
      <Labelled label="Pick a super-admin">
        <Select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— select —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name} · {u.email}</option>
          ))}
        </Select>
      </Labelled>
      <Sub>
        This person will be silently BCC&apos;d on every outbound message for this loan (audit trail). Toggle CC instead if you want them visible.
      </Sub>
    </div>
  );
}

/**
 * Label + control.
 *
 * A real `<label>`, not the design system's `Field` (a `<div>` plus a
 * `<span class="lbl">`): wrapping is what gives each control an accessible
 * name, and the markup this replaced had none.
 */
function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid g4">
      <span className="lbl">{label}</span>
      {children}
    </label>
  );
}

function ToggleField({ label, title, value, disabled, onChange }: {
  label: string; title?: string; value: boolean; disabled?: boolean; onChange: (v: boolean) => void;
}) {
  // `aria-pressed` is the state a screen reader needs; `.btn.tone-pet`
  // rather than a bare tone chip, which `.btn:hover` out-specifies.
  return (
    <Btn
      size="sm"
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      aria-pressed={value}
      title={title}
      className={value ? "tone-pet" : undefined}
      style={{ whiteSpace: "nowrap" }}
    >
      {/* Data-derived: the dot's tint is the toggle's state. */}
      <span className="repdot" style={{ background: value ? "currentColor" : "var(--faint)" }} />
      {label}
    </Btn>
  );
}
