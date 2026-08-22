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
//
// Styling is the shared class system (globals.css + app-extras.css) via the
// wrappers in @/components/ds. The page no longer sets its own padding or
// max-width: the shell's `.content` owns both, and the page setting them again
// was double-padding inside it.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import { AINotDeployedBanner } from "@/components/AINotDeployedBanner";
import { DscrPricingSection } from "@/components/admin/DscrPricingSection";
import {
  Btn,
  CG,
  Card,
  CellChip,
  IconBtn,
  Input,
  ItemRow,
  KpiRow,
  Note,
  PageHeader,
  Panel,
  Row,
  Select,
  Tag,
  Textarea,
  cx,
  type ChipTone,
} from "@/components/ds";
import {
  isAINotDeployed,
  useCurrentUser,
  useFundingMetaRules,
  useLendingPlaybooks,
  usePatchFundingMetaRules,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
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
  const router = useRouter();
  // Lending AI settings are operator-only (super-admin or loan-exec), matching
  // the backend _require_admin gate. Bounce anyone else instead of rendering
  // the console and firing its authenticated reads.
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const isOperator = me?.role === Role.SUPER_ADMIN || me?.role === Role.LOAN_EXEC;
  useEffect(() => {
    if (!meLoading && me && !isOperator) router.replace("/");
  }, [meLoading, me, isOperator, router]);
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
      <div className="grid">
        <SettingsHeader dirty={false} saving={false} onClose={() => router.push("/settings")} onSave={save} />
        <AINotDeployedBanner surface="Lending AI" />
      </div>
    );
  }

  if (me && !isOperator) return null;

  return (
    <div className="grid">
      <SettingsHeader
        dirty={dirty}
        saving={patch.isPending}
        onClose={() => router.push("/settings")}
        onSave={save}
      />

      <Snapshot
        aiName={identity.ai_name || "—"}
        playbookCount={(playbooks.data || []).filter((p) => p.status === "published").length}
        approvalMode={outreach.approval_mode ?? "draft_first"}
        wh={wh}
      />

      {isLoading ? (
        <Card><div className="sub">Loading firm settings…</div></Card>
      ) : (
        <div className="grid">
          <Section kicker="Step 1" title="Firm AI identity"
            copy="The global persona layered into every borrower-facing AI message. Agents inherit this voice unless they override their tone in Agent AI Settings.">
            <FirmIdentitySection
              identity={identity}
              onChange={(next) => mutate({ ...draft, identity: next })}
            />
          </Section>

          <Section kicker="Step 2" title="Lending playbooks"
            copy="Default requirements per loan product. Funding-locked items appear on every new deal and cannot be disabled by agents.">
            <LendingPlaybooksSection />
          </Section>

          <Section kicker="Step 3" title="Document verification rules"
            copy="What Elara may complete on its own vs. what an underwriter must verify. Per-document detail lives in the verification editor.">
            <VerificationSummarySection />
          </Section>

          <Section kicker="Step 4" title="Default outreach and working schedule"
            copy="The firm-wide fallback when an agent has not configured their own. Agent settings and per-deal overrides can still be stricter.">
            <OutreachAndScheduleSection
              outreach={outreach}
              wh={wh}
              onOutreach={(next) => mutate({ ...draft, outreach_defaults: next })}
              onWorkingHours={(next) => mutate({ ...draft, working_hours: next })}
            />
          </Section>

          <Section kicker="Step 5" title="Compliance guardrails"
            copy="Hard rules Elara follows on every conversation. These take precedence over per-agent or per-client overrides.">
            <GuardrailsSection
              identity={identity}
              onChange={(next) => mutate({ ...draft, identity: next })}
            />
          </Section>

          <Section kicker="Step 6" title="AI training per task"
            copy="Tune the instructions and tone for each borrower-facing AI task — document nudges, Nurture AI chat, re-engagement — and review what operators have flagged.">
            <Link href="/admin/lending-ai/training" className="btn">
              Open AI training →
            </Link>
          </Section>

          <Section kicker="Step 7" title="DSCR pricing (real-estate leads)"
            copy="Rate assumptions for the deterministic DSCR-potential screen. The lead's credit signal picks a tier; changes apply within a minute, no deploy needed.">
            <DscrPricingSection />
          </Section>

          <Section kicker="Step 8" title="Elara AI usage and controls"
            copy="Review AI cost, average spend per client file, category-level alerts, and manual controls for paid Bedrock calls.">
            <Link href="/admin/token-usage" className="btn">
              Open Elara AI Usage & Controls →
            </Link>
          </Section>
        </div>
      )}
    </div>
  );
}


