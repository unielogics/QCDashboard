"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useSettings, useUpdateSettings, useUsers } from "@/hooks/useApi";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import { parseIntStrict } from "@/lib/formCoerce";
import type {
  AICadenceSettings,
  AppSettingsData,
  DocChecklistItem,
  LoanTypeChecklist,
  PricingSettings,
  ReferralSettings,
  SecuritySettings,
} from "@/lib/types";

const SECTIONS = [
  { id: "checklists", label: "Doc checklists", icon: "vault" as const },
  { id: "cadence", label: "AI cadence", icon: "ai" as const },
  { id: "referrals", label: "Referrals", icon: "user" as const },
  { id: "pricing", label: "Pricing", icon: "rates" as const },
  { id: "security", label: "Security", icon: "shield" as const },
  { id: "team", label: "Team", icon: "clients" as const },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

const LOAN_TYPES = [
  { v: "dscr", l: "DSCR" },
  { v: "fix_and_flip", l: "Fix & Flip" },
  { v: "ground_up", l: "Ground Up" },
  { v: "bridge", l: "Bridge" },
] as const;

function defaultChecklist(loanType: string): LoanTypeChecklist {
  const docsByType: Record<string, string[]> = {
    dscr: ["Borrower PFS", "Lease agreement", "Rent roll", "Insurance binder", "Title commitment", "Appraisal"],
    fix_and_flip: ["Borrower PFS", "Construction budget", "Scope of work", "Contractor bids", "Insurance binder", "Title commitment", "Appraisal"],
    ground_up: ["Borrower PFS", "Plans & specs", "Permit acceptance", "Builder agreement", "Insurance binder", "Title commitment", "Appraisal"],
    bridge: ["Borrower PFS", "Exit strategy memo", "Insurance binder", "Title commitment", "Appraisal"],
  };
  return {
    docs: (docsByType[loanType] ?? []).map((name) => ({ name, required: true, auto_request: true })),
    first_reminder_days: 3,
    second_reminder_days: 7,
    escalate_after_days: 14,
    auto_approve_risk_score: 90,
  };
}

export default function SettingsPage() {
  const { t } = useTheme();
  const profile = useActiveProfile();
  const [section, setSection] = useState<SectionId>("checklists");
  const { data: settingsData, isLoading, error } = useSettings();
  const update = useUpdateSettings();

  // Local working copy — flushed to server on Save. If the server doesn't
  // expose /settings yet (older backend deploy), seed from the typed defaults
  // so the UI is still navigable in read-only mode.
  const [draft, setDraft] = useState<AppSettingsData | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [errFlash, setErrFlash] = useState<string | null>(null);

  useEffect(() => {
    if (settingsData?.data && !draft) {
      setDraft(settingsData.data);
    } else if (error && !draft) {
      // Backend doesn't have /settings yet — fall back to local defaults so the
      // page renders. Save buttons will surface the same error on click.
      setDraft({
        checklists: {},
        ai_cadence: {
          morning_digest: "08:00",
          evening_summary: "17:30",
          auto_nudge_borrower: true,
          auto_escalate_overdue: true,
          auto_draft_replies: true,
          anomaly_alerts: true,
          weekend_ops: false,
          confidence_floor_default: 0.8,
        },
        referrals: {
          require_approval: true,
          auto_link_from_url: true,
          block_re_attribution: true,
          notify_broker_on_signup: true,
          points_per_dollar: 1.0,
          refi_multiplier: 1.25,
          expiry_days: 365,
          dispute_sla_business_days: 5,
        },
        pricing: {
          daily_pull_time: "07:00",
          auto_publish_threshold_bps: 25,
          notify_clients_on_change: true,
          lock_window_business_days: 5,
        },
        security: {
          sso_enabled: true,
          mfa_enforced: true,
          mfa_renewal_days: 14,
          borrower_portal_mfa: false,
          session_timeout_minutes: 30,
          ip_allowlist: [],
        },
      });
    }
  }, [settingsData?.data, error, draft]);

  const dirty = useMemo(() => {
    if (!draft || !settingsData?.data) return false;
    return JSON.stringify(draft) !== JSON.stringify(settingsData.data);
  }, [draft, settingsData?.data]);

  const canEdit = profile.role === Role.SUPER_ADMIN;

  const flash = (msg: string, isError = false) => {
    setSavedFlash(isError ? null : msg);
    setErrFlash(isError ? msg : null);
    setTimeout(() => { setSavedFlash(null); setErrFlash(null); }, 2400);
  };

  const handleSaveSection = async (sectionKey: keyof AppSettingsData) => {
    if (!draft || !canEdit) return;
    try {
      await update.mutateAsync({ [sectionKey]: draft[sectionKey] } as Parameters<typeof update.mutateAsync>[0]);
      flash(`${sectionKey} saved.`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Save failed.", true);
    }
  };

  if (isLoading && !draft) {
    return <div style={{ color: t.ink3, padding: 16, fontSize: 13 }}>Loading settings…</div>;
  }

  if (!draft) {
    // Final fallback — should be unreachable since useEffect seeds defaults
    // on either success or error.
    return (
      <div style={{ padding: 16 }}>
        <Pill bg={t.dangerBg} color={t.danger}>Could not load settings</Pill>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>Settings</h1>
        {canEdit ? <Pill bg={t.brandSoft} color={t.brand}>Editing as super-admin</Pill> : <Pill bg={t.warnBg} color={t.warn}>Read-only — super-admin required</Pill>}
        {error && (
          <Pill bg={t.warnBg} color={t.warn}>
            Backend /settings not deployed yet — preview mode (saves disabled)
          </Pill>
        )}
        {savedFlash && <Pill bg={t.profitBg} color={t.profit}>✓ {savedFlash}</Pill>}
        {errFlash && <Pill bg={t.dangerBg} color={t.danger}>{errFlash}</Pill>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, alignItems: "flex-start" }}>
        <Card pad={6}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 9, border: "none",
                background: section === s.id ? t.brandSoft : "transparent",
                color: section === s.id ? t.ink : t.ink2,
                fontSize: 13, fontWeight: section === s.id ? 800 : 600,
                cursor: "pointer", textAlign: "left",
              }}
            >
              <Icon name={s.icon} size={14} />
              {s.label}
            </button>
          ))}
        </Card>

        <div>
          {section === "checklists" && (
            <ChecklistsSection
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
              dirty={dirty}
              onSave={() => handleSaveSection("checklists")}
              saving={update.isPending}
            />
          )}
          {section === "cadence" && (
            <CadenceSection
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
              dirty={dirty}
              onSave={() => handleSaveSection("ai_cadence")}
              saving={update.isPending}
            />
          )}
          {section === "referrals" && (
            <ReferralsSection
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
              dirty={dirty}
              onSave={() => handleSaveSection("referrals")}
              saving={update.isPending}
            />
          )}
          {section === "pricing" && (
            <PricingSection
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
              dirty={dirty}
              onSave={() => handleSaveSection("pricing")}
              saving={update.isPending}
            />
          )}
          {section === "security" && (
            <SecuritySection
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
              dirty={dirty}
              onSave={() => handleSaveSection("security")}
              saving={update.isPending}
            />
          )}
          {section === "team" && <TeamSection canEdit={canEdit} />}
        </div>
      </div>
    </div>
  );
}

