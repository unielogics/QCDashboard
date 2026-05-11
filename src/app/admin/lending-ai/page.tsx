"use client";

// Super Admin → Lending AI Settings — single scrollable page, 5 sections.
//
// 1. Firm AI identity        — ai_name, voice, greeting, signature + live preview
// 2. Lending playbooks       — summary of published funding playbooks (deep edit → /playbooks)
// 3. Document verification   — categorical summary of completion policy (deep edit → /verification)
// 4. Default outreach + schedule — firm-wide approval mode, attempts, channels, working hours
// 5. Compliance guardrails   — global rules, forbidden topics, redirect template
//
// All firm-wide state lives on the funding-owned `communication-rules`
// JSONB. Identity already existed; outreach_defaults + working_hours
// are new keys on the same row. Agent-level config overrides this;
// this row is the firm-wide fallback applied when an agent hasn't
// configured a value.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { AINotDeployedBanner } from "@/components/AINotDeployedBanner";
import {
  isAINotDeployed,
  useFundingMetaRules,
  useLendingPlaybooks,
  usePatchFundingMetaRules,
} from "@/hooks/useApi";
import {
  AFTER_HOURS_LABEL,
  TIMEZONE_OPTIONS,
  WEEKDAYS_ORDER,
  formatScheduleSummary,
  normalizeWorkingHours,
  type AfterHoursRule,
  type WeekdayCode,
  type WorkingHours,
} from "@/app/agent-settings/ai/scheduleFormat";


// ── Rules JSONB shape on the funding `communication` playbook ─────────

type GreetingStyle = "formal" | "friendly" | "concise";

type ApprovalMode = "draft_first" | "ask_before_sending" | "auto_send_portal";

type DefaultChannel = "portal" | "portal_email" | "portal_email_sms";

type QuietWindowBehavior =
  | "no_initiate"
  | "queue_next_morning"
  | "draft_only_after_hours";

interface FirmIdentity {
  ai_name?: string;
  greeting_style?: GreetingStyle;
  voice_summary?: string;
  brand_signature?: string;
  global_rules?: string[];
  forbidden_topics?: string[];
  redirect_template?: string;
}

interface FirmOutreachDefaults {
  approval_mode?: ApprovalMode;
  max_attempts?: number;
  default_channel?: DefaultChannel;
  quiet_window_behavior?: QuietWindowBehavior;
}

interface CommunicationRulesShape {
  identity?: FirmIdentity;
  outreach_defaults?: FirmOutreachDefaults;
  working_hours?: Partial<WorkingHours>;
}


const APPROVAL_MODE_LABEL: Record<ApprovalMode, string> = {
  draft_first: "Draft first",
  ask_before_sending: "Require approval per message",
  auto_send_portal: "Auto-send portal only",
};

const DEFAULT_CHANNEL_LABEL: Record<DefaultChannel, string> = {
  portal: "Portal",
  portal_email: "Portal + Email",
  portal_email_sms: "Portal + Email + SMS",
};

const QUIET_WINDOW_LABEL: Record<QuietWindowBehavior, string> = {
  no_initiate: "No initiated outreach after hours",
  queue_next_morning: "Queue for next business morning",
  draft_only_after_hours: "Draft only after hours",
};

const SUGGESTED_RULES = [
  "Never quote rates or APRs — always defer to the funding team",
  "Never promise loan approval before underwriting",
  "Never give legal, tax, or financial advice",
  "Always identify yourself by name when starting a conversation",
  "Always confirm before taking an action that sends a message or document",
  "Always escalate to a human if the borrower expresses anger or distress",
];


