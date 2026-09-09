"use client";

import { useEffect, useState } from "react";
import { Btn } from "@/components/ds";
import { V, type CssVars } from "@/components/design-system/cssVars";
import { Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { RightPanel } from "@/components/design-system/RightPanel";
import { useInviteUser, useReferralCompanies } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import type { OperatorAccountAccessType } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onInvited?: () => void;
}

const ROLE_OPTIONS: { value: Role; label: string; sub: string }[] = [
  { value: Role.BROKER, label: "Agent", sub: "Owns deals, sees their assigned pipeline." },
  { value: Role.REGIONAL_MANAGER, label: "Regional Manager", sub: "Sees assigned agents and their portfolio metrics." },
  { value: Role.LOAN_EXEC, label: "Underwriter", sub: "Sees all loans, runs UW + risk scoring." },
  { value: Role.DEALER_PARTNER, label: "Dealer Partner", sub: "External broker — starts and works dealer AI-intake leads for their own clients only." },
  { value: Role.FIELD_REP, label: "Field Rep", sub: "Visits businesses in person and opens files on site. Works only the files they own, on rep.qualifiedcommercial.com." },
  { value: Role.SUPER_ADMIN, label: "Super Admin", sub: "Full access: settings, team, every loan." },
];

export function InviteMemberDialog({ open, onClose, onInvited }: Props) {
  const invite = useInviteUser();
  const { data: companies = [] } = useReferralCompanies();
  const house = companies.find((c) => c.kind === "house") ?? null;
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>(Role.BROKER);
  const [companyId, setCompanyId] = useState("");
  const [accountTypes, setAccountTypes] = useState<OperatorAccountAccessType[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmail("");
      setName("");
      setRole(Role.BROKER);
      setCompanyId("");
      setAccountTypes([]);
      setErr(null);
    }
  }, [open]);

  // Everyone is linked to a business relationship profile: the house for
  // staff, their own company for a dealer partner. The house is preselected
  // for staff roles; a partner picks (or the desk types) their company.
  const isDealerPartner = role === Role.DEALER_PARTNER;
  const isStaff = role === Role.SUPER_ADMIN || role === Role.LOAN_EXEC || role === Role.FIELD_REP;
  const chooseRole = (next: Role) => {
    setRole(next);
    const staff = next === Role.SUPER_ADMIN || next === Role.LOAN_EXEC || next === Role.FIELD_REP;
    setCompanyId(staff && house ? house.id : next === Role.DEALER_PARTNER && companyId === house?.id ? "" : companyId);
  };
  const valid =
    /\S+@\S+\.\S+/.test(email) &&
    name.trim().length > 0 &&
    (!isDealerPartner || companyId.length > 0);

  const submit = async () => {
    setErr(null);
    try {
      await invite.mutateAsync({
        email: email.trim(),
        name: name.trim(),
        role,
        referral_partner_company_id: companyId || undefined,
        account_types: accountTypes,
      });
      onInvited?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Invite failed");
    }
  };

  return (
    <RightPanel
      open={open}
      onClose={onClose}
      eyebrow="Operator team"
      title="Invite member"
      ariaLabel="Invite team member"
      footer={
        <>
          <Btn onClick={onClose} disabled={invite.isPending}>Cancel</Btn>
          <Btn
            variant="pri"
            onClick={submit}
            disabled={!valid || invite.isPending}
            style={{
            }}
          >
            <Icon name="send" size={13} /> {invite.isPending ? "Sending…" : "Send invite"}
          </Btn>
        </>
      }
    >
      <Field label="Email">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
          type="email"
          style={inputStyle()}
          autoFocus
        />
      </Field>
      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Avery Park"
          style={inputStyle()}
        />
      </Field>

      <div>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: V.ink3,
            letterSpacing: 1.0,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Role
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ROLE_OPTIONS.map((opt) => {
            const active = role === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => chooseRole(opt.value)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: `1px solid ${active ? V.petrol : V.line}`,
                  background: active ? V.petrolSoft : V.surface2,
                }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    border: `2px solid ${active ? V.petrol : V.lineStrong}`,
                    background: active ? V.petrol : "transparent",
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: V.ink }}>{opt.label}</div>
                  <div style={{ fontSize: 11.5, color: V.ink3, marginTop: 2 }}>{opt.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: V.ink3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
          Additional account access
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["funding", "field_desk", "audit"] as OperatorAccountAccessType[]).map((product) => {
            const active = accountTypes.includes(product);
            return (
              <button
                key={product}
                type="button"
                aria-pressed={active}
                onClick={() => setAccountTypes((current) => active ? current.filter((item) => item !== product) : [...current, product])}
                style={{ ...inputStyle(), width: "auto", cursor: "pointer", background: active ? V.petrolSoft : V.surface2, borderColor: active ? V.petrol : V.line }}
              >
                {product === "funding" ? "Funding" : product === "field_desk" ? "Field Desk" : "Audit"}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: V.ink3, marginTop: 6 }}>The primary role controls permissions; access types add approved entry points.</div>
      </div>

      <Field label="Business relationship profile">
        <select value={companyId} onChange={(event) => setCompanyId(event.target.value)} style={inputStyle()}>
          <option value="">{isDealerPartner ? "Select their company…" : isStaff ? "The house" : "None"}</option>
          {companies
            .filter((company) => !(isDealerPartner && company.kind === "house"))
            .map((company) => <option key={company.id} value={company.id}>{company.name} · {company.kind === "house" ? "House" : company.signed ? "Signed" : "Unsigned"}</option>)}
        </select>
        <div style={{ fontSize: 11, color: V.ink3, marginTop: 6, lineHeight: 1.4 }}>
          Everyone is linked to a profile: the house for staff, their company for a partner. The Production Package&apos;s sponsor defaults from it. A partner company must sign the Referral Protection Agreement before its people can use the platform or be a sponsor.
        </div>
      </Field>

      {err && <Pill bg={V.dangerBg} color={V.danger}>{err}</Pill>}

      <div style={{ fontSize: 11, color: V.ink3, lineHeight: 1.5 }}>
        We&apos;ll send a Clerk invitation email. They sign up with that address; their role is honored on first sign-in.
      </div>
    </RightPanel>
  );
}

function Field({ label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: V.ink3,
          letterSpacing: 1.0,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 9,
    background: V.surface2,
    border: `1px solid ${V.line}`,
    color: V.ink,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
  };
}
