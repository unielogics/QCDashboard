"use client";

import { useEffect, useState } from "react";
import { V, type CssVars } from "@/components/design-system/cssVars";
import { Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { RightPanel } from "@/components/design-system/RightPanel";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useInviteUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";

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
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>(Role.BROKER);
  const [companyName, setCompanyName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmail("");
      setName("");
      setRole(Role.BROKER);
      setCompanyName("");
      setErr(null);
    }
  }, [open]);

  const isDealerPartner = role === Role.DEALER_PARTNER;
  const valid =
    /\S+@\S+\.\S+/.test(email) &&
    name.trim().length > 0 &&
    (!isDealerPartner || companyName.trim().length > 0);

  const submit = async () => {
    setErr(null);
    try {
      await invite.mutateAsync({
        email: email.trim(),
        name: name.trim(),
        role,
        company_name: isDealerPartner ? companyName.trim() : undefined,
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
          <button onClick={onClose} style={qcBtn()} disabled={invite.isPending}>Cancel</button>
          <button
            onClick={submit}
            disabled={!valid || invite.isPending}
            style={{
              ...qcBtnPrimary(),
              opacity: valid && !invite.isPending ? 1 : 0.5,
              cursor: valid && !invite.isPending ? "pointer" : "not-allowed",
            }}
          >
            <Icon name="send" size={13} /> {invite.isPending ? "Sending…" : "Send invite"}
          </button>
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
                onClick={() => setRole(opt.value)}
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

      {isDealerPartner ? (
        <Field label="Company name">
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Acme Auto Group LLC"
            style={inputStyle()}
          />
          <div style={{ fontSize: 11, color: V.ink3, marginTop: 6, lineHeight: 1.4 }}>
            Their company must have a signed Referral Protection Agreement on file before they can use the
            platform. If this company already exists, it will be linked automatically.
          </div>
        </Field>
      ) : null}

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
