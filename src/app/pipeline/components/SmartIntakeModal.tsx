"use client";

// Smart Intake — 4-step modal flow for creating a new loan.
// Ports .design/qualified-commercial/project/desktop/screens/smart-intake.jsx.
// On Activate → POST /api/v1/intake → router.push(`/loans/${loan_id}`).

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary, qcBtnPetrol } from "@/components/design-system/buttons";
import { useCreateIntake } from "@/hooks/useApi";
import { parseUSD, parseIntStrict } from "@/lib/formCoerce";
import {
  EntityType,
  ExperienceTier,
  LoanType,
  PropertyType,
} from "@/lib/enums.generated";
import { isLoanTypeEnabled } from "@/lib/products";
import type { SmartIntakePayload } from "@/lib/types";
import type { QCTokens } from "@/components/design-system/tokens";

interface FormState {
  // Borrower
  borrowerName: string;
  borrowerEmail: string;
  borrowerPhone: string;
  entityType: typeof EntityType[keyof typeof EntityType];
  entityName: string;
  experience: typeof ExperienceTier[keyof typeof ExperienceTier];
  // Asset
  address: string;
  city: string;
  propertyType: typeof PropertyType[keyof typeof PropertyType];
  asIsValue: string;
  sqft: string;
  taxes: string;
  insurance: string;
  // Numbers
  loanType: typeof LoanType[keyof typeof LoanType];
  targetLTV: number;
  expectedRent: string;
  arv: string;
  baseRate: number;
  // AI Rules
  floorRate: number;
  points: number;
  requireSoftPull: boolean;
  autoSendTerms: boolean;
  allowDocAuto: boolean;
  escalateOnDelta: number;
  notifyChannel: "sms+email" | "sms" | "email" | "push";
  message: string;
}

const INITIAL: FormState = {
  borrowerName: "",
  borrowerEmail: "",
  borrowerPhone: "",
  entityType: EntityType.LLC,
  entityName: "",
  experience: ExperienceTier.HEAVY,
  address: "",
  city: "",
  propertyType: PropertyType.SFR,
  asIsValue: "",
  sqft: "",
  taxes: "",
  insurance: "",
  loanType: LoanType.DSCR,
  targetLTV: 75,
  expectedRent: "",
  arv: "",
  baseRate: 7.5,
  floorRate: 6.5,
  points: 1.5,
  requireSoftPull: true,
  autoSendTerms: true,
  allowDocAuto: true,
  escalateOnDelta: 25,
  notifyChannel: "sms+email",
  message: "",
};

const STEPS = [
  { id: "borrower", label: "Borrower & Entity" },
  { id: "asset", label: "Asset" },
  { id: "numbers", label: "Numbers" },
  { id: "ai", label: "AI Rules" },
] as const;

