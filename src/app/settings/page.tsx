"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/lib/fmt";
import {
  Btn,
  CellChip,
  Field,
  IconBtn,
  Input,
  Kpi,
  KpiRow,
  Lbl,
  PageHeader,
  Panel,
  Row,
  Select,
  Table,
  Td,
  Textarea,
  Tr,
  WarnLine,
  cx,
} from "@/components/ds";
import {
  useCurrentUser,
  useDeleteUser,
  useAddRegionalManagerAgent,
  useGoogleConnection,
  useStartGoogleOAuth,
  useDisconnectGoogle,
  useGoogleAutomationSettings,
  useUpdateGoogleAutomationSettings,
  useProviderSettings,
  useBrokers,
  useInviteRegionalManager,
  useRegionalManagerDetail,
  useRegionalManagers,
  useRemoveRegionalManagerAgent,
  useSettings,
  useUpdateProviderSettings,
  useUpdateSettings,
  useUpdateUserRole,
  useUsers,
} from "@/hooks/useApi";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import { PageActionMenu } from "@/components/ds/PageActionMenu";
import { parseIntStrict } from "@/lib/formCoerce";
import { InviteMemberDialog } from "@/components/InviteMemberDialog";
import type {
  AICadenceSettings,
  AppSettingsData,
  DocChecklistItem,
  LetterheadSettings,
  LoanTypeChecklist,
  PricingSettings,
  ProviderSettingsUpdate,
  ReferralSettings,
  SecuritySettings,
  SimulatorSettings,
} from "@/lib/types";
import { useInitSignatureUpload } from "@/hooks/useApi";
import { DealAnalyzerSection } from "./DealAnalyzerSection";
import { BookingPageSettingsSection } from "@/components/settings/BookingPageSettingsSection";

