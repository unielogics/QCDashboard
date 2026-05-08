"use client";

// Agent Settings — the realtor's personal configuration. Three sections:
//
//   1. Identity & Letterhead
//      • From your account — read-only (name/email from User row, Clerk-synced).
//      • Your branding   — title, license #, brokerage, headshot. Persists to
//        brokers.settings_data.letterhead. Headshot is stored as base64 data
//        URL today; v2 will replace with S3-backed key.
//
//   2. AI Cadence — single preset selector (Gentle / Standard / Aggressive).
//      "Standard" = inherit firm default (sends `cadence: null`). Advanced
//      disclosure exposes raw numeric overrides.
//
//   3. Doc Checklist — single Buyer | Seller tab strip. Loan-type axis
//      dropped (those are funding-stage, super-admin territory). Two zones:
//      starter buyer/seller docs (toggle to disable on the agent's leads),
//      and "Your additions" (custom rows).

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useBrokerSettings,
  useCurrentUser,
  useUpdateBrokerSettings,
  useUploadHeadshot,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import type {
  AgentCadenceOverride,
  AgentChecklistOverlay,
  AgentLetterhead,
  AgentSettingsData,
  DocChecklistItem,
  LoanSide,
} from "@/lib/types";

// Buyer / seller starter docs — same as AddLeadWizard, kept in sync.
// Until firm-level transaction_checklists ships (deferred), these act as
// the canonical "firm defaults" the agent toggles against.
const STARTER_BUYER_DOCS = [
  "Government ID",
  "Pre-Approval Letter",
  "Buyer Agency Agreement",
  "Purchase Agreement",
  "Earnest Money Receipt",
  "Inspection Report",
  "Proof of Funds",
];
const STARTER_SELLER_DOCS = [
  "Government ID",
  "Listing Agreement",
  "Property Disclosure",
  "HOA Documents",
  "Lead-Based Paint Disclosure",
  "Title / Deed",
  "Agency Disclosure",
];

type CadencePreset = "gentle" | "standard" | "aggressive";
const CADENCE_PRESETS: Record<
  CadencePreset,
  { first: number; second: number; escalate: number; label: string; sub: string }
> = {
  gentle:     { first: 5, second: 12, escalate: 21, label: "Gentle",     sub: "5 / 12 / 21 day nudges" },
  standard:   { first: 3, second: 7,  escalate: 14, label: "Standard",   sub: "3 / 7 / 14d — firm default" },
  aggressive: { first: 2, second: 5,  escalate: 10, label: "Aggressive", sub: "2 / 5 / 10 day nudges" },
};

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

function emptyLetterhead(): AgentLetterhead {
  return {
    title: null,
    license_number: null,
    brokerage_name: null,
    headshot_data_url: null,
    headshot_s3_key: null,
  };
}

function emptyAgentSettings(): AgentSettingsData {
  return { checklists: {}, cadence: null, letterhead: emptyLetterhead() };
}

// Map a saved cadence override → preset id. "Standard" = no override (null).
function detectPreset(c: AgentCadenceOverride | null | undefined): CadencePreset {
  if (!c) return "standard";
  const f = c.first_reminder_days ?? null;
  const s = c.second_reminder_days ?? null;
  const e = c.escalate_after_days ?? null;
  for (const id of ["gentle", "aggressive"] as const) {
    const p = CADENCE_PRESETS[id];
    if (f === p.first && s === p.second && e === p.escalate) return id;
  }
  return "standard";
}

