"use client";

// The 11 builder-step panels for an AI Agent.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useAgentKnowledge,
  useUploadAgentKnowledge,
} from "@/hooks/useApi";
import {
  useAddKnowledgeLink,
  useAddSampleMessage,
  useAiAgentExitRules,
  useAiAgentGoal,
  useAiAgentKnowledgeLinks,
  useAiAgentLeads,
  useAiAgentMessages,
  useAiAgentPlaybook,
  useAiAgentSampleMessages,
  useAiAgentShowingGuide,
  useAiAgentTargeting,
  useAiAgentTargetingPreview,
  useAiAgentTestScenarios,
  useAiAgentTraining,
  useActivateAiAgent,
  useApprovePlaybook,
  useApproveShowingGuide,
  useCompleteTraining,
  useDeleteSampleMessage,
  useGeneratePlaybook,
  useGenerateShowingGuide,
  usePatchAiAgent,
  usePauseAiAgent,
  usePostTrainingTurn,
  useRemoveKnowledgeLink,
  useReviewTestScenario,
  useRunTargeting,
  useRunTest,
  useSaveAiAgentGoal,
  useSaveAiAgentTargeting,
  useSaveExitRules,
  useWarmupSend,
  type AiAgentDetail,
  type AiAgentKind,
  type AiAgentSynth,
} from "@/hooks/useAiAgents";
import {
  Btn,
  ChipToggle,
  FieldRow,
  PanelHeader,
  SelectField,
  TextAreaField,
  TextField,
} from "./ui";

export const STEP_DEFS: { key: string; label: string }[] = [
  { key: "basics", label: "Basics & Identity" },
  { key: "goal", label: "Goal" },
  { key: "knowledge", label: "Knowledge" },
  { key: "targeting", label: "Targeting" },
  { key: "training", label: "Training Studio" },
  { key: "playbook", label: "Playbook" },
  { key: "showing_guide", label: "Showing Guide" },
  { key: "followups", label: "Follow-ups & Exit" },
  { key: "test", label: "Test Scenarios" },
  { key: "launch", label: "Launch Controls" },
  { key: "warmup", label: "Warm-up & Launch" },
];

type PanelProps = { agent: AiAgentDetail };

// ── Step 1: Basics & Identity ───────────────────────────────────────

const KIND_OPTS: { value: AiAgentKind; label: string }[] = [
  { value: "buyer_nurture", label: "Buyer nurture" },
  { value: "seller_followup", label: "Seller / listing follow-up" },
  { value: "past_client", label: "Past-client re-engagement" },
  { value: "investor_outreach", label: "Investor outreach" },
  { value: "open_house", label: "Open-house follow-up" },
  { value: "review_request", label: "Review request" },
  { value: "custom", label: "Custom" },
];

export function BasicsPanel({ agent }: PanelProps) {
  const patch = usePatchAiAgent();
  const [name, setName] = useState(agent.name);
  const [kind, setKind] = useState(agent.kind);
  const [audience, setAudience] = useState(agent.audience ?? "");
  const [displayName, setDisplayName] = useState(agent.ai_display_name ?? "");
  const [persona, setPersona] = useState(agent.persona_mode);
  const [sendMode, setSendMode] = useState(agent.send_mode);

  const save = () =>
    patch.mutate({
      id: agent.id,
      patch: {
        name,
        kind,
        audience,
        ai_display_name: displayName,
        persona_mode: persona,
        send_mode: sendMode,
      },
    });

  return (
    <div>
      <PanelHeader
        title="Basics & Identity"
        desc="Name the agent, pick its workflow, and decide how it introduces itself."
      />
      <FieldRow label="Agent name">
        <TextField value={name} onChange={setName} />
      </FieldRow>
      <FieldRow label="Workflow type">
        <SelectField value={kind} onChange={(v) => setKind(v as AiAgentKind)} options={KIND_OPTS} />
      </FieldRow>
      <FieldRow label="Audience" hint="Who is this agent for? e.g. buyers who toured but didn't offer.">
        <TextAreaField value={audience} onChange={setAudience} rows={2} />
      </FieldRow>
      <FieldRow
        label="AI display name"
        hint="The name the AI signs as. Leave blank to use the firm default."
      >
        <TextField value={displayName} onChange={setDisplayName} placeholder="e.g. Alex" />
      </FieldRow>
      <FieldRow label="How it introduces itself">
        <SelectField
          value={persona}
          onChange={(v) => setPersona(v as typeof persona)}
          options={[
            { value: "virtual_secretary", label: "As a virtual secretary for the agent" },
            { value: "agent_persona", label: "In the agent's own voice" },
          ]}
        />
      </FieldRow>
      <FieldRow
        label="Send mode"
        hint="Draft-first puts every message in your review queue. Auto-send requires warm-up first."
      >
        <SelectField
          value={sendMode}
          onChange={(v) => setSendMode(v as typeof sendMode)}
          options={[
            { value: "draft_first", label: "Draft-first — I review every message" },
            { value: "auto", label: "Auto-send (after warm-up)" },
          ]}
        />
      </FieldRow>
      <Btn variant="primary" onClick={save} disabled={patch.isPending}>
        {patch.isPending ? "Saving…" : "Save"}
      </Btn>
    </div>
  );
}

