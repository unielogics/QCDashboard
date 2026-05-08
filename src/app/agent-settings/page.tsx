"use client";

// Agent Settings — the Agent's personal configuration that drives their
// client-side AI, the doc list they chase from leads, and the letterhead /
// signature applied to materials they send (prequal letters, intake links,
// etc.).
//
// Architectural rule (see memory: real_estate_domain_rules.md): these
// settings only affect the AI working the Agent's clients in the EARLY
// stages (lead / nurturing / ready). When a client transitions to
// `ready_for_lending` via the Start Funding action, the firm-wide Super
// Admin AI configuration takes over and these Agent-side settings stop
// influencing behavior on that file.
//
// Path lives at /agent-settings instead of /settings so the existing
// firm-wide /settings page (super-admin-only, hard-denied at middleware)
// stays untouched.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";

// ────────────────────────────────────────────────────────────────────────────
// Local-storage key for persistence until the backend ships agent-settings
// endpoints. Backend extension lands later — until then this page captures
// the Agent's preferences locally and surfaces them in the relevant places
// (compose drafts, prequal letter generation, AI doc-chase rules).
// TODO(P0A backend): replace with PATCH /users/me/settings (or similar).
// ────────────────────────────────────────────────────────────────────────────
const STORAGE_KEY = "qc.agent_settings.v1";

interface AgentSettings {
  ai_cadence: AICadence;
  doc_checklist: ChecklistItem[];
  letterhead: Letterhead;
}

interface AICadence {
  // Default delays in days for AI follow-ups across the lead funnel.
  initial_outreach_days: number;       // first touch after Lead is added
  no_response_nudge_days: number;       // re-nudge if no response
  stale_lead_revive_days: number;       // revive after long silence
  max_auto_followups: number;            // safety ceiling on auto-sends
  preferred_send_window: "anytime" | "business_hours" | "borrower_local";
  default_voice: "warm" | "concise" | "formal";
}

interface ChecklistItem {
  id: string;
  label: string;
  applies_when: "always" | "buyer_only" | "seller_only";
  enabled: boolean;
}

interface Letterhead {
  display_name: string;
  title: string;
  phone: string;
  email: string;
  license_number: string;     // real estate license (where applicable)
  brokerage_name: string;
  headshot_data_url: string | null;  // base64 for now; S3 upload later
  signature_block: string;            // freeform footer text
}

const DEFAULTS: AgentSettings = {
  ai_cadence: {
    initial_outreach_days: 0,
    no_response_nudge_days: 3,
    stale_lead_revive_days: 14,
    max_auto_followups: 3,
    preferred_send_window: "business_hours",
    default_voice: "warm",
  },
  doc_checklist: [
    { id: "purchase_agreement", label: "Purchase Agreement",       applies_when: "buyer_only",  enabled: true },
    { id: "buyer_agency",       label: "Buyer Agency Agreement",   applies_when: "buyer_only",  enabled: true },
    { id: "preapproval_letter", label: "Pre-Approval Letter",      applies_when: "buyer_only",  enabled: true },
    { id: "inspection_report",  label: "Inspection Report",        applies_when: "buyer_only",  enabled: false },
    { id: "listing_contract",   label: "Listing Contract",         applies_when: "seller_only", enabled: true },
    { id: "property_disclosure",label: "Property Disclosure Form", applies_when: "seller_only", enabled: true },
    { id: "lead_paint",         label: "Lead-Based Paint Disclosure (pre-1978)", applies_when: "seller_only", enabled: false },
    { id: "hoa_docs",           label: "HOA Documents",            applies_when: "seller_only", enabled: false },
    { id: "agency_disclosure",  label: "Agency Disclosure Form",   applies_when: "always",      enabled: true },
    { id: "id_verification",    label: "Government ID",            applies_when: "always",      enabled: true },
  ],
  letterhead: {
    display_name: "",
    title: "Real Estate Agent",
    phone: "",
    email: "",
    license_number: "",
    brokerage_name: "Qualified Commercial",
    headshot_data_url: null,
    signature_block: "",
  },
};