// ─── Page chrome ─────────────────────────────────────────────────────


// Named for what it is rather than `PageHeader`, which is now the shared
// `.hd` wrapper this renders.
function SettingsHeader({
  dirty, saving, onClose, onSave,
}: {
  dirty: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div>
      <PageHeader
        title="Super Admin AI Settings"
        actions={
          <>
            {/* `.btn.pri` + `.btn:disabled` carry what the inline petrol/greyed
                pair used to: enabled means there is something to publish. */}
            <Btn variant="pri" onClick={onSave} disabled={saving || !dirty}>
              {saving ? "Publishing…" : dirty ? "Publish settings" : "Published"}
            </Btn>
            <IconBtn aria-label="Close" onClick={onClose}>
              <Icon name="x" size={16} stroke={2.4} />
            </IconBtn>
          </>
        }
      />
      {/* Too long to sit on the `.hd` baseline as a lede, so it keeps its own
          line. `h2 + .sub` does not match an h1 inside `.hd`, hence the width. */}
      <div className="sub" style={{ maxWidth: 760, marginTop: 4 }}>
        Firm-wide controls for Elara — brand identity, lending
        playbooks, verification policy, outreach defaults, working schedule,
        and compliance boundaries. Agents may customize their own settings;
        these are the rules every conversation falls back to.
      </div>
    </div>
  );
}


function Snapshot({
  aiName, playbookCount, approvalMode, wh,
}: {
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
    <KpiRow>
      {items.map((item) => (
        // Not `<Kpi>`: `.knum` is 26px and `white-space: nowrap`, and two of
        // these four values are sentences ("Mon–Fri, 9:00–18:00 ET").
        <div key={item.label} className="kpi">
          <div className="lbl">{item.label}</div>
          <div>{item.body}</div>
        </div>
      ))}
    </KpiRow>
  );
}


function Section({
  kicker, title, copy, children,
}: {
  kicker: string;
  title: string;
  copy: string;
  children: React.ReactNode;
}) {
  return (
    <Panel title={title} actions={<Tag>{kicker}</Tag>}>
      <div className="sub mb" style={{ maxWidth: 740 }}>{copy}</div>
      {children}
    </Panel>
  );
}


// ─── Step 1: Firm AI identity ────────────────────────────────────────


function FirmIdentitySection({
  identity, onChange,
}: {
  identity: FirmIdentity;
  onChange: (next: FirmIdentity) => void;
}) {
  return (
    // A genuine 1fr 1fr — editor beside preview — so 6 + 6 of the page grid.
    <CG>
      <div className="s6 grid g10">
        <div className="fldgrid two">
          <FieldBlock label="AI name">
            <Input
              value={identity.ai_name || ""}
              onChange={(e) => onChange({ ...identity, ai_name: e.target.value })}
              placeholder="e.g. Quinn"
            />
          </FieldBlock>
          <FieldBlock label="Greeting style">
            <Select
              value={identity.greeting_style || "friendly"}
              onChange={(e) => onChange({ ...identity, greeting_style: e.target.value as GreetingStyle })}
            >
              <option value="formal">Formal</option>
              <option value="friendly">Friendly</option>
              <option value="concise">Concise</option>
            </Select>
          </FieldBlock>
        </div>
        <FieldBlock label="Voice summary">
          {/* `resize` is not on `.field`; vertical-only is the affordance the
              original shipped, and the min height keeps the box usable. */}
          <Textarea
            value={identity.voice_summary || ""}
            onChange={(e) => onChange({ ...identity, voice_summary: e.target.value })}
            placeholder="Direct, knowledgeable about commercial real estate lending. References concrete numbers, never vague generalities."
            rows={3}
            style={{ resize: "vertical", minHeight: 84 }}
          />
        </FieldBlock>
        <FieldBlock label="Brand signature">
          <Input
            value={identity.brand_signature || ""}
            onChange={(e) => onChange({ ...identity, brand_signature: e.target.value })}
            placeholder="— Qualified Commercial Lending Team"
          />
        </FieldBlock>
      </div>

      <IdentityPreview className="s6" identity={identity} />
    </CG>
  );
}