export default function LendingAISettingsPage() {
  const { t } = useTheme();
  const router = useRouter();
  const { data, isLoading, error } = useFundingMetaRules("communication");
  const patch = usePatchFundingMetaRules("communication");
  const playbooks = useLendingPlaybooks();

  const [draft, setDraft] = useState<CommunicationRulesShape>({});
  const [dirty, setDirty] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    if (data?.rules) {
      setDraft((data.rules as CommunicationRulesShape) || {});
      loadedRef.current = true;
    }
  }, [data?.rules]);

  function mutate(next: CommunicationRulesShape) {
    setDraft(next);
    setDirty(true);
  }

  async function save() {
    try {
      await patch.mutateAsync(draft as Record<string, unknown>);
      setDirty(false);
    } catch {/* AINotDeployedBanner handles 404 */}
  }

  const identity = draft.identity || {};
  const outreach = draft.outreach_defaults || {};
  const wh = useMemo(
    () => normalizeWorkingHours(draft.working_hours),
    [draft.working_hours],
  );

  if (isAINotDeployed(error)) {
    return (
      <div style={{ padding: 24, maxWidth: 1040, margin: "0 auto" }}>
        <PageHeader t={t} dirty={false} saving={false} onClose={() => router.push("/settings")} onSave={save} />
        <AINotDeployedBanner surface="Lending AI" />
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1040, margin: "0 auto" }}>
      <PageHeader
        t={t}
        dirty={dirty}
        saving={patch.isPending}
        onClose={() => router.push("/settings")}
        onSave={save}
      />

      <Snapshot
        t={t}
        aiName={identity.ai_name || "—"}
        playbookCount={(playbooks.data || []).filter((p) => p.status === "published").length}
        approvalMode={outreach.approval_mode ?? "draft_first"}
        wh={wh}
      />

      {isLoading ? (
        <Card pad={20}><div style={{ color: t.ink3 }}>Loading firm settings…</div></Card>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <Section t={t} kicker="Step 1" title="Firm AI identity"
            copy="The global persona layered into every borrower-facing AI message. Agents inherit this voice unless they override their tone in Agent AI Settings.">
            <FirmIdentitySection
              t={t}
              identity={identity}
              onChange={(next) => mutate({ ...draft, identity: next })}
            />
          </Section>

          <Section t={t} kicker="Step 2" title="Lending playbooks"
            copy="Default requirements per loan product. Funding-locked items appear on every new deal and cannot be disabled by agents.">
            <LendingPlaybooksSection t={t} />
          </Section>

          <Section t={t} kicker="Step 3" title="Document verification rules"
            copy="What the AI may complete on its own vs. what an underwriter must verify. Per-document detail lives in the verification editor.">
            <VerificationSummarySection t={t} />
          </Section>

          <Section t={t} kicker="Step 4" title="Default outreach and working schedule"
            copy="The firm-wide fallback when an agent has not configured their own. Agent settings and per-deal overrides can still be stricter.">
            <OutreachAndScheduleSection
              t={t}
              outreach={outreach}
              wh={wh}
              onOutreach={(next) => mutate({ ...draft, outreach_defaults: next })}
              onWorkingHours={(next) => mutate({ ...draft, working_hours: next })}
            />
          </Section>

          <Section t={t} kicker="Step 5" title="Compliance guardrails"
            copy="Hard rules the AI follows on every conversation. These take precedence over per-agent or per-client overrides.">
            <GuardrailsSection
              t={t}
              identity={identity}
              onChange={(next) => mutate({ ...draft, identity: next })}
            />
          </Section>
        </div>
      )}
    </div>
  );
}


// ─── Page chrome ─────────────────────────────────────────────────────


function PageHeader({
  t, dirty, saving, onClose, onSave,
}: {
  t: ReturnType<typeof useTheme>["t"];
  dirty: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div style={{
      position: "relative",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 16,
      marginBottom: 16,
    }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: "0 0 6px" }}>
          Super Admin AI Settings
        </h1>
        <p style={{ fontSize: 13, color: t.ink3, margin: 0, maxWidth: 720 }}>
          Firm-wide controls for the AI Secretary — brand identity, lending
          playbooks, verification policy, outreach defaults, working schedule,
          and compliance boundaries. Agents may customize their own settings;
          these are the rules every conversation falls back to.
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty}
          style={{
            padding: "8px 14px", fontSize: 13, fontWeight: 700,
            borderRadius: 6, border: `1px solid ${t.line}`,
            background: dirty ? t.petrol : t.surface2,
            color: dirty ? "#fff" : t.ink3,
            cursor: saving || !dirty ? "default" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Publishing…" : dirty ? "Publish settings" : "Published"}
        </button>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            width: 36, height: 36, borderRadius: 8,
            border: `1px solid ${t.line}`, background: t.surface,
            color: t.ink2, cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Icon name="x" size={16} stroke={2.4} />
        </button>
      </div>
    </div>
  );
}


