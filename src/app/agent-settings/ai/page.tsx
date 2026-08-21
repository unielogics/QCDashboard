"use client";

// Agent Settings → AI — single scrollable page, 5 stacked sections.
//
// 1. Sending Control          — agent's default for new deals
// 2. Lead Creation Templates  — buyer + seller checklist editors
// 3. Attempt Limit & Schedule — attempts before escalation + working hours
// 4. Ready for Lending        — handoff gate (buyer-side requirements)
// 5. Knowledge & Voice        — PDFs / FAQ + tone / style / signature
//
// X close button in the top-right returns to /agent-settings.
//
// Design system: the plain-CSS classes in globals.css / app-extras.css via the
// wrappers in components/ds. Every "choose one of these" control on the page —
// sending mode, weekday, tone, follow-up style, owner type — is the same object
// (`.seg` or `.pick`), which is the point: five different pill designs made one
// page read as five products. The two modals are `ds/Drawer`, which brings the
// Escape / backdrop / focus-return behaviour they hand-rolled.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import {
  Btn,
  CG,
  CellChip,
  IconBtn,
  Input,
  Linky,
  Note,
  PageHeader,
  Panel,
  Row,
  Select,
  Textarea,
  WarnLine,
  cx,
  type ChipTone,
} from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
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
      <div className="grid" style={{ maxWidth: 980, margin: "0 auto" }}>
        <AIHeader dirty={false} saving={false} onClose={() => router.push("/agent-settings")} onSave={save} />
        <AINotDeployedBanner surface="Elara" />
      </div>
    );
  }

  return (
    <div className="grid" style={{ maxWidth: 980, margin: "0 auto" }}>
      <AIHeader
        dirty={dirty}
        saving={patchCadence.isPending}
        onClose={() => router.push("/agent-settings")}
        onSave={save}
      />

      <Snapshot
        sendingControl={sendingControl}
        attempts={attempts}
        wh={wh}
      />

      <Section
        kicker="Step 1"
        title="Sending control"
        copy="Your default for new deals. You can still change this per file in Deal Secretary."
      >
        <SendingControlSection
          value={sendingControl}
          onChange={(v) => mutate({ ...rules, sending_control: v })}
        />
      </Section>

      <Section
        kicker="Step 2"
        title="Lead creation templates"
        copy="When you create a Buyer or Seller lead, this checklist becomes the starting point. AI works only on the items marked AI or Shared."
      >
        <LeadTemplatesSection />
      </Section>

      <Section
        kicker="Step 3"
        title="AI attempt limit & working schedule"
        copy="Set Elara's working hours and how many tries before it escalates to you. Elara never initiates outside these hours."
      >
        <AttemptAndScheduleSection
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
        kicker="Step 4"
        title="Ready for lending"
        copy="When these buyer-side items are satisfied, your AI may suggest the lending handoff."
      >
        <ReadyForLendingSection buyer={buyer} seller={seller} />
      </Section>

      <Section
        kicker="Step 5"
        title="Knowledge & voice"
        copy="Upload PDFs and paste FAQ Elara should know. Set tone, follow-up style, and signature."
      >
        <KnowledgeAndVoiceSection
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

      <AIPreviewPanel mode="plan" />
    </div>
  );
}


// ─── Page chrome ─────────────────────────────────────────────────────


function AIHeader({
  dirty, saving, onClose, onSave,
}: {
  dirty: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <PageHeader
      title="Agent AI Settings"
      lede="Configure your AI assistant — how it sends, when it works, what it collects, and the knowledge it speaks from."
      actions={
        <>
          {/* `.btn:disabled` carries the dimmed, not-allowed state the inline
              background swap used to; the label still says which it is. */}
          <Btn variant="pri" onClick={onSave} disabled={saving || !dirty}>
            {saving ? "Saving…" : dirty ? "Save settings" : "Saved"}
          </Btn>
          <IconBtn aria-label="Close" onClick={onClose}>
            <Icon name="x" size={16} stroke={2.4} />
          </IconBtn>
        </>
      }
    />
  );
}