export default function AgentSettingsPage() {
  const { t } = useTheme();
  const router = useRouter();
  const { data: user } = useCurrentUser();
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
      cadence: data.cadence ?? null,
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
  if (brokerQ.isLoading) {
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

  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 18, height: "100%", minHeight: 0 }}>
      {/* Sidebar */}
      <Card pad={0} style={{ overflow: "hidden" }}>
        <div style={{ padding: 16, borderBottom: `1px solid ${t.line}` }}>
          <SectionLabel>Agent Settings</SectionLabel>
          <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 6, lineHeight: 1.5 }}>
            Your personal branding, follow-up cadence, and lead-stage doc list.
            Per-lead overrides happen when you add a lead.
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
            user={user ?? null}
            dirty={dirty}
            saving={update.isPending}
            onSave={onSave}
          />
        )}
        {section === "cadence" && (
          <CadenceSection
            draft={draft}
            setDraft={setDraft}
            dirty={dirty}
            saving={update.isPending}
            onSave={onSave}
          />
        )}
        {section === "checklists" && (
          <ChecklistsSection
            draft={draft}
            setDraft={setDraft}
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
interface IdentityProps {
  draft: AgentSettingsData;
  setDraft: React.Dispatch<React.SetStateAction<AgentSettingsData>>;
  user: { name: string; email: string } | null;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}

function IdentitySection({ draft, setDraft, user, dirty, saving, onSave }: IdentityProps) {
  const { t } = useTheme();
  const lh = draft.letterhead ?? emptyLetterhead();
  const upload = useUploadHeadshot();
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const update = (patch: Partial<AgentLetterhead>) => {
    setDraft((d) => ({ ...d, letterhead: { ...lh, ...patch } }));
  };

  const onPickHeadshot = async (file: File | null) => {
    if (!file) return;
    setUploadErr(null);
    try {
      const r = await upload.mutateAsync(file);
      if (r.kind === "s3") {
        // Wipe legacy data URL when an S3 key is set so the
        // backend reads the production path.
        update({ headshot_s3_key: r.s3_key, headshot_data_url: null });
      } else {
        // Local dev — keep the data URL for instant preview.
        update({ headshot_data_url: r.data_url, headshot_s3_key: null });
      }
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const headshotPreview = lh.headshot_data_url || null;
  const hasS3Key = !!lh.headshot_s3_key;
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <SectionLabel>Identity & Letterhead</SectionLabel>
        <SaveBtn dirty={dirty} saving={saving} onClick={onSave} />
      </div>
      <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.5, marginBottom: 14 }}>
        Your headshot, brokerage, and license number appear on every prequal we
        generate for your clients alongside the Qualified Commercial firm logo.
      </div>

      {/* Zone 1: From your account (read-only) */}
      <div style={{
        padding: 12, borderRadius: 9,
        background: t.surface2, border: `1px solid ${t.line}`,
        marginBottom: 16,
      }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2,
          textTransform: "uppercase", color: t.ink3, marginBottom: 8,
        }}>
          From your account
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <ReadOnlyField label="Name" value={user?.name ?? "—"} />
          <ReadOnlyField label="Email" value={user?.email ?? "—"} />
        </div>
        <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 10, lineHeight: 1.5 }}>
          Synced from your profile. Edit your name or email in your account settings.
        </div>
      </div>

      {/* Zone 2: Your branding */}
      <div style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2,
        textTransform: "uppercase", color: t.ink3, marginBottom: 8,
      }}>
        Your branding
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
        <Field label="Headshot">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {hasS3Key || headshotPreview ? (
              headshotPreview ? (
                <img
                  src={headshotPreview}
                  alt="Headshot"
                  style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8, border: `1px solid ${t.line}` }}
                />
              ) : (
                <div style={{
                  width: 96, height: 96, borderRadius: 8, border: `1px solid ${t.line}`,
                  background: t.surface2, display: "flex", alignItems: "center", justifyContent: "center",
                  color: t.ink3, fontSize: 10.5, padding: 6, textAlign: "center",
                }}>
                  Stored on S3
                </div>
              )
            ) : (
              <div style={{
                width: 96, height: 96, borderRadius: 8, border: `1px dashed ${t.line}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: t.ink4, fontSize: 11,
              }}>
                No image
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => void onPickHeadshot(e.target.files?.[0] ?? null)}
                disabled={upload.isPending}
                style={inputStyle(t)}
              />
              {upload.isPending && (
                <div style={{ fontSize: 11, color: t.ink3 }}>Uploading…</div>
              )}
              {uploadErr && (
                <div style={{ fontSize: 11, color: t.danger }}>{uploadErr}</div>
              )}
              {(hasS3Key || headshotPreview) && !upload.isPending && (
                <button
                  onClick={() => update({ headshot_s3_key: null, headshot_data_url: null })}
                  style={{
                    all: "unset", cursor: "pointer",
                    fontSize: 11, color: t.danger, fontWeight: 600,
                    padding: "4px 8px", alignSelf: "flex-start",
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </Field>
      </div>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────
// Section 2: AI Cadence — preset cards + advanced disclosure
// ───────────────────────────────────────────────────────────────────
interface CadenceProps {
  draft: AgentSettingsData;
  setDraft: React.Dispatch<React.SetStateAction<AgentSettingsData>>;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}

function CadenceSection({ draft, setDraft, dirty, saving, onSave }: CadenceProps) {
  const { t } = useTheme();
  const preset = detectPreset(draft.cadence);
  const cadence = draft.cadence;
  const [showAdvanced, setShowAdvanced] = useState(
    // Auto-expand if the saved cadence doesn't match any preset (custom override)
    !!cadence && preset === "standard" &&
      (cadence.first_reminder_days != null ||
       cadence.second_reminder_days != null ||
       cadence.escalate_after_days != null)
  );

  const setPreset = (id: CadencePreset) => {
    if (id === "standard") {
      // Standard = inherit firm default = no override
      setDraft((d) => ({ ...d, cadence: null }));
    } else {
      const p = CADENCE_PRESETS[id];
      setDraft((d) => ({
        ...d,
        cadence: {
          first_reminder_days: p.first,
          second_reminder_days: p.second,
          escalate_after_days: p.escalate,
        },
      }));
    }
  };

  const updateAdvanced = (patch: Partial<AgentCadenceOverride>) => {
    setDraft((d) => ({
      ...d,
      cadence: {
        first_reminder_days: d.cadence?.first_reminder_days ?? null,
        second_reminder_days: d.cadence?.second_reminder_days ?? null,
        escalate_after_days: d.cadence?.escalate_after_days ?? null,
        ...patch,
      },
    }));
  };

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <SectionLabel>AI Cadence</SectionLabel>
        <SaveBtn dirty={dirty} saving={saving} onClick={onSave} />
      </div>
      <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.5, marginBottom: 14 }}>
        How aggressively the AI nudges your leads to send in the docs they owe.
        Pick a preset; you can override per-lead when you add a lead.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {(Object.keys(CADENCE_PRESETS) as CadencePreset[]).map((id) => {
          const p = CADENCE_PRESETS[id];
          const active = preset === id;
          return (
            <button
              key={id}
              onClick={() => setPreset(id)}
              style={{
                all: "unset", cursor: "pointer",
                padding: 14, borderRadius: 11,
                border: `2px solid ${active ? t.brand : t.line}`,
                background: active ? t.brandSoft : t.surface,
                display: "flex", flexDirection: "column", gap: 6,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: active ? t.brand : t.ink }}>
                {p.label}
              </div>
              <div style={{ fontSize: 11.5, color: t.ink3, lineHeight: 1.4 }}>
                {p.sub}
              </div>
            </button>
          );
        })}
      </div>

      {/* Advanced disclosure */}
      <div style={{ marginTop: 18 }}>
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          style={{
            all: "unset", cursor: "pointer",
            fontSize: 11.5, fontWeight: 700, color: t.ink3,
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "4px 0",
          }}
        >
          <Icon name={showAdvanced ? "chevD" : "chevR"} size={11} />
          Advanced — set exact day counts
        </button>
        {showAdvanced && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 10 }}>
            <Field label="First reminder (days)">
              <NullableNumInput
                value={cadence?.first_reminder_days ?? null}
                onChange={(n) => updateAdvanced({ first_reminder_days: n })}
                placeholder="3"
              />
            </Field>
            <Field label="Second reminder (days)">
              <NullableNumInput
                value={cadence?.second_reminder_days ?? null}
                onChange={(n) => updateAdvanced({ second_reminder_days: n })}
                placeholder="7"
              />
            </Field>
            <Field label="Escalate after (days)">
              <NullableNumInput
                value={cadence?.escalate_after_days ?? null}
                onChange={(n) => updateAdvanced({ escalate_after_days: n })}
                placeholder="14"
              />
            </Field>
          </div>
        )}
      </div>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────
// Section 3: Doc Checklist — single Buyer | Seller tab
// ───────────────────────────────────────────────────────────────────
interface ChecklistsProps {
  draft: AgentSettingsData;
  setDraft: React.Dispatch<React.SetStateAction<AgentSettingsData>>;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
}

function ChecklistsSection({ draft, setDraft, dirty, saving, onSave }: ChecklistsProps) {
  const { t } = useTheme();
  const [activeSide, setActiveSide] = useState<LoanSide>("buyer");
  // Click-to-expand state. Starter rows use string id "starter:<name>";
  // extra rows use "extra:<idx>". One row open at a time.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const overlay = draft.checklists?.[activeSide] ?? emptyOverlay();
  const starter = activeSide === "buyer" ? STARTER_BUYER_DOCS : STARTER_SELLER_DOCS;

  const setOverlay = (next: AgentChecklistOverlay) => {
    setDraft((d) => ({ ...d, checklists: { ...d.checklists, [activeSide]: next } }));
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
      due_offset_days: 7,
      anchor: "loan_created",
      per_unit: false,
      side: activeSide,
    };
    setOverlay({ ...overlay, extra_items: [...overlay.extra_items, newItem] });
    // Auto-expand the new row so the agent immediately edits its details
    setExpandedKey(`extra:${overlay.extra_items.length}`);
  };

  const updateExtra = (idx: number, patch: Partial<DocChecklistItem>) => {
    const next = [...overlay.extra_items];
    next[idx] = { ...next[idx], ...patch };
    setOverlay({ ...overlay, extra_items: next });
  };

  const removeExtra = (idx: number) => {
    const next = overlay.extra_items.filter((_, i) => i !== idx);
    setOverlay({ ...overlay, extra_items: next });
    if (expandedKey === `extra:${idx}`) setExpandedKey(null);
  };

  // Reset expanded row when switching tab so we don't accidentally
  // show a row from the other side.
  const onSideChange = (next: LoanSide) => {
    setActiveSide(next);
    setExpandedKey(null);
  };

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <SectionLabel>Doc Checklist — your leads</SectionLabel>
        <SaveBtn dirty={dirty} saving={saving} onClick={onSave} />
      </div>
      <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.5, marginBottom: 14 }}>
        What the AI will collect from your buyer-side and seller-side leads.
        Click any row to see its full detail. Disable starter items you don&apos;t
        want, and add your own. You can further override per-lead when you add a lead.
      </div>

      <Tabs t={t} value={activeSide} onChange={(v) => onSideChange(v as LoanSide)}
        options={SIDES.map((s) => ({ id: s.id, label: s.label }))} />

      {/* Starter (firm-default) zone — read-only details, toggle to disable */}
      <div style={{ marginTop: 16 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: 1.6,
          textTransform: "uppercase", color: t.ink3, marginBottom: 6,
        }}>
          Starter docs — uncheck to disable on your leads
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {starter.map((name) => {
            const disabled = overlay.disabled_firm_items.includes(name);
            const key = `starter:${name}`;
            const isExpanded = expandedKey === key;
            return (
              <div
                key={name}
                style={{
                  borderRadius: 9,
                  border: `1px solid ${isExpanded ? t.brand : t.line}`,
                  overflow: "hidden",
                  background: disabled ? t.surface2 : "transparent",
                  opacity: disabled ? 0.65 : 1,
                }}
              >
                {/* Collapsed row */}
                <div
                  onClick={() => setExpandedKey(isExpanded ? null : key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 12px", cursor: "pointer",
                    background: isExpanded ? t.brandSoft : "transparent",
                  }}
                >
                  <Icon name={isExpanded ? "chevD" : "chevR"} size={11} />
                  <input
                    type="checkbox"
                    checked={!disabled}
                    onChange={(e) => { e.stopPropagation(); toggleDisable(name); }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 700, color: t.ink,
                      textDecoration: disabled ? "line-through" : "none",
                    }}>
                      {name}
                    </div>
                  </div>
                  <Pill bg={t.surface2} color={t.ink3}>
                    {activeSide}
                  </Pill>
                </div>

                {/* Expanded details (read-only — firm defaults can't be
                    edited from the agent surface; only disabled). */}
                {isExpanded && (
                  <div style={{
                    padding: 14, borderTop: `1px solid ${t.line}`,
                    background: t.surface2, fontSize: 12.5, color: t.ink2,
                    lineHeight: 1.5,
                  }}>
                    <div>
                      <strong style={{ color: t.ink }}>What the AI collects:</strong> {name}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <strong style={{ color: t.ink }}>Side:</strong> {activeSide}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <strong style={{ color: t.ink }}>Status:</strong>{" "}
                      {disabled
                        ? "Disabled on your leads — the AI won't request this."
                        : "Active — the AI will request this from each new lead."}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11.5, color: t.ink3, fontStyle: "italic" }}>
                      Starter docs are firm-managed. To edit due dates or wording,
                      add your own version under &quot;Your additions&quot; below and
                      disable this one.
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Your additions — fully editable */}
      <div style={{ marginTop: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 1.6,
            textTransform: "uppercase", color: t.ink3,
          }}>
            Your additions — extras only you collect
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
            No additions yet. Click &quot;Add row&quot; to extend your {activeSide}-side checklist.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {overlay.extra_items.map((it, idx) => {
              const key = `extra:${idx}`;
              const isExpanded = expandedKey === key;
              const offset = it.due_offset_days ?? 7;
              return (
                <div
                  key={idx}
                  style={{
                    borderRadius: 9,
                    border: `1px solid ${isExpanded ? t.brand : t.line}`,
                    overflow: "hidden",
                  }}
                >
                  {/* Collapsed row */}
                  <div
                    onClick={() => setExpandedKey(isExpanded ? null : key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "9px 12px", cursor: "pointer",
                      background: isExpanded ? t.brandSoft : "transparent",
                    }}
                  >
                    <Icon name={isExpanded ? "chevD" : "chevR"} size={11} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {it.display_name || it.name}
                      </div>
                    </div>
                    {it.required ? <Pill>Required</Pill> : null}
                    <span style={{ fontSize: 11, color: t.ink3, whiteSpace: "nowrap" }}>
                      due +{offset}d
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeExtra(idx); }}
                      aria-label="Remove row"
                      style={{
                        width: 28, height: 28, borderRadius: 6,
                        border: `1px solid ${t.line}`, background: "transparent",
                        color: t.ink3, cursor: "pointer",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <Icon name="x" size={11} />
                    </button>
                  </div>

                  {/* Expanded editor — agent-relevant fields only.
                      Drops type/anchor/per_unit/internal_action since
                      those are funding-stage internal concerns. */}
                  {isExpanded && (
                    <div
                      style={{
                        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
                        padding: 14, borderTop: `1px solid ${t.line}`,
                        background: t.surface2,
                      }}
                    >
                      <Field label="Internal key">
                        <input
                          value={it.name}
                          onChange={(e) => updateExtra(idx, { name: e.target.value })}
                          placeholder="e.g. closing_disclosure"
                          style={inputStyle(t)}
                        />
                      </Field>
                      <Field label="What the borrower sees">
                        <input
                          value={it.display_name ?? ""}
                          onChange={(e) => updateExtra(idx, { display_name: e.target.value || null })}
                          placeholder={it.name}
                          style={inputStyle(t)}
                        />
                      </Field>
                      <Field label="Due offset (days)">
                        <NumInput
                          value={it.due_offset_days ?? 7}
                          onChange={(n) => updateExtra(idx, { due_offset_days: n })}
                        />
                      </Field>
                      <Field label="Side">
                        <select
                          value={it.side ?? activeSide}
                          onChange={(e) => updateExtra(idx, { side: e.target.value as DocChecklistItem["side"] })}
                          style={inputStyle(t)}
                        >
                          <option value="buyer">Buyer</option>
                          <option value="seller">Seller</option>
                          <option value="both">Both</option>
                        </select>
                      </Field>
                      <Toggle
                        label="Required"
                        value={!!it.required}
                        onChange={(v) => updateExtra(idx, { required: v })}
                      />
                      <Toggle
                        label="Auto-request from borrower"
                        value={it.auto_request !== false}
                        onChange={(v) => updateExtra(idx, { auto_request: v })}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────────
// Primitives
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

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  const { t } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: t.ink3 }}>
        {label}
      </span>
      <div style={{ fontSize: 13, color: t.ink, padding: "8px 10px" }}>
        {value}
      </div>
    </div>
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

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { t } = useTheme();
  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
      padding: "8px 10px", borderRadius: 7,
      border: `1px solid ${t.line}`,
    }}>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 16, height: 16, cursor: "pointer" }}
      />
      <span style={{ fontSize: 12.5, color: t.ink2, fontWeight: 600 }}>{label}</span>
    </label>
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