// ── Step 2: Goal ────────────────────────────────────────────────────

export function GoalPanel({ agent }: PanelProps) {
  const { data: goal } = useAiAgentGoal(agent.id);
  const save = useSaveAiAgentGoal();
  const [primaryGoal, setPrimaryGoal] = useState("");
  const [cta, setCta] = useState("");
  const [handoff, setHandoff] = useState("");
  const [success, setSuccess] = useState("");
  const [qualified, setQualified] = useState("");
  const seeded = useRef(false);

  useEffect(() => {
    if (goal && !seeded.current) {
      seeded.current = true;
      setPrimaryGoal(goal.primary_goal ?? "");
      setCta(goal.primary_cta ?? "");
      setHandoff((goal.handoff_triggers ?? []).join("\n"));
      setSuccess(goal.success_definition ?? "");
      setQualified(goal.qualified_reply_definition ?? "");
    }
  }, [goal]);

  const submit = () =>
    save.mutate({
      id: agent.id,
      goal: {
        primary_goal: primaryGoal,
        primary_cta: cta,
        handoff_triggers: handoff.split("\n").map((s) => s.trim()).filter(Boolean),
        success_definition: success,
        qualified_reply_definition: qualified,
        auto_reply_boundaries: {},
      },
    });

  return (
    <div>
      <PanelHeader
        title="Goal"
        desc="Define what the AI is working toward and when it should hand back to you."
      />
      <FieldRow label="Primary goal">
        <TextAreaField value={primaryGoal} onChange={setPrimaryGoal} rows={2} placeholder="e.g. Re-engage past buyers and book a buyer consult." />
      </FieldRow>
      <FieldRow label="Primary call to action">
        <TextField value={cta} onChange={setCta} placeholder="e.g. Book a 15-minute call" />
      </FieldRow>
      <FieldRow label="Hand off to me when…" hint="One trigger per line.">
        <TextAreaField value={handoff} onChange={setHandoff} rows={3} placeholder={"They reply with a question I should answer\nThey're ready to see a property"} />
      </FieldRow>
      <FieldRow label="What success looks like (optional)">
        <TextField value={success} onChange={setSuccess} />
      </FieldRow>
      <FieldRow label="What a qualified reply looks like (optional)">
        <TextField value={qualified} onChange={setQualified} />
      </FieldRow>
      <Btn variant="primary" onClick={submit} disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Save goal"}
      </Btn>
    </div>
  );
}

// ── Step 3: Knowledge ───────────────────────────────────────────────