function Snapshot({
  t, aiName, playbookCount, approvalMode, wh,
}: {
  t: ReturnType<typeof useTheme>["t"];
  aiName: string;
  playbookCount: number;
  approvalMode: ApprovalMode;
  wh: WorkingHours;
}) {
  const items = [
    { label: "Firm AI name", body: aiName || "—" },
    { label: "Published playbooks", body: String(playbookCount) },
    { label: "Default approval", body: APPROVAL_MODE_LABEL[approvalMode] },
    { label: "Working hours", body: formatScheduleSummary(wh) },
  ];
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 8,
      marginBottom: 18,
    }}>
      {items.map((item) => (
        <div key={item.label} style={{
          border: `1px solid ${t.line}`,
          borderRadius: 8,
          padding: 12,
          background: t.surface2,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 900, color: t.petrol,
            marginBottom: 4, textTransform: "uppercase",
          }}>
            {item.label}
          </div>
          <div style={{ fontSize: 12, color: t.ink, lineHeight: 1.4 }}>{item.body}</div>
        </div>
      ))}
    </div>
  );
}


function Section({
  t, kicker, title, copy, children,
}: {
  t: ReturnType<typeof useTheme>["t"];
  kicker: string;
  title: string;
  copy: string;
  children: React.ReactNode;
}) {
  return (
    <Card pad={20}>
      <div style={{ marginBottom: 14 }}>
        <div style={{
          fontSize: 11, fontWeight: 900, color: t.petrol,
          textTransform: "uppercase", letterSpacing: 0.8,
          marginBottom: 4,
        }}>
          {kicker}
        </div>
        <SectionLabel>{title}</SectionLabel>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: t.ink3, lineHeight: 1.55, maxWidth: 740 }}>
          {copy}
        </p>
      </div>
      {children}
    </Card>
  );
}


// ─── Step 1: Firm AI identity ────────────────────────────────────────


function FirmIdentitySection({
  t, identity, onChange,
}: {
  t: ReturnType<typeof useTheme>["t"];
  identity: FirmIdentity;
  onChange: (next: FirmIdentity) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <FieldBlock label="AI name" t={t}>
            <input
              value={identity.ai_name || ""}
              onChange={(e) => onChange({ ...identity, ai_name: e.target.value })}
              placeholder="e.g. Quinn"
              style={inputStyle(t)}
            />
          </FieldBlock>
          <FieldBlock label="Greeting style" t={t}>
            <select
              value={identity.greeting_style || "friendly"}
              onChange={(e) => onChange({ ...identity, greeting_style: e.target.value as GreetingStyle })}
              style={inputStyle(t)}
            >
              <option value="formal">Formal</option>
              <option value="friendly">Friendly</option>
              <option value="concise">Concise</option>
            </select>
          </FieldBlock>
        </div>
        <FieldBlock label="Voice summary" t={t}>
          <textarea
            value={identity.voice_summary || ""}
            onChange={(e) => onChange({ ...identity, voice_summary: e.target.value })}
            placeholder="Direct, knowledgeable about commercial real estate lending. References concrete numbers, never vague generalities."
            rows={3}
            style={{ ...inputStyle(t), resize: "vertical", minHeight: 84 }}
          />
        </FieldBlock>
        <FieldBlock label="Brand signature" t={t}>
          <input
            value={identity.brand_signature || ""}
            onChange={(e) => onChange({ ...identity, brand_signature: e.target.value })}
            placeholder="— Qualified Commercial Lending Team"
            style={inputStyle(t)}
          />
        </FieldBlock>
      </div>

      <IdentityPreview t={t} identity={identity} />
    </div>
  );
}


