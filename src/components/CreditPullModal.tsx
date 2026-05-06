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
import { ApiError } from "@/lib/api";

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
  // Form fields = exactly what iSoftPull's API requires (per their docs).
  // No phone/email — those live on the user/client record. SSN starts
  // hidden and is only required if the bureau can't match on
  // name+address+DOB alone (most consumers can be matched without it).
  const [first, last] = (initialName ?? "").split(" ", 2);
  const [form, setForm] = useState({
    legal_first_name: first ?? "",
    legal_last_name: last ?? "",
    dob: "",
    street: "",
    city: "",
    state: "",
    zip: "",
    ssn: "",
  });
  // Becomes true after the first attempt comes back with
  // code="no_hit_provide_ssn". Reveals the SSN field; subsequent
  // submits include it.
  const [ssnRequired, setSsnRequired] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset to form whenever the modal reopens — avoids the modal flashing the
  // previous "done" state when the user re-runs the pull.
  useEffect(() => {
    if (open) {
      setStage("form");
      setSsnRequired(false);
      setSubmitError(null);
      setForm((prev) => ({
        ...prev,
        legal_first_name: prev.legal_first_name || (initialName?.split(" ")[0] ?? ""),
        legal_last_name: prev.legal_last_name || (initialName?.split(" ").slice(1).join(" ") ?? ""),
        ssn: "", // never carry SSN across reopens
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
    setSubmitError(null);
    try {
      // Send SSN only when the user typed one (or backend told us it's
      // needed). Empty string would fail Pydantic's "exactly 9 digits"
      // validator, so coerce to undefined when blank.
      const payload: {
        legal_first_name: string; legal_last_name: string; dob: string;
        street: string; city: string; state: string; zip: string;
        ssn?: string; fcra_consent: boolean;
      } = {
        legal_first_name: form.legal_first_name,
        legal_last_name: form.legal_last_name,
        dob: form.dob, street: form.street, city: form.city,
        state: form.state, zip: form.zip, fcra_consent: true,
      };
      if (form.ssn.length === 9) payload.ssn = form.ssn;

      await start.mutateAsync(payload);
      setStage("done");
    } catch (err: unknown) {
      // Backend signals structured deny outcomes via 422 + detail.code:
      //   no_hit_provide_ssn  → reveal SSN field, return to form, retry
      //   bureau_freeze       → user must lift their freeze with the bureau
      // Other failures fall through to a generic message.
      const code = readErrorCode(err);
      const detailMsg = readErrorMessage(err);
      if (code === "no_hit_provide_ssn") {
        setSsnRequired(true);
        setSubmitError(
          detailMsg ||
            "We couldn't find your file with name + address + DOB alone. Add your SSN below and try again.",
        );
        setStage("form");
        return;
      }
      if (code === "bureau_freeze") {
        setSubmitError(
          detailMsg ||
            "Your credit file is frozen at the bureau. Please lift the freeze with Experian, Equifax, or TransUnion and try again.",
        );
        setStage("form");
        return;
      }
      setSubmitError(detailMsg || "Pull failed — please retry.");
      setStage("consent");
    }
  };

  const formValid =
    form.legal_first_name.trim() &&
    form.legal_last_name.trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.dob) &&
    form.street.trim() &&
    form.city.trim() &&
    form.state.length === 2 &&
    /^\d{5}(-\d{4})?$/.test(form.zip.trim()) &&
    // SSN only required after the bureau told us it couldn't match.
    (!ssnRequired || form.ssn.length === 9);

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

              {ssnRequired ? (
                <>
                  <div style={{ height: 10 }} />
                  <SectionLabel>Identity verification</SectionLabel>
                  {submitError ? (
                    <div style={{ marginBottom: 10 }}>
                      <Pill bg={t.warnBg} color={t.warn}>{submitError}</Pill>
                    </div>
                  ) : null}
                  <Field
                    t={t}
                    label="Social Security Number"
                    placeholder="9 digits, no dashes"
                    type="password"
                    value={form.ssn}
                    onChange={(v) => setForm({ ...form, ssn: v.replace(/\D/g, "").slice(0, 9) })}
                  />
                  <div style={{ fontSize: 11, color: t.ink3, marginTop: -4, marginBottom: 4 }}>
                    Sent to the bureau over TLS. Only the last 4 digits are stored on file.
                  </div>
                </>
              ) : (
                <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: t.surface2, border: `1px solid ${t.line}` }}>
                  <div style={{ fontSize: 11.5, color: t.ink2, lineHeight: 1.5 }}>
                    We try to match your credit file using name, address, and date of birth — most consumers can be matched on those alone. We only ask for your SSN if the bureau can't find your file without it.
                  </div>
                </div>
              )}

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
              {start.data?.fico == null ? (
                // Bureau matched but didn't return a usable score (thin file,
                // no recent activity). Re-running won't help — show that
                // explicitly so the operator doesn't burn another pull.
                <div style={{ textAlign: "center" }}>
                  <Pill bg={t.warnBg} color={t.warn}>
                    <Icon name="info" size={11} stroke={3} /> No score available
                  </Pill>
                  <div style={{ marginTop: 14, fontSize: 14, fontWeight: 700, color: t.ink }}>
                    The bureau didn't return a usable score
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12.5, color: t.ink2, lineHeight: 1.5, maxWidth: 380, marginInline: "auto" }}>
                    This usually means a thin or stale credit file. Re-running a soft pull
                    on the same identity won't change the result — please contact support
                    if you believe this is an error.
                  </div>
                  <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
                    <button onClick={onClose} style={qcBtnPrimary(t)}>Done</button>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: "center" }}>
                  <Pill bg={t.profitBg} color={t.profit}>
                    <Icon name="check" size={11} stroke={3} /> Verified
                  </Pill>
                  <div style={{ marginTop: 12, fontSize: 56, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"' }}>
                    {start.data.fico}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: t.ink3 }}>
                    Valid through {start.data?.expires_at ? new Date(start.data.expires_at).toLocaleDateString() : "—"}
                  </div>
                  <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
                    <button onClick={onClose} style={qcBtnPrimary(t)}>Done</button>
                  </div>
                </div>
              )}
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
  type = "text",
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password";
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
        type={type}
        autoComplete={type === "password" ? "off" : undefined}
        inputMode={type === "password" ? "numeric" : undefined}
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

// FastAPI returns 422s like:
//   { detail: { code: "no_hit_provide_ssn", message: "..." } }
// or for plain HTTPException(status, "msg") it returns:
//   { detail: "msg" }
// readErrorCode / readErrorMessage handle both shapes.
function readErrorCode(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body as { detail?: unknown } | undefined;
  const detail = body?.detail;
  if (detail && typeof detail === "object" && "code" in detail) {
    const code = (detail as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

function readErrorMessage(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body as { detail?: unknown } | undefined;
  const detail = body?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "message" in detail) {
    const msg = (detail as { message?: unknown }).message;
    return typeof msg === "string" ? msg : null;
  }
  return null;
}
