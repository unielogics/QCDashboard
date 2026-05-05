"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useInviteUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";

interface Props {
  open: boolean;
  onClose: () => void;
  onInvited?: () => void;
}

const ROLE_OPTIONS: { value: Role; label: string; sub: string }[] = [
  { value: Role.BROKER, label: "Account Exec", sub: "Owns deals, sees their assigned pipeline." },
  { value: Role.LOAN_EXEC, label: "Underwriter", sub: "Sees all loans, runs UW + risk scoring." },
  { value: Role.SUPER_ADMIN, label: "Super Admin", sub: "Full access: settings, team, every loan." },
];

export function InviteMemberDialog({ open, onClose, onInvited }: Props) {
  const { t } = useTheme();
  const invite = useInviteUser();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>(Role.BROKER);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmail("");
      setName("");
      setRole(Role.BROKER);
      setErr(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const valid = /\S+@\S+\.\S+/.test(email) && name.trim().length > 0;

  const submit = async () => {
    setErr(null);
    try {
      await invite.mutateAsync({ email: email.trim(), name: name.trim(), role });
      onInvited?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Invite failed");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Invite team member"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6, 7, 11, 0.55)",
        backdropFilter: "blur(2px)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          background: t.surface,
          borderRadius: 16,
          boxShadow: t.shadowLg,
          border: `1px solid ${t.line}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: `1px solid ${t.line}`,
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: t.petrol }}>
              Operator team
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: t.ink, marginTop: 2 }}>Invite member</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              all: "unset",
              cursor: "pointer",
              width: 30,
              height: 30,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              color: t.ink2,
            }}
          >
            <Icon name="x" size={15} />
          </button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <Field t={t} label="Email">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              type="email"
              style={inputStyle(t)}
              autoFocus
            />
          </Field>
          <Field t={t} label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Avery Park"
              style={inputStyle(t)}
            />
          </Field>

          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 8 }}>
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
                        marginTop: 1,
                      }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{opt.label}</div>
                      <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>{opt.sub}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {err && (
            <Pill bg={t.dangerBg} color={t.danger}>{err}</Pill>
          )}
          <div style={{ fontSize: 11, color: t.ink3, lineHeight: 1.5 }}>
            We&apos;ll send a Clerk invitation email. They sign up with that address; their role is honored on first sign-in.
          </div>
        </div>

        <div
          style={{
            padding: "12px 18px",
            borderTop: `1px solid ${t.line}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button onClick={onClose} style={qcBtn(t)} disabled={invite.isPending}>Cancel</button>
          <button
            onClick={submit}
            disabled={!valid || invite.isPending}
            style={{ ...qcBtnPrimary(t), opacity: valid && !invite.isPending ? 1 : 0.5, cursor: valid && !invite.isPending ? "pointer" : "not-allowed" }}
          >
            <Icon name="send" size={13} /> {invite.isPending ? "Sending…" : "Send invite"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ t, label, children }: { t: ReturnType<typeof useTheme>["t"]; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 6 }}>
        {label}
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
