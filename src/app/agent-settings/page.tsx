"use client";

// Agent Settings — the broker's personal configuration that overlays the
// firm's checklist + AI cadence for any loan they own. Backed by
// `brokers.settings_data` (alembic 0023, JSONB) via /me/broker-settings.
//
// Three sections that mirror the super-admin /settings page's visual
// rhythm:
//   1. Identity & Letterhead — agent's personal signing identity
//   2. AI Cadence — per-broker overrides for first/second/escalate
//      reminder windows. NULL field = inherit from firm defaults.
//   3. Doc Checklist — per (loan_type, side) overlay. Two zones:
//      "Firm defaults" (read-only with Disable checkbox) and
//      "Your additions" (full editor).
//
// Save uses a single PUT to /me/broker-settings with the full
// AgentSettingsData. Backend validates that disabled_firm_items
// references real firm names and that extra_items names don't shadow
// the firm.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useBrokerSettings,
  useCurrentUser,
  useSettings,
  useUpdateBrokerSettings,
} from "@/hooks/useApi";
import { LoanType, Role } from "@/lib/enums.generated";
import type {
  AgentCadenceOverride,
  AgentChecklistOverlay,
  AgentLetterhead,
  AgentSettingsData,
  DocChecklistItem,
  LoanSide,
} from "@/lib/types";

const LOAN_TYPES: { id: LoanType; label: string }[] = [
  { id: LoanType.DSCR, label: "DSCR" },
  { id: LoanType.FIX_AND_FLIP, label: "Fix & Flip" },
  { id: LoanType.GROUND_UP, label: "Ground Up" },
  { id: LoanType.BRIDGE, label: "Bridge" },
  { id: LoanType.PORTFOLIO, label: "Portfolio" },
  { id: LoanType.CASH_OUT_REFI, label: "Cash-out Refi" },
];

const SIDES: { id: LoanSide; label: string }[] = [
  { id: "buyer", label: "Buyer" },
  { id: "seller", label: "Seller" },
];

