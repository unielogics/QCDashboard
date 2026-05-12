"use client";

// Agent Settings → AI — single scrollable page, 5 stacked sections.
//
// 1. Sending Control          — agent's default for new deals
// 2. Lead Creation Templates  — buyer + seller checklist editors
// 3. Attempt Limit & Schedule — attempts before escalation + working hours
// 4. Ready for Lending        — handoff gate (buyer-side requirements)
// 5. Knowledge & Voice        — PDFs / FAQ + tone / style / signature
//
// X close button in the top-right returns to /agent-settings. The
// page uses the QC design-system primitives (Card, SectionLabel,
// Icon, useTheme) — no shadcn, no new color tokens.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { AIPreviewPanel } from "@/components/AIPreviewPanel";
import {
  isAINotDeployed,
  useAgentKnowledge,
  useAgentPlaybook,
  useDeleteAgentKnowledge,
  useDeleteAgentRequirement,
  usePatchAgentPlaybookRules,
  useUploadAgentKnowledge,
  useUpsertAgentRequirement,
  type AgentKnowledgeDocument,
  type PlaybookRequirement,
} from "@/hooks/useApi";
import { AINotDeployedBanner } from "@/components/AINotDeployedBanner";
import {
  AFTER_HOURS_LABEL,
  DEFAULT_WORKING_HOURS,
  TIMEZONE_OPTIONS,
  WEEKDAYS_ORDER,
  formatScheduleSummary,
  normalizeWorkingHours,
  type AfterHoursRule,
  type WeekdayCode,
  type WorkingHours,
} from "./scheduleFormat";

// ── Rules JSONB shapes (mirror what backend reads in services/ai) ─────

type SendingControl = "draft_only" | "ask_before_sending" | "auto_send_portal";

type AttemptLimit = {
  max_attempts?: number;
  create_task_when_reached?: boolean;
  mark_stalled?: boolean;
};

type VoiceStyle = {
  tone?: "professional" | "warm" | "concise" | "friendly";
  follow_up_style?: "soft" | "balanced" | "direct";
  signature?: string;
};

type AgentRulesShape = {
  sending_control?: SendingControl;
  working_hours?: Partial<WorkingHours>;
  attempt_limit?: AttemptLimit;
  voice?: VoiceStyle;
  knowledge?: { faq_text?: string };
  // legacy buckets retained as-is on save so other surfaces don't break
  followup?: Record<string, unknown>;
  style?: VoiceStyle;
};


export default function AgentAISettingsPage() {
  const { t } = useTheme();
  const router = useRouter();
  const cadence = useAgentPlaybook("cadence");
  const buyer = useAgentPlaybook("buyer");
  const seller = useAgentPlaybook("seller");
  const patchCadence = usePatchAgentPlaybookRules("cadence");

  // Local snapshot of the agent's cadence-playbook rules. Loaded once,
  // edited section-by-section. Single Save button at the top pushes
  // back through PATCH /me/ai-playbook/cadence/rules.
  const [rules, setRules] = useState<AgentRulesShape>({});
  const [dirty, setDirty] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    if (cadence.data?.rules) {
      setRules((cadence.data.rules as AgentRulesShape) || {});
      loadedRef.current = true;
    }
  }, [cadence.data?.rules]);

  function mutate(next: AgentRulesShape) {
    setRules(next);
    setDirty(true);
  }

  async function save() {
    try {
      await patchCadence.mutateAsync(rules as Record<string, unknown>);
      setDirty(false);
    } catch {
      // AINotDeployedBanner below renders if it's a 404. No toast lib
      // wired in this surface — same pattern as the rest of the page.
    }
  }

  const wh = useMemo(
    () => normalizeWorkingHours(rules.working_hours),
    [rules.working_hours],
  );
  const attempts = rules.attempt_limit?.max_attempts ?? 3;
  const sendingControl: SendingControl = rules.sending_control ?? "draft_only";

  if (isAINotDeployed(cadence.error)) {
    return (
      <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
        <PageHeader t={t} dirty={false} saving={false} onClose={() => router.push("/agent-settings")} onSave={save} />
        <AINotDeployedBanner surface="AI Assistant" />
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <PageHeader
        t={t}
        dirty={dirty}
        saving={patchCadence.isPending}
        onClose={() => router.push("/agent-settings")}
        onSave={save}
      />

      <Snapshot
        t={t}
        sendingControl={sendingControl}
        attempts={attempts}
        wh={wh}
      />

      <Section
        t={t}
        kicker="Step 1"
        title="Sending control"
        copy="Your default for new deals. You can still change this per file in Deal Secretary."
      >
        <SendingControlSection
          t={t}
          value={sendingControl}
          onChange={(v) => mutate({ ...rules, sending_control: v })}
        />
      </Section>

      <Section
        t={t}
        kicker="Step 2"
        title="Lead creation templates"
        copy="When you create a Buyer or Seller lead, this checklist becomes the starting point. AI works only on the items marked AI or Shared."
      >
        <LeadTemplatesSection t={t} />
      </Section>

      <Section
        t={t}
        kicker="Step 3"
        title="AI attempt limit & working schedule"
        copy="Set the AI's working hours and how many tries before it escalates to you. The AI never initiates outside these hours."
      >
        <AttemptAndScheduleSection
          t={t}
          attempts={attempts}
          createTask={rules.attempt_limit?.create_task_when_reached ?? true}
          markStalled={rules.attempt_limit?.mark_stalled ?? false}
          wh={wh}
          onAttempts={(n) =>
            mutate({
              ...rules,
              attempt_limit: {
                ...(rules.attempt_limit || {}),
                max_attempts: n,
              },
            })
          }
          onCreateTask={(v) =>
            mutate({
              ...rules,
              attempt_limit: {
                ...(rules.attempt_limit || {}),
                create_task_when_reached: v,
              },
            })
          }
          onMarkStalled={(v) =>
            mutate({
              ...rules,
              attempt_limit: {
                ...(rules.attempt_limit || {}),
                mark_stalled: v,
              },
            })
          }
          onWorkingHours={(next) =>
            mutate({ ...rules, working_hours: next })
          }
        />
      </Section>

      <Section
        t={t}
        kicker="Step 4"
        title="Ready for lending"
        copy="When these buyer-side items are satisfied, your AI may suggest the lending handoff."
      >
        <ReadyForLendingSection t={t} buyer={buyer} seller={seller} />
      </Section>

      <Section
        t={t}
        kicker="Step 5"
        title="Knowledge & voice"
        copy="Upload PDFs and paste FAQ the AI should know. Set tone, follow-up style, and signature."
      >
        <KnowledgeAndVoiceSection
          t={t}
          voice={rules.voice ?? rules.style ?? {}}
          faqText={rules.knowledge?.faq_text ?? ""}
          onVoice={(v) => mutate({ ...rules, voice: v })}
          onFaq={(text) =>
            mutate({
              ...rules,
              knowledge: { ...(rules.knowledge || {}), faq_text: text },
            })
          }
        />
      </Section>

      <div style={{ marginTop: 24 }}>
        <AIPreviewPanel mode="plan" />
      </div>
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
          Agent AI Settings
        </h1>
        <p style={{ fontSize: 13, color: t.ink3, margin: 0, maxWidth: 640 }}>
          Configure your AI assistant — how it sends, when it works,
          what it collects, and the knowledge it speaks from.
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
          {saving ? "Saving…" : dirty ? "Save settings" : "Saved"}
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
  t, sendingControl, attempts, wh,
}: {
  t: ReturnType<typeof useTheme>["t"];
  sendingControl: SendingControl;
  attempts: number;
  wh: WorkingHours;
}) {
  const items = [
    {
      label: "Sending",
      body:
        sendingControl === "auto_send_portal"
          ? "Auto-send portal only"
          : sendingControl === "ask_before_sending"
          ? "Ask before sending"
          : "Draft only",
    },
    { label: "Attempts", body: `${attempts} tries → task` },
    { label: "Working hours", body: formatScheduleSummary(wh) },
    { label: "After hours", body: AFTER_HOURS_LABEL[wh.after_hours_rule] },
  ];
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 8,
      marginBottom: 20,
    }}>
      {items.map(item => (
        <div key={item.label} style={{
          border: `1px solid ${t.line}`,
          borderRadius: 8,
          padding: 12,
          background: t.surface2,
        }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: t.petrol, marginBottom: 4, textTransform: "uppercase" }}>
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
    <div style={{ marginBottom: 18 }}>
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
          <p style={{ margin: "6px 0 0", fontSize: 13, color: t.ink3, lineHeight: 1.55, maxWidth: 720 }}>
            {copy}
          </p>
        </div>
        {children}
      </Card>
    </div>
  );
}