// Doc Checklists + AI Cadence are reachable via deep-link from the
// Lending AI portal (/admin/lending-ai → Legacy tiles) but no longer
// surfaced in this sidebar — they belong under the Lending AI umbrella.
const SECTIONS = [
  { id: "checklists", label: "Doc checklists", icon: "vault" as const, hidden: true },
  { id: "cadence", label: "AI cadence", icon: "ai" as const, hidden: true },
  { id: "booking", label: "Booking page", icon: "cal" as const, hidden: false },
  { id: "referrals", label: "Referrals", icon: "user" as const, hidden: false },
  { id: "pricing", label: "Pricing", icon: "rates" as const, hidden: false },
  { id: "simulator", label: "Simulator", icon: "calc" as const, hidden: false },
  { id: "deal_analyzer", label: "Deal Analyzer", icon: "calc" as const, hidden: false },
  { id: "property_intelligence", label: "Property Intel", icon: "map" as const, hidden: false },
  { id: "connections", label: "Connections", icon: "link" as const, hidden: false },
  { id: "letterhead", label: "Firm letterhead", icon: "docCheck" as const, hidden: false },
  { id: "security", label: "Security", icon: "shield" as const, hidden: false },
  { id: "regional_managers", label: "Regional Managers", icon: "clients" as const, hidden: false },
  { id: "team", label: "Team", icon: "clients" as const, hidden: false },
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
  const profile = useActiveProfile();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Deep-link: /settings?section=cadence opens that section directly.
  // Used by /admin/lending-ai legacy tiles to route into the right
  // form. Defaults to first visible (non-hidden) section so people
  // hitting plain /settings don't land on a now-hidden legacy.
  const initialSection = (() => {
    const fromUrl = searchParams.get("section");
    if (fromUrl && SECTIONS.some(s => s.id === fromUrl)) {
      return fromUrl as SectionId;
    }
    return SECTIONS.find(s => !s.hidden)?.id ?? "checklists";
  })();
  const fromLendingAI = searchParams.get("from") === "lending-ai";
  const [section, setSection] = useState<SectionId>(initialSection);
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
      // Backfill any sections that older AppSettings rows pre-date. Without
      // this, switching to e.g. the Simulator section crashes with
      // "Cannot read properties of undefined (reading 'points_min')" because
      // the backend's persisted JSONB has no `simulator` block.
      setDraft(withDefaults(settingsData.data));
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
        ai_spend: defaultAISpend(),
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
        simulator: {
          points_min: 0,
          points_max: 3,
          points_step: 0.5,
          amount_min: 100_000,
          amount_max: 5_000_000,
          amount_step: 25_000,
          ltv_min: 0.5,
          ltv_max: 0.9,
          ltv_step: 0.05,
          advanced_mode_enabled: true,
          show_taxes: true,
          show_insurance: true,
          show_hoa: true,
          show_ltv_toggle: true,
        },
        letterhead: defaultLetterhead(),
      });
    }
  }, [settingsData?.data, error, draft]);

  const dirty = useMemo(() => {
    if (!draft || !settingsData?.data) return false;
    return JSON.stringify(draft) !== JSON.stringify(settingsData.data);
  }, [draft, settingsData?.data]);

  const canEdit = profile.role === Role.SUPER_ADMIN;

  useEffect(() => {
    const requested = searchParams.get("section");
    if (requested && SECTIONS.some((item) => item.id === requested) && requested !== section) {
      setSection(requested as SectionId);
    }
  }, [searchParams, section]);

  const selectSection = (next: SectionId) => {
    setSection(next);
    router.replace(`/settings?section=${next}`, { scroll: false });
  };

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

  const currentSettingsKey: keyof AppSettingsData | null = ({
    checklists: "checklists",
    cadence: "ai_cadence",
    referrals: "referrals",
    pricing: "pricing",
    simulator: "simulator",
    security: "security",
    letterhead: "letterhead",
  } as Partial<Record<SectionId, keyof AppSettingsData>>)[section] ?? null;

  if (isLoading && !draft) {
    return <div className="sub">Loading settings…</div>;
  }

  if (!draft) {
    // Final fallback — should be unreachable since useEffect seeds defaults
    // on either success or error.
    return (
      <div className="row">
        <CellChip tone="bad">Could not load settings</CellChip>
      </div>
    );
  }

  return (
    <div className="grid">
      <PageHeader
        title="Settings"
        lede={section === "booking" ? "Account scheduling and availability" : canEdit ? "Super-admin configuration" : "Read-only"}
        actions={<>{canEdit && currentSettingsKey ? <Btn variant="pri" onClick={() => handleSaveSection(currentSettingsKey)} disabled={!dirty || update.isPending}><Icon name="check" size={13} /> {update.isPending ? "Saving..." : "Save changes"}</Btn> : null}<PageActionMenu items={[{ label: "Lending AI", href: "/admin/lending-ai" }, { label: "Elara usage and controls", href: "/admin/token-usage" }]} /></>}
      />
      <Row>
        {canEdit ? <CellChip tone="acc">Editing as super-admin</CellChip> : <CellChip tone="warn">Read-only — super-admin required</CellChip>}
        {error ? <CellChip tone="warn">Settings service unavailable · preview mode</CellChip> : null}
        {savedFlash ? <CellChip tone="ok">{savedFlash}</CellChip> : null}
        {errFlash ? <CellChip tone="bad">{errFlash}</CellChip> : null}
      </Row>

      {/* Lending AI breadcrumb — shown when an admin arrives via a
          legacy tile in the Lending AI portal. Lets them step back. */}
      {fromLendingAI ? (
        <div className="row">
          <Link href="/admin/lending-ai" className="btn sm">
            <Icon name="chevL" size={11} /> Lending AI
          </Link>
          <span className="sub">· Legacy section</span>
        </div>
      ) : null}

      {/* A 220px rail beside a fluid body — a bespoke split, not two of the
          twelve cockpit columns, so this grid stays inline. */}
      <div className="settings-layout">
        <div className="card">
          <div className="lbl" style={{ padding: "5px 8px 2px" }}>Account</div>
          {SECTIONS.filter(s => !s.hidden && s.id === "booking").map((s) => (
            <button
              key={s.id}
              onClick={() => selectSection(s.id)}
              className={cx("pick", section === s.id && "on")}
              style={{ width: "100%", textAlign: "left", font: "inherit" }}
            >
              <Icon name={s.icon} size={14} />
              <span className="sp">{s.label}</span>
            </button>
          ))}
          <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "6px 4px" }} />
          <div className="lbl" style={{ padding: "5px 8px 2px" }}>Firm configuration</div>
          {/* Lending AI — the canonical home for AI configuration.
              Routes away (not an in-page section). Sits at the top of
              the sidebar so it's the first thing admins reach for.
              `.toollink` is the shell's own nav-row class. */}
          <Link href="/admin/lending-ai" className="toollink">
            <Icon name="spark" size={14} />
            <b className="sp">Lending AI</b>
            <span className="sub">→</span>
          </Link>
          <Link href="/admin/token-usage" className="toollink">
            <Icon name="trend" size={14} />
            <span className="sp">Elara AI Usage & Controls</span>
            <span className="sub">→</span>
          </Link>
          <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "6px 4px" }} />

          {SECTIONS.filter(s => !s.hidden && s.id !== "booking").map((s) => (
            <button
              key={s.id}
              onClick={() => selectSection(s.id)}
              // `.pick` (+ `.on`) is the sheet's selectable row: it owns the
              // frame, the hover and the selected tint. A <button> inherits
              // none of width, alignment or font from it.
              className={cx("pick", section === s.id && "on")}
              style={{ width: "100%", textAlign: "left", font: "inherit" }}
            >
              <Icon name={s.icon} size={14} />
              <span className="sp">{s.label}</span>
            </button>
          ))}
        </div>

        <div className="grid">
          {/* Legacy banner — shown when a deprecated section is active.
              Doc Checklists + AI Cadence still write to the legacy
              app_settings JSON, but the AI itself reads from
              client_ai_plan (see /admin/lending-ai). */}
          {(section === "checklists" || section === "cadence") ? (
            <WarnLine>
              <div>
                <div><b>⚠ Legacy section — kept for the non-AI loan plumbing</b></div>
                <div style={{ marginTop: 4 }}>
                  {section === "cadence"
                    ? "Borrower follow-up now runs through Lending AI → Borrower Follow-Up. This preset only feeds the older non-AI doc-reminder pipeline (job_doc_reminders)."
                    : "Loan-product requirements now live in Lending AI → Lending Playbooks (organized by stage). This list only pre-populates loans.required_docs at loan creation."}
                  {" "}Edits here keep working but the AI ignores them.
                </div>
              </div>
            </WarnLine>
          ) : null}

          {section === "booking" && <BookingPageSettingsSection embedded />}

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
          {section === "regional_managers" && <RegionalManagersSection canEdit={canEdit} />}
          {section === "simulator" && (
            <SimulatorSection
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
              dirty={dirty}
              onSave={() => handleSaveSection("simulator")}
              saving={update.isPending}
            />
          )}
          {section === "deal_analyzer" && <DealAnalyzerSection />}
          {section === "property_intelligence" && <PropertyIntelligenceSection canEdit={canEdit} />}
          {section === "connections" && <ConnectionsSection />}
          {section === "letterhead" && (
            <LetterheadSection
              draft={draft}
              setDraft={setDraft}
              canEdit={canEdit}
              dirty={dirty}
              onSave={() => handleSaveSection("letterhead")}
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

const INTERNAL_ACTION_OPTIONS = [
  { value: "", label: "(none)" },
  { value: "order_appraisal", label: "Order appraisal" },
  { value: "order_title", label: "Order title commitment" },
  { value: "shop_insurance", label: "Shop insurance" },
  { value: "request_pfs", label: "Request PFS" },
  { value: "other", label: "Other" },
];

function ChecklistsSection({ draft, setDraft, canEdit, dirty, onSave, saving }: SectionProps) {
  const [loanType, setLoanType] = useState<string>(LOAN_TYPES[0].v);
  const checklist: LoanTypeChecklist = draft.checklists[loanType] ?? defaultChecklist(loanType);
  const [newDoc, setNewDoc] = useState("");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

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
  const removeDoc = (idx: number) => {
    updateChecklist({ docs: checklist.docs.filter((_, i) => i !== idx) });
    if (expandedIdx === idx) setExpandedIdx(null);
  };
  const addDoc = () => {
    if (!newDoc.trim()) return;
    updateChecklist({
      docs: [
        ...checklist.docs,
        {
          name: newDoc.trim(),
          required: true,
          auto_request: true,
          type: "external",
          due_offset_days: 3,
          anchor: "loan_created",
          per_unit: false,
        },
      ],
    });
    setNewDoc("");
  };

  // Anchor dropdown peers — a doc can only depend on items that
  // come earlier in the list (prevents cycles).
  const anchorOptionsFor = (idx: number): { value: string; label: string }[] => {
    const peers = checklist.docs.slice(0, idx).map((d) => ({
      value: `doc_received:${d.name}`,
      label: `Doc received: ${d.display_name || d.name}`,
    }));
    return [{ value: "loan_created", label: "Loan created" }, ...peers];
  };

  return (
    <Panel
      title="Per loan-type doc checklist"
      actions={null}
    >
      {/* `.seg` is the sheet's tab strip; `.on` marks the selected loan type. */}
      <div className="seg" style={{ marginBottom: 14 }}>
        {LOAN_TYPES.map((tp) => (
          <button
            key={tp.v}
            type="button"
            className={loanType === tp.v ? "on" : ""}
            onClick={() => { setLoanType(tp.v); setExpandedIdx(null); }}
          >{tp.l}</button>
        ))}
      </div>

      {/* 6px between accordion rows — tighter than `.grid`'s 14, so it stays. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {checklist.docs.map((doc, i) => {
          const isExpanded = expandedIdx === i;
          const docType = doc.type ?? "external";
          const anchor = doc.anchor ?? "loan_created";
          const offset = doc.due_offset_days ?? 3;
          const offsetLabel = anchor === "loan_created"
            ? `+${offset}d after loan created`
            : `+${offset}d after ${anchor.replace("doc_received:", "")} received`;
          return (
            <div
              key={i}
              // The open row keeps its petrol edge; the colour is state-derived.
              style={{ borderRadius: 9, border: `1px solid ${isExpanded ? "var(--petrol)" : "var(--line)"}`, overflow: "hidden" }}
            >
              {/* Collapsed header row */}
              <div
                onClick={() => setExpandedIdx(isExpanded ? null : i)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", cursor: "pointer",
                  background: isExpanded ? "var(--accent-100)" : "transparent",
                }}
              >
                <Icon name={isExpanded ? "chevD" : "chevR"} size={12} stroke={3} />
                <b style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {doc.display_name || doc.name}
                </b>
                <CellChip tone={docType === "internal" ? "pet" : "acc"}>{docType}</CellChip>
                {doc.required ? <CellChip>Required</CellChip> : null}
                {doc.per_unit ? <CellChip tone="warn">Per unit</CellChip> : null}
                <span className="sub" style={{ whiteSpace: "nowrap" }}>{offsetLabel}</span>
                {canEdit && (
                  <IconBtn
                    onClick={(e) => { e.stopPropagation(); removeDoc(i); }}
                    aria-label={`Remove ${doc.name}`}
                  >
                    <Icon name="x" size={13} />
                  </IconBtn>
                )}
              </div>

              {/* Expanded editor — 1fr 1fr, a genuine 6 + 6 of the cockpit grid. */}
              {isExpanded && (
                <div
                  className="cg"
                  style={{ padding: 14, borderTop: "1px solid var(--line)", background: "var(--sunken2)" }}
                >
                  <Field className="s6" label="Display name">
                    <Input
                      value={doc.display_name ?? ""}
                      onChange={(e) => updateDoc(i, { display_name: e.target.value || null })}
                      placeholder={doc.name}
                      disabled={!canEdit}
                    />
                  </Field>
                  <Field className="s6" label="Type">
                    <div className="seg">
                      {(["external", "internal"] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          className={docType === opt ? "on" : ""}
                          onClick={() => canEdit && updateDoc(i, { type: opt })}
                          disabled={!canEdit}
                          style={{ textTransform: "capitalize" }}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field className="s6" label="Anchor (when this fires)">
                    <Select
                      value={anchor}
                      onChange={(e) => canEdit && updateDoc(i, { anchor: e.target.value })}
                      disabled={!canEdit}
                    >
                      {anchorOptionsFor(i).map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field className="s6" label="Due offset (days from anchor)">
                    <NumInput
                      value={offset}
                      onChange={(n) => canEdit && updateDoc(i, { due_offset_days: n })}
                      disabled={!canEdit}
                    />
                  </Field>

                  <Field className="s6" label="Required">
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={doc.required}
                        onChange={(e) => canEdit && updateDoc(i, { required: e.target.checked })}
                        disabled={!canEdit}
                        style={{ accentColor: "var(--accent)" }}
                      />
                      <span className="sub">Item is required for this loan type</span>
                    </label>
                  </Field>
                  <Field className="s6" label="Auto-request at intake">
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={doc.auto_request}
                        onChange={(e) => canEdit && updateDoc(i, { auto_request: e.target.checked })}
                        disabled={!canEdit}
                        style={{ accentColor: "var(--accent)" }}
                      />
                      <span className="sub">Spawn this on loan kickoff</span>
                    </label>
                  </Field>

                  {docType === "external" ? (
                    <Field className="s6" label="Per-unit fan-out">
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={!!doc.per_unit}
                          onChange={(e) => canEdit && updateDoc(i, { per_unit: e.target.checked })}
                          disabled={!canEdit}
                          style={{ accentColor: "var(--accent)" }}
                        />
                        <span className="sub">One row per unit (e.g. 4-plex → 4 leases)</span>
                      </label>
                    </Field>
                  ) : (
                    <Field className="s6" label="Internal action (operator CTA)">
                      <Select
                        value={doc.internal_action ?? ""}
                        onChange={(e) => canEdit && updateDoc(i, { internal_action: e.target.value || null })}
                        disabled={!canEdit}
                      >
                        {INTERNAL_ACTION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </Select>
                    </Field>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {canEdit && (
        <div className="row mt">
          <Input
            grow
            value={newDoc}
            onChange={(e) => setNewDoc(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addDoc(); }}
            placeholder="Add a new document type and press Enter"
          />
          <Btn onClick={addDoc} disabled={!newDoc.trim()}>
            <Icon name="plus" size={13} /> Add
          </Btn>
        </div>
      )}

      <Lbl className="mt">Reminder cadence (days)</Lbl>
      {/* Four equal columns — a genuine 3 + 3 + 3 + 3 of the cockpit grid. */}
      <div className="cg mt">
        <Field className="s3" label="First nudge">
          <NumInput value={checklist.first_reminder_days} onChange={(n) => updateChecklist({ first_reminder_days: n })} disabled={!canEdit} />
        </Field>
        <Field className="s3" label="Second nudge">
          <NumInput value={checklist.second_reminder_days} onChange={(n) => updateChecklist({ second_reminder_days: n })} disabled={!canEdit} />
        </Field>
        <Field className="s3" label="Escalate after">
          <NumInput value={checklist.escalate_after_days} onChange={(n) => updateChecklist({ escalate_after_days: n })} disabled={!canEdit} />
        </Field>
        <Field className="s3" label="Auto-approve risk ≥">
          <NumInput value={checklist.auto_approve_risk_score} onChange={(n) => updateChecklist({ auto_approve_risk_score: n })} disabled={!canEdit} />
        </Field>
      </div>
    </Panel>
  );
}

// ── Section: AI cadence ─────────────────────────────────────────────────

function CadenceSection({ draft, setDraft, canEdit, dirty, onSave, saving }: SectionProps) {
  const ac = draft.ai_cadence;
  const set = (patch: Partial<AICadenceSettings>) => setDraft((d) => d && ({ ...d, ai_cadence: { ...ac, ...patch } }));

  return (
    <Panel title="AI cadence & autonomy">
      <div className="cg">
        <Field className="s6" label="Morning digest">
          <Input type="time" value={ac.morning_digest} onChange={(e) => set({ morning_digest: e.target.value })} disabled={!canEdit} />
        </Field>
        <Field className="s6" label="Evening summary">
          <Input type="time" value={ac.evening_summary} onChange={(e) => set({ evening_summary: e.target.value })} disabled={!canEdit} />
        </Field>
      </div>
      <div className="mt">
        <Toggle label="Auto-nudge borrowers when a doc is overdue" value={ac.auto_nudge_borrower} onChange={(v) => set({ auto_nudge_borrower: v })} disabled={!canEdit} />
        <Toggle label="Auto-escalate to UW when SLA breached" value={ac.auto_escalate_overdue} onChange={(v) => set({ auto_escalate_overdue: v })} disabled={!canEdit} />
        <Toggle label="Auto-draft replies (broker still approves)" value={ac.auto_draft_replies} onChange={(v) => set({ auto_draft_replies: v })} disabled={!canEdit} />
        <Toggle label="Anomaly alerts" value={ac.anomaly_alerts} onChange={(v) => set({ anomaly_alerts: v })} disabled={!canEdit} />
        <Toggle label="Weekend ops (AI runs on Sat/Sun)" value={ac.weekend_ops} onChange={(v) => set({ weekend_ops: v })} disabled={!canEdit} />
      </div>
      <Field className="mt" label={`Default confidence floor — ${(ac.confidence_floor_default * 100).toFixed(0)}%`}>
        {/* A range track has no class in the sheet; width and accent stay inline. */}
        <input
          type="range" min={0.5} max={1.0} step={0.01}
          value={ac.confidence_floor_default}
          onChange={(e) => set({ confidence_floor_default: Number(e.target.value) })}
          disabled={!canEdit}
          style={{ width: "100%", accentColor: "var(--accent)" }}
        />
      </Field>
    </Panel>
  );
}

// ── Section: Referrals ──────────────────────────────────────────────────

function ReferralsSection({ draft, setDraft, canEdit, dirty, onSave, saving }: SectionProps) {
  const r = draft.referrals;
  const set = (patch: Partial<ReferralSettings>) => setDraft((d) => d && ({ ...d, referrals: { ...r, ...patch } }));

  return (
    <Panel title="Referral workflow">
      <Toggle label="Require super-admin approval for self-claimed referrals" value={r.require_approval} onChange={(v) => set({ require_approval: v })} disabled={!canEdit} />
      <Toggle label="Auto-link from broker invite URL" value={r.auto_link_from_url} onChange={(v) => set({ auto_link_from_url: v })} disabled={!canEdit} />
      <Toggle label="Block re-attribution after first funded loan" value={r.block_re_attribution} onChange={(v) => set({ block_re_attribution: v })} disabled={!canEdit} />
      <Toggle label="Notify broker when their referral signs up" value={r.notify_broker_on_signup} onChange={(v) => set({ notify_broker_on_signup: v })} disabled={!canEdit} />

      <Lbl className="mt">Points</Lbl>
      <div className="cg mt">
        <Field className="s4" label="Per $1 funded">
          <FloatInput value={r.points_per_dollar} onChange={(n) => set({ points_per_dollar: n })} disabled={!canEdit} step={0.05} />
        </Field>
        <Field className="s4" label="Cash-out refi multiplier">
          <FloatInput value={r.refi_multiplier} onChange={(n) => set({ refi_multiplier: n })} disabled={!canEdit} step={0.05} />
        </Field>
        <Field className="s4" label="Expiry (days)">
          <NumInput value={r.expiry_days} onChange={(n) => set({ expiry_days: n })} disabled={!canEdit} />
        </Field>
      </div>
      <Field className="mt" label="Dispute SLA (business days)">
        <NumInput value={r.dispute_sla_business_days} onChange={(n) => set({ dispute_sla_business_days: n })} disabled={!canEdit} />
      </Field>
    </Panel>
  );
}

// ── Section: Pricing ────────────────────────────────────────────────────

function PricingSection({ draft, setDraft, canEdit, dirty, onSave, saving }: SectionProps) {
  const p = draft.pricing;
  const set = (patch: Partial<PricingSettings>) => setDraft((d) => d && ({ ...d, pricing: { ...p, ...patch } }));

  return (
    <Panel title="Pricing & rate-sheet automation">
      <div className="cg">
        <Field className="s6" label="Daily rate-sheet pull">
          <Input type="time" value={p.daily_pull_time} onChange={(e) => set({ daily_pull_time: e.target.value })} disabled={!canEdit} />
        </Field>
        <Field className="s6" label="Auto-publish threshold (bps)">
          <NumInput value={p.auto_publish_threshold_bps} onChange={(n) => set({ auto_publish_threshold_bps: n })} disabled={!canEdit} />
        </Field>
        <Field className="s6" label="Lock window (business days)">
          <NumInput value={p.lock_window_business_days} onChange={(n) => set({ lock_window_business_days: n })} disabled={!canEdit} />
        </Field>
      </div>
      <div className="mt">
        <Toggle label="Notify clients automatically when rates change" value={p.notify_clients_on_change} onChange={(v) => set({ notify_clients_on_change: v })} disabled={!canEdit} />
      </div>
    </Panel>
  );
}

// ── Section: Security ───────────────────────────────────────────────────

/** Real two-step verification state, read from Clerk rather than asserted.
 *
 * Replaces three toggles that wrote to our settings row and were read by
 * nothing. This shows what is actually true for the signed-in operator and
 * sends them to the one place that can change it. Instance-wide enforcement is
 * a Clerk dashboard setting; we deliberately do not mirror it here, because a
 * mirrored copy is exactly what went stale last time.
 */
function MfaPanel() {
  const { isLoaded, user } = useUser();
  const enrolled = !!user && (user.twoFactorEnabled || (user.passkeys?.length ?? 0) > 0);

  return (
    <div className="card">
      <div className="row">
        <b>Two-step verification</b>
        {isLoaded && (
          <CellChip tone={enrolled ? "ok" : "bad"}>
            {enrolled ? "Active on your account" : "Not set up"}
          </CellChip>
        )}
      </div>
      <div className="sub" style={{ margin: "6px 0 10px" }}>
        Required for every operator login. Enrolment and instance-wide enforcement are
        managed in Clerk, so this page reports the state rather than setting it.
      </div>
      <Link href="/account/security" className="btn">
        {enrolled ? "Review" : "Set it up"}
      </Link>
    </div>
  );
}

function SecuritySection({ draft, setDraft, canEdit, dirty, onSave, saving }: SectionProps) {
  const s = draft.security;
  const set = (patch: Partial<SecuritySettings>) => setDraft((d) => d && ({ ...d, security: { ...s, ...patch } }));

  return (
    <Panel title="Security">
      <Toggle label="SSO (Okta)" sub="Enforce single sign-on for the operator console." value={s.sso_enabled} onChange={(v) => set({ sso_enabled: v })} disabled={!canEdit} />

      {/* Two-step verification is owned by Clerk, not by these settings.
          This panel used to render toggles for "MFA enforcement", "Borrower
          portal MFA" and a renewal period, all of which wrote to our own
          settings row and were read by nothing. A control that claims to
          enforce authentication and does not is worse than no control: it
          tells an auditor, and us, that something is on when it is off.
          Enforcement now lives in the Clerk dashboard, and this links there. */}
      <div className="mt">
        <MfaPanel />
      </div>

      <div className="cg mt">
        <Field className="s6" label="Session timeout (minutes)">
          <NumInput value={s.session_timeout_minutes} onChange={(n) => set({ session_timeout_minutes: n })} disabled={!canEdit} />
        </Field>
      </div>
      <Field className="mt" label="IP allowlist (one CIDR per line)">
        <Textarea
          value={s.ip_allowlist.join("\n")}
          onChange={(e) => set({ ip_allowlist: e.target.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) })}
          disabled={!canEdit}
          rows={3}
          style={{ resize: "vertical" }}
        />
      </Field>
    </Panel>
  );
}

// ── Section: Property Intelligence ──────────────────────────────────────

function ConnectionsSection() {
  const searchParams = useSearchParams();
  const { data, isLoading, error, refetch } = useGoogleConnection();
  const startOAuth = useStartGoogleOAuth();
  const disconnect = useDisconnectGoogle();
  const { data: automation } = useGoogleAutomationSettings();
  const updateAutomation = useUpdateGoogleAutomationSettings();
  const [flash, setFlash] = useState<string | null>(null);

  // Returning from the Google consent screen (?connected=1 / ?error=...).
  useEffect(() => {
    if (searchParams.get("connected") === "1") {
      setFlash("Google connected.");
      refetch();
    } else if (searchParams.get("error")) {
      setFlash(`Google connection failed: ${searchParams.get("error")}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async (services: string) => {
    try {
      const { auth_url } = await startOAuth.mutateAsync(services);
      window.location.href = auth_url;
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Could not start Google connection.");
    }
  };

  const connected = Boolean(data?.connected);
  const services: Array<{ key: string; label: string; desc: string; on: boolean }> = [
    { key: "gmail", label: "Gmail", desc: "Send loan & lender emails from your own address.", on: Boolean(data?.gmail_connected) },
    { key: "calendar", label: "Google Calendar", desc: "Two-way sync plus Google Meet creation for client bookings.", on: Boolean(data?.calendar_connected) },
    { key: "drive", label: "Google Drive", desc: "Attach Drive files to emails & share with the AI (coming soon).", on: Boolean(data?.drive_connected) },
  ];

  return (
    <Panel title="Google connections">
      <div className="sub">
        Connect your own Google account so the platform can send email as you, sync your calendar, and use your Drive.
        Your credentials are encrypted and never shared.
      </div>

      {flash ? <div className="note">{flash}</div> : null}

      {data?.oauth_configured === false ? (
        <div className="mt">
          <StatusLine kind="warn">
            {data.oauth_configuration_message || "Google OAuth setup is required before accounts can connect."}
          </StatusLine>
        </div>
      ) : null}

      {isLoading ? (
        <div className="sub mt">Loading connection status…</div>
      ) : error ? (
        <div className="mt">
          <StatusLine kind="err">Connection status unavailable.</StatusLine>
        </div>
      ) : (
        <>
          <div className="row mt">
            <CellChip tone={connected ? "ok" : "mut"}>
              {connected ? `Connected${data?.google_email ? ` · ${data.google_email}` : ""}` : "Not connected"}
            </CellChip>
            {connected ? (
              <Btn onClick={() => disconnect.mutate(undefined, { onSuccess: () => { setFlash("Disconnected."); refetch(); } })} disabled={disconnect.isPending}>
                {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
              </Btn>
            ) : (
              <Btn variant="pri" onClick={() => connect("gmail")} disabled={startOAuth.isPending || data?.oauth_configured === false}>
                {data?.oauth_configured === false ? "Setup required" : startOAuth.isPending ? "Opening Google…" : "Connect Google"}
              </Btn>
            )}
          </div>

          {/* `.filerow` — the sheet's hairline-separated list row. */}
          <div className="mt">
            {services.map((s) => (
              <div key={s.key} className="filerow">
                <div className="sp">
                  <b>{s.label}</b>
                  <div className="sub">{s.desc}</div>
                </div>
                <CellChip tone={s.on ? "ok" : "mut"}>{s.on ? "On" : "Off"}</CellChip>
                {connected && !s.on ? (
                  <Btn size="sm" onClick={() => connect(s.key)} disabled={startOAuth.isPending || data?.oauth_configured === false}>Enable</Btn>
                ) : null}
              </div>
            ))}
          </div>

          {connected ? (
            <div className="mt" style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
              <Lbl>Automated emails</Lbl>
              <div className="sub" style={{ margin: "4px 0 10px" }}>
                Sent from your connected Gmail. Each also requires the firm master switch (Settings → AI cadence).
              </div>
              {([
                ["status_change_emails", "Notify realtor on file status changes", "Emails the realtor when a file moves to lender-connected, processing, closing, or funded."],
                ["re_agent_auto_emails", "Automated task & collection nudges to realtors", "Lets cadence rules email the realtor about items to collect or clarify."],
                ["merged_updates_auto", "Auto-send merged client + realtor updates", "Allows merged updates to send without manual approval."],
              ] as const).map(([key, label, desc]) => {
                const on = Boolean(automation?.[key]);
                return (
                  <div key={key} className="filerow">
                    <div className="sp">
                      <b>{label}</b>
                      <div className="sub">{desc}</div>
                    </div>
                    {/* No switch exists in the stylesheet, so the track and
                        knob stay inline — the one thing on this row that is
                        not already a class. */}
                    <button
                      type="button"
                      onClick={() => automation && updateAutomation.mutate({ ...automation, [key]: !on })}
                      disabled={updateAutomation.isPending}
                      style={{
                        width: 44, height: 24, borderRadius: 999, border: "none", cursor: "pointer", position: "relative", flexShrink: 0,
                        background: on ? "var(--accent)" : "var(--sunken)", transition: "background .15s",
                      }}
                      aria-pressed={on}
                    >
                      <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: 999, background: "#fff", transition: "left .15s" }} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}

          {data?.last_error ? (
            <div className="mt">
              <StatusLine kind="warn">Last error: {data.last_error} — reconnect to resolve.</StatusLine>
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}

function PropertyIntelligenceSection({ canEdit }: { canEdit: boolean }) {
  const { data, isLoading, error } = useProviderSettings();
  const update = useUpdateProviderSettings();
  const [rentcastKey, setRentcastKey] = useState("");
  const [googleServerKey, setGoogleServerKey] = useState("");
  const [googleBrowserKey, setGoogleBrowserKey] = useState("");
  const [googleIosKey, setGoogleIosKey] = useState("");
  const [googleAndroidKey, setGoogleAndroidKey] = useState("");
  const [geoapifyKey, setGeoapifyKey] = useState("");
  const [addressProvider, setAddressProvider] = useState<"google" | "geoapify">("google");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [ttlHours, setTtlHours] = useState(24);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setAiEnabled(data.property_analysis_ai_enabled);
    setTtlHours(data.property_intelligence_cache_ttl_hours);
    setAddressProvider(data.address_provider);
  }, [data]);

  const dirty =
    rentcastKey.trim() ||
    googleServerKey.trim() ||
    googleBrowserKey.trim() ||
    googleIosKey.trim() ||
    googleAndroidKey.trim() ||
    geoapifyKey.trim() ||
    (data && (
      aiEnabled !== data.property_analysis_ai_enabled ||
      ttlHours !== data.property_intelligence_cache_ttl_hours ||
      addressProvider !== data.address_provider
    ));

  const save = async () => {
    if (!canEdit) return;
    const payload: ProviderSettingsUpdate = {
      property_analysis_ai_enabled: aiEnabled,
      property_intelligence_cache_ttl_hours: ttlHours,
      address_provider: addressProvider,
    };
    if (rentcastKey.trim()) payload.rentcast_api_key = rentcastKey.trim();
    if (googleServerKey.trim()) payload.google_server_api_key = googleServerKey.trim();
    if (googleBrowserKey.trim()) payload.google_maps_browser_key = googleBrowserKey.trim();
    if (googleIosKey.trim()) payload.google_maps_ios_key = googleIosKey.trim();
    if (googleAndroidKey.trim()) payload.google_maps_android_key = googleAndroidKey.trim();
    if (geoapifyKey.trim()) payload.geoapify_api_key = geoapifyKey.trim();
    try {
      await update.mutateAsync(payload);
      setRentcastKey("");
      setGoogleServerKey("");
      setGoogleBrowserKey("");
      setGoogleIosKey("");
      setGoogleAndroidKey("");
      setGeoapifyKey("");
      setFlash({ kind: "ok", msg: "Provider settings saved." });
    } catch (e) {
      setFlash({ kind: "err", msg: e instanceof Error ? e.message : "Save failed." });
    }
    setTimeout(() => setFlash(null), 2600);
  };

  return (
    <Panel
      title="Property intelligence"
      actions={canEdit && (
        <Btn variant="pri" onClick={save} disabled={!dirty || update.isPending}>
          <Icon name="check" size={13} /> {update.isPending ? "Saving..." : "Save providers"}
        </Btn>
      )}
    >
      {isLoading ? (
        <div className="sub">Loading provider settings...</div>
      ) : error ? (
        <StatusLine kind="err">{error instanceof Error ? error.message : "Provider settings unavailable"}</StatusLine>
      ) : (
        <>
          <div className="row">
            <StatusPill label="RentCast" ok={!!data?.rentcast_configured} />
            <StatusPill label="Google Places/Geocoding" ok={!!data?.google_server_configured} />
            <StatusPill label="Geoapify" ok={!!data?.geoapify_configured} />
            <StatusPill label={`${data?.address_provider === "geoapify" ? "Geoapify" : "Google"} active`} ok={!!data?.address_provider_ready} />
            <StatusPill label="Google Maps web" ok={!!data?.google_maps_browser_key_configured} />
            <StatusPill label="Google Maps iOS" ok={!!data?.google_maps_ios_key_configured} />
            <StatusPill label="Google Maps Android" ok={!!data?.google_maps_android_key_configured} />
          </div>

          <div className="sub mt">
            Address search uses exactly the selected provider. Keys are stored encrypted; leave a key blank to keep its saved value.
          </div>

          <Field label="Address autocomplete and resolution provider">
            <Select value={addressProvider} onChange={(event) => setAddressProvider(event.target.value as "google" | "geoapify")} disabled={!canEdit}>
              <option value="geoapify">Geoapify (recommended)</option>
              <option value="google">Google Places / Geocoding</option>
            </Select>
          </Field>

          {/* 1fr 1fr — a genuine 6 + 6 of the cockpit grid. */}
          <div className="cg mt">
            <SecretField
              className="s6"
              label="RentCast property data key"
              helper="Used for property details, value estimates, rent estimates, and market data."
              configured={!!data?.rentcast_configured}
              savedValue={data?.rentcast_api_key ?? null}
              value={rentcastKey}
              onChange={setRentcastKey}
              disabled={!canEdit}
            />
            <SecretField
              className="s6"
              label="Geoapify server API key"
              helper="Used by the backend for U.S. address autocomplete and structured address resolution when Geoapify is selected. Restrict the key to Geoapify Geocoding and Place Details APIs plus production backend traffic."
              configured={!!data?.geoapify_configured}
              savedValue={data?.geoapify_api_key ?? null}
              value={geoapifyKey}
              onChange={setGeoapifyKey}
              disabled={!canEdit}
            />
            <SecretField
              className="s6"
              label="Google Places and Geocoding key"
              helper="Used by the API for address autocomplete, place lookup, and geocoding."
              configured={!!data?.google_server_configured}
              savedValue={data?.google_server_api_key ?? null}
              value={googleServerKey}
              onChange={setGoogleServerKey}
              disabled={!canEdit}
            />
            <SecretField
              className="s6"
              label="Google Maps web key"
              helper="Used by the desktop web app for browser-based map and address features."
              configured={!!data?.google_maps_browser_key_configured}
              savedValue={data?.google_maps_browser_key ?? null}
              value={googleBrowserKey}
              onChange={setGoogleBrowserKey}
              disabled={!canEdit}
            />
            <SecretField
              className="s6"
              label="Google Maps iOS key"
              helper="Use an iOS apps restriction with bundle ID com.qualifiedcommercial.mobile. Restrict APIs to Maps SDK for iOS and Places SDK for iOS if used."
              configured={!!data?.google_maps_ios_key_configured}
              savedValue={data?.google_maps_ios_key ?? null}
              value={googleIosKey}
              onChange={setGoogleIosKey}
              disabled={!canEdit}
            />
            <SecretField
              className="s6"
              label="Google Maps Android key"
              helper="Use an Android apps restriction with package com.qualifiedcommercial.mobile and the app signing SHA-1 fingerprint. Restrict APIs to Maps SDK for Android and Places SDK for Android if used."
              configured={!!data?.google_maps_android_key_configured}
              savedValue={data?.google_maps_android_key ?? null}
              value={googleAndroidKey}
              onChange={setGoogleAndroidKey}
              disabled={!canEdit}
            />
          </div>

          <div className="mt">
            <Toggle
              label="Generate AI property reports"
              sub="Uses the tracked light AI model and reuses cached reports when inputs do not materially change."
              value={aiEnabled}
              onChange={setAiEnabled}
              disabled={!canEdit}
            />
          </div>
          <Field label="Property cache TTL (hours)">
            <Input
              type="number"
              min={1}
              max={720}
              value={ttlHours}
              onChange={(e) => setTtlHours(Math.max(1, Math.min(720, Number(e.target.value) || 24)))}
              disabled={!canEdit}
            />
          </Field>

          {flash ? (
            <div className="mt">
              <StatusLine kind={flash.kind}>{flash.msg}</StatusLine>
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return <CellChip tone={ok ? "ok" : "warn"}>{label}: {ok ? "configured" : "missing"}</CellChip>;
}

function SecretField({
  label,
  helper,
  configured,
  savedValue,
  value,
  onChange,
  disabled,
  className,
}: {
  label: string;
  helper: string;
  configured: boolean;
  savedValue?: string | null;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const maskedValue = "************";
  const showingSavedKey = configured && !value;
  const revealableValue = value || savedValue || "";
  const canReveal = !!revealableValue;
  const displayValue = showingSavedKey
    ? revealed && savedValue
      ? savedValue
      : maskedValue
    : value;

  return (
    <Field className={className} label={label}>
      {/* The reveal control sits beside the input rather than floating inside
          it: the overlay needed the input's own padding rewritten, and `.field`
          owns padding. Same affordance, one owner. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Input
          grow
          type={revealed && canReveal ? "text" : "password"}
          value={displayValue}
          onFocus={(e) => {
            if (showingSavedKey) e.currentTarget.select();
          }}
          onChange={(e) => {
            if (showingSavedKey && e.target.value === maskedValue) return;
            onChange(e.target.value);
          }}
          placeholder={configured ? "" : "Paste key"}
          disabled={disabled}
          autoComplete="off"
        />
        <IconBtn
          aria-label={revealed ? "Hide key" : "Show key"}
          title={revealed ? "Hide key" : "Show key"}
          onClick={() => setRevealed((v) => !v)}
          disabled={!canReveal}
        >
          <Icon name={revealed ? "eyeOff" : "eye"} size={16} />
        </IconBtn>
      </div>
      <div className="sub">
        {configured ? (
          <>
            {/* Unclassed <b>, so the state colour has exactly one owner. */}
            <b style={{ color: "var(--ok)" }}>Saved key is configured.</b> Type a new key to replace it.
          </>
        ) : (
          "No key saved yet."
        )}
      </div>
      <div className="sub">{helper}</div>
    </Field>
  );
}

// ── Section: Team ───────────────────────────────────────────────────────

const ASSIGNABLE_ROLES: { value: Role; label: string }[] = [
  { value: Role.BROKER, label: "Agent" },
  { value: Role.REGIONAL_MANAGER, label: "Regional Manager" },
  { value: Role.LOAN_EXEC, label: "Underwriter" },
  { value: Role.DEALER_PARTNER, label: "Dealer Partner" },
  { value: Role.SUPER_ADMIN, label: "Super Admin" },
];

function RegionalManagersSection({ canEdit }: { canEdit: boolean }) {
  const { data: managers = [], isLoading, error } = useRegionalManagers();
  const { data: brokers = [] } = useBrokers();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [agentUserId, setAgentUserId] = useState("");
  const inviteManager = useInviteRegionalManager();
  const addAgent = useAddRegionalManagerAgent(selectedId);
  const removeAgent = useRemoveRegionalManagerAgent(selectedId);
  const selected = selectedId ?? managers[0]?.id ?? null;
  const detail = useRegionalManagerDetail(selected);

  useEffect(() => {
    if (!selectedId && managers[0]?.id) setSelectedId(managers[0].id);
  }, [managers, selectedId]);

  if (!canEdit) {
    return (
      <Panel>
        <div className="sub">Regional manager management is super-admin only.</div>
      </Panel>
    );
  }

  const createManager = async () => {
    if (!email.trim() || !name.trim()) return;
    const row = await inviteManager.mutateAsync({ email: email.trim(), name: name.trim() });
    setEmail("");
    setName("");
    setSelectedId(row.id);
  };
  const assignAgent = async () => {
    if (!agentUserId) return;
    await addAgent.mutateAsync({ agent_user_id: agentUserId });
    setAgentUserId("");
  };

  const linkedUserIds = new Set(detail.data?.agents.map((a) => a.user_id) ?? []);
  const availableAgents = brokers.filter((b) => !linkedUserIds.has(b.user_id));

  return (
    // Fixed 360px roster beside a fluid detail pane — a bespoke split, not two
    // of the twelve cockpit columns, so the grid stays inline.
    <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 14, alignItems: "flex-start" }}>
      <Panel title="Invite regional manager">
        <div className="grid">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@company.com" />
          <Btn
            variant="pri"
            onClick={createManager}
            disabled={!name.trim() || !email.trim() || inviteManager.isPending}
            style={{ justifyContent: "center" }}
          >
            <Icon name="plus" size={13} /> Invite manager
          </Btn>
        </div>

        <Lbl className="mt">Managers</Lbl>
        {isLoading && <div className="sub">Loading...</div>}
        {error && <CellChip tone="bad">Failed to load managers</CellChip>}
        <div className="mt">
          {managers.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedId(m.id)}
              className={cx("pick", selected === m.id && "on")}
              style={{ width: "100%", textAlign: "left", font: "inherit" }}
            >
              <div className="sp">
                <b>{m.name}</b>
                <div className="sub">{m.email}</div>
                <div className="sub">
                  {m.metrics.agent_count} agents · {QC_FMT.short(m.metrics.pipeline_value)} pipeline
                </div>
              </div>
            </button>
          ))}
        </div>
      </Panel>

      {detail.data ? (
        <Panel
          title={detail.data.name}
          sub={detail.data.email}
          actions={<CellChip tone="acc">Regional Manager</CellChip>}
        >
          <RegionalMetrics metrics={detail.data.metrics} />
          <div className="row mt">
            <Select grow value={agentUserId} onChange={(e) => setAgentUserId(e.target.value)}>
              <option value="">Assign existing agent...</option>
              {availableAgents.map((b) => (
                <option key={b.user_id} value={b.user_id}>{b.display_name}</option>
              ))}
            </Select>
            <Btn variant="pri" onClick={assignAgent} disabled={!agentUserId || addAgent.isPending}>
              <Icon name="plus" size={13} /> Assign
            </Btn>
          </div>
          <Lbl className="mt">Portfolio agents</Lbl>
          {detail.data.agents.length === 0 ? (
            <div className="sub mt">No assigned agents yet.</div>
          ) : (
            <Table
              className="mt"
              caption="Agents assigned to this regional manager"
              cols={[
                { label: "Agent" },
                { label: "Clients", align: "r" },
                { label: "Pipeline", align: "r" },
                { label: "" },
              ]}
            >
              {detail.data.agents.map((agent) => (
                <Tr key={agent.user_id}>
                  <Td>
                    <b>{agent.display_name ?? agent.name}</b>
                    <div className="sub">{agent.email}</div>
                  </Td>
                  <Td align="r">{agent.metrics.client_count}</Td>
                  <Td align="r">{QC_FMT.short(agent.metrics.pipeline_value)}</Td>
                  <Td align="r">
                    <IconBtn
                      aria-label={`Remove ${agent.name}`}
                      onClick={() => removeAgent.mutate(agent.user_id)}
                    >
                      <Icon name="x" size={13} />
                    </IconBtn>
                  </Td>
                </Tr>
              ))}
            </Table>
          )}
        </Panel>
      ) : (
        <Panel>
          <div className="sub">Select or invite a regional manager.</div>
        </Panel>
      )}
    </div>
  );
}

function RegionalMetrics({ metrics }: { metrics: import("@/lib/types").PortfolioMetrics }) {
  const items: Array<[string, string | number]> = [
    ["Agents", metrics.agent_count],
    ["Clients", metrics.client_count],
    ["Active loans", metrics.active_loans],
    ["Pipeline", QC_FMT.short(metrics.pipeline_value)],
    ["Funded YTD", QC_FMT.short(metrics.funded_ytd)],
    ["Pull-through", metrics.pull_through == null ? "—" : `${Math.round(metrics.pull_through * 100)}%`],
    ["High priority", metrics.high_priority_tasks],
    ["Overdue", metrics.overdue_items],
  ];
  // `.kpis` auto-fits the tiles instead of forcing four to a row, so the eight
  // figures reflow rather than squeezing on a narrow console.
  return (
    <KpiRow className="mt">
      {items.map(([label, value]) => (
        <Kpi key={label} label={label} value={value} />
      ))}
    </KpiRow>
  );
}

function TeamSection({ canEdit }: { canEdit: boolean }) {
  const { data: users, isLoading, error } = useUsers();
  const { data: me } = useCurrentUser();
  const updateRole = useUpdateUserRole();
  const deleteUser = useDeleteUser();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  if (!canEdit) {
    return (
      <Panel>
        <div className="sub">Team management is super-admin only.</div>
      </Panel>
    );
  }

  const onChangeRole = (userId: string, role: Role) => {
    // DEALER_PARTNER is hard-blocked server-side until their company has a
    // signed Referral Protection Agreement -- a user with no company link
    // at all (e.g. one promoted via this dropdown rather than invited)
    // can never pass that check. Collect a company name here, same as the
    // invite flow, so this path can't create a permanently-locked-out user.
    const target = users?.find((u) => u.id === userId);
    if (role === Role.DEALER_PARTNER && !target?.referral_partner_company_name) {
      const companyName = window.prompt(
        "Their company must have a signed Referral Protection Agreement on file.\n\nEnter the company name (existing companies are matched by name):"
      );
      if (!companyName?.trim()) return;
      updateRole.mutate({ userId, role, company_name: companyName.trim() });
      return;
    }
    updateRole.mutate({ userId, role });
  };
  const onRevoke = (userId: string) => {
    deleteUser.mutate({ userId });
    setConfirmRevoke(null);
  };

  return (
    <>
      {/* Was a six-column div grid pretending to be a table, with the header
          row hand-built. It is a real <table class="tbl"> now: same columns,
          same cells, and a scroll container so a wide row cannot widen the
          page. `noPad` lets the table sit flush to the panel edge. */}
      <Panel
        title="Operator team"
        sub={`${users?.length ?? 0} members`}
        actions={
          <Btn variant="pri" onClick={() => setInviteOpen(true)}>
            <Icon name="plus" size={13} stroke={2.4} /> Invite member
          </Btn>
        }
        noPad
      >
        {isLoading && <div className="panel-b sub">Loading…</div>}
        {error && (
          <div className="panel-b">
            <StatusLine kind="err">Failed to load: {error instanceof Error ? error.message : String(error)}</StatusLine>
          </div>
        )}
        {users && users.length > 0 && (
          <Table
            caption="Operator team members"
            cols={[
              { label: "Name" },
              { label: "Email" },
              { label: "Role", width: 160 },
              { label: "Company / Agreement" },
              { label: "Joined", width: 110 },
              { label: "" },
            ]}
          >
            {users.map((u) => {
              const isSelf = me?.id === u.id;
              return (
                <Tr key={u.id}>
                  <Td>
                    <b>{u.name}</b> {isSelf && <CellChip>You</CellChip>}
                  </Td>
                  <Td>{u.email}</Td>
                  <Td>
                    <Select
                      value={u.role}
                      onChange={(e) => onChangeRole(u.id, e.target.value as Role)}
                      disabled={isSelf || updateRole.isPending}
                      style={{ width: "100%" }}
                    >
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </Select>
                  </Td>
                  <Td>
                    {u.referral_partner_company_name ? (
                      <>
                        {u.referral_partner_company_name}{" "}
                        {u.company_agreement_signed ? (
                          <CellChip tone="ok">Signed</CellChip>
                        ) : (
                          <CellChip tone="bad">No agreement</CellChip>
                        )}
                      </>
                    ) : (
                      <span className="sub">—</span>
                    )}
                  </Td>
                  <Td>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </Td>
                  <Td align="r">
                    {!isSelf && (
                      confirmRevoke === u.id ? (
                        <span style={{ display: "inline-flex", gap: 4 }}>
                          <Btn
                            size="sm"
                            className="c-bad"
                            onClick={() => onRevoke(u.id)}
                            disabled={deleteUser.isPending}
                          >
                            Revoke
                          </Btn>
                          <Btn size="sm" onClick={() => setConfirmRevoke(null)}>
                            Cancel
                          </Btn>
                        </span>
                      ) : (
                        <IconBtn
                          aria-label={`Remove ${u.name}`}
                          onClick={() => setConfirmRevoke(u.id)}
                        >
                          <Icon name="x" size={13} />
                        </IconBtn>
                      )
                    )}
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}
        {users && users.length === 0 && <div className="panel-b sub">No team members yet.</div>}
      </Panel>
      <InviteMemberDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </>
  );
}

// ── Section: Simulator ──────────────────────────────────────────────────

function SimulatorSection({ draft, setDraft, canEdit, dirty, onSave, saving }: SectionProps) {
  const s = draft.simulator;
  const set = (patch: Partial<SimulatorSettings>) =>
    setDraft((d) => d && ({ ...d, simulator: { ...s, ...patch } }));

  return (
    <Panel
      title="Borrower simulator"
      actions={null}
    >
      <div className="sub">
        Defines the bounds the Simulate screen exposes to borrowers. Changes apply immediately to every borrower&apos;s
        scenario builder.
      </div>

      <Lbl className="mt">Discount points</Lbl>
      <div className="cg mt">
        <Field className="s4" label="Min">
          <FloatInput value={s.points_min} onChange={(n) => set({ points_min: n })} disabled={!canEdit} step={0.25} />
        </Field>
        <Field className="s4" label="Max">
          <FloatInput value={s.points_max} onChange={(n) => set({ points_max: n })} disabled={!canEdit} step={0.25} />
        </Field>
        <Field className="s4" label="Step">
          <FloatInput value={s.points_step} onChange={(n) => set({ points_step: n })} disabled={!canEdit} step={0.25} />
        </Field>
      </div>

      <Lbl className="mt">Loan amount</Lbl>
      <div className="cg mt">
        <Field className="s4" label="Min ($)">
          <NumInput value={s.amount_min} onChange={(n) => set({ amount_min: n })} disabled={!canEdit} />
        </Field>
        <Field className="s4" label="Max ($)">
          <NumInput value={s.amount_max} onChange={(n) => set({ amount_max: n })} disabled={!canEdit} />
        </Field>
        <Field className="s4" label="Step ($)">
          <NumInput value={s.amount_step} onChange={(n) => set({ amount_step: n })} disabled={!canEdit} />
        </Field>
      </div>

      <Lbl className="mt">LTV (decimal, e.g. 0.75 = 75%)</Lbl>
      <div className="cg mt">
        <Field className="s4" label="Min">
          <FloatInput value={s.ltv_min} onChange={(n) => set({ ltv_min: n })} disabled={!canEdit} step={0.05} />
        </Field>
        <Field className="s4" label="Max">
          <FloatInput value={s.ltv_max} onChange={(n) => set({ ltv_max: n })} disabled={!canEdit} step={0.05} />
        </Field>
        <Field className="s4" label="Step">
          <FloatInput value={s.ltv_step} onChange={(n) => set({ ltv_step: n })} disabled={!canEdit} step={0.05} />
        </Field>
      </div>

      <Lbl className="mt">Advanced mode</Lbl>
      <div className="mt">
        <Toggle
          label="Enable advanced mode"
          sub="Show the taxes / insurance / HOA / LTV inputs in the borrower simulator."
          value={s.advanced_mode_enabled}
          onChange={(v) => set({ advanced_mode_enabled: v })}
          disabled={!canEdit}
        />
        <Toggle label="Show LTV toggle" value={s.show_ltv_toggle} onChange={(v) => set({ show_ltv_toggle: v })} disabled={!canEdit || !s.advanced_mode_enabled} />
        <Toggle label="Show annual taxes input" value={s.show_taxes} onChange={(v) => set({ show_taxes: v })} disabled={!canEdit || !s.advanced_mode_enabled} />
        <Toggle label="Show annual insurance input" value={s.show_insurance} onChange={(v) => set({ show_insurance: v })} disabled={!canEdit || !s.advanced_mode_enabled} />
        <Toggle label="Show monthly HOA input" value={s.show_hoa} onChange={(v) => set({ show_hoa: v })} disabled={!canEdit || !s.advanced_mode_enabled} />
      </div>
    </Panel>
  );
}

// ── Section: Firm letterhead ────────────────────────────────────────────
//
// Drives every prequal PDF (officer name + title, address block, saved
// signature image). Super-admin only — non-supers see the form
// read-only with a "super-admin required" pill at the page header.
//
// Signature upload flow:
//   1. POST /settings/letterhead/signature/upload-init → presigned PUT URL
//   2. Browser PUTs the PNG bytes directly to S3
//   3. PATCH /settings with letterhead.signature_s3_key set → activates
//      it on the next render. Until step 3 is saved, the previously
//      saved signature remains the active one.

function LetterheadSection({ draft, setDraft, canEdit, dirty, onSave, saving }: SectionProps) {
  const lh = draft.letterhead;
  const set = (patch: Partial<LetterheadSettings>) => setDraft((d) => d && ({ ...d, letterhead: { ...lh, ...patch } }));
  const initUpload = useInitSignatureUpload();
  const [uploadStatus, setUploadStatus] = useState<null | { kind: "ok" | "err" | "uploading"; msg: string }>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    if (!canEdit) {
      setUploadStatus({ kind: "err", msg: "Super-admin required" });
      return;
    }
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setUploadStatus({ kind: "err", msg: "PNG or JPEG only — transparent PNG recommended" });
      return;
    }
    if (file.size > 1_500_000) {
      setUploadStatus({ kind: "err", msg: "File is too large — keep under 1.5 MB" });
      return;
    }
    setUploadStatus({ kind: "uploading", msg: "Uploading signature…" });
    try {
      const init = await initUpload.mutateAsync(file.type === "image/jpeg" ? "image/jpeg" : "image/png");
      if (!init.upload_url) {
        setUploadStatus({ kind: "err", msg: "S3 not configured on the server. Ask the operator to enable it." });
        return;
      }
      const put = await fetch(init.upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          "x-amz-server-side-encryption": "AES256",
        },
        body: file,
      });
      if (!put.ok) throw new Error(`S3 PUT returned ${put.status}`);
      // Stash the new key on the draft. The user still has to click
      // Save section to persist it — same pattern as every other
      // setting on this page.
      set({ signature_s3_key: init.s3_key });
      // Local preview so the operator can confirm the upload worked
      // before saving.
      setPreviewUrl(URL.createObjectURL(file));
      setUploadStatus({ kind: "ok", msg: "Uploaded — click Save section to make it the active signature." });
    } catch (e) {
      setUploadStatus({ kind: "err", msg: e instanceof Error ? e.message : "Upload failed" });
    }
  };

  return (
    <Panel
      title="Firm letterhead — prequal PDF header & signature"
      actions={null}
    >
      <div className="sub">
        Edits here change every pre-qualification letter generated from the next
        approval forward. Existing already-issued PDFs aren&apos;t retroactively
        rewritten — re-approve a request from the queue if you need to refresh
        an outstanding letter against new values.
      </div>

      {/* Officer identity — a genuine 6 + 6 of the cockpit grid. */}
      <div className="cg mt">
        <Field className="s6" label="Signing officer — full name">
          <Input
            type="text"
            value={lh.officer_name}
            onChange={(e) => set({ officer_name: e.target.value })}
            disabled={!canEdit}
            placeholder="Franco Pellegrino"
          />
        </Field>
        <Field className="s6" label="Officer title line">
          <Input
            type="text"
            value={lh.officer_title}
            onChange={(e) => set({ officer_title: e.target.value })}
            disabled={!canEdit}
            placeholder="Managing Director | Qualified Commercial LLC"
          />
        </Field>
      </div>

      {/* Office address (3 lines, top-right block on the letter) */}
      <Lbl className="mt">Office address (top-right of the letterhead)</Lbl>
      <div className="grid mt">
        <Input
          type="text"
          value={lh.office_address_line_1}
          onChange={(e) => set({ office_address_line_1: e.target.value })}
          disabled={!canEdit}
          placeholder="123 Financial Way, Suite 400"
        />
        <Input
          type="text"
          value={lh.office_address_line_2}
          onChange={(e) => set({ office_address_line_2: e.target.value })}
          disabled={!canEdit}
          placeholder="Garfield, NJ 07026"
        />
        <Input
          type="text"
          value={lh.office_address_line_3}
          onChange={(e) => set({ office_address_line_3: e.target.value })}
          disabled={!canEdit}
          placeholder="www.qualifiedcommercial.com"
        />
      </div>

      {/* Signature image */}
      <Lbl className="mt">Saved signature image</Lbl>
      <div className="sub" style={{ margin: "6px 0 12px" }}>
        Upload a PNG of your signature (transparent background ideal). The image
        renders above your name on every prequal PDF. To create one, sign a
        white sheet with a black pen, photograph it, then remove the background
        with any free tool (e.g. remove.bg) and export as PNG.
      </div>

      {/* Preview beside the controls — a fixed 280px well, not two of the
          twelve cockpit columns, so the split stays inline. */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 280px) 1fr", gap: 16, alignItems: "flex-start" }}>
        {/* Dashed well. `.dropzone` is the sheet's dashed surface but it is a
            click target (cursor:pointer, hover tint) and this is not one, so
            the frame stays inline rather than promising an interaction. */}
        <div style={{
          border: "1px dashed var(--line2)",
          borderRadius: 12,
          background: "var(--sunken2)",
          padding: 16,
          minHeight: 120,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Signature preview" style={{ maxWidth: 240, maxHeight: 90 }} />
          ) : lh.signature_s3_key ? (
            <div style={{ textAlign: "center" }}>
              <CellChip tone="ok">
                <Icon name="check" size={11} stroke={3} /> Signature on file
              </CellChip>
              <div className="sub" style={{ marginTop: 8 }}>
                Upload a new file below to replace it.
              </div>
            </div>
          ) : (
            <div className="sub" style={{ textAlign: "center" }}>
              No signature uploaded yet.
              <div>Letters fall back to a plain underline + typed name.</div>
            </div>
          )}
        </div>

        {/* Upload controls */}
        <div className="grid">
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="field"
            disabled={!canEdit || initUpload.isPending}
            onChange={(e) => handleFile(e.currentTarget.files?.[0] ?? null)}
          />
          {uploadStatus ? (
            <StatusLine kind={uploadStatus.kind === "uploading" ? "warn" : uploadStatus.kind}>{uploadStatus.msg}</StatusLine>
          ) : null}
          {lh.signature_s3_key ? (
            <div>
              {/* `.c-bad` is declared after `.btn` in the sheet, so it wins the
                  tint and the text colour without an inline override. */}
              <Btn
                className="c-bad"
                onClick={() => { set({ signature_s3_key: null }); setPreviewUrl(null); setUploadStatus({ kind: "ok", msg: "Will revert to underline on save." }); }}
                disabled={!canEdit}
              >
                Remove saved signature
              </Btn>
            </div>
          ) : null}
          <div className="sub">
            <strong>Heads up:</strong> uploading replaces the
            file in S3 immediately, but the new key only becomes the active
            signature on PDFs after you click <em>Save section</em> at the top.
          </div>
        </div>
      </div>
    </Panel>
  );
}

/**
 * Sentence-length status line.
 *
 * `.c-ok` / `.c-warn` / `.c-bad` own the tint and the text colour; the inline
 * values are box geometry only, because the sheet has no block-level status
 * surface and `.cellchip` is `white-space: nowrap` — these run to a sentence.
 */
function StatusLine({ kind, children }: { kind: "ok" | "err" | "warn"; children: React.ReactNode }) {
  return (
    <div
      className={kind === "ok" ? "c-ok" : kind === "err" ? "c-bad" : "c-warn"}
      style={{ borderRadius: 8, padding: "8px 11px", fontSize: 12.5, fontWeight: 650, lineHeight: 1.45 }}
    >
      {children}
    </div>
  );
}

// ── Form primitives ─────────────────────────────────────────────────────

// `Field`, `Input`, `Select` and `Textarea` now come from `@/components/ds`.
// What survives here is the pair of numeric wrappers (they own the parsing)
// and the switch, which has no equivalent in the stylesheet.

function NumInput({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <Input
      value={String(value)}
      onChange={(e) => onChange(parseIntStrict(e.target.value))}
      disabled={disabled}
    />
  );
}

function FloatInput({ value, onChange, disabled, step = 0.01 }: { value: number; onChange: (n: number) => void; disabled?: boolean; step?: number }) {
  return (
    <Input
      type="number"
      step={step}
      value={String(value)}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      disabled={disabled}
    />
  );
}

/**
 * Switch row.
 *
 * `.pick` — the stylesheet's "selectable row" — owns the frame, the hover and
 * the `.on` tint, which is exactly what this control is. Only the sliding knob
 * stays inline: there is no switch anywhere in globals.css to borrow.
 */
function Toggle({ label, sub, value, onChange, disabled }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      aria-pressed={value}
      className={cx("pick", value && "on")}
      // A <button> inherits none of width, alignment or font from `.pick`.
      style={{ width: "100%", textAlign: "left", font: "inherit", opacity: disabled ? 0.7 : undefined, marginBottom: 8 }}
    >
      <div className="sp">
        <b>{label}</b>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <span
        style={{
          width: 34, height: 20, borderRadius: 999, padding: 2, flexShrink: 0, display: "block",
          background: value ? "var(--petrol)" : "var(--line2)", transition: "background 120ms",
        }}
      >
        <span style={{
          width: 16, height: 16, borderRadius: 999, background: "#fff", display: "block",
          transform: value ? "translateX(14px)" : "translateX(0)", transition: "transform 120ms",
        }} />
      </span>
    </button>
  );
}

function SaveBtn({ dirty, saving, onClick }: { dirty: boolean; saving: boolean; onClick: () => void }) {
  // `.btn:disabled` carries the dimmed, non-interactive state that the inline
  // opacity/cursor pair used to hand-roll.
  return (
    <Btn variant="pri" onClick={onClick} disabled={!dirty || saving}>
      <Icon name="check" size={13} /> {saving ? "Saving…" : "Save section"}
    </Btn>
  );
}

// Defensive normalizer — fills in any AppSettingsData section that the
// backend's persisted JSONB blob doesn't have yet. Older rows pre-date
// the simulator section; rendering it without these defaults crashes.
function withDefaults(data: AppSettingsData): AppSettingsData {
  return {
    checklists: data.checklists ?? {},
    ai_cadence: data.ai_cadence ?? {
      morning_digest: "08:00",
      evening_summary: "17:30",
      auto_nudge_borrower: true,
      auto_escalate_overdue: true,
      auto_draft_replies: true,
      anomaly_alerts: true,
      weekend_ops: false,
      confidence_floor_default: 0.8,
    },
    ai_spend: data.ai_spend ?? defaultAISpend(),
    referrals: data.referrals ?? {
      require_approval: true,
      auto_link_from_url: true,
      block_re_attribution: true,
      notify_broker_on_signup: true,
      points_per_dollar: 1.0,
      refi_multiplier: 1.25,
      expiry_days: 365,
      dispute_sla_business_days: 5,
    },
    pricing: data.pricing ?? {
      daily_pull_time: "07:00",
      auto_publish_threshold_bps: 25,
      notify_clients_on_change: true,
      lock_window_business_days: 5,
    },
    security: data.security ?? {
      sso_enabled: true,
      mfa_enforced: true,
      mfa_renewal_days: 14,
      borrower_portal_mfa: false,
      session_timeout_minutes: 30,
      ip_allowlist: [],
    },
    simulator: data.simulator ?? {
      points_min: 0,
      points_max: 3,
      points_step: 0.5,
      amount_min: 100_000,
      amount_max: 5_000_000,
      amount_step: 25_000,
      ltv_min: 0.5,
      ltv_max: 0.9,
      ltv_step: 0.05,
      advanced_mode_enabled: true,
      show_taxes: true,
      show_insurance: true,
      show_hoa: true,
      show_ltv_toggle: true,
    },
    letterhead: data.letterhead ?? defaultLetterhead(),
  };
}

function defaultAISpend() {
  return {
    daily_warning_usd: 10,
    daily_critical_usd: 25,
    avg_client_file_warning_usd: 1.5,
    avg_client_file_critical_usd: 3,
    master_enabled: true,
    chat_enabled: true,
    automations_enabled: true,
    document_scanning_enabled: true,
    summaries_enabled: true,
    lender_ai_enabled: true,
  };
}

function defaultLetterhead(): LetterheadSettings {
  return {
    officer_name: "Franco Pellegrino",
    officer_title: "Managing Director | Qualified Commercial LLC",
    office_address_line_1: "123 Financial Way, Suite 400",
    office_address_line_2: "Garfield, NJ 07026",
    office_address_line_3: "www.qualifiedcommercial.com",
    signature_s3_key: null,
  };
}