const SECTIONS = [
  { id: "identity", label: "Identity & Letterhead", icon: "user" as const },
  { id: "cadence", label: "AI Cadence", icon: "bell" as const },
  { id: "checklists", label: "Doc Checklist", icon: "vault" as const },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

function emptyOverlay(): AgentChecklistOverlay {
  return { disabled_firm_items: [], extra_items: [] };
}

function emptyCadence(): AgentCadenceOverride {
  return {
    first_reminder_days: null,
    second_reminder_days: null,
    escalate_after_days: null,
  };
}

function emptyLetterhead(): AgentLetterhead {
  return {
    display_name: null,
    title: null,
    phone: null,
    email: null,
    license_number: null,
    brokerage_name: null,
    logo_data_url: null,
    headshot_data_url: null,
  };
}

function emptyAgentSettings(): AgentSettingsData {
  return { checklists: {}, cadence: {}, letterhead: emptyLetterhead() };
}

export default function AgentSettingsPage() {
  const { t } = useTheme();
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const settingsQ = useSettings();
  const brokerQ = useBrokerSettings();
  const update = useUpdateBrokerSettings();

  const [section, setSection] = useState<SectionId>("identity");
  const [draft, setDraft] = useState<AgentSettingsData>(emptyAgentSettings());
  const [originalJson, setOriginalJson] = useState<string>("");
  const [feedback, setFeedback] = useState<string | null>(null);

  // Auth: brokers + super-admins (super-admin can preview)
  useEffect(() => {
    if (!user) return;
    if (user.role !== Role.BROKER && user.role !== Role.SUPER_ADMIN) {
      router.replace("/");
    }
  }, [user, router]);

  // Hydrate draft from API
  useEffect(() => {
    const data = brokerQ.data?.data;
    if (!data) return;
    const seeded: AgentSettingsData = {
      checklists: data.checklists ?? {},
      cadence: data.cadence ?? {},
      letterhead: data.letterhead ?? emptyLetterhead(),
    };
    setDraft(seeded);
    setOriginalJson(JSON.stringify(seeded));
  }, [brokerQ.data]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== originalJson,
    [draft, originalJson],
  );

  const onSave = async () => {
    setFeedback(null);
    try {
      const r = await update.mutateAsync(draft);
      setOriginalJson(JSON.stringify(r.data));
      setDraft(r.data);
      setFeedback("Saved.");
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Save failed.");
    }
  };

  if (user?.role === Role.CLIENT) return null;
  if (brokerQ.isLoading || settingsQ.isLoading) {
    return (
      <div style={{ padding: 24, color: t.ink3, fontSize: 13 }}>Loading…</div>
    );
  }
  if (brokerQ.isError) {
    return (
      <div style={{ padding: 24 }}>
        <Pill bg={t.dangerBg} color={t.danger}>
          {brokerQ.error instanceof Error ? brokerQ.error.message : "Couldn't load broker settings."}
        </Pill>
      </div>
    );
  }

  const firmChecklists = settingsQ.data?.data?.checklists ?? {};

  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 18, height: "100%", minHeight: 0 }}>
      {/* Sidebar */}
      <Card pad={0} style={{ overflow: "hidden" }}>
        <div style={{ padding: 16, borderBottom: `1px solid ${t.line}` }}>
          <SectionLabel>Agent Settings</SectionLabel>
          <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 6, lineHeight: 1.5 }}>
            Your personal overlay on the firm&apos;s checklist + cadence. Affects
            only loans where you&apos;re the listed broker.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: 6 }}>
          {SECTIONS.map((s) => {
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: active ? t.brandSoft : "transparent",
                  color: active ? t.brand : t.ink2,
                  fontSize: 13,
                  fontWeight: active ? 700 : 600,
                }}
              >
                <Icon name={s.icon} size={14} />
                {s.label}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Body */}
      <div style={{ minHeight: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        {section === "identity" && (
          <IdentitySection
            draft={draft}
            setDraft={setDraft}
            dirty={dirty}
            saving={update.isPending}
            onSave={onSave}
          />
        )}
        {section === "cadence" && (
          <CadenceSection
            draft={draft}
            setDraft={setDraft}
            firmChecklists={firmChecklists}
            dirty={dirty}
            saving={update.isPending}
            onSave={onSave}
          />
        )}
        {section === "checklists" && (
          <ChecklistsSection
            draft={draft}
            setDraft={setDraft}
            firmChecklists={firmChecklists}
            dirty={dirty}
            saving={update.isPending}
            onSave={onSave}
          />
        )}
        {feedback && (
          <Pill bg={feedback === "Saved." ? t.profitBg : t.warnBg} color={feedback === "Saved." ? t.profit : t.warn}>
            {feedback}
          </Pill>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Section 1: Identity & Letterhead
// ───────────────────────────────────────────────────────────────────
interface SectionProps {
  draft: AgentSettingsData;
  setDraft: React.Dispatch<React.SetStateAction<AgentSettingsData>>;
  firmChecklists?: Record<string, { docs: DocChecklistItem[] }>;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}

function IdentitySection({ draft, setDraft, dirty, saving, onSave }: SectionProps) {
  const { t } = useTheme();
  const lh = draft.letterhead ?? emptyLetterhead();
  const update = (patch: Partial<AgentLetterhead>) => {
    setDraft((d) => ({ ...d, letterhead: { ...lh, ...patch } }));
  };
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <SectionLabel>Identity & Letterhead</SectionLabel>
        <SaveBtn dirty={dirty} saving={saving} onClick={onSave} />
      </div>
      <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.5, marginBottom: 14 }}>
        Renders on prequal letters and intake links you send. Persists to
        <code style={{ padding: "1px 5px", background: t.surface2, borderRadius: 4, marginLeft: 4 }}>brokers.settings_data</code>.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Display name">
          <TextInput value={lh.display_name ?? ""} onChange={(v) => update({ display_name: v || null })} />
        </Field>
        <Field label="Title">
          <TextInput value={lh.title ?? ""} onChange={(v) => update({ title: v || null })} placeholder="Real Estate Agent" />
        </Field>
        <Field label="License #">
          <TextInput value={lh.license_number ?? ""} onChange={(v) => update({ license_number: v || null })} />
        </Field>
        <Field label="Brokerage">
          <TextInput value={lh.brokerage_name ?? ""} onChange={(v) => update({ brokerage_name: v || null })} />
        </Field>
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <ImageDataField label="Firm logo" value={lh.logo_data_url ?? null} onChange={(v) => update({ logo_data_url: v })} />
          <ImageDataField label="Realtor headshot" value={lh.headshot_data_url ?? null} onChange={(v) => update({ headshot_data_url: v })} />
        </div>
      </div>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────
// Section 2: AI Cadence (per-broker overrides)
// ───────────────────────────────────────────────────────────────────
function CadenceSection({ draft, setDraft, firmChecklists, dirty, saving, onSave }: SectionProps) {
  const { t } = useTheme();
  const [activeType, setActiveType] = useState<LoanType>(LoanType.DSCR);
  const cadence = draft.cadence?.[activeType] ?? emptyCadence();
  const firm = firmChecklists?.[activeType] as { first_reminder_days?: number; second_reminder_days?: number; escalate_after_days?: number } | undefined;
  const firmFirst = firm?.first_reminder_days ?? 3;
  const firmSecond = firm?.second_reminder_days ?? 7;
  const firmEscalate = firm?.escalate_after_days ?? 14;

  const update = (patch: Partial<AgentCadenceOverride>) => {
    setDraft((d) => ({
      ...d,
      cadence: { ...d.cadence, [activeType]: { ...cadence, ...patch } },
    }));
  };

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <SectionLabel>AI Cadence — your loans</SectionLabel>
        <SaveBtn dirty={dirty} saving={saving} onClick={onSave} />
      </div>
      <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.5, marginBottom: 14 }}>
        Override how often the AI nudges borrowers about their docs on YOUR
        loans. Leave a field blank to inherit the firm default. Per-loan-type.
      </div>
      <Tabs t={t} value={activeType} onChange={(v) => setActiveType(v as LoanType)}
        options={LOAN_TYPES.map((lt) => ({ id: lt.id, label: lt.label }))} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 14 }}>
        <Field label={`First reminder (firm: ${firmFirst}d)`}>
          <NullableNumInput value={cadence.first_reminder_days} onChange={(n) => update({ first_reminder_days: n })} placeholder={`${firmFirst}`} />
        </Field>
        <Field label={`Second reminder (firm: ${firmSecond}d)`}>
          <NullableNumInput value={cadence.second_reminder_days} onChange={(n) => update({ second_reminder_days: n })} placeholder={`${firmSecond}`} />
        </Field>
        <Field label={`Escalate (firm: ${firmEscalate}d)`}>
          <NullableNumInput value={cadence.escalate_after_days} onChange={(n) => update({ escalate_after_days: n })} placeholder={`${firmEscalate}`} />
        </Field>
      </div>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────