// ─── Section 1: Sending Control ──────────────────────────────────────


function SendingControlSection({
  t, value, onChange,
}: {
  t: ReturnType<typeof useTheme>["t"];
  value: SendingControl;
  onChange: (v: SendingControl) => void;
}) {
  const options: { value: SendingControl; title: string; body: string }[] = [
    {
      value: "draft_only",
      title: "Draft only",
      body: "Writes messages into the AI Inbox. Nothing sends without your approval.",
    },
    {
      value: "ask_before_sending",
      title: "Ask before sending",
      body: "Suggests the message and asks you to approve each send.",
    },
    {
      value: "auto_send_portal",
      title: "Auto-send portal only",
      body: "Sends low-risk portal reminders automatically. Email and SMS still require approval.",
    },
  ];
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {options.map(opt => {
          const selected = value === opt.value;
          return (
            <label
              key={opt.value}
              style={{
                position: "relative",
                display: "block",
                padding: 14,
                borderRadius: 12,
                border: `1px solid ${selected ? t.petrol : t.line}`,
                background: selected ? t.petrolSoft : t.surface,
                cursor: "pointer",
                minHeight: 110,
              }}
            >
              <input
                type="radio"
                checked={selected}
                onChange={() => onChange(opt.value)}
                style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
              />
              <div style={{ fontSize: 13, fontWeight: 800, color: t.ink, marginBottom: 6 }}>
                {opt.title}
              </div>
              <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.45 }}>
                {opt.body}
              </div>
            </label>
          );
        })}
      </div>
      <BehaviorNote
        icon="lightbulb"
        title="Per-file overrides stay easy"
        body="Open a deal's AI Secretary and change its outreach mode any time. This setting only affects new deals."
        style={{ marginTop: 12 }}
      />
    </>
  );
}


// ─── Section 2: Lead Creation Templates ──────────────────────────────


function LeadTemplatesSection({ t }: { t: ReturnType<typeof useTheme>["t"] }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <TemplateCard t={t} side="buyer" />
      <TemplateCard t={t} side="seller" />
    </div>
  );
}