function IdentityPreview({
  identity, className,
}: {
  identity: FirmIdentity;
  className?: string;
}) {
  const greeting =
    identity.greeting_style === "formal" ? "Hello Jordan,"
    : identity.greeting_style === "concise" ? "Jordan,"
    : "Hi Jordan,";
  const name = identity.ai_name?.trim() || "—";
  return (
    <Panel className={className} title="Borrower-facing preview">
      {/* A sunken quote block. `.msg-b` is the closest class but it is
          `white-space: pre-wrap`, which would render the JSX indentation. */}
      <div style={{ background: "var(--sunken2)", border: "1px solid var(--line)", borderRadius: 10, padding: 14 }}>
        <div className="grid g8">
          <b>{name}</b>
          <div>{greeting}</div>
          <div>
            I am following up to help keep your lending file moving. Please upload the
            missing purchase contract when available.
          </div>
          {identity.voice_summary ? (
            <div className="sub">Voice: {identity.voice_summary}</div>
          ) : null}
          <div>
            Best,<br />
            {identity.brand_signature?.trim() || "Qualified Commercial Lending Team"}
          </div>
        </div>
      </div>
    </Panel>
  );
}


// ─── Step 2: Lending playbooks summary ───────────────────────────────


function LendingPlaybooksSection() {
  const { data, isLoading, error } = useLendingPlaybooks();
  if (isAINotDeployed(error)) return <AINotDeployedBanner surface="Lending AI" />;
  const playbooks = (data || []).filter((p) => p.owner_type === "funding" || p.owner_type === "platform");

  return (
    <div>
      {isLoading ? (
        <div className="sub">Loading playbooks…</div>
      ) : playbooks.length === 0 ? (
        <div className="sub">
          No funding playbooks yet — create one to lock in firm-required documents per product.
        </div>
      ) : (
        // `.itemrow + .itemrow` owns the spacing between rows.
        <div>
          {playbooks.map((pb) => (
            <ItemRow
              key={pb.id}
              right={
                <span className="row">
                  <CellChip tone={pb.status === "published" ? "ok" : "warn"}>
                    {pb.status}
                  </CellChip>
                  <CellChip>
                    {pb.owner_type === "funding" ? "Funding" : "Platform"}
                  </CellChip>
                </span>
              }
            >
              <div><b>{pb.name}</b></div>
              <div className="sub">
                {pb.description || "Default requirements per loan product."}
              </div>
            </ItemRow>
          ))}
        </div>
      )}
      <div className="mt">
        <Link href="/admin/lending-ai/playbooks" className="btn">
          Edit lending playbooks →
        </Link>
      </div>
    </div>
  );
}


// ─── Step 3: Document verification summary ───────────────────────────


function VerificationSummarySection() {
  const { data, isLoading, error } = useFundingMetaRules("verification");

  // Above the early return, not below it. React counts hooks per render: when
  // `error` flips to a 404 the component returns before reaching useMemo, the
  // hook count changes between renders, and React throws "rendered fewer hooks
  // than expected" — taking the whole page down rather than showing the
  // not-deployed banner it was trying to show.
  const docTypes = useMemo(() => {
    const raw = data?.rules as { doc_types?: Record<string, unknown> } | undefined;
    return raw?.doc_types && typeof raw.doc_types === "object" ? Object.keys(raw.doc_types) : [];
  }, [data?.rules]);

  if (isAINotDeployed(error)) return <AINotDeployedBanner surface="Lending AI" />;

  const buckets: { title: string; tone: ChipTone; body: string; examples: string[] }[] = [
    {
      title: "AI can complete",
      tone: "ok",
      body: "Low-risk items where upload presence or simple structured data is enough.",
      examples: ["Proof of funds received", "Property photos received", "Borrower questionnaire complete"],
    },
    {
      title: "Requires human verify",
      tone: "warn",
      body: "Material underwriting items that should never be fully approved by Elara.",
      examples: ["Purchase contract", "Entity documents", "Scope of work"],
    },
    {
      title: "Borrower self-attest",
      tone: "acc",
      body: "Answers the borrower can provide directly, reviewable later by a human.",
      examples: ["Exit strategy", "Project timeline", "Property use"],
    },
  ];

  return (
    <div>
      {/* Three equal columns — 4 + 4 + 4 of the page grid. */}
      <CG>
        {buckets.map((b) => (
          <Card key={b.title} className="s4">
            <div className="mb"><CellChip tone={b.tone}>{b.title}</CellChip></div>
            <div className="sub">{b.body}</div>
            <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
              {b.examples.map((ex) => <li key={ex}>{ex}</li>)}
            </ul>
          </Card>
        ))}
      </CG>

      <Note>
        <div>
          <b>Recommended rule:</b> AI may collect and organize
          documents, but material lending approval stays with a human operator.
          {isLoading ? null : (
            <div className="sub">
              {docTypes.length} document type{docTypes.length === 1 ? "" : "s"} configured.
            </div>
          )}
        </div>
      </Note>

      <div className="mt">
        <Link href="/admin/lending-ai/verification" className="btn">
          Edit per-document checks →
        </Link>
      </div>
    </div>
  );
}