function loadSettings(): AgentSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AgentSettings>;
    return {
      ai_cadence: { ...DEFAULTS.ai_cadence, ...(parsed.ai_cadence ?? {}) },
      doc_checklist: parsed.doc_checklist ?? DEFAULTS.doc_checklist,
      letterhead: { ...DEFAULTS.letterhead, ...(parsed.letterhead ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(s: AgentSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export default function AgentSettingsPage() {
  const { t } = useTheme();
  const router = useRouter();
  const { data: user, isLoading } = useCurrentUser();
  const [settings, setSettings] = useState<AgentSettings>(DEFAULTS);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  // Hydrate from localStorage on mount + seed letterhead identity from
  // /auth/me so the Agent doesn't have to retype name + email.
  useEffect(() => {
    const loaded = loadSettings();
    if (user) {
      if (!loaded.letterhead.display_name) loaded.letterhead.display_name = user.name;
      if (!loaded.letterhead.email) loaded.letterhead.email = user.email;
    }
    setSettings(loaded);
  }, [user]);

  // Hard-redirect non-Agent roles. Super Admin / Underwriter use /settings
  // (the firm-wide config); Borrowers shouldn't reach this URL.
  useEffect(() => {
    if (!isLoading && user && user.role !== Role.BROKER && user.role !== Role.SUPER_ADMIN) {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  const handleSave = () => {
    saveSettings(settings);
    setSavedNote("Saved.");
    setTimeout(() => setSavedNote(null), 2000);
  };

  const updateCadence = <K extends keyof AICadence>(k: K, v: AICadence[K]) =>
    setSettings((s) => ({ ...s, ai_cadence: { ...s.ai_cadence, [k]: v } }));

  const updateLetterhead = <K extends keyof Letterhead>(k: K, v: Letterhead[K]) =>
    setSettings((s) => ({ ...s, letterhead: { ...s.letterhead, [k]: v } }));

  const toggleChecklist = (id: string) =>
    setSettings((s) => ({
      ...s,
      doc_checklist: s.doc_checklist.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)),
    }));

  const handleHeadshotUpload = async (file: File) => {
    if (file.size > 1.5 * 1024 * 1024) {
      alert("Headshot must be under 1.5 MB. Use a smaller file or compress.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      updateLetterhead("headshot_data_url", dataUrl);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: t.petrol }}>
            My settings
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color: t.ink, margin: "4px 0 0" }}>
            Agent Settings
          </h1>
          <div style={{ fontSize: 13, color: t.ink3, marginTop: 4, maxWidth: 560 }}>
            Personal config for your client-side AI, your transaction-doc checklist, and the
            letterhead applied to materials you send. <strong>Only affects clients in the
            early stages</strong> (Lead → Nurturing → Ready). Once a client is Ready for
            Lending, the firm&apos;s funding-side AI takes over.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {savedNote && <span style={{ fontSize: 12, fontWeight: 700, color: t.profit }}>{savedNote}</span>}
          <button onClick={handleSave} style={qcBtnPrimary(t)}>
            <Icon name="check" size={13} /> Save
          </button>
        </div>
      </div>

      {/* ─── My AI Cadence ──────────────────────────────────────────────── */}
      <Card pad={20}>
        <SectionLabel
          action={<Pill bg={t.petrolSoft} color={t.petrol}>Early-stage clients only</Pill>}
        >
          My AI Cadence
        </SectionLabel>
        <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.55, marginBottom: 14 }}>
          How often and in what voice your AI reaches out to leads + clients on your behalf.
          The full rule engine that drives this lives in the <Link href="/ai-inbox" style={{ color: t.petrol, fontWeight: 700, textDecoration: "none" }}>AI Inbox → Rules tab</Link>; these are the global defaults for new rules you create.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <NumField t={t} label="Initial outreach (days after Lead added)" value={settings.ai_cadence.initial_outreach_days} onChange={(v) => updateCadence("initial_outreach_days", v)} suffix="days" />
          <NumField t={t} label="Re-nudge after no response" value={settings.ai_cadence.no_response_nudge_days} onChange={(v) => updateCadence("no_response_nudge_days", v)} suffix="days" />
          <NumField t={t} label="Stale lead revival" value={settings.ai_cadence.stale_lead_revive_days} onChange={(v) => updateCadence("stale_lead_revive_days", v)} suffix="days" />
          <NumField t={t} label="Max auto-sends per client" value={settings.ai_cadence.max_auto_followups} onChange={(v) => updateCadence("max_auto_followups", v)} suffix="messages" />
          <Field t={t} label="Send window">
            <Select
              t={t}
              value={settings.ai_cadence.preferred_send_window}
              onChange={(v) => updateCadence("preferred_send_window", v as AICadence["preferred_send_window"])}
              options={[
                { value: "business_hours", label: "Business hours (your local)" },
                { value: "borrower_local", label: "Business hours (client's local)" },
                { value: "anytime", label: "Anytime" },
              ]}
            />
          </Field>
          <Field t={t} label="Default voice">
            <Select
              t={t}
              value={settings.ai_cadence.default_voice}
              onChange={(v) => updateCadence("default_voice", v as AICadence["default_voice"])}
              options={[
                { value: "warm", label: "Warm + relational" },
                { value: "concise", label: "Concise + factual" },
                { value: "formal", label: "Formal" },
              ]}
            />
          </Field>
        </div>
      </Card>

      {/* ─── Doc Checklist ──────────────────────────────────────────────── */}
      <Card pad={20}>
        <SectionLabel
          action={<Pill bg={t.petrolSoft} color={t.petrol}>Transaction-side only</Pill>}
        >
          My Doc Checklist
        </SectionLabel>
        <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.55, marginBottom: 12 }}>
          The transaction documents your AI will request from clients on your behalf.
          Funding-required docs (tax returns, bank statements, appraisal, etc.) are
          configured by Super Admin firm-wide and aren&apos;t shown here — your list
          lives next to those, not on top of them.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {settings.doc_checklist.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                borderRadius: 10,
                border: `1px solid ${t.line}`,
                background: item.enabled ? t.surface : t.surface2,
                opacity: item.enabled ? 1 : 0.7,
              }}
            >
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={() => toggleChecklist(item.id)}
                style={{ accentColor: t.petrol, width: 16, height: 16, cursor: "pointer" }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{item.label}</div>
              </div>
              <Pill bg={t.chip} color={t.ink2}>
                {item.applies_when === "always" ? "All clients" : item.applies_when === "buyer_only" ? "Buyers" : "Sellers"}
              </Pill>
            </div>
          ))}
        </div>
      </Card>

      {/* ─── Letterhead ──────────────────────────────────────────────────── */}
      <Card pad={20}>
        <SectionLabel>Letterhead & Identity</SectionLabel>
        <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.55, marginBottom: 14 }}>
          Applied to prequalification letter templates and any materials you send to
          your clients. Headshot, name, title, contact info, license number.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 20, alignItems: "start" }}>
          {/* Headshot uploader */}
          <div>
            <Label t={t}>Headshot</Label>
            <div
              style={{
                width: 160,
                height: 160,
                borderRadius: 12,
                border: `1px dashed ${t.line}`,
                background: t.surface2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                position: "relative",
              }}
            >
              {settings.letterhead.headshot_data_url ? (
                // Uses native img since the data: URL isn't supported by next/image's
                // remote loader without config.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.letterhead.headshot_data_url}
                  alt="Headshot"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div style={{ fontSize: 11, color: t.ink3, padding: 12, textAlign: "center", lineHeight: 1.55 }}>
                  No photo yet.
                  <br />
                  Square JPG/PNG, &lt; 1.5 MB.
                </div>
              )}
            </div>
            <label
              style={{
                ...qcBtn(t),
                marginTop: 10,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
              }}
            >
              <Icon name="upload" size={12} /> Upload
              <input
                type="file"
                accept="image/jpeg,image/png"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleHeadshotUpload(f);
                }}
              />
            </label>
            {settings.letterhead.headshot_data_url && (
              <button
                onClick={() => updateLetterhead("headshot_data_url", null)}
                style={{
                  ...qcBtn(t),
                  marginTop: 6,
                  marginLeft: 6,
                  color: t.danger,
                  borderColor: `${t.danger}40`,
                }}
              >
                Remove
              </button>
            )}
          </div>

          {/* Identity fields */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field t={t} label="Display name">
              <Input t={t} value={settings.letterhead.display_name} onChange={(v) => updateLetterhead("display_name", v)} placeholder="Avery Park" />
            </Field>
            <Field t={t} label="Title">
              <Input t={t} value={settings.letterhead.title} onChange={(v) => updateLetterhead("title", v)} placeholder="Real Estate Agent" />
            </Field>
            <Field t={t} label="Email">
              <Input t={t} type="email" value={settings.letterhead.email} onChange={(v) => updateLetterhead("email", v)} placeholder="avery@brokerage.com" />
            </Field>
            <Field t={t} label="Phone">
              <Input t={t} value={settings.letterhead.phone} onChange={(v) => updateLetterhead("phone", v)} placeholder="(917) 555-0148" />
            </Field>
            <Field t={t} label="License number">
              <Input t={t} value={settings.letterhead.license_number} onChange={(v) => updateLetterhead("license_number", v)} placeholder="State + #" />
            </Field>
            <Field t={t} label="Brokerage">
              <Input t={t} value={settings.letterhead.brokerage_name} onChange={(v) => updateLetterhead("brokerage_name", v)} placeholder="Brokerage Name" />
            </Field>
            <Field t={t} label="Signature block" full>
              <textarea
                value={settings.letterhead.signature_block}
                onChange={(e) => updateLetterhead("signature_block", e.target.value)}
                placeholder="Optional closing line — &quot;Looking forward to working with you&quot; etc."
                rows={2}
                style={{
                  width: "100%",
                  resize: "vertical",
                  padding: "10px 12px",
                  background: t.surface2,
                  border: `1px solid ${t.line}`,
                  borderRadius: 9,
                  color: t.ink,
                  fontSize: 13,
                  fontFamily: "inherit",
                  lineHeight: 1.5,
                  outline: "none",
                }}
              />
            </Field>
          </div>
        </div>
      </Card>

      <div style={{ fontSize: 11, color: t.ink3, textAlign: "center" }}>
        Settings are stored locally for now. Backend persistence + sync to prequal-letter
        templates ships once <code style={{ background: t.chip, padding: "1px 5px", borderRadius: 4 }}>PATCH /users/me/settings</code> lands.
      </div>
    </div>
  );
}