export function SmartIntakeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTheme();
  const router = useRouter();
  const createIntake = useCreateIntake();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  if (!open) return null;

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const canAdvance = () => {
    if (step === 0) return form.borrowerName.trim().length > 0 && form.borrowerEmail.includes("@");
    if (step === 1) return form.address.trim().length > 0 && parseUSD(form.asIsValue) > 0;
    if (step === 2) return form.targetLTV > 0;
    return true;
  };

  const handleActivate = async () => {
    setSubmitErr(null);
    try {
      const payload = mapToPayload(form);
      const result = await createIntake.mutateAsync(payload);
      // Reset for next time, then navigate to the Deal Control Room.
      setForm(INITIAL);
      setStep(0);
      onClose();
      router.push(`/loans/${result.loan_id}/control-room?just-created=1`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to create loan";
      setSubmitErr(msg);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,20,28,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 32,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 880,
          maxHeight: "90vh",
          background: t.surface,
          borderRadius: 18,
          border: `1px solid ${t.line}`,
          boxShadow: t.shadowLg,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "18px 24px",
          borderBottom: `1px solid ${t.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.petrol, letterSpacing: 1.4, textTransform: "uppercase" }}>
              New Deal · Smart Intake
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: t.ink, letterSpacing: -0.4, marginTop: 2 }}>
              {STEPS[step].label}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 30, height: 30, borderRadius: 8,
              border: `1px solid ${t.line}`, background: "transparent", color: t.ink2,
              cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        {/* Stepper */}
        <div style={{
          display: "flex",
          padding: "14px 24px",
          gap: 4,
          borderBottom: `1px solid ${t.line}`,
          background: t.surface2,
        }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                background: i <= step ? t.petrol : t.line,
                color: i <= step ? "#fff" : t.ink3,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800,
              }}>
                {i < step ? "✓" : i + 1}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: i <= step ? t.ink : t.ink3, letterSpacing: 0.3 }}>
                {s.label}
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ flex: 1, height: 1, background: i < step ? t.petrol : t.line }} />
              )}
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {step === 0 && <BorrowerStepView t={t} form={form} update={update} />}
          {step === 1 && <AssetStepView t={t} form={form} update={update} />}
          {step === 2 && <NumbersStepView t={t} form={form} update={update} />}
          {step === 3 && <AIRulesStepView t={t} form={form} update={update} />}
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 24px",
          borderTop: `1px solid ${t.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: t.surface,
          gap: 12,
        }}>
          <button onClick={() => (step === 0 ? onClose() : setStep(step - 1))} style={qcBtn(t)}>
            {step === 0 ? "Cancel" : "← Back"}
          </button>
          <div style={{ flex: 1, textAlign: "center", fontSize: 12, color: submitErr ? t.danger : t.ink3, fontWeight: 600 }}>
            {submitErr ? submitErr : `Step ${step + 1} of ${STEPS.length}`}
          </div>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => canAdvance() && setStep(step + 1)}
              disabled={!canAdvance()}
              style={{
                ...qcBtnPrimary(t),
                opacity: canAdvance() ? 1 : 0.5,
                cursor: canAdvance() ? "pointer" : "not-allowed",
              }}
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={handleActivate}
              disabled={createIntake.isPending}
              style={{
                ...qcBtnPetrol(t),
                opacity: createIntake.isPending ? 0.6 : 1,
                cursor: createIntake.isPending ? "wait" : "pointer",
              }}
            >
              <Icon name="bolt" size={14} />
              {createIntake.isPending ? "Activating…" : "Activate AI & Notify Client"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Map flat form → backend nested payload ────────────────────────────────

function mapToPayload(form: FormState): SmartIntakePayload {
  const value = parseUSD(form.asIsValue);
  const ltvDecimal = form.targetLTV / 100;
  const amount = Math.round(value * ltvDecimal);
  const monthlyRent = parseUSD(form.expectedRent);
  const arv = parseUSD(form.arv);
  // Split address by comma if user provided "Street, City" — heuristic only.
  let address = form.address.trim();
  let city = form.city.trim();
  if (!city && address.includes(",")) {
    const parts = address.split(",");
    address = parts[0].trim();
    city = parts.slice(1).join(",").trim();
  }
  return {
    borrower: {
      name: form.borrowerName.trim(),
      email: form.borrowerEmail.trim(),
      phone: form.borrowerPhone.trim(),
      entity_type: form.entityType,
      entity_name: form.entityName.trim() || null,
      experience: form.experience,
    },
    asset: {
      address,
      city: city || null,
      property_type: form.propertyType,
      sqft: parseIntStrict(form.sqft) || null,
      annual_taxes: parseUSD(form.taxes),
      annual_insurance: parseUSD(form.insurance),
      as_is_value: value || null,
    },
    numbers: {
      type: form.loanType,
      amount,
      ltv: ltvDecimal,
      ltc: null,
      arv: arv || null,
      monthly_rent: monthlyRent || null,
      base_rate: form.baseRate,
    },
    ai_rules: {
      floor_rate: form.floorRate,
      max_buy_down_points: form.points,
      require_soft_pull: form.requireSoftPull,
      auto_send_terms: form.autoSendTerms,
      doc_auto_verify: form.allowDocAuto,
      escalation_delta_bps: form.escalateOnDelta,
      notify_channel: form.notifyChannel,
      intro_message: form.message.trim() || null,
    },
  };
}

// ── Step views ────────────────────────────────────────────────────────────

interface StepProps {
  t: QCTokens;
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}

function BorrowerStepView({ t, form, update }: StepProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <Field t={t} label="Borrower name" required>
        <Input t={t} value={form.borrowerName} onChange={(v) => update("borrowerName", v)} placeholder="Marcus Holloway" />
      </Field>
      <Field t={t} label="Email" required>
        <Input t={t} type="email" value={form.borrowerEmail} onChange={(v) => update("borrowerEmail", v)} placeholder="marcus@holloway.cap" />
      </Field>
      <Field t={t} label="Phone">
        <Input t={t} value={form.borrowerPhone} onChange={(v) => update("borrowerPhone", v)} placeholder="(917) 555-0148" />
      </Field>
      <Field t={t} label="Entity type">
        <Select t={t} value={form.entityType} onChange={(v) => update("entityType", v as FormState["entityType"])} options={[
          { value: EntityType.INDIVIDUAL, label: "Individual" },
          { value: EntityType.LLC, label: "LLC" },
          { value: EntityType.CORPORATION, label: "Corporation" },
          { value: EntityType.TRUST, label: "Trust" },
        ]} />
      </Field>
      <Field t={t} label="Entity name (LLC)">
        <Input t={t} value={form.entityName} onChange={(v) => update("entityName", v)} placeholder="Holloway Capital LLC" />
      </Field>
      <Field t={t} label="Experience level" full>
        <Select t={t} value={form.experience} onChange={(v) => update("experience", v as FormState["experience"])} options={[
          { value: ExperienceTier.NONE, label: "First-time investor" },
          { value: ExperienceTier.LIGHT, label: "Some experience (1–2 deals)" },
          { value: ExperienceTier.MID, label: "Experienced (3–5 deals)" },
          { value: ExperienceTier.HEAVY, label: "Institutional (5+ deals)" },
        ]} />
      </Field>
    </div>
  );
}

function AssetStepView({ t, form, update }: StepProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <Field t={t} label="Property address" full required>
        <Input t={t} value={form.address} onChange={(v) => update("address", v)} placeholder="123 Main St" />
      </Field>
      <Field t={t} label="City, State ZIP">
        <Input t={t} value={form.city} onChange={(v) => update("city", v)} placeholder="Brooklyn, NY 11201" />
      </Field>
      <Field t={t} label="Property type">
        <Select t={t} value={form.propertyType} onChange={(v) => update("propertyType", v as FormState["propertyType"])} options={[
          { value: PropertyType.SFR, label: "Single-Family Rental" },
          { value: PropertyType.UNITS_2_4, label: "2–4 Unit Multi-Family" },
          { value: PropertyType.UNITS_5_8, label: "Multi-Family (5–8 units)" },
          { value: PropertyType.MIXED_USE, label: "Mixed-Use" },
          { value: PropertyType.COMMERCIAL, label: "Commercial" },
        ]} />
      </Field>
      <Field t={t} label="As-is value" required>
        <Input t={t} value={form.asIsValue} onChange={(v) => update("asIsValue", v)} placeholder="485,000" prefix="$" />
      </Field>
      <Field t={t} label="Square footage">
        <Input t={t} value={form.sqft} onChange={(v) => update("sqft", v)} placeholder="2,140" suffix="sqft" />
      </Field>
      <Field t={t} label="Annual taxes">
        <Input t={t} value={form.taxes} onChange={(v) => update("taxes", v)} placeholder="8,420" prefix="$" />
      </Field>
      <Field t={t} label="Annual insurance">
        <Input t={t} value={form.insurance} onChange={(v) => update("insurance", v)} placeholder="2,400" prefix="$" />
      </Field>
    </div>
  );
}