export function KnowledgePanel({ agent }: PanelProps) {
  const { t } = useTheme();
  const { data: links = [] } = useAiAgentKnowledgeLinks(agent.id);
  const { data: library = [] } = useAgentKnowledge();
  const upload = useUploadAgentKnowledge();
  const addLink = useAddKnowledgeLink();
  const removeLink = useRemoveKnowledgeLink();
  const fileRef = useRef<HTMLInputElement>(null);

  const linkedDocIds = new Set(links.map((l) => l.knowledge_document_id));
  const reusable = library.filter((d) => !linkedDocIds.has(d.id));

  const onUpload = async (f: File | undefined) => {
    if (!f) return;
    const doc = await upload.mutateAsync(f);
    await addLink.mutateAsync({
      id: agent.id,
      knowledge_document_id: doc.id,
      attach_to_emails: false,
    });
  };

  return (
    <div>
      <PanelHeader
        title="Knowledge"
        desc="Give the AI product sheets, FAQs, neighbourhood guides — or reuse a file you already uploaded."
      />
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.csv,.txt,.md,.docx"
        style={{ display: "none" }}
        onChange={(e) => onUpload(e.target.files?.[0] ?? undefined)}
      />
      <Btn variant="primary" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
        <Icon name="upload" size={14} /> {upload.isPending ? "Uploading…" : "Upload a file"}
      </Btn>

      <div style={{ fontSize: 12, fontWeight: 800, color: t.ink3, margin: "20px 0 8px", textTransform: "uppercase", letterSpacing: 0.6 }}>
        Attached to this agent ({links.length})
      </div>
      {links.length === 0 && (
        <div style={{ fontSize: 13, color: t.ink3 }}>Nothing attached yet.</div>
      )}
      {links.map((l) => (
        <Card key={l.id} pad={12} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: t.ink }}>{l.filename}</div>
              <div style={{ fontSize: 12, color: t.ink3, marginTop: 2 }}>
                {l.doc_type ?? "document"} · {l.status}
                {l.summary ? ` — ${l.summary.slice(0, 90)}` : ""}
              </div>
            </div>
            <Btn variant="danger" onClick={() => removeLink.mutate({ id: agent.id, linkId: l.id })}>
              Remove
            </Btn>
          </div>
        </Card>
      ))}

      {reusable.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 800, color: t.ink3, margin: "20px 0 8px", textTransform: "uppercase", letterSpacing: 0.6 }}>
            Reuse a file you already uploaded
          </div>
          {reusable.map((d) => (
            <Card key={d.id} pad={12} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontSize: 13.5, color: t.ink }}>{d.filename}</div>
                <Btn
                  onClick={() =>
                    addLink.mutate({
                      id: agent.id,
                      knowledge_document_id: d.id,
                      attach_to_emails: false,
                    })
                  }
                >
                  Attach
                </Btn>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

// ── Step 4: Targeting ───────────────────────────────────────────────

const STAGES = ["lead", "contacted", "verified", "ready_for_lending", "processing", "funded"];
const TEMPS = ["hot", "warm", "cold"];

export function TargetingPanel({ agent }: PanelProps) {
  const { t } = useTheme();
  const { data: targeting } = useAiAgentTargeting(agent.id);
  const save = useSaveAiAgentTargeting();
  const preview = useAiAgentTargetingPreview();
  const runNow = useRunTargeting();

  const [domain, setDomain] = useState("clients");
  const [stages, setStages] = useState<string[]>([]);
  const [temps, setTemps] = useState<string[]>([]);
  const [neverClosed, setNeverClosed] = useState(false);
  const [skipLoan, setSkipLoan] = useState(true);
  const [skipOwned, setSkipOwned] = useState(true);
  const [enrollMode, setEnrollMode] = useState("review");
  const seeded = useRef(false);

  useEffect(() => {
    if (targeting && !seeded.current && Object.keys(targeting).length) {
      seeded.current = true;
      setDomain(targeting.domain ?? "clients");
      const inc = targeting.include_rules ?? {};
      const exc = targeting.exclude_rules ?? {};
      setStages((inc.stages as string[]) ?? []);
      setTemps((inc.lead_temperatures as string[]) ?? []);
      setNeverClosed(Boolean(inc.never_closed));
      setSkipLoan(exc.skip_in_loan_process !== false);
      setSkipOwned(exc.skip_owned_by_other_ai_agent !== false);
      setEnrollMode(targeting.enrollment_mode ?? "review");
    }
  }, [targeting]);

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const payload = useMemo(
    () => ({
      domain: domain as "pipeline" | "clients" | "both",
      include_rules: {
        ...(stages.length ? { stages } : {}),
        ...(temps.length ? { lead_temperatures: temps } : {}),
        ...(neverClosed ? { never_closed: true } : {}),
      },
      exclude_rules: {
        skip_in_loan_process: skipLoan,
        skip_owned_by_other_ai_agent: skipOwned,
      },
      enrollment_mode: enrollMode as "auto" | "review",
    }),
    [domain, stages, temps, neverClosed, skipLoan, skipOwned, enrollMode],
  );

  return (
    <div>
      <PanelHeader
        title="Targeting"
        desc="The AI works people already in QC — it never imports lists. Set who it should reach and what to skip."
      />
      <FieldRow label="Source">
        <SelectField
          value={domain}
          onChange={setDomain}
          options={[
            { value: "clients", label: "My clients" },
            { value: "pipeline", label: "My pipeline (deals / files)" },
            { value: "both", label: "Both" },
          ]}
        />
      </FieldRow>
      <FieldRow label="Include — pipeline stages">
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {STAGES.map((s) => (
            <ChipToggle key={s} label={s.replace(/_/g, " ")} active={stages.includes(s)} onClick={() => toggle(stages, s, setStages)} />
          ))}
        </div>
      </FieldRow>
      <FieldRow label="Include — lead temperature">
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {TEMPS.map((s) => (
            <ChipToggle key={s} label={s} active={temps.includes(s)} onClick={() => toggle(temps, s, setTemps)} />
          ))}
        </div>
      </FieldRow>
      <FieldRow label="Special filters">
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: t.ink2 }}>
          <input type="checkbox" checked={neverClosed} onChange={(e) => setNeverClosed(e.target.checked)} />
          Only clients who have never closed a deal with me
        </label>
      </FieldRow>
      <FieldRow label="Avoid overlap with higher-priority work">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: t.ink2 }}>
            <input type="checkbox" checked={skipLoan} onChange={(e) => setSkipLoan(e.target.checked)} />
            Skip anyone with a file in the loan process
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: t.ink2 }}>
            <input type="checkbox" checked={skipOwned} onChange={(e) => setSkipOwned(e.target.checked)} />
            Skip anyone already worked by another AI Agent
          </label>
        </div>
      </FieldRow>
      <FieldRow label="Enrollment">
        <SelectField
          value={enrollMode}
          onChange={setEnrollMode}
          options={[
            { value: "review", label: "Hold matches for my review" },
            { value: "auto", label: "Enroll matches automatically" },
          ]}
        />
      </FieldRow>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Btn
          variant="primary"
          onClick={() => save.mutate({ id: agent.id, targeting: payload })}
          disabled={save.isPending}
        >
          {save.isPending ? "Saving…" : "Save targeting"}
        </Btn>
        <Btn onClick={() => preview.mutate(agent.id)} disabled={preview.isPending}>
          Preview matches
        </Btn>
        <Btn onClick={() => runNow.mutate({ id: agent.id })} disabled={runNow.isPending}>
          Enroll matches now
        </Btn>
      </div>
      {preview.data && (
        <div style={{ marginTop: 14, fontSize: 13, color: t.ink2 }}>
          <strong>{preview.data.count}</strong> contact(s) match right now
          {preview.data.sample.length > 0 && (
            <span style={{ color: t.ink3 }}>
              {" "}
              — {preview.data.sample.map((s) => s.name).slice(0, 6).join(", ")}
              {preview.data.count > 6 ? "…" : ""}
            </span>
          )}
        </div>
      )}
      {runNow.data && (
        <div style={{ marginTop: 10, fontSize: 13, color: t.profit }}>
          Enrolled {runNow.data.enrolled}, retired {runNow.data.retired}.
        </div>
      )}
      <AgentLeadList agentId={agent.id} />
    </div>
  );
}