function TemplateCard({
  t, side,
}: {
  t: ReturnType<typeof useTheme>["t"];
  side: "buyer" | "seller";
}) {
  const { data, isLoading, error } = useAgentPlaybook(side);
  const upsert = useUpsertAgentRequirement(side);
  const del = useDeleteAgentRequirement(side);
  const [expanded, setExpanded] = useState(false);
  const [configureFor, setConfigureFor] = useState<{ req: PlaybookRequirement; owner: "platform" | "agent" } | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const platform = data?.platform_requirements || [];
  const overlay = data?.agent_requirements || [];
  const groups = useMemo(() => groupByLevel(platform, overlay), [platform, overlay]);

  const allRows = [...groups.required, ...groups.recommended, ...groups.optional];

  async function setLevel(req: PlaybookRequirement, owner: "platform" | "agent", newLevel: "required" | "recommended" | "optional" | "disable") {
    if (owner === "platform" && !req.can_agent_override) return;
    try {
      if (newLevel === "disable") {
        if (owner === "agent") await del.mutateAsync(req.id);
        else {
          await upsert.mutateAsync({
            requirement_key: req.requirement_key, label: req.label,
            category: req.category, required_level: "optional",
          });
        }
        return;
      }
      await upsert.mutateAsync({
        id: owner === "agent" ? req.id : undefined,
        requirement_key: req.requirement_key, label: req.label,
        category: req.category, required_level: newLevel,
      });
    } catch {/* banner shown elsewhere */}
  }

  if (isAINotDeployed(error)) {
    return <AINotDeployedBanner surface="AI Assistant" />;
  }

  return (
    <div style={{
      border: `1px solid ${t.line}`,
      borderRadius: 12,
      background: t.surface,
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 12, padding: "14px 16px", borderBottom: `1px solid ${t.line}`,
        background: t.surface2,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: t.ink, marginBottom: 2 }}>
            {side === "buyer" ? "Buyer Lead Template" : "Seller Lead Template"}
          </div>
          <div style={{ fontSize: 12, color: t.ink3 }}>
            Applies automatically when the lead is labeled <b>{side === "buyer" ? "Buyer" : "Seller"}</b>.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={{
            padding: "7px 12px", fontSize: 12, fontWeight: 700,
            borderRadius: 7, border: `1px solid ${t.line}`,
            background: t.surface, color: t.ink2, cursor: "pointer",
          }}
        >
          {expanded ? "Collapse" : "Edit"}
        </button>
      </div>

      <div style={{ padding: "10px 16px 14px" }}>
        {isLoading ? (
          <div style={{ color: t.ink3, fontSize: 13, padding: 8 }}>Loading…</div>
        ) : !expanded ? (
          // Compact preview — first 5 rows with chips.
          <div>
            {allRows.slice(0, 5).map(({ req }) => (
              <div key={req.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                gap: 12, padding: "10px 0", borderBottom: `1px solid ${t.line}`,
                fontSize: 13,
              }}>
                <div>
                  <div style={{ color: t.ink, fontWeight: 700 }}>{req.label}</div>
                </div>
                <ChipText t={t}>{ownerLabel(req.default_owner_type)}</ChipText>
              </div>
            ))}
            {allRows.length > 5 ? (
              <div style={{ fontSize: 11, color: t.ink3, marginTop: 8 }}>
                + {allRows.length - 5} more — click Edit to manage.
              </div>
            ) : null}
          </div>
        ) : (
          <div>
            <Group title="Required" t={t} rows={groups.required} onSetLevel={setLevel} onConfigure={(req, owner) => setConfigureFor({ req, owner })} />
            <Group title="Recommended" t={t} rows={groups.recommended} onSetLevel={setLevel} onConfigure={(req, owner) => setConfigureFor({ req, owner })} />
            <Group title="Optional" t={t} rows={groups.optional} onSetLevel={setLevel} onConfigure={(req, owner) => setConfigureFor({ req, owner })} />
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${t.line}` }}>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                style={{
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 8,
                  border: `1px solid ${t.line}`,
                  background: t.surface,
                  color: t.ink,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                + Add row
              </button>
              <span style={{ marginLeft: 10, fontSize: 11, color: t.ink3 }}>
                Custom rows show up in your buyer/seller playbook and seed the Tasks tab on new deals.
              </span>
            </div>
          </div>
        )}
      </div>

      {addOpen ? (
        <AddTemplateRowModal
          t={t}
          side={side}
          existingKeys={new Set([...platform.map((r) => r.requirement_key), ...overlay.map((r) => r.requirement_key)])}
          onClose={() => setAddOpen(false)}
          onSave={async (input) => {
            await upsert.mutateAsync(input);
            setAddOpen(false);
          }}
          saving={upsert.isPending}
        />
      ) : null}

      {configureFor ? (
        <RequirementConfigurePopup
          t={t}
          row={configureFor.req}
          owner={configureFor.owner}
          candidates={[...platform, ...overlay].filter((r) => r.requirement_key !== configureFor.req.requirement_key)}
          onClose={() => setConfigureFor(null)}
          onSave={async (changes) => {
            try {
              await upsert.mutateAsync({
                id: configureFor.owner === "agent" ? configureFor.req.id : undefined,
                requirement_key: configureFor.req.requirement_key,
                label: configureFor.req.label,
                category: configureFor.req.category,
                required_level: configureFor.req.required_level,
                ...changes,
              });
              setConfigureFor(null);
            } catch {/* banner */}
          }}
        />
      ) : null}
    </div>
  );
}


// ─── Section 3: Attempt Limit & Working Schedule ─────────────────────


function AttemptAndScheduleSection({
  t, attempts, createTask, markStalled, wh,
  onAttempts, onCreateTask, onMarkStalled, onWorkingHours,
}: {
  t: ReturnType<typeof useTheme>["t"];
  attempts: number;
  createTask: boolean;
  markStalled: boolean;
  wh: WorkingHours;
  onAttempts: (n: number) => void;
  onCreateTask: (v: boolean) => void;
  onMarkStalled: (v: boolean) => void;
  onWorkingHours: (next: WorkingHours) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 14 }}>
      <div style={{
        border: `1px solid ${t.line}`, borderRadius: 12,
        background: t.surface, padding: 16,
      }}>
        <Label t={t}>After how many AI attempts should a task be assigned to you?</Label>
        <input
          type="number"
          min={1}
          max={8}
          value={attempts}
          onChange={(e) => onAttempts(Math.max(1, Math.min(8, parseInt(e.target.value || "3", 10))))}
          style={{
            width: "100%", padding: "12px 14px", fontSize: 24, fontWeight: 800,
            color: t.ink, textAlign: "center",
            border: `1px solid ${t.line}`, borderRadius: 10, background: t.surface,
            outline: "none",
          }}
        />
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <ToggleRow t={t} value={createTask} onChange={onCreateTask} title="Create task for me" body="When the limit is reached, drop a task in my AI Inbox." />
          <ToggleRow t={t} value={markStalled} onChange={onMarkStalled} title="Mark lead stalled" body="Also flag the lead as stalled so it leaves your active list." />
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
          The AI can think and prepare anytime, but only starts new outreach during these hours.
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

        <ScheduleSummary t={t} wh={wh} />
      </div>
    </div>
  );
}


function ScheduleSummary({ t, wh }: { t: ReturnType<typeof useTheme>["t"]; wh: WorkingHours }) {
  return (
    <div style={{
      marginTop: 14, padding: 12,
      border: `1px solid ${t.petrol}`, borderRadius: 10,
      background: t.petrolSoft, color: t.petrol,
      fontSize: 13, lineHeight: 1.45,
    }}>
      <div>
        <b style={{ color: t.ink }}>Active schedule:</b> {formatScheduleSummary(wh)}
      </div>
      <div style={{ marginTop: 4 }}>
        <b style={{ color: t.ink }}>After hours:</b> {AFTER_HOURS_LABEL[wh.after_hours_rule]}
      </div>
    </div>
  );
}


function ToggleRow({
  t, value, onChange, title, body,
}: {
  t: ReturnType<typeof useTheme>["t"];
  value: boolean;
  onChange: (v: boolean) => void;
  title: string;
  body: string;
}) {
  return (
    <label style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      gap: 12, padding: "9px 0",
      borderTop: `1px solid ${t.line}`,
      cursor: "pointer",
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.4 }}>{body}</div>
      </div>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18 }}
      />
    </label>
  );
}


// ─── Section 4: Ready for Lending ────────────────────────────────────


function ReadyForLendingSection({
  t, buyer, seller,
}: {
  t: ReturnType<typeof useTheme>["t"];
  buyer: ReturnType<typeof useAgentPlaybook>;
  seller: ReturnType<typeof useAgentPlaybook>;
}) {
  // Reuse the existing semantics from the previous ReadyForLending tab.
  void seller; // referenced for future "seller-side hand off" symmetry
  const patch = usePatchAgentPlaybookRules("buyer");
  const lockedItems = (buyer.data?.platform_requirements || []).filter(r => !r.can_agent_override);
  const overridable = (buyer.data?.platform_requirements || [])
    .filter(r => r.can_agent_override)
    .concat(buyer.data?.agent_requirements || []);

  const savedGate = useMemo(() => {
    const r = (buyer.data?.rules?.before_handoff as string[]) || [];
    return new Set(r);
  }, [buyer.data?.rules]);
  const [chosen, setChosen] = useState<Set<string>>(savedGate);
  useEffect(() => { setChosen(savedGate); }, [savedGate]);

  function toggle(key: string) {
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key); else next.add(key);
    setChosen(next);
  }
  async function save() {
    const next = { ...(buyer.data?.rules || {}), before_handoff: Array.from(chosen) };
    try { await patch.mutateAsync(next); } catch {/* banner */}
  }

  if (isAINotDeployed(buyer.error)) {
    return <AINotDeployedBanner surface="AI Assistant" />;
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        {overridable.map(r => (
          <label key={r.id} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 0", borderBottom: `1px solid ${t.line}`,
            fontSize: 13, color: t.ink, cursor: "pointer",
          }}>
            <input
              type="checkbox"
              checked={chosen.has(r.requirement_key)}
              onChange={() => toggle(r.requirement_key)}
              style={{ width: 18, height: 18 }}
            />
            <span style={{ flex: 1 }}>{r.label}</span>
          </label>
        ))}
      </div>

      {lockedItems.length > 0 ? (
        <div style={{
          padding: 14, borderRadius: 8, background: t.surface2,
          border: `1px solid ${t.line}`, marginBottom: 12,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: "#a06000",
            marginBottom: 6, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5,
          }}>
            <Icon name="lock" size={12} stroke={2.5} /> Funding-required items (always)
          </div>
          <div style={{ fontSize: 12, color: t.ink3, marginBottom: 8 }}>
            Locked by the funding team. These cannot be changed here.
          </div>
          {lockedItems.map(r => (
            <div key={r.id} style={{ fontSize: 13, color: t.ink, padding: "4px 0" }}>
              · {r.label}
            </div>
          ))}
        </div>
      ) : null}

      <button onClick={save} disabled={patch.isPending} style={btnPrimary(t)}>
        {patch.isPending ? "Saving…" : "Save handoff gates"}
      </button>
    </div>
  );
}


// ─── Section 5: Knowledge & Voice ────────────────────────────────────


function KnowledgeAndVoiceSection({
  t, voice, faqText, onVoice, onFaq,
}: {
  t: ReturnType<typeof useTheme>["t"];
  voice: VoiceStyle;
  faqText: string;
  onVoice: (v: VoiceStyle) => void;
  onFaq: (text: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <KnowledgeUploadCard t={t} faqText={faqText} onFaq={onFaq} />
      <VoiceCard t={t} voice={voice} onVoice={onVoice} />
    </div>
  );
}


function KnowledgeUploadCard({
  t, faqText, onFaq,
}: {
  t: ReturnType<typeof useTheme>["t"];
  faqText: string;
  onFaq: (text: string) => void;
}) {
  const list = useAgentKnowledge();
  const upload = useUploadAgentKnowledge();
  const del = useDeleteAgentKnowledge();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(files: FileList | File[] | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      try { await upload.mutateAsync(f); } catch {/* banner / row will show failed */}
    }
  }

  return (
    <div style={{
      border: `1px solid ${t.line}`, borderRadius: 12,
      background: t.surface, padding: 16,
    }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: t.ink, marginBottom: 4 }}>Knowledge</div>
      <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.45, marginBottom: 12 }}>
        The AI uses your FAQ text and any uploaded documents as context whenever it speaks for you.
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        style={{
          display: "grid", placeItems: "center",
          minHeight: 100, padding: 16,
          border: `1.5px dashed ${dragOver ? t.petrol : t.line}`,
          borderRadius: 12,
          background: dragOver ? t.petrolSoft : t.surface2,
          textAlign: "center", cursor: "pointer",
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, marginBottom: 4 }}>
            {upload.isPending ? "Uploading…" : "Drop PDFs here or click to browse"}
          </div>
          <div style={{ fontSize: 12, color: t.ink3 }}>
            PDFs and plain text up to ~10MB each.
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,text/plain,text/markdown"
          multiple
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Document list */}
      {isAINotDeployed(list.error) ? (
        <AINotDeployedBanner surface="AI Assistant" />
      ) : list.data && list.data.length > 0 ? (
        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          {list.data.map((doc) => (
            <KnowledgeRow key={doc.id} t={t} doc={doc} onDelete={() => del.mutate(doc.id)} />
          ))}
        </div>
      ) : null}

      {/* FAQ paste */}
      <FieldBlock label="FAQ / talking points" t={t}>
        <textarea
          value={faqText}
          onChange={(e) => onFaq(e.target.value)}
          placeholder="Paste anything the AI should know — product details, company background, common questions and answers."
          style={{ ...inputStyle(t), minHeight: 120, resize: "vertical" }}
        />
      </FieldBlock>
    </div>
  );
}


function KnowledgeRow({
  t, doc, onDelete,
}: {
  t: ReturnType<typeof useTheme>["t"];
  doc: AgentKnowledgeDocument;
  onDelete: () => void;
}) {
  const statusTone =
    doc.status === "ready" ? { bg: t.profitBg, fg: t.profit } :
    doc.status === "failed" ? { bg: "#fdecea", fg: "#b42318" } :
    { bg: t.surface2, fg: t.ink3 };
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      gap: 10, padding: "8px 11px",
      borderRadius: 10, border: `1px solid ${t.line}`, background: t.surface2,
      fontSize: 13,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
        <Icon name="file" size={14} />
        <span style={{ color: t.ink, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {doc.filename}
        </span>
        <span style={{ color: t.ink3, fontSize: 11 }}>
          {Math.max(1, Math.round(doc.size_bytes / 1024))} KB
        </span>
      </div>
      <ChipText t={t} bg={statusTone.bg} fg={statusTone.fg}>{doc.status}</ChipText>
      <button
        type="button"
        onClick={onDelete}
        style={{
          all: "unset", cursor: "pointer",
          padding: "4px 8px", fontSize: 11, fontWeight: 700,
          color: t.ink3, borderRadius: 6,
        }}
        aria-label={`Delete ${doc.filename}`}
      >
        Remove
      </button>
    </div>
  );
}


function VoiceCard({
  t, voice, onVoice,
}: {
  t: ReturnType<typeof useTheme>["t"];
  voice: VoiceStyle;
  onVoice: (v: VoiceStyle) => void;
}) {
  return (
    <div style={{
      border: `1px solid ${t.line}`, borderRadius: 12,
      background: t.surface, padding: 16,
    }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: t.ink, marginBottom: 4 }}>Voice</div>
      <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.45, marginBottom: 12 }}>
        How the AI talks for you. Funding-side borrower messaging is configured in Lending AI Settings.
      </div>

      <FieldBlock label="Tone" t={t}>
        <ChipRow
          options={[
            { value: "professional", label: "Professional" },
            { value: "warm", label: "Warm" },
            { value: "concise", label: "Concise" },
            { value: "friendly", label: "Friendly" },
          ]}
          value={voice.tone || "professional"}
          onChange={(v) => onVoice({ ...voice, tone: v as VoiceStyle["tone"] })}
          t={t}
        />
      </FieldBlock>
      <FieldBlock label="Follow-up style" t={t}>
        <ChipRow
          options={[
            { value: "soft", label: "Soft" },
            { value: "balanced", label: "Balanced" },
            { value: "direct", label: "Direct" },
          ]}
          value={voice.follow_up_style || "balanced"}
          onChange={(v) => onVoice({ ...voice, follow_up_style: v as VoiceStyle["follow_up_style"] })}
          t={t}
        />
      </FieldBlock>
      <FieldBlock label="Signature" t={t}>
        <input
          value={voice.signature || ""}
          onChange={(e) => onVoice({ ...voice, signature: e.target.value })}
          placeholder="— [Your name], Qualified Commercial"
          style={inputStyle(t)}
        />
      </FieldBlock>
      <FieldBlock label="Preview" t={t}>
        <div style={{
          padding: 12, borderRadius: 8, background: t.surface2,
          fontSize: 13, color: t.ink, lineHeight: 1.5, fontStyle: "italic",
        }}>
          {previewMessage(voice)}
        </div>
      </FieldBlock>
    </div>
  );
}


function previewMessage(s: VoiceStyle): string {
  const tone = s.tone || "professional";
  const fu = s.follow_up_style || "balanced";
  const examples: Record<string, Record<string, string>> = {
    professional: {
      soft: "Hi Marcus, hope you're doing well. Just checking in on a few items when you have a moment.",
      balanced: "Hi Marcus, following up on the buyer agreement. Could you let me know where you'd like to take this?",
      direct: "Hi Marcus, I need the buyer agreement signed to keep this moving. Can you sign it today?",
    },
    warm: {
      soft: "Hey Marcus! Just thinking of you — wanted to check in when it's a good time.",
      balanced: "Hey Marcus, hope your week's going well. Quick one — want to circle back on the buyer agreement?",
      direct: "Hey Marcus, I want to keep this on track for you — let's get the buyer agreement signed today if we can.",
    },
    concise: {
      soft: "Marcus — quick check-in.",
      balanced: "Marcus — buyer agreement status?",
      direct: "Marcus — need buyer agreement signed today.",
    },
    friendly: {
      soft: "Hi Marcus! Just a friendly nudge whenever you've got a sec.",
      balanced: "Hi Marcus! Wanted to check on the buyer agreement when you're free.",
      direct: "Hi Marcus! Let's get the buyer agreement squared away — can you sign today?",
    },
  };
  const body = examples[tone]?.[fu] || examples.professional.balanced;
  return s.signature ? `${body}\n\n${s.signature}` : body;
}


// ─── Shared primitives ───────────────────────────────────────────────


function BehaviorNote({
  icon, title, body, style,
}: {
  icon: string; title: string; body: string;
  style?: React.CSSProperties;
}) {
  const { t } = useTheme();
  return (
    <div style={{
      display: "flex", gap: 10, padding: 12,
      borderRadius: 8,
      border: `1px solid ${t.line}`,
      background: t.surface2,
      ...style,
    }}>
      <span style={{ color: t.petrol, display: "inline-flex", paddingTop: 1 }}>
        <Icon name={icon} size={16} />
      </span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: t.ink, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.45 }}>{body}</div>
      </div>
    </div>
  );
}


function Group({
  title, t, rows, onSetLevel, onConfigure,
}: {
  title: string;
  t: ReturnType<typeof useTheme>["t"];
  rows: { req: PlaybookRequirement; owner: "platform" | "agent"; enabled: boolean }[];
  onSetLevel: (req: PlaybookRequirement, owner: "platform" | "agent", level: "required" | "recommended" | "optional" | "disable") => Promise<void>;
  onConfigure: (req: PlaybookRequirement, owner: "platform" | "agent") => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: t.ink3,
        marginBottom: 6, textTransform: "uppercase",
      }}>
        {title}
      </div>
      {rows.map(({ req, owner, enabled }) => {
        const locked = owner === "platform" && !req.can_agent_override;
        const ownerTone = req.default_owner_type === "ai"
          ? { bg: t.brandSoft, fg: t.brand }
          : req.default_owner_type === "shared"
          ? { bg: t.warnBg, fg: t.warn }
          : { bg: t.surface2, fg: t.ink3 };
        return (
          <div key={`${owner}-${req.id}`} style={{
            display: "grid",
            gridTemplateColumns: "22px minmax(0, 1fr) auto",
            gap: 10, padding: "8px 0",
            borderBottom: `1px solid ${t.line}`, alignItems: "center",
          }}>
            <input
              type="checkbox"
              checked={enabled}
              disabled={locked}
              onChange={() => onSetLevel(req, owner, enabled ? "disable" : title.toLowerCase() as "required" | "recommended" | "optional")}
              style={{ width: 18, height: 18 }}
            />
            <div style={{ minWidth: 0, opacity: enabled ? 1 : 0.5 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, lineHeight: 1.25 }}>
                {req.label}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                <ChipText t={t} bg={ownerTone.bg} fg={ownerTone.fg}>
                  {ownerLabel(req.default_owner_type)}
                </ChipText>
                {req.link_kind === "docusign" ? (
                  <ChipText t={t} bg={t.profitBg} fg={t.profit}>DocuSign</ChipText>
                ) : null}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {locked ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#a06000" }}>
                  <Icon name="lock" size={10} stroke={2.5} /> Locked
                </span>
              ) : !locked ? (
                <button
                  type="button"
                  onClick={() => onConfigure(req, owner)}
                  style={{
                    padding: "5px 9px", borderRadius: 7,
                    border: `1px solid ${t.line}`,
                    background: t.surface2, color: t.ink2,
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  Configure
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}


function ChipText({ children, t, bg, fg }: { children: React.ReactNode; t: ReturnType<typeof useTheme>["t"]; bg?: string; fg?: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      padding: "2px 6px", borderRadius: 4,
      background: bg ?? t.chip, color: fg ?? t.ink3,
      letterSpacing: 0.3, textTransform: "uppercase",
    }}>
      {children}
    </span>
  );
}


function ownerLabel(owner?: string): string {
  switch (owner) {
    case "ai": return "My AI Secretary";
    case "shared": return "Shared";
    case "funding_locked": return "Locked";
    default: return "My Tasks";
  }
}


function groupByLevel(
  platform: PlaybookRequirement[],
  overlay: PlaybookRequirement[],
): {
  required: { req: PlaybookRequirement; owner: "platform" | "agent"; enabled: boolean }[];
  recommended: { req: PlaybookRequirement; owner: "platform" | "agent"; enabled: boolean }[];
  optional: { req: PlaybookRequirement; owner: "platform" | "agent"; enabled: boolean }[];
} {
  const overlayByKey = new Map(overlay.map(r => [r.requirement_key, r]));
  const required: { req: PlaybookRequirement; owner: "platform" | "agent"; enabled: boolean }[] = [];
  const recommended: typeof required = [];
  const optional: typeof required = [];

  for (const p of platform) {
    const o = overlayByKey.get(p.requirement_key);
    const effective = o ? o.required_level : p.required_level;
    const enabled = !o || o.required_level !== "optional" || p.required_level === "optional";
    const row = { req: o ?? p, owner: (o ? "agent" : "platform") as "platform" | "agent", enabled };
    if (effective === "required") required.push(row);
    else if (effective === "recommended") recommended.push(row);
    else optional.push(row);
  }
  const platKeys = new Set(platform.map(p => p.requirement_key));
  for (const o of overlay) {
    if (platKeys.has(o.requirement_key)) continue;
    const row = { req: o, owner: "agent" as const, enabled: true };
    if (o.required_level === "required") required.push(row);
    else if (o.required_level === "recommended") recommended.push(row);
    else optional.push(row);
  }
  return { required, recommended, optional };
}


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


function Label({ children, t }: { children: React.ReactNode; t: ReturnType<typeof useTheme>["t"] }) {
  return (
    <div style={{
      fontSize: 12, color: t.ink2,
      marginBottom: 8, lineHeight: 1.4,
    }}>
      {children}
    </div>
  );
}


function ChipRow({
  options, value, onChange, t,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  t: ReturnType<typeof useTheme>["t"];
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          style={{
            padding: "6px 14px", fontSize: 13, fontWeight: 600,
            borderRadius: 18, border: `1px solid ${value === o.value ? t.petrol : t.line}`,
            background: value === o.value ? t.petrol : t.surface,
            color: value === o.value ? "#fff" : t.ink,
            cursor: "pointer",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
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


function btnPrimary(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "8px 14px", fontSize: 13, fontWeight: 700,
    borderRadius: 6, border: `1px solid ${t.line}`,
    background: t.petrol, color: "#fff", cursor: "pointer",
  } as const;
}


// ─── Per-requirement configuration popup (kept from prior version) ───


function RequirementConfigurePopup({
  t, row, owner, candidates, onClose, onSave,
}: {
  t: ReturnType<typeof useTheme>["t"];
  row: PlaybookRequirement;
  owner: "platform" | "agent";
  candidates: PlaybookRequirement[];
  onClose: () => void;
  onSave: (changes: Partial<{
    default_owner_type: "human" | "ai" | "shared" | "funding_locked";
    default_channels: string[];
    default_cadence_hours: number;
    link_url: string | null;
    link_label: string | null;
    link_kind: "docusign" | "esign" | "external_form" | "reference" | null;
    objective_text: string;
    completion_criteria: string;
    depends_on: string[];
    parent_key: string | null;
  }>) => Promise<void>;
}) {
  const [ownerType, setOwnerType] = useState<"human" | "ai" | "shared">(
    (row.default_owner_type as "human" | "ai" | "shared") ?? "human",
  );
  const [linkUrl, setLinkUrl] = useState<string>(row.link_url ?? "");
  const [linkLabel, setLinkLabel] = useState<string>(row.link_label ?? "");
  const [linkKind, setLinkKind] = useState<"docusign" | "esign" | "external_form" | "reference" | "">(
    (row.link_kind as "docusign" | "esign" | "external_form" | "reference") ?? "",
  );
  const [objective, setObjective] = useState<string>(row.objective_text ?? "");
  const [completion, setCompletion] = useState<string>(row.completion_criteria ?? "");
  const [parentKey, setParentKey] = useState<string>(row.parent_key ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        default_owner_type: ownerType,
        link_url: linkUrl.trim() || null,
        link_label: linkLabel.trim() || null,
        link_kind: linkKind || null,
        objective_text: objective,
        completion_criteria: completion,
        parent_key: parentKey || null,
      });
    } finally { setSaving(false); }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.surface, color: t.ink,
          border: `1px solid ${t.line}`, borderRadius: 14,
          boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
          width: "min(560px, 100%)", maxHeight: "90vh", overflow: "auto",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${t.line}` }}>
          <div style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.3, textTransform: "uppercase" }}>
            Configure
          </div>
          <div style={{ marginTop: 2, fontSize: 17, fontWeight: 900, color: t.ink }}>
            {row.label}
          </div>
          <div style={{ marginTop: 2, fontSize: 11, color: t.ink3 }}>
            {owner === "platform"
              ? "Editing forks a personal copy — your changes won't affect the firm-wide default."
              : "Your personal default. Applies to every new lead going forward."}
          </div>
        </div>

        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: t.ink3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
              Who handles this by default
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {(["human", "ai", "shared"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setOwnerType(opt)}
                  style={{
                    padding: "9px 10px", borderRadius: 9,
                    border: `1px solid ${ownerType === opt ? t.brand : t.line}`,
                    background: ownerType === opt ? t.brandSoft : t.surface2,
                    color: ownerType === opt ? t.brand : t.ink2,
                    cursor: "pointer",
                    fontSize: 12, fontWeight: 800, fontFamily: "inherit",
                  }}
                >
                  {opt === "human" ? "My Tasks" : opt === "ai" ? "My AI Secretary" : "Shared"}
                </button>
              ))}
            </div>
          </div>

          <FieldBlock label="AI objective (one line)" t={t}>
            <input
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="e.g. Collect a signed buyer agency agreement."
              style={inputStyle(t)}
            />
          </FieldBlock>

          <FieldBlock label="What 'done' looks like" t={t}>
            <textarea
              value={completion}
              onChange={(e) => setCompletion(e.target.value)}
              placeholder="e.g. Signed PDF uploaded; all parties on the agreement."
              style={{ ...inputStyle(t), minHeight: 64, resize: "vertical" }}
            />
          </FieldBlock>

          <FieldBlock label="Group under (optional)" t={t}>
            <select
              value={parentKey}
              onChange={(e) => setParentKey(e.target.value)}
              style={inputStyle(t)}
            >
              <option value="">No parent — top-level task</option>
              {candidates.map((c) => (
                <option key={c.requirement_key} value={c.requirement_key}>{c.label}</option>
              ))}
            </select>
          </FieldBlock>

          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: t.ink3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
              Optional link (DocuSign, intake form, etc.)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, marginBottom: 6 }}>
              <select
                value={linkKind}
                onChange={(e) => setLinkKind(e.target.value as typeof linkKind)}
                style={inputStyle(t)}
              >
                <option value="">No link</option>
                <option value="docusign">DocuSign</option>
                <option value="esign">E-Sign</option>
                <option value="external_form">Form</option>
                <option value="reference">Reference</option>
              </select>
              <input
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder="Display label"
                style={inputStyle(t)}
              />
            </div>
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://docusign.example/envelope/123"
              style={inputStyle(t)}
            />
          </div>
        </div>

        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 8,
          padding: "12px 14px", borderTop: `1px solid ${t.line}`,
        }}>
          <button type="button" onClick={onClose} style={{
            padding: "8px 14px", borderRadius: 9,
            background: t.surface2, color: t.ink2,
            border: `1px solid ${t.line}`, cursor: "pointer",
            fontSize: 12, fontWeight: 800, fontFamily: "inherit",
          }}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving} style={{
            padding: "8px 14px", borderRadius: 9,
            background: t.brand, color: t.inverse, border: "none",
            cursor: saving ? "wait" : "pointer",
            fontSize: 12, fontWeight: 800, fontFamily: "inherit",
            opacity: saving ? 0.7 : 1,
          }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}