function IdentityPreview({
  t, identity,
}: {
  t: ReturnType<typeof useTheme>["t"];
  identity: FirmIdentity;
}) {
  const greeting =
    identity.greeting_style === "formal" ? "Hello Jordan,"
    : identity.greeting_style === "concise" ? "Jordan,"
    : "Hi Jordan,";
  const name = identity.ai_name?.trim() || "—";
  return (
    <div style={{
      border: `1px solid ${t.line}`, borderRadius: 12,
      background: t.surface, padding: 16,
    }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: t.ink, marginBottom: 10 }}>
        Borrower-facing preview
      </div>
      <div style={{
        padding: 14, borderRadius: 10,
        background: t.surface2, fontSize: 13, lineHeight: 1.55, color: t.ink,
      }}>
        <p style={{ margin: "0 0 8px", fontWeight: 700 }}>{name}</p>
        <p style={{ margin: "0 0 8px" }}>{greeting}</p>
        <p style={{ margin: "0 0 8px" }}>
          I am following up to help keep your lending file moving. Please upload the
          missing purchase contract when available.
        </p>
        {identity.voice_summary ? (
          <p style={{ margin: "0 0 8px", fontSize: 12, color: t.ink3 }}>
            Voice: {identity.voice_summary}
          </p>
        ) : null}
        <p style={{ margin: 0 }}>
          Best,<br />
          {identity.brand_signature?.trim() || "Qualified Commercial Lending Team"}
        </p>
      </div>
    </div>
  );
}


// ─── Step 2: Lending playbooks summary ───────────────────────────────