// ─── Step 4: Outreach defaults + Working schedule ────────────────────


function OutreachAndScheduleSection({
  outreach, wh, onOutreach, onWorkingHours,
}: {
  outreach: FirmOutreachDefaults;
  wh: WorkingHours;
  onOutreach: (next: FirmOutreachDefaults) => void;
  onWorkingHours: (next: WorkingHours) => void;
}) {
  return (
    <>
      <CG>
        <Panel className="s6" title="Sending and escalation">
          <div className="grid g10">
            <FieldBlock label="Default approval mode">
              <Select
                value={outreach.approval_mode || "draft_first"}
                onChange={(e) => onOutreach({ ...outreach, approval_mode: e.target.value as ApprovalMode })}
              >
                {(Object.keys(APPROVAL_MODE_LABEL) as ApprovalMode[]).map((k) => (
                  <option key={k} value={k}>{APPROVAL_MODE_LABEL[k]}</option>
                ))}
              </Select>
            </FieldBlock>
            <FieldBlock label="Max AI attempts before human task">
              <Input
                type="number"
                min={1}
                max={8}
                value={outreach.max_attempts ?? 3}
                onChange={(e) => onOutreach({
                  ...outreach,
                  max_attempts: Math.max(1, Math.min(8, parseInt(e.target.value || "3", 10))),
                })}
              />
            </FieldBlock>
            <div className="fldgrid two">
              <FieldBlock label="Default channel">
                <Select
                  value={outreach.default_channel || "portal"}
                  onChange={(e) => onOutreach({ ...outreach, default_channel: e.target.value as DefaultChannel })}
                >
                  {(Object.keys(DEFAULT_CHANNEL_LABEL) as DefaultChannel[]).map((k) => (
                    <option key={k} value={k}>{DEFAULT_CHANNEL_LABEL[k]}</option>
                  ))}
                </Select>
              </FieldBlock>
              <FieldBlock label="Quiet hour behavior">
                <Select
                  value={outreach.quiet_window_behavior || "no_initiate"}
                  onChange={(e) => onOutreach({ ...outreach, quiet_window_behavior: e.target.value as QuietWindowBehavior })}
                >
                  {(Object.keys(QUIET_WINDOW_LABEL) as QuietWindowBehavior[]).map((k) => (
                    <option key={k} value={k}>{QUIET_WINDOW_LABEL[k]}</option>
                  ))}
                </Select>
              </FieldBlock>
            </div>
          </div>
        </Panel>

        <Panel className="s6" title="Working schedule">
          <div className="sub mb">
            Elara can prepare messages anytime, but it only initiates borrower outreach during this schedule.
          </div>

          <div className="grid g10">
            <FieldBlock label="Timezone">
              <Select
                value={wh.timezone}
                onChange={(e) => onWorkingHours({ ...wh, timezone: e.target.value })}
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </Select>
            </FieldBlock>

            <div className="fldgrid two">
              <FieldBlock label="Start time">
                <Input
                  type="time"
                  value={wh.start_time}
                  onChange={(e) => onWorkingHours({ ...wh, start_time: e.target.value })}
                />
              </FieldBlock>
              <FieldBlock label="End time">
                <Input
                  type="time"
                  value={wh.end_time}
                  onChange={(e) => onWorkingHours({ ...wh, end_time: e.target.value })}
                />
              </FieldBlock>
            </div>

            <FieldBlock label="Working days">
              {/* Seven equal columns is a day-of-week strip, not a page-grid
                  span: `.fldgrid` owns display and gap, the template is its own. */}
              <div className="fldgrid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
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
                      aria-pressed={active}
                      className={cx("btn", "sm", active && "pri")}
                      style={{ justifyContent: "center" }}
                    >
                      {d.charAt(0)}
                    </button>
                  );
                })}
              </div>
            </FieldBlock>

            <FieldBlock label="After-hours rule">
              <Select
                value={wh.after_hours_rule}
                onChange={(e) =>
                  onWorkingHours({
                    ...wh,
                    after_hours_rule: e.target.value as AfterHoursRule,
                  })
                }
              >
                {(Object.keys(AFTER_HOURS_LABEL) as AfterHoursRule[]).map((rule) => (
                  <option key={rule} value={rule}>{AFTER_HOURS_LABEL[rule]}</option>
                ))}
              </Select>
            </FieldBlock>
          </div>
        </Panel>
      </CG>

      <ScheduleSummary outreach={outreach} wh={wh} />
    </>
  );
}