// ── Section: Doc checklists ─────────────────────────────────────────────

interface SectionProps {
  draft: AppSettingsData;
  setDraft: React.Dispatch<React.SetStateAction<AppSettingsData | null>>;
  canEdit: boolean;
  dirty: boolean;
  onSave: () => void;
  saving: boolean;
}

function ChecklistsSection({ draft, setDraft, canEdit, dirty, onSave, saving }: SectionProps) {
  const { t } = useTheme();
  const [loanType, setLoanType] = useState<string>(LOAN_TYPES[0].v);
  const checklist: LoanTypeChecklist = draft.checklists[loanType] ?? defaultChecklist(loanType);
  const [newDoc, setNewDoc] = useState("");

  const updateChecklist = (patch: Partial<LoanTypeChecklist>) => {
    setDraft((d) => d && ({
      ...d,
      checklists: { ...d.checklists, [loanType]: { ...checklist, ...patch } },
    }));
  };

  const updateDoc = (idx: number, patch: Partial<DocChecklistItem>) => {
    const nextDocs = checklist.docs.map((doc, i) => (i === idx ? { ...doc, ...patch } : doc));
    updateChecklist({ docs: nextDocs });
  };
  const removeDoc = (idx: number) => updateChecklist({ docs: checklist.docs.filter((_, i) => i !== idx) });
  const addDoc = () => {
    if (!newDoc.trim()) return;
    updateChecklist({ docs: [...checklist.docs, { name: newDoc.trim(), required: true, auto_request: true }] });
    setNewDoc("");
  };

  return (
    <Card pad={20}>
      <SectionLabel
        action={canEdit && (
          <button onClick={onSave} disabled={!dirty || saving} style={{ ...qcBtnPrimary(t), opacity: dirty && !saving ? 1 : 0.5, cursor: dirty && !saving ? "pointer" : "not-allowed" }}>
            <Icon name="check" size={13} /> {saving ? "Saving…" : "Save section"}
          </button>
        )}
      >
        Per loan-type doc checklist
      </SectionLabel>

      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        {LOAN_TYPES.map((tp) => (
          <button
            key={tp.v}
            onClick={() => setLoanType(tp.v)}
            style={{
              padding: "8px 14px", borderRadius: 9, border: "none",
              background: loanType === tp.v ? t.ink : t.surface2,
              color: loanType === tp.v ? t.inverse : t.ink2,
              fontSize: 12.5, fontWeight: 700, cursor: "pointer",
            }}
          >{tp.l}</button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {checklist.docs.map((doc, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 9, border: `1px solid ${t.line}` }}>
            <input
              type="checkbox"
              checked={doc.required}
              onChange={(e) => canEdit && updateDoc(i, { required: e.target.checked })}
              disabled={!canEdit}
              style={{ accentColor: t.petrol }}
            />
            <div style={{ flex: 1, fontSize: 13, color: t.ink, fontWeight: 600 }}>{doc.name}</div>
            <label style={{ fontSize: 11, color: t.ink3, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <input
                type="checkbox"
                checked={doc.auto_request}
                onChange={(e) => canEdit && updateDoc(i, { auto_request: e.target.checked })}
                disabled={!canEdit}
                style={{ accentColor: t.petrol }}
              />
              Auto-request
            </label>
            {canEdit && (
              <button
                onClick={() => removeDoc(i)}
                style={{ padding: 4, color: t.ink3, background: "transparent", border: "none", cursor: "pointer" }}
                aria-label={`Remove ${doc.name}`}
              >
                <Icon name="x" size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <input
            value={newDoc}
            onChange={(e) => setNewDoc(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addDoc(); }}
            placeholder="Add a new document type and press Enter"
            style={inputStyle(t)}
          />
          <button onClick={addDoc} disabled={!newDoc.trim()} style={qcBtn(t)}>
            <Icon name="plus" size={13} /> Add
          </button>
        </div>
      )}

      <div style={{ height: 18 }} />
      <SectionLabel>Reminder cadence (days)</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <Field t={t} label="First nudge">
          <NumInput t={t} value={checklist.first_reminder_days} onChange={(n) => updateChecklist({ first_reminder_days: n })} disabled={!canEdit} />
        </Field>
        <Field t={t} label="Second nudge">
          <NumInput t={t} value={checklist.second_reminder_days} onChange={(n) => updateChecklist({ second_reminder_days: n })} disabled={!canEdit} />
        </Field>
        <Field t={t} label="Escalate after">
          <NumInput t={t} value={checklist.escalate_after_days} onChange={(n) => updateChecklist({ escalate_after_days: n })} disabled={!canEdit} />
        </Field>
        <Field t={t} label="Auto-approve risk ≥">
          <NumInput t={t} value={checklist.auto_approve_risk_score} onChange={(n) => updateChecklist({ auto_approve_risk_score: n })} disabled={!canEdit} />
        </Field>
      </div>
    </Card>
  );
}

// ── Section: AI cadence ─────────────────────────────────────────────────

function CadenceSection({ draft, setDraft, canEdit, dirty, onSave, saving }: SectionProps) {
  const { t } = useTheme();
  const ac = draft.ai_cadence;
  const set = (patch: Partial<AICadenceSettings>) => setDraft((d) => d && ({ ...d, ai_cadence: { ...ac, ...patch } }));

  return (
    <Card pad={20}>
      <SectionLabel
        action={canEdit && <SaveBtn t={t} dirty={dirty} saving={saving} onClick={onSave} />}
      >
        AI cadence & autonomy
      </SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field t={t} label="Morning digest">
          <input type="time" value={ac.morning_digest} onChange={(e) => set({ morning_digest: e.target.value })} disabled={!canEdit} style={inputStyle(t)} />
        </Field>
        <Field t={t} label="Evening summary">
          <input type="time" value={ac.evening_summary} onChange={(e) => set({ evening_summary: e.target.value })} disabled={!canEdit} style={inputStyle(t)} />
        </Field>
      </div>
      <div style={{ height: 14 }} />
      <Toggle t={t} label="Auto-nudge borrowers when a doc is overdue" value={ac.auto_nudge_borrower} onChange={(v) => set({ auto_nudge_borrower: v })} disabled={!canEdit} />
      <Toggle t={t} label="Auto-escalate to UW when SLA breached" value={ac.auto_escalate_overdue} onChange={(v) => set({ auto_escalate_overdue: v })} disabled={!canEdit} />
      <Toggle t={t} label="Auto-draft replies (broker still approves)" value={ac.auto_draft_replies} onChange={(v) => set({ auto_draft_replies: v })} disabled={!canEdit} />
      <Toggle t={t} label="Anomaly alerts" value={ac.anomaly_alerts} onChange={(v) => set({ anomaly_alerts: v })} disabled={!canEdit} />
      <Toggle t={t} label="Weekend ops (AI runs on Sat/Sun)" value={ac.weekend_ops} onChange={(v) => set({ weekend_ops: v })} disabled={!canEdit} />
      <div style={{ height: 14 }} />
      <Field t={t} label={`Default confidence floor — ${(ac.confidence_floor_default * 100).toFixed(0)}%`}>
        <input
          type="range" min={0.5} max={1.0} step={0.01}
          value={ac.confidence_floor_default}
          onChange={(e) => set({ confidence_floor_default: Number(e.target.value) })}
          disabled={!canEdit}
          style={{ width: "100%", accentColor: t.petrol }}
        />
      </Field>
    </Card>
  );
}

// ── Section: Referrals ──────────────────────────────────────────────────

function ReferralsSection({ draft, setDraft, canEdit, dirty, onSave, saving }: SectionProps) {
  const { t } = useTheme();
  const r = draft.referrals;
  const set = (patch: Partial<ReferralSettings>) => setDraft((d) => d && ({ ...d, referrals: { ...r, ...patch } }));

  return (
    <Card pad={20}>
      <SectionLabel action={canEdit && <SaveBtn t={t} dirty={dirty} saving={saving} onClick={onSave} />}>Referral workflow</SectionLabel>
      <Toggle t={t} label="Require super-admin approval for self-claimed referrals" value={r.require_approval} onChange={(v) => set({ require_approval: v })} disabled={!canEdit} />
      <Toggle t={t} label="Auto-link from broker invite URL" value={r.auto_link_from_url} onChange={(v) => set({ auto_link_from_url: v })} disabled={!canEdit} />
      <Toggle t={t} label="Block re-attribution after first funded loan" value={r.block_re_attribution} onChange={(v) => set({ block_re_attribution: v })} disabled={!canEdit} />
      <Toggle t={t} label="Notify broker when their referral signs up" value={r.notify_broker_on_signup} onChange={(v) => set({ notify_broker_on_signup: v })} disabled={!canEdit} />

      <div style={{ height: 14 }} />
      <SectionLabel>Points</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <Field t={t} label="Per $1 funded">
          <FloatInput t={t} value={r.points_per_dollar} onChange={(n) => set({ points_per_dollar: n })} disabled={!canEdit} step={0.05} />
        </Field>
        <Field t={t} label="Cash-out refi multiplier">
          <FloatInput t={t} value={r.refi_multiplier} onChange={(n) => set({ refi_multiplier: n })} disabled={!canEdit} step={0.05} />
        </Field>
        <Field t={t} label="Expiry (days)">
          <NumInput t={t} value={r.expiry_days} onChange={(n) => set({ expiry_days: n })} disabled={!canEdit} />
        </Field>
      </div>
      <Field t={t} label="Dispute SLA (business days)">
        <NumInput t={t} value={r.dispute_sla_business_days} onChange={(n) => set({ dispute_sla_business_days: n })} disabled={!canEdit} />
      </Field>
    </Card>
  );
}

// ── Section: Pricing ────────────────────────────────────────────────────

function PricingSection({ draft, setDraft, canEdit, dirty, onSave, saving }: SectionProps) {
  const { t } = useTheme();
  const p = draft.pricing;
  const set = (patch: Partial<PricingSettings>) => setDraft((d) => d && ({ ...d, pricing: { ...p, ...patch } }));

  return (
    <Card pad={20}>
      <SectionLabel action={canEdit && <SaveBtn t={t} dirty={dirty} saving={saving} onClick={onSave} />}>Pricing & rate-sheet automation</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field t={t} label="Daily rate-sheet pull">
          <input type="time" value={p.daily_pull_time} onChange={(e) => set({ daily_pull_time: e.target.value })} disabled={!canEdit} style={inputStyle(t)} />
        </Field>
        <Field t={t} label="Auto-publish threshold (bps)">
          <NumInput t={t} value={p.auto_publish_threshold_bps} onChange={(n) => set({ auto_publish_threshold_bps: n })} disabled={!canEdit} />
        </Field>
        <Field t={t} label="Lock window (business days)">
          <NumInput t={t} value={p.lock_window_business_days} onChange={(n) => set({ lock_window_business_days: n })} disabled={!canEdit} />
        </Field>
      </div>
      <div style={{ height: 10 }} />
      <Toggle t={t} label="Notify clients automatically when rates change" value={p.notify_clients_on_change} onChange={(v) => set({ notify_clients_on_change: v })} disabled={!canEdit} />
    </Card>
  );
}

// ── Section: Security ───────────────────────────────────────────────────

function SecuritySection({ draft, setDraft, canEdit, dirty, onSave, saving }: SectionProps) {
  const { t } = useTheme();
  const s = draft.security;
  const set = (patch: Partial<SecuritySettings>) => setDraft((d) => d && ({ ...d, security: { ...s, ...patch } }));

  return (
    <Card pad={20}>
      <SectionLabel action={canEdit && <SaveBtn t={t} dirty={dirty} saving={saving} onClick={onSave} />}>Security</SectionLabel>
      <Toggle t={t} label="SSO (Okta)" sub="Enforce single sign-on for the operator console." value={s.sso_enabled} onChange={(v) => set({ sso_enabled: v })} disabled={!canEdit} />
      <Toggle t={t} label="MFA enforcement (TOTP / hardware key)" value={s.mfa_enforced} onChange={(v) => set({ mfa_enforced: v })} disabled={!canEdit} />
      <Toggle t={t} label="Borrower portal MFA" sub="Optional — recommended for refi flows." value={s.borrower_portal_mfa} onChange={(v) => set({ borrower_portal_mfa: v })} disabled={!canEdit} />

      <div style={{ height: 14 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field t={t} label="MFA renewal (days)">
          <NumInput t={t} value={s.mfa_renewal_days} onChange={(n) => set({ mfa_renewal_days: n })} disabled={!canEdit} />
        </Field>
        <Field t={t} label="Session timeout (minutes)">
          <NumInput t={t} value={s.session_timeout_minutes} onChange={(n) => set({ session_timeout_minutes: n })} disabled={!canEdit} />
        </Field>
      </div>
      <Field t={t} label="IP allowlist (one CIDR per line)">
        <textarea
          value={s.ip_allowlist.join("\n")}
          onChange={(e) => set({ ip_allowlist: e.target.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) })}
          disabled={!canEdit}
          rows={3}
          style={{ ...inputStyle(t), resize: "vertical" }}
        />
      </Field>
    </Card>
  );
}

// ── Section: Team ───────────────────────────────────────────────────────

function TeamSection({ canEdit }: { canEdit: boolean }) {
  const { t } = useTheme();
  const { data: users, isLoading, error } = useUsers();
  if (!canEdit) {
    return (
      <Card pad={20}>
        <div style={{ fontSize: 12.5, color: t.ink3 }}>Team management is super-admin only.</div>
      </Card>
    );
  }
  return (
    <Card pad={0}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionLabel>Operator team</SectionLabel>
        <Pill>{users?.length ?? 0} members</Pill>
      </div>
      {isLoading && <div style={{ padding: 16, fontSize: 13, color: t.ink3 }}>Loading…</div>}
      {error && <div style={{ padding: 16, fontSize: 13, color: t.danger }}>Failed to load: {error instanceof Error ? error.message : String(error)}</div>}
      {users && users.length > 0 && (
        <div>
          <div style={{
            display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 2fr) 130px 120px",
            padding: "10px 16px", fontSize: 11, fontWeight: 700, color: t.ink3,
            textTransform: "uppercase", letterSpacing: 1.2, borderBottom: `1px solid ${t.line}`,
          }}>
            <div>Name</div><div>Email</div><div>Role</div><div>Joined</div>
          </div>
          {users.map((u) => (
            <div key={u.id} style={{
              display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 2fr) 130px 120px",
              padding: "12px 16px", borderBottom: `1px solid ${t.line}`, alignItems: "center", fontSize: 13,
            }}>
              <div style={{ fontWeight: 700, color: t.ink }}>{u.name}</div>
              <div style={{ color: t.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
              <div><Pill>{u.role.replace(/_/g, " ")}</Pill></div>
              <div style={{ color: t.ink3 }}>
                {u.created_at ? new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
              </div>
            </div>
          ))}
        </div>
      )}
      {users && users.length === 0 && <div style={{ padding: 16, fontSize: 13, color: t.ink3 }}>No team members yet.</div>}
    </Card>
  );
}

// ── Form primitives ─────────────────────────────────────────────────────

function Field({ t, label, children }: { t: ReturnType<typeof useTheme>["t"]; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%", padding: "10px 12px", borderRadius: 9, background: t.surface2,
    border: `1px solid ${t.line}`, color: t.ink, fontSize: 13, fontFamily: "inherit", outline: "none",
  };
}

function NumInput({ t, value, onChange, disabled }: { t: ReturnType<typeof useTheme>["t"]; value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <input
      value={String(value)}
      onChange={(e) => onChange(parseIntStrict(e.target.value))}
      disabled={disabled}
      style={inputStyle(t)}
    />
  );
}

function FloatInput({ t, value, onChange, disabled, step = 0.01 }: { t: ReturnType<typeof useTheme>["t"]; value: number; onChange: (n: number) => void; disabled?: boolean; step?: number }) {
  return (
    <input
      type="number"
      step={step}
      value={String(value)}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      disabled={disabled}
      style={inputStyle(t)}
    />
  );
}

function Toggle({ t, label, sub, value, onChange, disabled }: { t: ReturnType<typeof useTheme>["t"]; label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        padding: "12px 14px", borderRadius: 9, border: `1px solid ${t.line}`, background: t.surface2, color: t.ink,
        fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer", textAlign: "left", marginBottom: 8,
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: t.ink3, marginTop: 2, fontWeight: 500 }}>{sub}</div>}
      </div>
      <div style={{
        width: 34, height: 20, borderRadius: 999, padding: 2,
        background: value ? t.petrol : t.line, transition: "background 120ms", flexShrink: 0,
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: 999, background: "#fff",
          transform: value ? "translateX(14px)" : "translateX(0)", transition: "transform 120ms",
        }} />
      </div>
    </button>
  );
}

function SaveBtn({ t, dirty, saving, onClick }: { t: ReturnType<typeof useTheme>["t"]; dirty: boolean; saving: boolean; onClick: () => void }) {
  const enabled = dirty && !saving;
  return (
    <button onClick={onClick} disabled={!enabled} style={{ ...qcBtnPrimary(t), opacity: enabled ? 1 : 0.5, cursor: enabled ? "pointer" : "not-allowed" }}>
      <Icon name="check" size={13} /> {saving ? "Saving…" : "Save section"}
    </button>
  );
}