function AgentLeadList({ agentId }: { agentId: string }) {
  const { t } = useTheme();
  const { data: leads = [] } = useAiAgentLeads(agentId);
  if (leads.length === 0) return null;
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: t.ink3, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.6 }}>
        Enrolled contacts ({leads.length})
      </div>
      {leads.slice(0, 25).map((l) => (
        <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${t.line}`, fontSize: 13 }}>
          <span style={{ color: t.ink }}>{l.name}</span>
          <span style={{ color: t.ink3 }}>{l.status} · {l.attempts_made} sent</span>
        </div>
      ))}
    </div>
  );
}

// ── Step 5: Training Studio ─────────────────────────────────────────

export function TrainingPanel({ agent }: PanelProps) {
  const { t } = useTheme();
  const { data: training } = useAiAgentTraining(agent.id);
  const turn = usePostTrainingTurn();
  const complete = useCompleteTraining();
  const [msg, setMsg] = useState("");
  const messages = training?.messages ?? [];

  const send = async () => {
    if (!msg.trim()) return;
    const text = msg.trim();
    setMsg("");
    await turn.mutateAsync({ id: agent.id, message: text });
  };

  return (
    <div>
      <PanelHeader
        title="Training Studio"
        desc="Chat with an AI coach about your market, style, and the objections you hear. It learns how you sell."
      />
      <Card pad={14} style={{ maxHeight: 380, overflowY: "auto", marginBottom: 12 }}>
        {messages.length === 0 && (
          <div style={{ fontSize: 13, color: t.ink3 }}>
            Start by telling the coach what this agent should do and who it's for.
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              marginBottom: 10,
              display: "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "82%",
                padding: "9px 12px",
                borderRadius: 12,
                fontSize: 13.5,
                lineHeight: 1.5,
                background: m.role === "user" ? t.ink : t.surface2,
                color: m.role === "user" ? t.inverse : t.ink,
                border: m.role === "user" ? "none" : `1px solid ${t.line}`,
                whiteSpace: "pre-wrap",
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
      </Card>
      {!training?.completed ? (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Type your answer…"
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${t.lineStrong}`,
                background: t.surface,
                color: t.ink,
                fontSize: 14,
              }}
            />
            <Btn variant="primary" onClick={send} disabled={turn.isPending}>
              {turn.isPending ? "…" : "Send"}
            </Btn>
          </div>
          <div style={{ marginTop: 12 }}>
            <Btn
              onClick={() => complete.mutate({ id: agent.id })}
              disabled={complete.isPending || messages.length < 2}
            >
              Finish training
            </Btn>
          </div>
        </>
      ) : (
        <Pill color={t.profit} bg={t.profitBg}>
          Training complete
        </Pill>
      )}
    </div>
  );
}