// ── Tiny form primitives (local copies — small enough not to deduplicate yet) ──

function Field({ t, label, children, full }: { t: ReturnType<typeof useTheme>["t"]; label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : "auto" }}>
      <Label t={t}>{label}</Label>
      {children}
    </div>
  );
}

function Label({ t, children }: { t: ReturnType<typeof useTheme>["t"]; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function Input({
  t,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  t: ReturnType<typeof useTheme>["t"];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
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
  );
}

function NumField({
  t,
  label,
  value,
  onChange,
  suffix,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div>
      <Label t={t}>{label}</Label>
      <div style={{ display: "inline-flex", alignItems: "center", width: "100%", background: t.surface2, border: `1px solid ${t.line}`, borderRadius: 9 }}>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "10px 12px",
            background: "transparent",
            border: "none",
            color: t.ink,
            fontSize: 13,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
        {suffix && <span style={{ padding: "0 12px 0 0", color: t.ink3, fontSize: 12 }}>{suffix}</span>}
      </div>
    </div>
  );
}

function Select({
  t,
  value,
  onChange,
  options,
}: {
  t: ReturnType<typeof useTheme>["t"];
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
        borderRadius: 9,
        background: t.surface2,
        border: `1px solid ${t.line}`,
        color: t.ink,
        fontSize: 13,
        fontFamily: "inherit",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