function ScheduleSummary({
  outreach, wh,
}: {
  outreach: FirmOutreachDefaults;
  wh: WorkingHours;
}) {
  const approval = APPROVAL_MODE_LABEL[outreach.approval_mode || "draft_first"];
  const channel = DEFAULT_CHANNEL_LABEL[outreach.default_channel || "portal"];
  const attempts = outreach.max_attempts ?? 3;
  const quiet = QUIET_WINDOW_LABEL[outreach.quiet_window_behavior || "no_initiate"];
  return (
    <Note>
      <div>
        <div>
          <b>Firm default:</b> {approval}, {attempts} AI attempts then a human task. Default channel: {channel}.
        </div>
        <div>
          <b>Working schedule:</b> {formatScheduleSummary(wh)}
        </div>
        <div>
          <b>After hours:</b> {AFTER_HOURS_LABEL[wh.after_hours_rule]} Quiet behavior: {quiet}.
        </div>
      </div>
    </Note>
  );
}


// ─── Step 5: Compliance guardrails ───────────────────────────────────


function GuardrailsSection({
  identity, onChange,
}: {
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
    <CG>
      <Panel className="s6" title="Global rules">
        <div className="sub mb">
          Plain-English &quot;never&quot; / &quot;always&quot; statements. Honored regardless of any per-agent override.
        </div>

        <div>
          {rules.map((r, i) => (
            <ItemRow
              key={i}
              right={<Btn size="sm" onClick={() => removeRule(i)}>Remove</Btn>}
            >
              {r}
            </ItemRow>
          ))}
        </div>

        <Row className="mt">
          <Input
            grow
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            placeholder="Add a new global rule"
            onKeyDown={(e) => { if (e.key === "Enter") addRule(newRule); }}
          />
          <Btn variant="pri" onClick={() => addRule(newRule)}>Add</Btn>
        </Row>

        <div className="mt" style={{ paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          <div className="lbl">Suggested (click to add)</div>
          <Row className="mt">
            {SUGGESTED_RULES.filter((s) => !rules.includes(s)).map((s) => (
              <Btn key={s} size="sm" onClick={() => addRule(s)}>+ {s}</Btn>
            ))}
          </Row>
        </div>
      </Panel>

      <Panel className="s6" title="Forbidden topics and redirect">
        <div className="sub mb">
          Elara refuses to engage on these and offers the redirect template instead.
        </div>

        <div className="grid g10">
          <FieldBlock label="Forbidden topics (comma-separated)">
            <Textarea
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
              style={{ resize: "vertical", minHeight: 78 }}
            />
          </FieldBlock>
          <FieldBlock label="Redirect template">
            <Textarea
              value={identity.redirect_template || ""}
              onChange={(e) => onChange({ ...identity, redirect_template: e.target.value })}
              placeholder="That's something the funding team will confirm directly with you. I can flag it and they'll follow up — would that work?"
              rows={4}
              style={{ resize: "vertical", minHeight: 100 }}
            />
          </FieldBlock>
        </div>
      </Panel>
    </CG>
  );
}


// ─── Shared primitives ───────────────────────────────────────────────


// Stays a <label> rather than becoming `ds/Field`: wrapping the control means
// clicking the caption focuses it, and that is an affordance, not decoration.
function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid g6">
      <span className="lbl">{label}</span>
      {children}
    </label>
  );
}