// ── Steps 6 & 7: Playbook + Showing Guide ───────────────────────────

function RenderSynth({ content }: { content: Record<string, unknown> }) {
  const { t } = useTheme();
  const entries = Object.entries(content ?? {});
  if (entries.length === 0) return null;
  return (
    <div style={{ marginTop: 14 }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6 }}>
            {k.replace(/_/g, " ")}
          </div>
          <div style={{ fontSize: 13, color: t.ink2, marginTop: 3, whiteSpace: "pre-wrap" }}>
            {typeof v === "string"
              ? v
              : Array.isArray(v)
                ? v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n• ")
                : JSON.stringify(v, null, 2)}
          </div>
        </div>
      ))}
    </div>
  );
}

function SynthPanel({
  agent,
  title,
  desc,
  query,
  onGenerate,
  onApprove,
  generating,
  approving,
}: {
  agent: AiAgentDetail;
  title: string;
  desc: string;
  query: ReturnType<typeof useAiAgentPlaybook>;
  onGenerate: () => void;
  onApprove: () => void;
  generating: boolean;
  approving: boolean;
}) {
  const { t } = useTheme();
  const synth: AiAgentSynth | undefined = query.data;
  const status = synth?.generation_status ?? "idle";

  // Poll while the heavy synthesis job runs.
  useEffect(() => {
    if (status !== "generating") return;
    const iv = setInterval(() => query.refetch(), 4000);
    return () => clearInterval(iv);
  }, [status, query]);

  return (
    <div>
      <PanelHeader title={title} desc={desc} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Btn variant="primary" onClick={onGenerate} disabled={generating || status === "generating"}>
          {status === "generating" ? "Generating…" : status === "ready" || status === "failed" ? "Regenerate" : "Generate"}
        </Btn>
        {status === "ready" && synth?.approval_status !== "approved" && (
          <Btn onClick={onApprove} disabled={approving}>
            Approve
          </Btn>
        )}
        {synth?.approval_status === "approved" && (
          <Pill color={t.profit} bg={t.profitBg}>Approved</Pill>
        )}
        {status === "generating" && (
          <span style={{ fontSize: 12.5, color: t.ink3 }}>
            The AI is synthesizing this — usually under a minute.
          </span>
        )}
        {status === "failed" && (
          <span style={{ fontSize: 12.5, color: t.danger }}>
            Generation failed — {synth?.generation_error ?? "try again"}.
          </span>
        )}
      </div>
      {synth?.content && <RenderSynth content={synth.content} />}
    </div>
  );
}