function Snapshot({
  sendingControl, attempts, wh,
}: {
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
    // `.kpi` tiles, but not `<Kpi>`: these carry a sentence, and `.knum` is a
    // 26px nowrap figure that a sentence overflows.
    <div className="kpis">
      {items.map(item => (
        <div key={item.label} className="kpi">
          <div className="lbl">{item.label}</div>
          <div>{item.body}</div>
        </div>
      ))}
    </div>
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
    <Panel title={title} actions={<span className="tag">{kicker}</span>} bodyClass="grid">
      <p className="sub" style={{ margin: 0, maxWidth: 720 }}>{copy}</p>
      {children}
    </Panel>
  );
}


// ─── Section 1: Sending Control ──────────────────────────────────────


function SendingControlSection({
  value, onChange,
}: {
  value: SendingControl;
  onChange: (v: SendingControl) => void;
}) {
  const options: { value: SendingControl; title: string; body: string }[] = [
    {
      value: "draft_only",
      title: "Draft only",
      body: "Writes messages into Elara Inbox. Nothing sends without your approval.",
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
      <div>
        {options.map(opt => {
          const selected = value === opt.value;
          return (
            // The radio is visible now. It was `opacity: 0` before, which left
            // a focusable control a keyboard user could land on and not see.
            <label key={opt.value} className={cx("pick", selected && "on")}>
              <input
                type="radio"
                name="sending-control"
                checked={selected}
                onChange={() => onChange(opt.value)}
                style={{ width: 16, height: 16, cursor: "pointer", flex: "0 0 auto" }}
              />
              <span style={{ display: "grid", gap: 2 }}>
                <b>{opt.title}</b>
                <span className="sub">{opt.body}</span>
              </span>
            </label>
          );
        })}
      </div>
      <BehaviorNote
        icon="lightbulb"
        title="Per-file overrides stay easy"
        body="Open a deal's Elara and change its outreach mode any time. This setting only affects new deals."
      />
    </>
  );
}


// ─── Section 2: Lead Creation Templates ──────────────────────────────


function LeadTemplatesSection() {
  return (
    <div className="grid">
      <TemplateCard side="buyer" />
      <TemplateCard side="seller" />
    </div>
  );
}


function TemplateCard({
  side,
}: {
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
    return <AINotDeployedBanner surface="Elara" />;
  }

  return (
    <Panel
      title={side === "buyer" ? "Buyer Lead Template" : "Seller Lead Template"}
      sub={<>Applies automatically when the lead is labeled <b>{side === "buyer" ? "Buyer" : "Seller"}</b>.</>}
      actions={
        <Btn size="sm" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Collapse" : "Edit"}
        </Btn>
      }
    >
      {isLoading ? (
        <div className="sub">Loading…</div>
      ) : !expanded ? (
        // Compact preview — first 5 rows with chips.
        <div>
          {allRows.slice(0, 5).map(({ req }) => (
            <div key={req.id} className="filerow">
              <span className="sp"><b>{req.label}</b></span>
              <CellChip tone={ownerTone(req.default_owner_type)}>{ownerLabel(req.default_owner_type)}</CellChip>
            </div>
          ))}
          {allRows.length > 5 ? (
            <div className="sub mt">
              + {allRows.length - 5} more — click Edit to manage.
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          <Group title="Required" rows={groups.required} onSetLevel={setLevel} onConfigure={(req, owner) => setConfigureFor({ req, owner })} />
          <Group title="Recommended" rows={groups.recommended} onSetLevel={setLevel} onConfigure={(req, owner) => setConfigureFor({ req, owner })} />
          <Group title="Optional" rows={groups.optional} onSetLevel={setLevel} onConfigure={(req, owner) => setConfigureFor({ req, owner })} />
          <Row className="mt">
            <Btn size="sm" onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={11} /> Add row
            </Btn>
            <span className="sub">
              Custom rows show up in your buyer/seller playbook and seed the Tasks tab on new deals.
            </span>
          </Row>
        </div>
      )}

      {addOpen ? (
        <AddTemplateRowModal
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
    </Panel>
  );
}


// ─── Section 3: Attempt Limit & Working Schedule ─────────────────────


function AttemptAndScheduleSection({
  attempts, createTask, markStalled, wh,
  onAttempts, onCreateTask, onMarkStalled, onWorkingHours,
}: {
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
    // 340px is the width the attempt card wants, not a share of the page.
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 14 }}>
      <div className="card">
        <div className="sub">After how many AI attempts should a task be assigned to you?</div>
        <div className="mt">
          <Input
            type="number"
            min={1}
            max={8}
            value={attempts}
            onChange={(e) => onAttempts(Math.max(1, Math.min(8, parseInt(e.target.value || "3", 10))))}
          />
        </div>
        <div className="mt">
          <ToggleRow value={createTask} onChange={onCreateTask} title="Create task for me" body="When the limit is reached, drop a task in my Elara Inbox." />
          <ToggleRow value={markStalled} onChange={onMarkStalled} title="Mark lead stalled" body="Also flag the lead as stalled so it leaves your active list." />
        </div>
      </div>

      <div className="card">
        <div><b>Working schedule</b></div>
        <div className="sub">
          Elara can think and prepare anytime, but only starts new outreach during these hours.
        </div>

        <div className="grid mt">
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

          <CG>
            <FieldBlock className="s6" label="Start time">
              <Input
                type="time"
                value={wh.start_time}
                onChange={(e) => onWorkingHours({ ...wh, start_time: e.target.value })}
              />
            </FieldBlock>
            <FieldBlock className="s6" label="End time">
              <Input
                type="time"
                value={wh.end_time}
                onChange={(e) => onWorkingHours({ ...wh, end_time: e.target.value })}
              />
            </FieldBlock>
          </CG>

          <div>
            <div className="lbl">Working days</div>
            {/* `.seg` shrink-wraps only inside a flex parent. */}
            <Row className="mt">
              <div className="seg" role="group" aria-label="Working days">
                {WEEKDAYS_ORDER.map((d) => {
                  const active = wh.working_days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={active}
                      className={active ? "on" : ""}
                      onClick={() =>
                        onWorkingHours({
                          ...wh,
                          working_days: active
                            ? wh.working_days.filter((x) => x !== d)
                            : ([...wh.working_days, d] as WeekdayCode[]),
                        })
                      }
                    >
                      {d.charAt(0)}
                    </button>
                  );
                })}
              </div>
            </Row>
          </div>

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

        <ScheduleSummary wh={wh} />
      </div>
    </div>
  );
}


function ScheduleSummary({ wh }: { wh: WorkingHours }) {
  return (
    <Note>
      <div>
        <div><b>Active schedule:</b> {formatScheduleSummary(wh)}</div>
        <div><b>After hours:</b> {AFTER_HOURS_LABEL[wh.after_hours_rule]}</div>
      </div>
    </Note>
  );
}


function ToggleRow({
  value, onChange, title, body,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  title: string;
  body: string;
}) {
  return (
    <label className="filerow" style={{ cursor: "pointer" }}>
      <span className="sp">
        <b>{title}</b>
        <div className="sub">{body}</div>
      </span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}


// ─── Section 4: Ready for Lending ────────────────────────────────────


function ReadyForLendingSection({
  buyer, seller,
}: {
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
    return <AINotDeployedBanner surface="Elara" />;
  }

  return (
    <div>
      <div>
        {overridable.map(r => (
          <label key={r.id} className="filerow" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={chosen.has(r.requirement_key)}
              onChange={() => toggle(r.requirement_key)}
            />
            <span className="sp">{r.label}</span>
          </label>
        ))}
      </div>

      {lockedItems.length > 0 ? (
        <WarnLine className="mt">
          <div>
            <b><Icon name="lock" size={12} stroke={2.5} /> Funding-required items (always)</b>
          </div>
          <div>Locked by the funding team. These cannot be changed here.</div>
          {lockedItems.map(r => (
            <div key={r.id}>· {r.label}</div>
          ))}
        </WarnLine>
      ) : null}

      <Row className="mt">
        <Btn variant="pri" onClick={save} disabled={patch.isPending}>
          {patch.isPending ? "Saving…" : "Save handoff gates"}
        </Btn>
      </Row>
    </div>
  );
}


// ─── Section 5: Knowledge & Voice ────────────────────────────────────


function KnowledgeAndVoiceSection({
  voice, faqText, onVoice, onFaq,
}: {
  voice: VoiceStyle;
  faqText: string;
  onVoice: (v: VoiceStyle) => void;
  onFaq: (text: string) => void;
}) {
  return (
    <div className="grid">
      <KnowledgeUploadCard faqText={faqText} onFaq={onFaq} />
      <VoiceCard voice={voice} onVoice={onVoice} />
    </div>
  );
}


function KnowledgeUploadCard({
  faqText, onFaq,
}: {
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
    <div className="card">
      <div><b>Knowledge</b></div>
      <div className="sub">
        Elara uses your FAQ text and any uploaded documents as context whenever it speaks for you.
      </div>

      {/* Dropzone — `.dropzone` / `.dropzone.drag` own the dashed frame and the
          drag-over tint the inline branch used to compute. */}
      <div
        className={cx("dropzone", "mt", dragOver && "drag")}
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
      >
        <b>{upload.isPending ? "Uploading…" : "Drop PDFs here or click to browse"}</b>
        <div className="sub">PDFs and plain text up to ~10MB each.</div>
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
        <div className="mt"><AINotDeployedBanner surface="Elara" /></div>
      ) : list.data && list.data.length > 0 ? (
        <div className="mt">
          {list.data.map((doc) => (
            <KnowledgeRow key={doc.id} doc={doc} onDelete={() => del.mutate(doc.id)} />
          ))}
        </div>
      ) : null}

      {/* FAQ paste */}
      <div className="mt">
        <FieldBlock label="FAQ / talking points">
          <Textarea
            value={faqText}
            onChange={(e) => onFaq(e.target.value)}
            placeholder="Paste anything Elara should know — product details, company background, common questions and answers."
            style={{ minHeight: 120, resize: "vertical" }}
          />
        </FieldBlock>
      </div>
    </div>
  );
}


function KnowledgeRow({
  doc, onDelete,
}: {
  doc: AgentKnowledgeDocument;
  onDelete: () => void;
}) {
  const statusTone: ChipTone =
    doc.status === "ready" ? "ok" :
    doc.status === "failed" ? "bad" :
    "mut";
  return (
    <div className="filerow">
      <Icon name="file" size={14} />
      <span className="sp" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <b>{doc.filename}</b>
      </span>
      <span className="sub">
        {Math.max(1, Math.round(doc.size_bytes / 1024))} KB
      </span>
      <CellChip tone={statusTone}>{doc.status}</CellChip>
      <Linky onClick={onDelete} aria-label={`Delete ${doc.filename}`}>
        Remove
      </Linky>
    </div>
  );
}


function VoiceCard({
  voice, onVoice,
}: {
  voice: VoiceStyle;
  onVoice: (v: VoiceStyle) => void;
}) {
  return (
    <div className="card">
      <div><b>Voice</b></div>
      <div className="sub">
        How Elara talks for you. Funding-side borrower messaging is configured in Lending AI Settings.
      </div>

      <div className="grid mt">
        <div>
          <div className="lbl">Tone</div>
          <ChipRow
            options={[
              { value: "professional", label: "Professional" },
              { value: "warm", label: "Warm" },
              { value: "concise", label: "Concise" },
              { value: "friendly", label: "Friendly" },
            ]}
            value={voice.tone || "professional"}
            onChange={(v) => onVoice({ ...voice, tone: v as VoiceStyle["tone"] })}
          />
        </div>
        <div>
          <div className="lbl">Follow-up style</div>
          <ChipRow
            options={[
              { value: "soft", label: "Soft" },
              { value: "balanced", label: "Balanced" },
              { value: "direct", label: "Direct" },
            ]}
            value={voice.follow_up_style || "balanced"}
            onChange={(v) => onVoice({ ...voice, follow_up_style: v as VoiceStyle["follow_up_style"] })}
          />
        </div>
        <FieldBlock label="Signature">
          <Input
            value={voice.signature || ""}
            onChange={(e) => onVoice({ ...voice, signature: e.target.value })}
            placeholder="— [Your name], Qualified Commercial"
          />
        </FieldBlock>
        <div>
          <div className="lbl">Preview</div>
          <Note>
            <div style={{ fontStyle: "italic" }}>{previewMessage(voice)}</div>
          </Note>
        </div>
      </div>
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
  icon, title, body,
}: {
  icon: string; title: string; body: string;
}) {
  return (
    <Note>
      <Icon name={icon} size={16} />
      <div>
        <div><b>{title}</b></div>
        <div>{body}</div>
      </div>
    </Note>
  );
}


function Group({
  title, rows, onSetLevel, onConfigure,
}: {
  title: string;
  rows: { req: PlaybookRequirement; owner: "platform" | "agent"; enabled: boolean }[];
  onSetLevel: (req: PlaybookRequirement, owner: "platform" | "agent", level: "required" | "recommended" | "optional" | "disable") => Promise<void>;
  onConfigure: (req: PlaybookRequirement, owner: "platform" | "agent") => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mt">
      <div className="lbl">{title}</div>
      {rows.map(({ req, owner, enabled }) => {
        const locked = owner === "platform" && !req.can_agent_override;
        return (
          <div key={`${owner}-${req.id}`} className="filerow">
            <input
              type="checkbox"
              checked={enabled}
              disabled={locked}
              onChange={() => onSetLevel(req, owner, enabled ? "disable" : title.toLowerCase() as "required" | "recommended" | "optional")}
            />
            <div className="sp" style={{ minWidth: 0, opacity: enabled ? 1 : 0.5 }}>
              <div><b>{req.label}</b></div>
              <Row>
                <CellChip tone={ownerTone(req.default_owner_type)}>
                  {ownerLabel(req.default_owner_type)}
                </CellChip>
                {req.link_kind === "docusign" ? (
                  <CellChip tone="ok">DocuSign</CellChip>
                ) : null}
              </Row>
            </div>
            {locked ? (
              <CellChip tone="warn">
                <Icon name="lock" size={10} stroke={2.5} /> Locked
              </CellChip>
            ) : (
              <Btn size="sm" onClick={() => onConfigure(req, owner)}>
                Configure
              </Btn>
            )}
          </div>
        );
      })}
    </div>
  );
}


function ownerLabel(owner?: string): string {
  switch (owner) {
    case "ai": return "Elara";
    case "shared": return "Shared";
    case "funding_locked": return "Locked";
    default: return "My Tasks";
  }
}


/** Same three-way split the inline `ownerTone` object encoded. */
function ownerTone(owner?: string): ChipTone {
  if (owner === "ai") return "acc";
  if (owner === "shared") return "warn";
  return "mut";
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


/** Label above a control, still a real `<label>` so clicking it focuses. */
function FieldBlock({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={className} style={{ display: "grid", gap: 5, minWidth: 0 }}>
      <span className="lbl">{label}</span>
      {children}
    </label>
  );
}


function ChipRow({
  options, value, onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    // `.seg` shrink-wraps only inside a flex parent.
    <Row>
      <div className="seg" role="group">
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            className={value === o.value ? "on" : ""}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Row>
  );
}


// ─── Per-requirement configuration popup (kept from prior version) ───


function RequirementConfigurePopup({
  row, owner, candidates, onClose, onSave,
}: {
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

  // Escape, backdrop click, body scroll lock and focus return all come from
  // Drawer now — the hand-rolled keydown listener this component carried did
  // only the first of the four.
  return (
    <Drawer
      open
      onClose={onClose}
      width="md"
      title={`Configure — ${row.label}`}
      sub={
        owner === "platform"
          ? "Editing forks a personal copy — your changes won't affect the firm-wide default."
          : "Your personal default. Applies to every new lead going forward."
      }
      bodyClass="grid"
      footer={
        <>
          <span className="sp" />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="pri" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Btn>
        </>
      }
    >
      <div>
        <div className="lbl">Who handles this by default</div>
        <Row className="mt">
          <div className="seg" role="group" aria-label="Who handles this by default">
            {(["human", "ai", "shared"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                aria-pressed={ownerType === opt}
                className={ownerType === opt ? "on" : ""}
                onClick={() => setOwnerType(opt)}
              >
                {opt === "human" ? "My Tasks" : opt === "ai" ? "Elara" : "Shared"}
              </button>
            ))}
          </div>
        </Row>
      </div>

      <FieldBlock label="AI objective (one line)">
        <Input
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="e.g. Collect a signed buyer agency agreement."
        />
      </FieldBlock>

      <FieldBlock label="What 'done' looks like">
        <Textarea
          value={completion}
          onChange={(e) => setCompletion(e.target.value)}
          placeholder="e.g. Signed PDF uploaded; all parties on the agreement."
          style={{ minHeight: 64, resize: "vertical" }}
        />
      </FieldBlock>

      <FieldBlock label="Group under (optional)">
        <Select value={parentKey} onChange={(e) => setParentKey(e.target.value)}>
          <option value="">No parent — top-level task</option>
          {candidates.map((c) => (
            <option key={c.requirement_key} value={c.requirement_key}>{c.label}</option>
          ))}
        </Select>
      </FieldBlock>

      <div>
        <div className="lbl">Optional link (DocuSign, intake form, etc.)</div>
        {/* 120px is the width the kind selector needs, not a share of the row. */}
        <div className="mt" style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8 }}>
          <Select
            value={linkKind}
            onChange={(e) => setLinkKind(e.target.value as typeof linkKind)}
            aria-label="Link kind"
          >
            <option value="">No link</option>
            <option value="docusign">DocuSign</option>
            <option value="esign">E-Sign</option>
            <option value="external_form">Form</option>
            <option value="reference">Reference</option>
          </Select>
          <Input
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="Display label"
            aria-label="Link display label"
          />
        </div>
        <div className="mt">
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://docusign.example/envelope/123"
            aria-label="Link URL"
          />
        </div>
      </div>
    </Drawer>
  );
}


// AddTemplateRowModal — lets the agent create a brand-new playbook
// requirement on their buyer or seller template. Hits the same
// useUpsertAgentRequirement(side) endpoint the existing edit flow
// uses, just with a fresh requirement_key.
function AddTemplateRowModal({
  side,
  existingKeys,
  onSave,
  onClose,
  saving,
}: {
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

  // Escape / backdrop / focus return come from Drawer.
  return (
    <Drawer
      open
      onClose={onClose}
      width="md"
      title={`Add row to ${side === "buyer" ? "Buyer" : "Seller"} template`}
      sub={`Defines a new playbook requirement. Applies automatically to every new ${side} deal you open; existing deals can opt-in via the Tasks tab.`}
      bodyClass="grid"
      footer={
        <>
          <span className="sp" />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="pri" onClick={save} disabled={saving || !label.trim()}>
            {saving ? "Adding…" : "Add row"}
          </Btn>
        </>
      }
    >
      <div>
        <FieldBlock label="Label">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder='e.g. "Send buyer agency agreement"'
          />
        </FieldBlock>
        {baseKey ? (
          <div className="sub" style={{ marginTop: 4, fontFamily: "ui-monospace, SF Mono, monospace" }}>
            key: {baseKey}
          </div>
        ) : null}
      </div>

      <CG>
        <FieldBlock className="s6" label="Required level">
          <Select
            value={level}
            onChange={(e) => setLevel(e.target.value as "required" | "recommended" | "optional")}
          >
            <option value="required">Required</option>
            <option value="recommended">Recommended</option>
            <option value="optional">Optional</option>
          </Select>
        </FieldBlock>
        <FieldBlock className="s6" label="Default owner">
          <Select
            value={owner}
            onChange={(e) => setOwner(e.target.value as "human" | "ai" | "shared")}
          >
            <option value="human">My Tasks (I handle it)</option>
            <option value="ai">Elara</option>
            <option value="shared">Shared</option>
          </Select>
        </FieldBlock>
      </CG>

      <FieldBlock label="Category">
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
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
        </Select>
      </FieldBlock>

      {err ? <div className="c-bad" style={{ borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 650 }}>{err}</div> : null}
    </Drawer>
  );
}