function LendingPlaybooksSection({ t }: { t: ReturnType<typeof useTheme>["t"] }) {
  const { data, isLoading, error } = useLendingPlaybooks();
  if (isAINotDeployed(error)) return <AINotDeployedBanner surface="Lending AI" />;
  const playbooks = (data || []).filter((p) => p.owner_type === "funding" || p.owner_type === "platform");

  return (
    <div>
      {isLoading ? (
        <div style={{ color: t.ink3, fontSize: 13 }}>Loading playbooks…</div>
      ) : playbooks.length === 0 ? (
        <div style={{ color: t.ink3, fontSize: 13, padding: 12 }}>
          No funding playbooks yet — create one to lock in firm-required documents per product.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {playbooks.map((pb) => (
            <div
              key={pb.id}
              style={{
                display: "grid", gridTemplateColumns: "1fr auto",
                gap: 12, alignItems: "center", padding: "12px 14px",
                border: `1px solid ${t.line}`, borderRadius: 12,
                background: t.surface,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: t.ink, marginBottom: 2 }}>
                  {pb.name}
                </div>
                <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.4 }}>
                  {pb.description || "Default requirements per loan product."}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Chip t={t} tone={pb.status === "published" ? "good" : "warn"}>
                  {pb.status}
                </Chip>
                <Chip t={t}>
                  {pb.owner_type === "funding" ? "Funding" : "Platform"}
                </Chip>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <Link href="/admin/lending-ai/playbooks" style={linkButton(t)}>
          Edit lending playbooks →
        </Link>
      </div>
    </div>
  );
}


// ─── Step 3: Document verification summary ───────────────────────────


function VerificationSummarySection({ t }: { t: ReturnType<typeof useTheme>["t"] }) {
  const { data, isLoading, error } = useFundingMetaRules("verification");
  if (isAINotDeployed(error)) return <AINotDeployedBanner surface="Lending AI" />;

  const docTypes = useMemo(() => {
    const raw = data?.rules as { doc_types?: Record<string, unknown> } | undefined;
    return raw?.doc_types && typeof raw.doc_types === "object" ? Object.keys(raw.doc_types) : [];
  }, [data?.rules]);

  const buckets = [
    {
      title: "AI can complete",
      tone: "good" as const,
      body: "Low-risk items where upload presence or simple structured data is enough.",
      examples: ["Proof of funds received", "Property photos received", "Borrower questionnaire complete"],
    },
    {
      title: "Requires human verify",
      tone: "warn" as const,
      body: "Material underwriting items that should never be fully approved by the AI.",
      examples: ["Purchase contract", "Entity documents", "Scope of work"],
    },
    {
      title: "Borrower self-attest",
      tone: "blue" as const,
      body: "Answers the borrower can provide directly, reviewable later by a human.",
      examples: ["Exit strategy", "Project timeline", "Property use"],
    },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {buckets.map((b) => (
          <div
            key={b.title}
            style={{
              border: `1px solid ${t.line}`, borderRadius: 12,
              background: t.surface, padding: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Chip t={t} tone={b.tone}>{b.title}</Chip>
            </div>
            <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.45, marginBottom: 8 }}>
              {b.body}
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: t.ink, lineHeight: 1.6 }}>
              {b.examples.map((ex) => <li key={ex}>{ex}</li>)}
            </ul>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 12, padding: 12,
        border: `1px solid ${t.line}`, borderRadius: 10,
        background: t.surface2, fontSize: 13, color: t.ink3, lineHeight: 1.45,
      }}>
        <b style={{ color: t.ink }}>Recommended rule:</b> AI may collect and organize
        documents, but material lending approval stays with a human operator.
        {isLoading ? null : (
          <span style={{ display: "block", marginTop: 4, color: t.ink2 }}>
            {docTypes.length} document type{docTypes.length === 1 ? "" : "s"} configured.
          </span>
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        <Link href="/admin/lending-ai/verification" style={linkButton(t)}>
          Edit per-document checks →
        </Link>
      </div>
    </div>
  );
}


// ─── Step 4: Outreach defaults + Working schedule ────────────────────


function OutreachAndScheduleSection({
  t, outreach, wh, onOutreach, onWorkingHours,
}: {
  t: ReturnType<typeof useTheme>["t"];
  outreach: FirmOutreachDefaults;
  wh: WorkingHours;
  onOutreach: (next: FirmOutreachDefaults) => void;
  onWorkingHours: (next: WorkingHours) => void;
}) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{
          border: `1px solid ${t.line}`, borderRadius: 12,
          background: t.surface, padding: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: t.ink, marginBottom: 10 }}>
            Sending and escalation
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <FieldBlock label="Default approval mode" t={t}>
              <select
                value={outreach.approval_mode || "draft_first"}
                onChange={(e) => onOutreach({ ...outreach, approval_mode: e.target.value as ApprovalMode })}
                style={inputStyle(t)}
              >
                {(Object.keys(APPROVAL_MODE_LABEL) as ApprovalMode[]).map((k) => (
                  <option key={k} value={k}>{APPROVAL_MODE_LABEL[k]}</option>
                ))}
              </select>
            </FieldBlock>
            <FieldBlock label="Max AI attempts before human task" t={t}>
              <input
                type="number"
                min={1}
                max={8}
                value={outreach.max_attempts ?? 3}
                onChange={(e) => onOutreach({
                  ...outreach,
                  max_attempts: Math.max(1, Math.min(8, parseInt(e.target.value || "3", 10))),
                })}
                style={inputStyle(t)}
              />
            </FieldBlock>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <FieldBlock label="Default channel" t={t}>
                <select
                  value={outreach.default_channel || "portal"}
                  onChange={(e) => onOutreach({ ...outreach, default_channel: e.target.value as DefaultChannel })}
                  style={inputStyle(t)}
                >
                  {(Object.keys(DEFAULT_CHANNEL_LABEL) as DefaultChannel[]).map((k) => (
                    <option key={k} value={k}>{DEFAULT_CHANNEL_LABEL[k]}</option>
                  ))}
                </select>
              </FieldBlock>
              <FieldBlock label="Quiet hour behavior" t={t}>
                <select
                  value={outreach.quiet_window_behavior || "no_initiate"}
                  onChange={(e) => onOutreach({ ...outreach, quiet_window_behavior: e.target.value as QuietWindowBehavior })}
                  style={inputStyle(t)}
                >
                  {(Object.keys(QUIET_WINDOW_LABEL) as QuietWindowBehavior[]).map((k) => (
                    <option key={k} value={k}>{QUIET_WINDOW_LABEL[k]}</option>
                  ))}
                </select>
              </FieldBlock>
            </div>
          </div>
        </div>

        <div style={{
          border: `1px solid ${t.line}`, borderRadius: 12,
          background: t.surface, padding: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: t.ink, marginBottom: 4 }}>
            Working schedule
          </div>
          <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.45, marginBottom: 12 }}>
            The AI can prepare messages anytime, but it only initiates borrower outreach during this schedule.
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <FieldBlock label="Timezone" t={t}>
              <select
                value={wh.timezone}
                onChange={(e) => onWorkingHours({ ...wh, timezone: e.target.value })}
                style={inputStyle(t)}
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </FieldBlock>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <FieldBlock label="Start time" t={t}>
                <input
                  type="time"
                  value={wh.start_time}
                  onChange={(e) => onWorkingHours({ ...wh, start_time: e.target.value })}
                  style={inputStyle(t)}
                />
              </FieldBlock>
              <FieldBlock label="End time" t={t}>
                <input
                  type="time"
                  value={wh.end_time}
                  onChange={(e) => onWorkingHours({ ...wh, end_time: e.target.value })}
                  style={inputStyle(t)}
                />
              </FieldBlock>
            </div>

            <FieldBlock label="Working days" t={t}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                {WEEKDAYS_ORDER.map((d) => {
                  const active = wh.working_days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        onWorkingHours({
                          ...wh,
                          working_days: active
                            ? wh.working_days.filter((x) => x !== d)
                            : ([...wh.working_days, d] as WeekdayCode[]),
                        })
                      }
                      style={{
                        padding: "8px 0", fontSize: 12, fontWeight: 800,
                        borderRadius: 9,
                        border: `1px solid ${active ? t.petrol : t.line}`,
                        background: active ? t.petrolSoft : t.surface,
                        color: active ? t.petrol : t.ink3,
                        cursor: "pointer",
                      }}
                    >
                      {d.charAt(0)}
                    </button>
                  );
                })}
              </div>
            </FieldBlock>

            <FieldBlock label="After-hours rule" t={t}>
              <select
                value={wh.after_hours_rule}
                onChange={(e) =>
                  onWorkingHours({
                    ...wh,
                    after_hours_rule: e.target.value as AfterHoursRule,
                  })
                }
                style={inputStyle(t)}
              >
                {(Object.keys(AFTER_HOURS_LABEL) as AfterHoursRule[]).map((rule) => (
                  <option key={rule} value={rule}>{AFTER_HOURS_LABEL[rule]}</option>
                ))}
              </select>
            </FieldBlock>
          </div>
        </div>
      </div>

      <ScheduleSummary t={t} outreach={outreach} wh={wh} />
    </>
  );
}