export function PlaybookPanel({ agent }: PanelProps) {
  const query = useAiAgentPlaybook(agent.id);
  const generate = useGeneratePlaybook();
  const approve = useApprovePlaybook();
  return (
    <SynthPanel
      agent={agent}
      title="Playbook"
      desc="The AI synthesizes your training + knowledge into a structured outreach playbook. Review and approve it."
      query={query}
      onGenerate={() => generate.mutate({ id: agent.id })}
      onApprove={() => approve.mutate({ id: agent.id })}
      generating={generate.isPending}
      approving={approve.isPending}
    />
  );
}

export function ShowingGuidePanel({ agent }: PanelProps) {
  const query = useAiAgentShowingGuide(agent.id);
  const generate = useGenerateShowingGuide();
  const approve = useApproveShowingGuide();
  return (
    <SynthPanel
      agent={agent}
      title="Showing & Discovery Guide"
      desc="A discovery + showing playbook — agenda, discovery questions, follow-up templates. Review and approve."
      query={query}
      onGenerate={() => generate.mutate({ id: agent.id })}
      onApprove={() => approve.mutate({ id: agent.id })}
      generating={generate.isPending}
      approving={approve.isPending}
    />
  );
}

// ── Step 8: Follow-ups & Exit ───────────────────────────────────────

const TOUCHPOINTS = ["intro", "followup_1", "followup_2", "followup_3", "breakup", "doc_nudge", "review_request"];

