"use client";

// Borrower-facing soft-pull flow. Mirrors qcmobile/app/credit-pull.tsx —
// 4-stage state machine (form → consent → pulling → done) shown as a modal
// instead of a screen. Triggered from <ProTermsCard> on the dashboard and
// from /profile.

import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useStartMyCreditPull } from "@/hooks/useApi";

type Stage = "form" | "consent" | "pulling" | "done";

interface Props {
  open: boolean;
  onClose: () => void;
  // Optional: prefill from /auth/me so the borrower doesn't retype their name/email.
  initialEmail?: string;
  initialName?: string;
  // "rerun" tweaks copy slightly to acknowledge there's already a pull on file.
  // "expired" is for the 90-day re-verification flow — emphasizes that the
  // calculator is locked until the pull refreshes.
  mode?: "first" | "rerun" | "expired";
}

export function CreditPullModal({ open, onClose, initialEmail, initialName, mode = "first" }: Props) {
  const { t } = useTheme();
  const start = useStartMyCreditPull();
  const [stage, setStage] = useState<Stage>("form");
  const [first, last] = (initialName ?? "").split(" ", 2);
  const [form, setForm] = useState({
    legal_first_name: first ?? "",
    legal_last_name: last ?? "",
    dob: "1985-01-01",
    street: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    email: initialEmail ?? "",
    last4_ssn: "",
  });

  // Reset to form whenever the modal reopens — avoids the modal flashing the
  // previous "done" state when the user re-runs the pull.
  useEffect(() => {
    if (open) {
      setStage("form");
      setForm((prev) => ({
        ...prev,
        legal_first_name: prev.legal_first_name || (initialName?.split(" ")[0] ?? ""),
        legal_last_name: prev.legal_last_name || (initialName?.split(" ").slice(1).join(" ") ?? ""),
        email: prev.email || (initialEmail ?? ""),
      }));
    }
  }, [open, initialName, initialEmail]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async () => {
    setStage("pulling");
    try {
      await start.mutateAsync({ ...form, fcra_consent: true });
      setStage("done");
    } catch {
      setStage("consent");
    }
  };

  const formValid =
    form.legal_first_name.trim() &&
    form.legal_last_name.trim() &&
    form.dob &&
    form.street.trim() &&
    form.city.trim() &&
    form.state.length === 2 &&
    form.zip.trim() &&
    form.email.trim() &&
    form.last4_ssn.length === 4;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Soft credit pull"
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
          maxWidth: 560,
          maxHeight: "90vh",
          overflowY: "auto",
          background: t.bg,
          borderRadius: 18,
          boxShadow: t.shadowLg,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: `1px solid ${t.line}`,
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: mode === "expired" ? t.danger : t.petrol }}>
              {mode === "expired"
                ? "Refresh credit · 90-day expiry"
                : mode === "rerun"
                  ? "Re-run soft pull"
                  : "Unlock pro terms"}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: t.ink, marginTop: 2 }}>Soft Credit Pull</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              all: "unset",
              cursor: "pointer",
              width: 32,
              height: 32,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              color: t.ink2,
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.5 }}>
            We capture only what the bureaus require. No score impact. Valid for 90 days.
          </div>

          {stage === "form" && (
            <Card pad={16}>
              <SectionLabel>Legal Name</SectionLabel>
              <Field t={t} label="First name" value={form.legal_first_name} onChange={(v) => setForm({ ...form, legal_first_name: v })} />
              <Field t={t} label="Last name" value={form.legal_last_name} onChange={(v) => setForm({ ...form, legal_last_name: v })} />
              <Field t={t} label="Date of birth" placeholder="YYYY-MM-DD" value={form.dob} onChange={(v) => setForm({ ...form, dob: v })} />

              <div style={{ height: 10 }} />
              <SectionLabel>Address Used for Credit</SectionLabel>
              <Field t={t} label="Street" value={form.street} onChange={(v) => setForm({ ...form, street: v })} />
              <Field t={t} label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field t={t} label="State (2-letter)" value={form.state} onChange={(v) => setForm({ ...form, state: v.toUpperCase().slice(0, 2) })} />
                <Field t={t} label="ZIP" value={form.zip} onChange={(v) => setForm({ ...form, zip: v })} />
              </div>

              <div style={{ height: 10 }} />
              <SectionLabel>Contact</SectionLabel>
              <Field t={t} label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
              <Field t={t} label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />

              <div style={{ height: 10 }} />
              <SectionLabel>Identity</SectionLabel>
              <Field t={t} label="Last 4 of SSN" value={form.last4_ssn} onChange={(v) => setForm({ ...form, last4_ssn: v.replace(/\D/g, "").slice(0, 4) })} />

              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={onClose} style={qcBtn(t)}>Cancel</button>
                <button
                  onClick={() => setStage("consent")}
                  disabled={!formValid}
                  style={{ ...qcBtnPrimary(t), opacity: formValid ? 1 : 0.5, cursor: formValid ? "pointer" : "not-allowed" }}
                >
                  Continue to Consent <Icon name="arrowR" size={13} />
                </button>
              </div>
            </Card>
          )}

          {stage === "consent" && (
            <Card pad={20}>
              <SectionLabel>FCRA Consent</SectionLabel>
              <p style={{ color: t.ink2, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                I, <strong style={{ color: t.ink }}>{form.legal_first_name} {form.legal_last_name}</strong>, authorize Qualified Commercial to obtain my consumer credit report from Experian, TransUnion, and Equifax for the purpose of evaluating loan products. I understand this is a soft pull and will not affect my credit score.
              </p>
              {start.error && (
                <div style={{ marginTop: 12 }}>
                  <Pill bg={t.dangerBg} color={t.danger}>
                    {start.error instanceof Error ? start.error.message : "Pull failed — please retry."}
                  </Pill>
                </div>
              )}
              <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setStage("form")} style={qcBtn(t)}>Back</button>
                <button onClick={submit} style={{ ...qcBtnPrimary(t), background: t.danger }}>
                  <Icon name="shield" size={14} /> I Authorize · Run Soft Pull
                </button>
              </div>
            </Card>
          )}

          {stage === "pulling" && (
            <Card pad={32}>
              <div style={{ textAlign: "center" }}>
                <div style={{ display: "inline-block", animation: "spin 1.2s linear infinite", color: t.petrol }}>
                  <Icon name="refresh" size={28} stroke={2.4} />
                </div>
                <div style={{ marginTop: 14, fontSize: 14, fontWeight: 700, color: t.ink }}>
                  Pulling… Experian → TransUnion → Equifax
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: t.ink3 }}>
                  This usually takes 5–10 seconds.
                </div>
              </div>
              <style jsx>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
              `}</style>
            </Card>
          )}

          {stage === "done" && (
            <Card pad={32}>
              <div style={{ textAlign: "center" }}>
                <Pill bg={t.profitBg} color={t.profit}>
                  <Icon name="check" size={11} stroke={3} /> Verified
                </Pill>
                <div style={{ marginTop: 12, fontSize: 56, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"' }}>
                  {start.data?.fico ?? "—"}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: t.ink3 }}>
                  Valid through {start.data?.expires_at ? new Date(start.data.expires_at).toLocaleDateString() : "—"}
                </div>
                <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
                  <button onClick={onClose} style={qcBtnPrimary(t)}>Done</button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  t,
  label,
  value,
  onChange,
  placeholder,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 5 }}>
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 9,
          background: t.surface2,
          border: `1px solid ${t.line}`,
          color: t.ink,
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
        }}
      />
    </div>
  );
}