function ScheduleSummary({
  t, outreach, wh,
}: {
  t: ReturnType<typeof useTheme>["t"];
  outreach: FirmOutreachDefaults;
  wh: WorkingHours;
}) {
  const approval = APPROVAL_MODE_LABEL[outreach.approval_mode || "draft_first"];
  const channel = DEFAULT_CHANNEL_LABEL[outreach.default_channel || "portal"];
  const attempts = outreach.max_attempts ?? 3;
  const quiet = QUIET_WINDOW_LABEL[outreach.quiet_window_behavior || "no_initiate"];
  return (
    <div style={{
      marginTop: 14, padding: 14,
      border: `1px solid ${t.petrol}`, borderRadius: 12,
      background: t.petrolSoft, color: t.petrol,
      fontSize: 13, lineHeight: 1.55,
    }}>
      <div>
        <b style={{ color: t.ink }}>Firm default:</b> {approval}, {attempts} AI attempts then a human task. Default channel: {channel}.
      </div>
      <div style={{ marginTop: 4 }}>
        <b style={{ color: t.ink }}>Working schedule:</b> {formatScheduleSummary(wh)}
      </div>
      <div style={{ marginTop: 4 }}>
        <b style={{ color: t.ink }}>After hours:</b> {AFTER_HOURS_LABEL[wh.after_hours_rule]} Quiet behavior: {quiet}.
      </div>
    </div>
  );
}


// ─── Step 5: Compliance guardrails ───────────────────────────────────