export function FollowupsPanel({ agent }: PanelProps) {
  const { t } = useTheme();
  const patch = usePatchAiAgent();
  const { data: rules } = useAiAgentExitRules(agent.id);
  const saveRules = useSaveExitRules();
  const { data: samples = [] } = useAiAgentSampleMessages(agent.id);
  const addSample = useAddSampleMessage();
  const delSample = useDeleteSampleMessage();

  const [cadence, setCadence] = useState(agent.cadence.join(", "));
  const [maxEmail, setMaxEmail] = useState(5);
  const [maxNoReply, setMaxNoReply] = useState(4);
  const [maxDays, setMaxDays] = useState(14);
  const seeded = useRef(false);
  useEffect(() => {
    if (rules && !seeded.current && Object.keys(rules).length) {
      seeded.current = true;
      setMaxEmail(rules.max_email_attempts);
      setMaxNoReply(rules.max_no_reply_followups);
      setMaxDays(rules.max_days_in_sequence);
    }
  }, [rules]);

  const [tp, setTp] = useState("intro");
  const [sampleText, setSampleText] = useState("");

  const saveCadence = () => {
    const days = cadence.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
    patch.mutate({ id: agent.id, patch: { cadence: days } });
  };

  return (
    <div>
      <PanelHeader
        title="Follow-ups & Exit"
        desc="Set the cadence, when to stop, and give the AI a sample message per touchpoint so it learns your voice."
      />
      <FieldRow label="Cadence — days from enrollment" hint="Comma-separated. Default 0, 2, 5, 8, 12.">
        <div style={{ display: "flex", gap: 8 }}>
          <TextField value={cadence} onChange={setCadence} />
          <Btn onClick={saveCadence} disabled={patch.isPending}>Save</Btn>
        </div>
      </FieldRow>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <FieldRow label="Max email attempts">
          <input type="number" value={maxEmail} onChange={(e) => setMaxEmail(+e.target.value)} style={numStyle(t)} />
        </FieldRow>
        <FieldRow label="Max no-reply follow-ups">
          <input type="number" value={maxNoReply} onChange={(e) => setMaxNoReply(+e.target.value)} style={numStyle(t)} />
        </FieldRow>
        <FieldRow label="Max days in sequence">
          <input type="number" value={maxDays} onChange={(e) => setMaxDays(+e.target.value)} style={numStyle(t)} />
        </FieldRow>
      </div>
      <Btn
        variant="primary"
        onClick={() =>
          saveRules.mutate({
            id: agent.id,
            rules: {
              max_email_attempts: maxEmail,
              max_no_reply_followups: maxNoReply,
              max_days_in_sequence: maxDays,
            },
          })
        }
        disabled={saveRules.isPending}
      >
        Save exit rules
      </Btn>

      <div style={{ fontSize: 12, fontWeight: 800, color: t.ink3, margin: "22px 0 8px", textTransform: "uppercase", letterSpacing: 0.6 }}>
        Sample messages
      </div>
      {samples.map((s) => (
        <Card key={s.id} pad={12} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div>
              <Pill>{s.touchpoint_key}</Pill>
              <div style={{ fontSize: 13, color: t.ink2, marginTop: 6, whiteSpace: "pre-wrap" }}>{s.sample_text}</div>
            </div>
            <Btn variant="danger" onClick={() => delSample.mutate({ id: agent.id, sampleId: s.id })}>
              Delete
            </Btn>
          </div>
        </Card>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <select value={tp} onChange={(e) => setTp(e.target.value)} style={{ ...numStyle(t), width: 150 }}>
          {TOUCHPOINTS.map((x) => (
            <option key={x} value={x}>{x}</option>
          ))}
        </select>
      </div>
      <div style={{ marginTop: 8 }}>
        <TextAreaField value={sampleText} onChange={setSampleText} rows={3} placeholder="Paste an example of how you'd write this message…" />
      </div>
      <Btn
        onClick={async () => {
          if (!sampleText.trim()) return;
          await addSample.mutateAsync({ id: agent.id, touchpoint_key: tp, channel: "email", sample_text: sampleText.trim() });
          setSampleText("");
        }}
        disabled={addSample.isPending || !sampleText.trim()}
      >
        Add sample message
      </Btn>
    </div>
  );
}

function numStyle(t: ReturnType<typeof useTheme>["t"]) {
  return {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 10,
    border: `1px solid ${t.lineStrong}`,
    background: t.surface,
    color: t.ink,
    fontSize: 14,
    boxSizing: "border-box" as const,
  };
}

// ── Step 9: Test Scenarios ──────────────────────────────────────────

export function TestPanel({ agent }: PanelProps) {
  const { t } = useTheme();
  const { data: scenarios = [] } = useAiAgentTestScenarios(agent.id);
  const runTest = useRunTest();
  const review = useReviewTestScenario();
  const [prompt, setPrompt] = useState("");

  return (
    <div>
      <PanelHeader
        title="Test Scenarios"
        desc="Send the AI a sample lead message and see exactly how it would reply. Review the ones that look right."
      />
      <TextAreaField value={prompt} onChange={setPrompt} rows={3} placeholder="e.g. Hi, is that property on Oak St still available?" />
      <div style={{ marginTop: 8 }}>
        <Btn
          variant="primary"
          onClick={async () => {
            if (!prompt.trim()) return;
            await runTest.mutateAsync({ id: agent.id, prompt: prompt.trim() });
            setPrompt("");
          }}
          disabled={runTest.isPending || !prompt.trim()}
        >
          {runTest.isPending ? "Running…" : "Run test"}
        </Btn>
      </div>
      <div style={{ marginTop: 16 }}>
        {scenarios.map((s) => (
          <Card key={s.id} pad={14} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, color: t.ink3 }}>Lead said:</div>
            <div style={{ fontSize: 13.5, color: t.ink, marginTop: 2 }}>{s.prompt}</div>
            <div style={{ fontSize: 12.5, color: t.ink3, marginTop: 10 }}>AI replied:</div>
            <div style={{ fontSize: 13.5, color: t.ink2, marginTop: 2, whiteSpace: "pre-wrap" }}>
              {s.ai_response}
            </div>
            <div style={{ marginTop: 10 }}>
              {s.reviewed ? (
                <Pill color={t.profit} bg={t.profitBg}>Reviewed</Pill>
              ) : (
                <Btn onClick={() => review.mutate({ id: agent.id, scenarioId: s.id })}>
                  Mark reviewed
                </Btn>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Step 10: Launch Controls ────────────────────────────────────────

export function LaunchPanel({ agent }: PanelProps) {
  const { t } = useTheme();
  const blockers = agent.gate_blockers ?? [];
  return (
    <div>
      <PanelHeader
        title="Launch Controls"
        desc="A review of everything that must be in place before this AI Agent can go live."
      />
      {blockers.length === 0 ? (
        <Card pad={18} style={{ borderColor: t.profit }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: t.profit }}>
            <Icon name="check" size={18} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              All checks passed — ready to launch.
            </span>
          </div>
        </Card>
      ) : (
        <Card pad={18}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.warn, marginBottom: 10 }}>
            {blockers.length} item{blockers.length === 1 ? "" : "s"} still need attention:
          </div>
          {blockers.map((b, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: t.ink2, padding: "5px 0" }}>
              <Icon name="alert" size={14} /> {b}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ── Step 11: Warm-up & Launch ───────────────────────────────────────

export function WarmupPanel({ agent }: PanelProps) {
  const { t } = useTheme();
  const { data: messages = [] } = useAiAgentMessages(agent.id);
  const warmup = useWarmupSend();
  const activate = useActivateAiAgent();
  const pause = usePauseAiAgent();
  const [err, setErr] = useState<string[]>([]);

  const doActivate = async () => {
    setErr([]);
    try {
      await activate.mutateAsync({ id: agent.id });
    } catch (e: unknown) {
      const detail = (e as { body?: { detail?: { blockers?: string[] } } })?.body?.detail;
      setErr(detail?.blockers ?? ["Activation blocked — complete the earlier steps."]);
    }
  };

  return (
    <div>
      <PanelHeader
        title="Warm-up & Launch"
        desc="Send real messages one at a time to validate the AI, then activate the agent for good."
      />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <Btn
          variant="primary"
          onClick={() => warmup.mutate({ id: agent.id, touchpoint_key: "intro" })}
          disabled={warmup.isPending}
        >
          {warmup.isPending ? "Composing…" : "Compose a warm-up message"}
        </Btn>
        {agent.status === "active" ? (
          <Btn onClick={() => pause.mutate({ id: agent.id })}>Pause agent</Btn>
        ) : null}
        <Btn variant="primary" onClick={doActivate} disabled={activate.isPending}>
          {agent.warmup_mode ? "Graduate to full activation" : "Activate AI Agent"}
        </Btn>
      </div>
      {agent.status === "active" && (
        <Pill color={t.profit} bg={t.profitBg}>
          {agent.warmup_mode ? "Active — warm-up mode" : "Active"}
        </Pill>
      )}
      {err.length > 0 && (
        <Card pad={14} style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.warn, marginBottom: 6 }}>
            Activation blocked:
          </div>
          {err.map((b, i) => (
            <div key={i} style={{ fontSize: 13, color: t.ink2, padding: "3px 0" }}>• {b}</div>
          ))}
        </Card>
      )}

      <div style={{ fontSize: 12, fontWeight: 800, color: t.ink3, margin: "20px 0 8px", textTransform: "uppercase", letterSpacing: 0.6 }}>
        Outbox ({messages.length})
      </div>
      {messages.length === 0 && (
        <div style={{ fontSize: 13, color: t.ink3 }}>No messages yet.</div>
      )}
      {messages.map((m) => (
        <Card key={m.id} pad={14} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>
              {m.subject || "(no subject)"}
            </div>
            <Pill>{m.is_warmup ? "warm-up" : m.status}</Pill>
          </div>
          <div style={{ fontSize: 13, color: t.ink2, marginTop: 6, whiteSpace: "pre-wrap" }}>
            {m.body}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── panel dispatch ──────────────────────────────────────────────────

export function StepPanel({ stepKey, agent }: { stepKey: string; agent: AiAgentDetail }) {
  switch (stepKey) {
    case "basics":
      return <BasicsPanel agent={agent} />;
    case "goal":
      return <GoalPanel agent={agent} />;
    case "knowledge":
      return <KnowledgePanel agent={agent} />;
    case "targeting":
      return <TargetingPanel agent={agent} />;
    case "training":
      return <TrainingPanel agent={agent} />;
    case "playbook":
      return <PlaybookPanel agent={agent} />;
    case "showing_guide":
      return <ShowingGuidePanel agent={agent} />;
    case "followups":
      return <FollowupsPanel agent={agent} />;
    case "test":
      return <TestPanel agent={agent} />;
    case "launch":
      return <LaunchPanel agent={agent} />;
    case "warmup":
      return <WarmupPanel agent={agent} />;
    default:
      return null;
  }
}