// AddTemplateRowModal — lets the agent create a brand-new playbook
// requirement on their buyer or seller template. Hits the same
// useUpsertAgentRequirement(side) endpoint the existing edit flow
// uses, just with a fresh requirement_key.
function AddTemplateRowModal({
  t,
  side,
  existingKeys,
  onSave,
  onClose,
  saving,
}: {
  t: ReturnType<typeof useTheme>["t"];
  side: "buyer" | "seller";
  existingKeys: Set<string>;
  onSave: (input: {
    requirement_key: string;
    label: string;
    category: string;
    required_level: "required" | "recommended" | "optional";
    default_owner_type?: string;
  }) => Promise<unknown>;
  onClose: () => void;
  saving: boolean;
}) {
  const [label, setLabel] = useState("");
  const [level, setLevel] = useState<"required" | "recommended" | "optional">("recommended");
  const [category, setCategory] = useState<string>("communication");
  const [owner, setOwner] = useState<"human" | "ai" | "shared">("human");
  const [err, setErr] = useState<string | null>(null);

  // Derive requirement_key from the label — agents shouldn't have to
  // care about backend identifiers, but if a key clashes we suffix it.
  const baseKey = useMemo(() => {
    const slug = label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!slug) return "";
    let key = `agent_${side}_${slug}`;
    let n = 2;
    while (existingKeys.has(key)) key = `agent_${side}_${slug}_${n++}`;
    return key;
  }, [label, side, existingKeys]);

  async function save() {
    if (!label.trim()) {
      setErr("Label is required");
      return;
    }
    if (!baseKey) {
      setErr("Couldn't derive a key from the label");
      return;
    }
    setErr(null);
    try {
      await onSave({
        requirement_key: baseKey,
        label: label.trim(),
        category,
        required_level: level,
        default_owner_type: owner,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.surface,
          border: `1px solid ${t.line}`,
          borderRadius: 12,
          width: 480,
          maxWidth: "100%",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, color: t.ink }}>
          Add row to {side === "buyer" ? "Buyer" : "Seller"} template
        </div>
        <div style={{ fontSize: 12, color: t.ink3 }}>
          Defines a new playbook requirement. Applies automatically to every new {side} deal
          you open; existing deals can opt-in via the Tasks tab.
        </div>
        <label style={{ display: "block" }}>
          <span style={{ fontSize: 11, color: t.ink3, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>Label</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder='e.g. "Send buyer agency agreement"'
            style={{
              marginTop: 4,
              width: "100%",
              padding: 8,
              fontSize: 13,
              borderRadius: 6,
              border: `1px solid ${t.line}`,
              background: t.surface,
              color: t.ink,
              boxSizing: "border-box",
            }}
          />
          {baseKey ? (
            <div style={{ marginTop: 4, fontSize: 10.5, color: t.ink3, fontFamily: "ui-monospace, SF Mono, monospace" }}>
              key: {baseKey}
            </div>
          ) : null}
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 11, color: t.ink3, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>Required level</span>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as "required" | "recommended" | "optional")}
              style={{
                marginTop: 4,
                width: "100%",
                padding: 8,
                fontSize: 13,
                borderRadius: 6,
                border: `1px solid ${t.line}`,
                background: t.surface,
                color: t.ink,
              }}
            >
              <option value="required">Required</option>
              <option value="recommended">Recommended</option>
              <option value="optional">Optional</option>
            </select>
          </label>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 11, color: t.ink3, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>Default owner</span>
            <select
              value={owner}
              onChange={(e) => setOwner(e.target.value as "human" | "ai" | "shared")}
              style={{
                marginTop: 4,
                width: "100%",
                padding: 8,
                fontSize: 13,
                borderRadius: 6,
                border: `1px solid ${t.line}`,
                background: t.surface,
                color: t.ink,
              }}
            >
              <option value="human">My Tasks (I handle it)</option>
              <option value="ai">My AI Secretary</option>
              <option value="shared">Shared</option>
            </select>
          </label>
        </div>
        <label style={{ display: "block" }}>
          <span style={{ fontSize: 11, color: t.ink3, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              marginTop: 4,
              width: "100%",
              padding: 8,
              fontSize: 13,
              borderRadius: 6,
              border: `1px solid ${t.line}`,
              background: t.surface,
              color: t.ink,
            }}
          >
            <option value="communication">Communication</option>
            <option value="agreements">Agreements</option>
            <option value="scheduling">Scheduling</option>
            <option value="property_data">Property data</option>
            <option value="financials">Financials</option>
            <option value="credit">Credit</option>
            <option value="title_and_escrow">Title &amp; escrow</option>
            <option value="appraisal_and_inspection">Appraisal &amp; inspection</option>
            <option value="insurance">Insurance</option>
            <option value="compliance">Compliance</option>
            <option value="borrower_info">Borrower info</option>
          </select>
        </label>
        {err ? <div style={{ fontSize: 12, color: "#dc2626" }}>{err}</div> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 6,
              border: `1px solid ${t.line}`,
              background: t.surface,
              color: t.ink2,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !label.trim()}
            style={{
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 800,
              borderRadius: 6,
              border: "none",
              background: t.brand,
              color: t.inverse,
              cursor: "pointer",
              opacity: saving || !label.trim() ? 0.5 : 1,
            }}
          >
            {saving ? "Adding…" : "Add row"}
          </button>
        </div>
      </div>
    </div>
  );
}