function NumbersStepView({ t, form, update }: StepProps) {
  const ltv = Number(form.targetLTV) || 0;
  const value = parseUSD(form.asIsValue);
  const loanAmt = Math.round((value * ltv) / 100);
  const isDscr = form.loanType === LoanType.DSCR;
  const isFlipOrConstruct = form.loanType === LoanType.FIX_AND_FLIP || form.loanType === LoanType.GROUND_UP;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field t={t} label="Loan type">
          <Select t={t} value={form.loanType} onChange={(v) => update("loanType", v as FormState["loanType"])} options={[
            { value: LoanType.DSCR, label: "DSCR Rental" },
            { value: LoanType.FIX_AND_FLIP, label: "Fix & Flip" },
            { value: LoanType.BRIDGE, label: "Bridge" },
            { value: LoanType.GROUND_UP, label: "Ground Up / Construction" },
            { value: LoanType.PORTFOLIO, label: "Portfolio" },
            { value: LoanType.CASH_OUT_REFI, label: "Cash-Out Refi" },
          ].filter((o) => isLoanTypeEnabled(o.value))} />
        </Field>
        <Field t={t} label={`Target LTV — ${ltv}%`}>
          <input
            type="range"
            min={50}
            max={85}
            step={1}
            value={ltv}
            onChange={(e) => update("targetLTV", Number(e.target.value))}
            style={{ width: "100%", accentColor: t.petrol }}
          />
        </Field>
        <Field t={t} label={`Base rate — ${form.baseRate.toFixed(3)}%`}>
          <input
            type="range"
            min={6.0}
            max={11.0}
            step={0.125}
            value={form.baseRate}
            onChange={(e) => update("baseRate", Number(e.target.value))}
            style={{ width: "100%", accentColor: t.petrol }}
          />
        </Field>
        {isDscr && (
          <Field t={t} label="Expected monthly rent">
            <Input t={t} value={form.expectedRent} onChange={(v) => update("expectedRent", v)} placeholder="3,650" prefix="$" />
          </Field>
        )}
        {isFlipOrConstruct && (
          <Field t={t} label="ARV (after-repair value)">
            <Input t={t} value={form.arv} onChange={(v) => update("arv", v)} placeholder="640,000" prefix="$" />
          </Field>
        )}
      </div>
      {/* Live calc strip */}
      <div style={{
        marginTop: 18,
        padding: 14,
        borderRadius: 11,
        background: t.petrolSoft,
        border: `1px solid ${t.petrol}30`,
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 12,
      }}>
        <Stat t={t} label="Loan amount" value={loanAmt ? `$${loanAmt.toLocaleString()}` : "—"} accent />
        <Stat t={t} label="LTV" value={`${ltv}%`} />
        <Stat t={t} label="Property value" value={value ? `$${value.toLocaleString()}` : "—"} />
        <Stat t={t} label="Type" value={prettyLoanType(form.loanType)} />
      </div>
    </div>
  );
}