function GuardrailsSection({
  t, identity, onChange,
}: {
  t: ReturnType<typeof useTheme>["t"];
  identity: FirmIdentity;
  onChange: (next: FirmIdentity) => void;
}) {
  const [newRule, setNewRule] = useState("");
  const rules = identity.global_rules || [];

  function addRule(text: string) {
    const v = text.trim();
    if (!v) return;
    onChange({ ...identity, global_rules: [...rules, v] });
    setNewRule("");
  }
  function removeRule(idx: number) {
    onChange({ ...identity, global_rules: rules.filter((_, i) => i !== idx) });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <div style={{
        border: `1px solid ${t.line}`, borderRadius: 12,
        background: t.surface, padding: 16,
      }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: t.ink, marginBottom: 4 }}>
          Global rules
        </div>
        <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.45, marginBottom: 12 }}>
          Plain-English &quot;never&quot; / &quot;always&quot; statements. Honored regardless of any per-agent override.
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          {rules.map((r, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "1fr auto",
              gap: 8, alignItems: "center", padding: "10px 11px",
              border: `1px solid ${t.line}`, borderRadius: 10,
              background: t.surface2, fontSize: 13, color: t.ink,
            }}>
              <span>{r}</span>
              <button
                type="button"
                onClick={() => removeRule(i)}
                style={{
                  padding: "4px 10px", fontSize: 11, fontWeight: 700,
                  border: `1px solid ${t.line}`, borderRadius: 7,
                  background: t.surface, color: t.ink3, cursor: "pointer",
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginTop: 10 }}>
          <input
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            placeholder="Add a new global rule"
            onKeyDown={(e) => { if (e.key === "Enter") addRule(newRule); }}
            style={inputStyle(t)}
          />
          <button
            type="button"
            onClick={() => addRule(newRule)}
            style={{
              padding: "10px 14px", fontSize: 13, fontWeight: 700,
              borderRadius: 8, border: `1px solid ${t.line}`,
              background: t.brandSoft, color: t.brand, cursor: "pointer",
            }}
          >
            Add
          </button>
        </div>

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${t.line}` }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: t.ink3,
            marginBottom: 8, textTransform: "uppercase",
          }}>
            Suggested (click to add)
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SUGGESTED_RULES.filter((s) => !rules.includes(s)).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addRule(s)}
                style={{
                  padding: "6px 10px", fontSize: 12,
                  borderRadius: 999, border: `1px solid ${t.line}`,
                  background: t.surface, color: t.ink2, cursor: "pointer",
                  textAlign: "left",
                }}
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{
        border: `1px solid ${t.line}`, borderRadius: 12,
        background: t.surface, padding: 16,
      }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: t.ink, marginBottom: 4 }}>
          Forbidden topics and redirect
        </div>
        <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.45, marginBottom: 12 }}>
          The AI refuses to engage on these and offers the redirect template instead.
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <FieldBlock label="Forbidden topics (comma-separated)" t={t}>
            <textarea
              value={(identity.forbidden_topics || []).join(", ")}
              onChange={(e) =>
                onChange({
                  ...identity,
                  forbidden_topics: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="exact rate quotes, legal advice, tax advice, competitor pricing"
              rows={3}
              style={{ ...inputStyle(t), resize: "vertical", minHeight: 78 }}
            />
          </FieldBlock>
          <FieldBlock label="Redirect template" t={t}>
            <textarea
              value={identity.redirect_template || ""}
              onChange={(e) => onChange({ ...identity, redirect_template: e.target.value })}
              placeholder="That's something the funding team will confirm directly with you. I can flag it and they'll follow up — would that work?"
              rows={4}
              style={{ ...inputStyle(t), resize: "vertical", minHeight: 100 }}
            />
          </FieldBlock>
        </div>
      </div>
    </div>
  );
}


// ─── Shared primitives ───────────────────────────────────────────────


function FieldBlock({ label, children, t }: { label: string; children: React.ReactNode; t: ReturnType<typeof useTheme>["t"] }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>
        {label}
      </span>
      {children}
    </label>
  );
}


function Chip({
  children, t, tone,
}: {
  children: React.ReactNode;
  t: ReturnType<typeof useTheme>["t"];
  tone?: "good" | "warn" | "blue";
}) {
  const palette =
    tone === "good" ? { bg: t.profitBg, fg: t.profit }
    : tone === "warn" ? { bg: t.warnBg, fg: t.warn }
    : tone === "blue" ? { bg: t.brandSoft, fg: t.brand }
    : { bg: t.surface2, fg: t.ink3 };
  return (
    <span style={{
      fontSize: 10, fontWeight: 800,
      padding: "3px 8px", borderRadius: 999,
      background: palette.bg, color: palette.fg,
      textTransform: "uppercase", letterSpacing: 0.4,
    }}>
      {children}
    </span>
  );
}


function inputStyle(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "10px 12px", fontSize: 13, fontFamily: "inherit",
    borderRadius: 8, border: `1px solid ${t.line}`,
    background: t.surface, color: t.ink, width: "100%",
    outline: "none",
  } as const;
}


function linkButton(t: ReturnType<typeof useTheme>["t"]) {
  return {
    display: "inline-block",
    padding: "8px 13px", fontSize: 12, fontWeight: 700,
    borderRadius: 8, border: `1px solid ${t.line}`,
    background: t.surface2, color: t.ink2,
    textDecoration: "none", cursor: "pointer",
  } as const;
}