// Section 3: Doc Checklist (per loan_type × side overlay)
// ───────────────────────────────────────────────────────────────────
function ChecklistsSection({ draft, setDraft, firmChecklists, dirty, saving, onSave }: SectionProps) {
  const { t } = useTheme();
  const [activeType, setActiveType] = useState<LoanType>(LoanType.DSCR);
  const [activeSide, setActiveSide] = useState<LoanSide>("buyer");

  const overlayKey = `${activeType}:${activeSide}`;
  const overlay = draft.checklists?.[overlayKey] ?? emptyOverlay();

  const firmAll: DocChecklistItem[] = useMemo(() => {
    return (firmChecklists?.[activeType]?.docs ?? []) as DocChecklistItem[];
  }, [firmChecklists, activeType]);

  // Show firm items where side ∈ (activeSide, "both")
  const firmForSide = useMemo(
    () => firmAll.filter((it) => (it.side ?? "both") === activeSide || (it.side ?? "both") === "both"),
    [firmAll, activeSide],
  );

  const setOverlay = (next: AgentChecklistOverlay) => {
    setDraft((d) => ({ ...d, checklists: { ...d.checklists, [overlayKey]: next } }));
  };

  const toggleDisable = (name: string) => {
    const has = overlay.disabled_firm_items.includes(name);
    setOverlay({
      ...overlay,
      disabled_firm_items: has
        ? overlay.disabled_firm_items.filter((n) => n !== name)
        : [...overlay.disabled_firm_items, name],
    });
  };

  const addExtra = () => {
    const newItem: DocChecklistItem = {
      name: `Custom doc ${overlay.extra_items.length + 1}`,
      display_name: null,
      type: "external",
      required: false,
      auto_request: true,
      due_offset_days: 3,
      anchor: "loan_created",
      per_unit: false,
      side: activeSide,
    };
    setOverlay({ ...overlay, extra_items: [...overlay.extra_items, newItem] });
  };

  const updateExtra = (idx: number, patch: Partial<DocChecklistItem>) => {
    const next = [...overlay.extra_items];
    next[idx] = { ...next[idx], ...patch };
    setOverlay({ ...overlay, extra_items: next });
  };

  const removeExtra = (idx: number) => {
    const next = overlay.extra_items.filter((_, i) => i !== idx);
    setOverlay({ ...overlay, extra_items: next });
  };

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <SectionLabel>Doc Checklist — your loans</SectionLabel>
        <SaveBtn dirty={dirty} saving={saving} onClick={onSave} />
      </div>
      <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.5, marginBottom: 14 }}>
        Tune what the AI collects on YOUR loans. Disable firm defaults you
        don&apos;t want, and add your own rows. Affects all your future loans
        of the chosen type and side.
      </div>
      <Tabs t={t} value={activeType} onChange={(v) => setActiveType(v as LoanType)}
        options={LOAN_TYPES.map((lt) => ({ id: lt.id, label: lt.label }))} />
      <div style={{ marginTop: 10 }}>
        <Tabs t={t} value={activeSide} onChange={(v) => setActiveSide(v as LoanSide)}
          options={SIDES.map((s) => ({ id: s.id, label: s.label }))} />
      </div>

      {/* Firm defaults zone */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: t.ink3, marginBottom: 6 }}>
          Firm defaults — uncheck to disable on your loans
        </div>
        {firmForSide.length === 0 ? (
          <div style={{ fontSize: 12, color: t.ink3, fontStyle: "italic", padding: "8px 0" }}>
            No firm defaults for {activeType.replace(/_/g, " ")} ({activeSide}).
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {firmForSide.map((it) => {
              const disabled = overlay.disabled_firm_items.includes(it.name);
              return (
                <label key={it.name} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 12px", borderRadius: 9, cursor: "pointer",
                  border: `1px solid ${t.line}`,
                  background: disabled ? t.surface2 : "transparent",
                  opacity: disabled ? 0.65 : 1,
                }}>
                  <input
                    type="checkbox"
                    checked={!disabled}
                    onChange={() => toggleDisable(it.name)}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, textDecoration: disabled ? "line-through" : "none" }}>
                      {it.display_name ?? it.name}
                    </div>
                    <div style={{ fontSize: 11, color: t.ink3, marginTop: 1 }}>
                      {it.type ?? "external"} · due +{it.due_offset_days ?? 3}d
                      {it.anchor && it.anchor !== "loan_created" ? ` · ${it.anchor}` : ""}
                      {it.per_unit ? " · per-unit" : ""}
                    </div>
                  </div>
                  <Pill bg={t.surface2} color={t.ink3}>
                    {it.side ?? "both"}
                  </Pill>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Your additions zone */}
      <div style={{ marginTop: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: t.ink3 }}>
            Your additions — extras only you will collect
          </div>
          <button
            onClick={addExtra}
            style={{
              padding: "5px 10px", borderRadius: 7,
              border: `1px solid ${t.line}`, background: t.surface2,
              color: t.ink, fontSize: 12, fontWeight: 600, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}
          >
            <Icon name="plus" size={11} /> Add row
          </button>
        </div>
        {overlay.extra_items.length === 0 ? (
          <div style={{ fontSize: 12, color: t.ink3, fontStyle: "italic", padding: "8px 0" }}>
            No additions yet. Click &quot;Add row&quot; to extend the checklist for
            this loan type and side.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {overlay.extra_items.map((it, idx) => (
              <div key={idx} style={{
                padding: 12, borderRadius: 9, border: `1px solid ${t.line}`,
                display: "grid", gridTemplateColumns: "1fr 1fr 90px 100px 36px", gap: 10, alignItems: "center",
              }}>
                <input
                  value={it.name}
                  onChange={(e) => updateExtra(idx, { name: e.target.value })}
                  placeholder="Internal key (e.g. closing_disclosure)"
                  style={inputStyle(t)}
                />
                <input
                  value={it.display_name ?? ""}
                  onChange={(e) => updateExtra(idx, { display_name: e.target.value || null })}
                  placeholder="What the borrower sees"
                  style={inputStyle(t)}
                />
                <NumInput
                  value={it.due_offset_days ?? 3}
                  onChange={(n) => updateExtra(idx, { due_offset_days: n })}
                />
                <select
                  value={it.side ?? "both"}
                  onChange={(e) => updateExtra(idx, { side: e.target.value as DocChecklistItem["side"] })}
                  style={inputStyle(t)}
                >
                  <option value="buyer">Buyer</option>
                  <option value="seller">Seller</option>
                  <option value="both">Both</option>
                </select>
                <button
                  onClick={() => removeExtra(idx)}
                  aria-label="Remove row"
                  style={{
                    width: 36, height: 36, borderRadius: 7,
                    border: `1px solid ${t.line}`, background: t.surface2,
                    color: t.danger, cursor: "pointer",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Icon name="x" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────
// Primitives (matching super-admin /settings page visual language)
// ───────────────────────────────────────────────────────────────────
function Tabs<T extends string>({ t, value, onChange, options }: {
  t: ReturnType<typeof useTheme>["t"];
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div style={{ display: "flex", gap: 4, padding: 3, background: t.surface2, borderRadius: 9, width: "fit-content" }}>
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              all: "unset", cursor: "pointer",
              padding: "6px 11px", borderRadius: 7,
              fontSize: 12, fontWeight: 600,
              background: active ? t.surface : "transparent",
              color: active ? t.ink : t.ink3,
              boxShadow: active ? `0 1px 2px ${t.line}` : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: t.ink3 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 7,
    border: `1px solid ${t.line}`,
    background: t.surface2,
    color: t.ink,
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  };
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { t } = useTheme();
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={inputStyle(t)}
    />
  );
}
function ImageDataField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  const { t } = useTheme();
  const onPick = async (file: File | null) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => onChange(typeof r.result === "string" ? r.result : null);
    r.readAsDataURL(file);
  };
  return (
    <Field label={label}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input type="file" accept="image/*" onChange={(e) => void onPick(e.target.files?.[0] ?? null)} style={inputStyle(t)} />
        {value ? <img src={value} alt={label} style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8, border: `1px solid ${t.line}` }} /> : null}
      </div>
    </Field>
  );
}

function NumInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { t } = useTheme();
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      style={inputStyle(t)}
    />
  );
}

function NullableNumInput({ value, onChange, placeholder }: { value: number | null; onChange: (n: number | null) => void; placeholder?: string }) {
  const { t } = useTheme();
  return (
    <input
      type="number"
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? null : Number(v));
      }}
      placeholder={placeholder}
      style={inputStyle(t)}
    />
  );
}

function SaveBtn({ dirty, saving, onClick }: { dirty: boolean; saving: boolean; onClick: () => void }) {
  const { t } = useTheme();
  return (
    <button
      onClick={onClick}
      disabled={!dirty || saving}
      style={{
        padding: "7px 14px", borderRadius: 8,
        border: "none",
        background: dirty && !saving ? t.brand : t.chip,
        color: dirty && !saving ? t.inverse : t.ink4,
        fontSize: 12, fontWeight: 700,
        cursor: dirty && !saving ? "pointer" : "not-allowed",
      }}
    >
      {saving ? "Saving…" : "Save"}
    </button>
  );
}