function AIRulesStepView({ t, form, update }: StepProps) {
  return (
    <div>
      <div style={{
        padding: 14,
        borderRadius: 11,
        background: t.petrolSoft,
        border: `1px solid ${t.petrol}30`,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        marginBottom: 18,
      }}>
        <Icon name="bolt" size={16} style={{ color: t.petrol, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>How the AI should handle this client</div>
          <div style={{ fontSize: 12, color: t.ink2, marginTop: 3, lineHeight: 1.5 }}>
            The co-pilot will text/email the client on activation, run gates per your rules, and pause for a human anywhere outside these guardrails.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field t={t} label={`Floor rate (buy-down limit) — ${form.floorRate.toFixed(3)}%`}>
          <input
            type="range"
            min={5.0}
            max={form.baseRate}
            step={0.125}
            value={form.floorRate}
            onChange={(e) => update("floorRate", Number(e.target.value))}
            style={{ width: "100%", accentColor: t.petrol }}
          />
        </Field>
        <Field t={t} label={`Max buy-down points — ${form.points.toFixed(2)}`}>
          <input
            type="range"
            min={0}
            max={3}
            step={0.125}
            value={form.points}
            onChange={(e) => update("points", Number(e.target.value))}
            style={{ width: "100%", accentColor: t.petrol }}
          />
        </Field>
        <Field t={t} label={`Escalate on rate delta > ${form.escalateOnDelta} bps`} full>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={form.escalateOnDelta}
            onChange={(e) => update("escalateOnDelta", Number(e.target.value))}
            style={{ width: "100%", accentColor: t.petrol }}
          />
        </Field>
      </div>

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <Toggle t={t} label="Require soft credit pull before showing terms" sub="Client consent captured in portal." value={form.requireSoftPull} onChange={(v) => update("requireSoftPull", v)} />
        <Toggle t={t} label="Auto-send custom terms after soft pull clears" sub="Skips broker-approve step on green underwriting." value={form.autoSendTerms} onChange={(v) => update("autoSendTerms", v)} />
        <Toggle t={t} label="Auto-verify standard documents (W-9, ID, bank stmts)" sub="OCR + cross-check; flags exceptions only." value={form.allowDocAuto} onChange={(v) => update("allowDocAuto", v)} />
      </div>

      <Field t={t} label="Initial message to client (optional)" full>
        <textarea
          value={form.message}
          onChange={(e) => update("message", e.target.value)}
          placeholder="Hi Marcus, I've started your file for 123 Main St. The link below will let you verify a few details, run a soft credit check, and view your custom terms in about 60 seconds…"
          style={{
            width: "100%",
            minHeight: 76,
            resize: "vertical",
            padding: "10px 12px",
            background: t.surface2,
            border: `1px solid ${t.line}`,
            borderRadius: 9,
            color: t.ink,
            fontSize: 12.5,
            fontFamily: "inherit",
            lineHeight: 1.5,
            marginTop: 14,
          }}
        />
      </Field>

      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: t.ink2, fontWeight: 600 }}>
        Notify via:
        {([
          { v: "sms+email", l: "SMS + Email" },
          { v: "sms", l: "SMS only" },
          { v: "email", l: "Email only" },
          { v: "push", l: "Push only" },
        ] as const).map((o) => (
          <button
            key={o.v}
            onClick={() => update("notifyChannel", o.v)}
            style={{
              padding: "5px 10px",
              borderRadius: 7,
              fontFamily: "inherit",
              fontSize: 11.5,
              fontWeight: 700,
              cursor: "pointer",
              background: form.notifyChannel === o.v ? t.petrol : "transparent",
              color: form.notifyChannel === o.v ? "#fff" : t.ink2,
              border: `1px solid ${form.notifyChannel === o.v ? t.petrol : t.line}`,
            }}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Tiny form primitives ──────────────────────────────────────────────────

function Field({ t, label, required, children, full }: { t: QCTokens; label: string; required?: boolean; children: ReactNode; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : "auto" }}>
      <div style={{
        fontSize: 10.5,
        fontWeight: 700,
        color: t.ink3,
        letterSpacing: 1.0,
        textTransform: "uppercase",
        marginBottom: 6,
      }}>
        {label} {required && <span style={{ color: t.danger }}>*</span>}
      </div>
      {children}
    </div>
  );
}

function Input({ t, value, onChange, placeholder, type = "text", prefix, suffix }: {
  t: QCTokens;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      {prefix && <span style={{ position: "absolute", left: 10, fontSize: 12.5, color: t.ink3, fontWeight: 600 }}>{prefix}</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: prefix ? "10px 12px 10px 22px" : "10px 12px",
          paddingRight: suffix ? 50 : 12,
          background: t.surface2,
          border: `1px solid ${t.line}`,
          borderRadius: 9,
          color: t.ink,
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
        }}
      />
      {suffix && <span style={{ position: "absolute", right: 10, fontSize: 11, color: t.ink3, fontWeight: 700 }}>{suffix}</span>}
    </div>
  );
}

function Select({ t, value, onChange, options }: {
  t: QCTokens;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        padding: "10px 12px",
        background: t.surface2,
        border: `1px solid ${t.line}`,
        borderRadius: 9,
        color: t.ink,
        fontSize: 13,
        fontFamily: "inherit",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function Toggle({ t, label, sub, value, onChange }: {
  t: QCTokens;
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 9,
        border: `1px solid ${t.line}`,
        background: t.surface2,
        color: t.ink,
        fontFamily: "inherit",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: t.ink3, marginTop: 2, fontWeight: 500 }}>{sub}</div>}
      </div>
      <div style={{
        width: 34,
        height: 20,
        borderRadius: 999,
        padding: 2,
        background: value ? t.petrol : t.line,
        transition: "background 120ms",
        flexShrink: 0,
      }}>
        <div style={{
          width: 16,
          height: 16,
          borderRadius: 999,
          background: "#fff",
          transform: value ? "translateX(14px)" : "translateX(0)",
          transition: "transform 120ms",
        }} />
      </div>
    </button>
  );
}

function Stat({ t, label, value, accent }: { t: QCTokens; label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div style={{
        fontSize: 9.5,
        fontWeight: 800,
        color: accent ? t.petrol : t.ink3,
        letterSpacing: 1.0,
        textTransform: "uppercase",
      }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: t.ink, marginTop: 2, letterSpacing: -0.3 }}>{value}</div>
    </div>
  );
}

function prettyLoanType(t: FormState["loanType"]): string {
  switch (t) {
    case LoanType.DSCR: return "DSCR";
    case LoanType.FIX_AND_FLIP: return "Fix & Flip";
    case LoanType.GROUND_UP: return "Ground Up";
    case LoanType.BRIDGE: return "Bridge";
    case LoanType.PORTFOLIO: return "Portfolio";
    case LoanType.CASH_OUT_REFI: return "Cash-Out Refi";
    default: return t;
  }
}
