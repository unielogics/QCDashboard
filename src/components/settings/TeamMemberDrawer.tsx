"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Btn, Callout, CellChip, Field, Input, Panel, Row, Select } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import {
  useAuthedApi,
  useDeleteUser,
  useResendTeamInvite,
  useRevokeTeamSessions,
  useSendTeamPasswordReset,
  useSetTeamAccountStatus,
  useUpdateUserRole,
} from "@/hooks/useApi";
import { CONSOLE_LABELS, GRANTABLE_CONSOLES, INHERITED_CONSOLES } from "@/lib/consoles";
import { Role } from "@/lib/enums.generated";
import {
  roleAccessProfile,
  roleRequiresPartnerCompany,
  roleUsesHouseProfile,
  TEAM_ASSIGNABLE_ROLES,
} from "@/lib/roleAccess";
import type { OperatorAccountAccessType, ReferralCompany, UserRow } from "@/lib/types";

const CONSOLES: OperatorAccountAccessType[] = ["funding", "field_desk", "audit"];

function when(value?: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function TeamMemberDrawer({
  user,
  companies,
  currentUserId,
  onClose,
}: {
  user: UserRow | null;
  companies: ReferralCompany[];
  currentUserId?: string | null;
  onClose: () => void;
}) {
  const apiCall = useAuthedApi();
  const update = useUpdateUserRole();
  const remove = useDeleteUser();
  const resend = useResendTeamInvite();
  const reset = useSendTeamPasswordReset();
  const revokeSessions = useRevokeTeamSessions();
  const setStatus = useSetTeamAccountStatus();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>(Role.BROKER);
  const [companyId, setCompanyId] = useState("");
  const [accountTypes, setAccountTypes] = useState<OperatorAccountAccessType[]>([]);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [certificateBusy, setCertificateBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setPhone(user.phone || "");
    setRole(user.role);
    setCompanyId(user.referral_partner_company_id || "");
    setAccountTypes(user.account_types || []);
    setReason("");
    setNotice("");
    setError("");
    setConfirmRemove(false);
    setCertificateBusy(false);
  }, [user]);

  const profile = roleAccessProfile(role);
  const isSelf = Boolean(user && currentUserId === user.id);
  const busy = update.isPending || remove.isPending || resend.isPending || reset.isPending
    || revokeSessions.isPending || setStatus.isPending;
  const partnerCompanyRequired = roleRequiresPartnerCompany(role);
  const houseProfileRequired = roleUsesHouseProfile(role);
  const hasConsoleAccess = Boolean((INHERITED_CONSOLES[role] ?? []).length || (GRANTABLE_CONSOLES[role] ?? []).length);
  const houseCompany = companies.find((company) => company.kind === "house");
  const selectedCompany = companies.find((company) => company.id === companyId);
  const allowedCompanies = useMemo(
    () => companies.filter((company) => partnerCompanyRequired ? company.kind !== "house" : houseProfileRequired ? company.kind === "house" : true),
    [companies, houseProfileRequired, partnerCompanyRequired],
  );

  if (!user) return null;

  const toggleConsole = (console: OperatorAccountAccessType) => {
    const inherited = (INHERITED_CONSOLES[role] ?? []).includes(console);
    const grantable = (GRANTABLE_CONSOLES[role] ?? []).includes(console);
    if (inherited || !grantable) return;
    setAccountTypes((current) => current.includes(console)
      ? current.filter((item) => item !== console)
      : [...current, console]);
  };

  const chooseRole = (next: Role) => {
    setRole(next);
    const inherited = INHERITED_CONSOLES[next] ?? [];
    const grantable = GRANTABLE_CONSOLES[next] ?? [];
    setAccountTypes((current) => [...new Set([...inherited, ...current.filter((item) => grantable.includes(item))])]);
    if ((next === Role.DEALER_PARTNER || next === Role.PROFESSIONAL_REFERRAL_PARTNER) && selectedCompany?.kind === "house") {
      setCompanyId("");
    } else if (roleUsesHouseProfile(next) && selectedCompany?.kind !== "house") {
      setCompanyId(houseCompany?.id ?? "");
    }
  };

  const run = async (action: () => Promise<{ message: string }>) => {
    setError("");
    setNotice("");
    try {
      const result = await action();
      setNotice(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The account action could not be completed.");
    }
  };

  const save = async () => {
    if (partnerCompanyRequired && !companyId) {
      setError("Select the partner company before assigning this workspace.");
      return;
    }
    setError("");
    try {
      await update.mutateAsync({
        userId: user.id,
        name: name.trim(),
        phone: phone.trim() || null,
        role,
        // An empty house selection is omitted so a fresh deployment without a
        // seeded house row can still apply the role; the backend will link the
        // house automatically when it exists. A broker profile may be cleared.
        ...companyId
          ? { referral_partner_company_id: companyId }
          : houseProfileRequired
            ? {}
            : { referral_partner_company_id: null },
        account_types: accountTypes,
      });
      setNotice("Member access updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Member access could not be updated.");
    }
  };

  const openPlatformAccessCertificate = async () => {
    setCertificateBusy(true);
    setError("");
    try {
      const result = await apiCall<{ download_url: string | null }>(`/contracts/platform_access/certificate?subject_id=${user.id}`);
      if (!result.download_url) throw new Error("The signed certificate is not available yet.");
      window.open(result.download_url, "_blank", "noopener,noreferrer");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The signed certificate could not be opened.");
    } finally {
      setCertificateBusy(false);
    }
  };

  const suspend = user.account_status !== "suspended";
  const loginTone = user.account_status === "suspended"
    ? "bad"
    : user.login_state === "active" ? "ok" : user.login_state === "invite_failed" ? "bad" : "warn";

  return <Drawer
    open
    onClose={onClose}
    title={user.name}
    sub={`${user.email} · ${profile.workspace}`}
    width="lg"
    closeOnBackdrop={!busy}
    footer={<><Btn onClick={onClose} disabled={busy}>Close</Btn><span className="sp" /><Btn variant="pri" onClick={() => void save()} disabled={busy || !name.trim()}>Save access</Btn></>}
  >
    <div className="grid">
      <div className="client-access-summary">
        <div><span className="lbl">Login</span><CellChip tone={loginTone}>{(user.login_state || "not invited").replaceAll("_", " ")}</CellChip></div>
        <div><span className="lbl">Last active</span><b>{when(user.last_seen_at)}</b></div>
        <div><span className="lbl">Workspace</span><b>{profile.workspace}</b></div>
        <div><span className="lbl">Joined</span><b>{when(user.created_at)}</b></div>
      </div>

      {notice ? <Callout tone="acc">{notice}</Callout> : null}
      {error ? <Callout tone="bad">{error}</Callout> : null}

      <Panel title="Identity and contact">
        <div className="fldgrid two">
          <Field label="Name"><Input aria-label="Name" value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Email"><Input aria-label="Email" value={user.email} disabled /></Field>
          <Field label="Mobile phone"><Input aria-label="Mobile phone" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="Add a mobile number" /></Field>
          <Field label="Business profile">
            <Select aria-label="Business profile" value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
              <option value="">Select a business profile…</option>
              {allowedCompanies.map((company) => <option key={company.id} value={company.id}>{company.name} · {company.kind === "house" ? "House" : company.signed ? "Signed" : "Unsigned"}</option>)}
            </Select>
          </Field>
        </div>
      </Panel>

      <Panel title="Role and industry workspace" sub="Role controls authority; workspace describes the industry-specific experience.">
        <Field label="Access profile">
          <Select aria-label="Access profile" value={role} onChange={(event) => chooseRole(event.target.value as Role)} disabled={isSelf}>
            {TEAM_ASSIGNABLE_ROLES.map((value) => {
              const option = roleAccessProfile(value);
              return <option key={value} value={value}>{option.label} · {option.workspace}</option>;
            })}
          </Select>
        </Field>
        <Callout tone={role === Role.DEALER_PARTNER ? "acc" : "mut"}><b>{profile.label}</b> · {profile.scope}</Callout>
        {hasConsoleAccess ? <div className="row">
          {CONSOLES.map((console) => {
            const inherited = (INHERITED_CONSOLES[role] ?? []).includes(console);
            const grantable = (GRANTABLE_CONSOLES[role] ?? []).includes(console);
            const active = inherited || accountTypes.includes(console);
            return <button
              key={console}
              type="button"
              className={`cellchip ${active ? "c-acc" : "c-mut"}`}
              aria-pressed={active}
              disabled={inherited || !grantable || busy}
              title={inherited ? "Included by this role" : grantable ? "Toggle this console" : "Unavailable for this role"}
              onClick={() => toggleConsole(console)}
            >{CONSOLE_LABELS[console]}{inherited ? " · included" : ""}</button>;
          })}
        </div> : <Callout tone="mut">Role portal only · this role does not sign in to Funding, Field Desk, or Audit.</Callout>}
      </Panel>

      <Panel title="Account actions" sub="Passwords remain private. Reset uses the account owner’s Clerk verification code.">
        <Field label="Reason for access changes">
          <Input aria-label="Reason for access changes" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required to suspend or reactivate (8+ characters)" />
        </Field>
        <Row>
          {user.login_state === "active" || user.login_state === "suspended" ? <Btn onClick={() => void run(() => reset.mutateAsync({ userId: user.id }))} disabled={busy}>Email password reset</Btn> : <Btn onClick={() => void run(() => resend.mutateAsync({ userId: user.id }))} disabled={busy}>Resend invitation</Btn>}
          <Btn onClick={() => void run(() => revokeSessions.mutateAsync({ userId: user.id }))} disabled={busy || isSelf || user.login_state !== "active"}>Revoke sessions</Btn>
          <Btn className={suspend ? "c-bad" : undefined} onClick={() => void run(() => setStatus.mutateAsync({ userId: user.id, body: { account_status: suspend ? "suspended" : "active", reason: reason.trim() } }))} disabled={busy || isSelf || reason.trim().length < 8}>{suspend ? "Suspend login" : "Reactivate login"}</Btn>
        </Row>
        {role === Role.DEALER_PARTNER ? <Row>
          <Link className="btn" href={`/admin/ai-underwriter-leads?partner=${user.id}&variant=dealer`}>Open this agent’s auto files</Link>
          <Link className="btn" href="/admin/ai-underwriter-leads?variant=dealer">Add files in Auto AI Intake</Link>
        </Row> : null}
        <div className="sub">Files belong to a specific intake, loan, or document room—not directly to a login. Choose the file first, then upload there.</div>
      </Panel>

      <Panel title="Agreement and acknowledgment">
        <div className="row">
          {companyId ? <CellChip tone={selectedCompany?.kind === "house" || selectedCompany?.signed ? "ok" : "warn"}>{selectedCompany?.kind === "house" ? "House profile" : selectedCompany?.signed ? "Company agreement signed" : "Company agreement unsigned"}</CellChip> : <CellChip tone="warn">No business profile</CellChip>}
          {user.platform_access_signed_at ? <CellChip tone="ok">Platform access signed {when(user.platform_access_signed_at)}</CellChip> : partnerCompanyRequired ? <CellChip tone="warn">Platform access missing</CellChip> : null}
          <CellChip tone={user.acknowledgment_status === "current" ? "ok" : "warn"}>Acknowledgment {(user.acknowledgment_status || "unknown").replaceAll("_", " ")}</CellChip>
        </div>
        {user.platform_access_signed_at ? <Row><Btn onClick={() => void openPlatformAccessCertificate()} disabled={busy || certificateBusy}>{certificateBusy ? "Opening certificate…" : "Open signed Platform Access certificate"}</Btn></Row> : null}
      </Panel>

      {!isSelf ? <Panel title="Remove member" sub="Use suspension for a reversible access block. Removal preserves history but deletes the Clerk identity.">
        {confirmRemove ? <Row><Btn className="c-bad" onClick={() => void run(async () => { await remove.mutateAsync({ userId: user.id }); onClose(); return { message: "Member removed." }; })} disabled={busy}>Confirm removal</Btn><Btn onClick={() => setConfirmRemove(false)} disabled={busy}>Cancel</Btn></Row> : <Btn onClick={() => setConfirmRemove(true)} disabled={busy}>Remove member…</Btn>}
      </Panel> : null}
    </div>
  </Drawer>;
}
