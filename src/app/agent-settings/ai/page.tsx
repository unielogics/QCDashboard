"use client";

// Agent Settings → AI Assistant — single page, 5 tabs.
//
// Plain-language vocabulary throughout — Required / Recommended /
// Optional / Locked by Funding. No raw playbook concepts (category,
// applies_when, blocks_stage, display_order) on this surface.
//
// Replaces the earlier 6 sub-routes. Tab state is in-memory + URL
// hash for deep-link, no nested routes.

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { AIPreviewPanel } from "@/components/AIPreviewPanel";
import {
  isAINotDeployed,
  useAgentPlaybook,
  useDeleteAgentRequirement,
  usePatchAgentPlaybookRules,
  useUpsertAgentRequirement,
  type PlaybookRequirement,
} from "@/hooks/useApi";
import { AINotDeployedBanner } from "@/components/AINotDeployedBanner";

type TabId = "buyer" | "seller" | "followup" | "handoff" | "style";

const TABS: { id: TabId; label: string; sub: string }[] = [
  { id: "buyer", label: "Buyer Rules", sub: "What the AI collects from buyer leads." },
  { id: "seller", label: "Seller Rules", sub: "What the AI collects from seller / listing leads." },
  { id: "followup", label: "Follow-Up", sub: "When the AI nudges + drafts." },
  { id: "handoff", label: "Ready for Lending", sub: "Your gate before lending hand-off." },
  { id: "style", label: "Message Style", sub: "Tone, signature, follow-up style." },
];


export default function AIAssistantPage() {
  const { t } = useTheme();
  const [tab, setTab] = useState<TabId>("buyer");

  // Deep-linkable via #buyer / #seller / etc.
  useEffect(() => {
    const hash = (typeof window !== "undefined" ? window.location.hash : "").replace("#", "");
    if (hash && TABS.some(t2 => t2.id === hash)) setTab(hash as TabId);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") window.location.hash = tab;
  }, [tab]);

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: "0 0 6px" }}>
        AI Assistant
      </h1>
      <p style={{ fontSize: 13, color: t.ink3, margin: "0 0 20px", maxWidth: 640 }}>
        Tell your AI what to collect, when to follow up, and what it&apos;s
        allowed to do. Everything here is your default — per-client
        adjustments live on each client page.
      </p>

      <AgentAIWorkflowMap />

      {/* Tab strip */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 20,
        borderBottom: `1px solid ${t.line}`, paddingBottom: 0,
        flexWrap: "wrap",
      }}>
        {TABS.map(x => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            style={{
              padding: "10px 16px", fontSize: 13, fontWeight: 600,
              border: "none", background: "transparent",
              color: tab === x.id ? t.ink : t.ink3,
              borderBottom: `2px solid ${tab === x.id ? t.petrol : "transparent"}`,
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === "buyer" ? <BuyerRulesTab /> : null}
      {tab === "seller" ? <SellerRulesTab /> : null}
      {tab === "followup" ? <FollowUpTab /> : null}
      {tab === "handoff" ? <ReadyForLendingTab /> : null}
      {tab === "style" ? <MessageStyleTab /> : null}
    </div>
  );
}


// ─── BUYER RULES ────────────────────────────────────────────────────


function BuyerRulesTab() {
  return <SidedRulesTab side="buyer" leadLabel="buyer lead" />;
}


function SellerRulesTab() {
  return <SidedRulesTab side="seller" leadLabel="seller / listing lead" />;
}


/** Shared shape between Buyer + Seller tabs — both render a checklist
 * grouped by Required / Recommended / Optional, plus an inline "+ Add
 * my own" form. The platform defaults appear as pre-checked rows
 * (locked items show a 🔒 chip and can't be unchecked). */
function SidedRulesTab({ side, leadLabel }: { side: "buyer" | "seller"; leadLabel: string }) {
  const { t } = useTheme();
  const { data, isLoading, error } = useAgentPlaybook(side);
  const upsert = useUpsertAgentRequirement(side);
  const del = useDeleteAgentRequirement(side);

  // Local "disabled" set for platform overridable items — we treat the
  // agent's overlay as the source of truth: a presence of an
  // overlay-row with required_level=optional means "agent disabled it".
  // For the agent UI we just show the checkbox; saving toggles via
  // the upsert/delete hooks.

  const platform = data?.platform_requirements || [];
  const overlay = data?.agent_requirements || [];

  // Group platform rows by plain level.
  const groups = useMemo(() => groupByLevel(platform, overlay), [platform, overlay]);

  // Inline new-item form state.
  const [draft, setDraft] = useState<{ label: string; level: "required" | "recommended" | "optional"; isDoc: boolean } | null>(null);

  async function setLevel(req: PlaybookRequirement, owner: "platform" | "agent", newLevel: "required" | "recommended" | "optional" | "disable") {
    if (owner === "platform" && !req.can_agent_override) return;  // Locked
    try {
      if (newLevel === "disable") {
        if (owner === "agent") await del.mutateAsync(req.id);
        // For platform rows, the way to "disable" is to clone an agent
        // overlay with required_level=optional. The agent has the toggle
        // in their UI but we reflect intent via overlay presence.
        else {
          await upsert.mutateAsync({
            requirement_key: req.requirement_key,
            label: req.label,
            category: req.category,
            required_level: "optional",
          });
        }
        return;
      }
      await upsert.mutateAsync({
        id: owner === "agent" ? req.id : undefined,
        requirement_key: req.requirement_key,
        label: req.label,
        category: req.category,
        required_level: newLevel,
      });
    } catch {
      // The next query refetch will surface AINotDeployedBanner if it's a 404;
      // any other error gets swallowed here rather than crashing the event handler.
    }
  }

  async function addCustom() {
    if (!draft || !draft.label.trim()) return;
    try {
      await upsert.mutateAsync({
        requirement_key: draft.label.trim().toLowerCase().replace(/\s+/g, "_"),
        label: draft.label.trim(),
        category: draft.isDoc ? "document" : "fact",
        required_level: draft.level,
      });
      setDraft(null);
    } catch {
      // 404 / 403 swallowed — the banner above already explains why.
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: t.ink3, margin: "0 0 10px" }}>
          When you get a {leadLabel}, your AI should collect:
        </p>
        <BehaviorNote
          icon={side === "buyer" ? "clients" : "building2"}
          title={side === "buyer" ? "Agent-side collection only" : "Seller-side collection only"}
          body={
            side === "buyer"
              ? "These items drive the Realtor AI's questions and client readiness map. They do not create lending document due dates until the buyer is marked ready for lending and a loan-side workflow starts."
              : "Seller items help the agent manage listing work. They are intentionally ignored by the lending handoff unless a buyer is also finance-ready."
          }
        />
      </div>

      {isAINotDeployed(error) ? (
        <AINotDeployedBanner surface="AI Assistant" />
      ) : isLoading ? (
        <Card pad={20}><div style={{ color: t.ink3, fontSize: 13 }}>Loading…</div></Card>
      ) : (
        <Card pad={20}>
          <Group title="Required" t={t} rows={groups.required} onSetLevel={setLevel} />
          <Group title="Recommended" t={t} rows={groups.recommended} onSetLevel={setLevel} />
          <Group title="Optional" t={t} rows={groups.optional} onSetLevel={setLevel} />

          {draft ? (
            <div style={{
              marginTop: 16, padding: 14,
              borderRadius: 8, border: `1px dashed ${t.line}`,
              background: t.surface2, display: "grid", gap: 8,
            }}>
              <input
                value={draft.label}
                onChange={e => setDraft({ ...draft, label: e.target.value })}
                placeholder="e.g. Inspection contingency"
                autoFocus
                style={inputStyle(t)}
              />
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <label style={radioLabel(t)}>
                  <input type="radio" checked={draft.level === "required"} onChange={() => setDraft({ ...draft, level: "required" })} /> Required
                </label>
                <label style={radioLabel(t)}>
                  <input type="radio" checked={draft.level === "recommended"} onChange={() => setDraft({ ...draft, level: "recommended" })} /> Recommended
                </label>
                <label style={radioLabel(t)}>
                  <input type="radio" checked={draft.level === "optional"} onChange={() => setDraft({ ...draft, level: "optional" })} /> Optional
                </label>
                <label style={{ ...radioLabel(t), marginLeft: "auto" }}>
                  <input type="checkbox" checked={draft.isDoc} onChange={e => setDraft({ ...draft, isDoc: e.target.checked })} /> Document / agreement
                </label>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={addCustom} style={btnPrimary(t)}>Add</button>
                <button onClick={() => setDraft(null)} style={btnSecondary(t)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setDraft({ label: "", level: "recommended", isDoc: false })}
              style={{ ...btnSecondary(t), marginTop: 12 }}
            >
              + Add my own
            </button>
          )}
        </Card>
      )}

      <div style={{ marginTop: 20 }}>
        <AIPreviewPanel mode="plan" />
      </div>
    </div>
  );
}


/** Render one level-group (Required / Recommended / Optional) as a
 * checkbox list. Each row toggles ON/OFF + (when enabled) shows the
 * row label plus the source/locked chip. */
function Group({
  title, t, rows, onSetLevel,
}: {
  title: string;
  t: ReturnType<typeof useTheme>["t"];
  rows: { req: PlaybookRequirement; owner: "platform" | "agent"; enabled: boolean }[];
  onSetLevel: (req: PlaybookRequirement, owner: "platform" | "agent", level: "required" | "recommended" | "optional" | "disable") => Promise<void>;
}) {
  if (rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: t.ink3,
        marginBottom: 8, textTransform: "uppercase",
      }}>
        {title}
      </div>
      {rows.map(({ req, owner, enabled }) => {
        const locked = owner === "platform" && !req.can_agent_override;
        return (
          <div key={`${owner}-${req.id}`} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 0", borderBottom: `1px solid ${t.line}`,
          }}>
            <input
              type="checkbox"
              checked={enabled}
              disabled={locked}
              onChange={() => onSetLevel(req, owner, enabled ? "disable" : title.toLowerCase() as "required" | "recommended" | "optional")}
              style={{ width: 18, height: 18 }}
            />
            <span style={{
              flex: 1, fontSize: 13, color: t.ink,
              opacity: enabled ? 1 : 0.5,
            }}>
              {req.label}
            </span>
            {locked ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#a06000" }} title="Locked by funding team">
                <Icon name="lock" size={10} stroke={2.5} /> Locked by Funding
              </span>
            ) : owner === "agent" ? (
              <span style={{ fontSize: 10, fontWeight: 700, color: t.petrol }}>
                YOUR ADDITION
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}


/** Bucket platform + agent rows into Required / Recommended / Optional
 * groups. Agent rows for the same key as a platform row override the
 * platform's level. */
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

  // Walk platform rows; overlay supersedes level when present.
  for (const p of platform) {
    const o = overlayByKey.get(p.requirement_key);
    const effective = o ? o.required_level : p.required_level;
    const enabled = !o || o.required_level !== "optional" || p.required_level === "optional";
    const row = { req: o ?? p, owner: (o ? "agent" : "platform") as "platform" | "agent", enabled: enabled };
    if (effective === "required") required.push(row);
    else if (effective === "recommended") recommended.push(row);
    else optional.push(row);
  }
  // Then any overlay-only rows the agent added themselves.
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


// ─── FOLLOW-UP ──────────────────────────────────────────────────────


/** Plain-English preset rows: wait time → action. No trigger/event
 * picker. Stored as a JSONB blob on the agent's `cadence` playbook
 * rules; the existing cadence engine consumes whatever is there. */
function FollowUpTab() {
  const { t } = useTheme();
  const cadence = useAgentPlaybook("cadence");
  const patch = usePatchAgentPlaybookRules("cadence");

  type Followup = {
    new_lead?: Preset[];
    buyer_agreement?: Preset[];
    seller_listing?: Preset[];
    require_approval?: boolean;
    drafts_to_inbox?: boolean;
  };

  const initial: Followup = (cadence.data?.rules?.followup as Followup) || {
    new_lead: [
      { wait_hours: 24, action: "draft_message" },
      { wait_hours: 72, action: "create_task" },
      { wait_hours: 168, action: "mark_lead_cold" },
    ],
    buyer_agreement: [
      { wait_hours: 24, action: "draft_message" },
      { wait_hours: 72, action: "create_task" },
    ],
    seller_listing: [
      { wait_hours: 48, action: "draft_message" },
      { wait_hours: 120, action: "mark_stalled" },
    ],
    require_approval: true,
    drafts_to_inbox: true,
  };
  const [val, setVal] = useState<Followup>(initial);
  useEffect(() => {
    if (cadence.data?.rules?.followup) setVal(cadence.data.rules.followup as Followup);
  }, [cadence.data?.rules?.followup]);

  async function save() {
    const next = { ...(cadence.data?.rules || {}), followup: val };
    try { await patch.mutateAsync(next); } catch { /* banner covers it */ }
  }

  if (isAINotDeployed(cadence.error)) {
    return <AINotDeployedBanner surface="AI Assistant" />;
  }

  return (
    <Card pad={20}>
      <BehaviorNote
        icon="bell"
        title="Follow-up rules create drafts and reminders, not silent sends"
        body="The agent AI can draft outreach, create follow-up work, or mark a lead stalled based on these presets. Message sending still routes through your approval unless you explicitly change that behavior."
        style={{ marginBottom: 18 }}
      />
      <PresetSection
        label="New Lead — if no response after:"
        rows={val.new_lead || []}
        onChange={(rows) => setVal({ ...val, new_lead: rows })}
        t={t}
      />
      <PresetSection
        label="Buyer Agreement — if not signed after:"
        rows={val.buyer_agreement || []}
        onChange={(rows) => setVal({ ...val, buyer_agreement: rows })}
        t={t}
      />
      <PresetSection
        label="Seller Listing — if listing agreement not signed after:"
        rows={val.seller_listing || []}
        onChange={(rows) => setVal({ ...val, seller_listing: rows })}
        t={t}
      />
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${t.line}` }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: t.ink, marginBottom: 6 }}>
          <input
            type="checkbox"
            checked={val.require_approval !== false}
            onChange={e => setVal({ ...val, require_approval: e.target.checked })}
          />
          Always ask me before sending messages
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: t.ink }}>
          <input
            type="checkbox"
            checked={val.drafts_to_inbox !== false}
            onChange={e => setVal({ ...val, drafts_to_inbox: e.target.checked })}
          />
          Put drafts in AI Inbox
        </label>
      </div>
      <button onClick={save} disabled={patch.isPending} style={{ ...btnPrimary(t), marginTop: 16 }}>
        {patch.isPending ? "Saving…" : "Save follow-up rules"}
      </button>

      <div style={{ marginTop: 20 }}>
        <AIPreviewPanel mode="cadence" />
      </div>
    </Card>
  );
}


type PresetAction = "draft_message" | "create_task" | "mark_stalled" | "mark_lead_cold";
type Preset = { wait_hours: number; action: PresetAction };


function PresetSection({
  label, rows, onChange, t,
}: {
  label: string;
  rows: Preset[];
  onChange: (rows: Preset[]) => void;
  t: ReturnType<typeof useTheme>["t"];
}) {
  const HOUR_PRESETS = [12, 24, 48, 72, 120, 168, 336];
  const ACTION_LABELS: Record<PresetAction, string> = {
    draft_message: "Draft follow-up message",
    create_task: "Create call task",
    mark_stalled: "Mark stalled",
    mark_lead_cold: "Mark lead cold",
  };
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: t.ink, marginBottom: 8 }}>
        {label}
      </div>
      {rows.map((row, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <select
            value={row.wait_hours}
            onChange={e => {
              const next = [...rows];
              next[i] = { ...next[i], wait_hours: parseInt(e.target.value, 10) };
              onChange(next);
            }}
            style={{ ...inputStyle(t), width: 140 }}
          >
            {HOUR_PRESETS.map(h => (
              <option key={h} value={h}>{formatHours(h)}</option>
            ))}
          </select>
          <span style={{ color: t.ink3 }}>→</span>
          <select
            value={row.action}
            onChange={e => {
              const next = [...rows];
              next[i] = { ...next[i], action: e.target.value as PresetAction };
              onChange(next);
            }}
            style={{ ...inputStyle(t), flex: 1 }}
          >
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            style={{ ...btnSecondary(t), color: "#c14444" }}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...rows, { wait_hours: 24, action: "draft_message" }])}
        style={{ ...btnSecondary(t), marginTop: 4 }}
      >
        + Add another step
      </button>
    </div>
  );
}


function formatHours(h: number): string {
  if (h < 24) return `${h} hours`;
  if (h % 168 === 0) return `${h / 168} weeks`;
  return `${h / 24} days`;
}


// ─── READY FOR LENDING ──────────────────────────────────────────────


function ReadyForLendingTab() {
  const { t } = useTheme();
  const buyer = useAgentPlaybook("buyer");
  const patch = usePatchAgentPlaybookRules("buyer");

  // Funding-locked items: the platform requirements where can_agent_override=false.
  const lockedItems = (buyer.data?.platform_requirements || []).filter(r => !r.can_agent_override);
  // Agent-controllable: every overridable platform + agent-overlay row.
  const overridable = (buyer.data?.platform_requirements || [])
    .filter(r => r.can_agent_override)
    .concat(buyer.data?.agent_requirements || []);
  // Saved gate selection.
  const savedGate = useMemo(() => {
    const r = (buyer.data?.rules?.before_handoff as string[]) || [];
    return new Set(r);
  }, [buyer.data?.rules]);
  const [chosen, setChosen] = useState<Set<string>>(savedGate);
  useEffect(() => { setChosen(savedGate); }, [savedGate]);

  function toggle(key: string) {
    const next = new Set(chosen);
    next.has(key) ? next.delete(key) : next.add(key);
    setChosen(next);
  }

  async function save() {
    const next = { ...(buyer.data?.rules || {}), before_handoff: Array.from(chosen) };
    try { await patch.mutateAsync(next); } catch { /* banner covers it */ }
  }

  if (isAINotDeployed(buyer.error)) {
    return <AINotDeployedBanner surface="AI Assistant" />;
  }

  return (
    <div>
      <Card pad={20}>
        <BehaviorNote
          icon="arrowR"
          title="This is the buyer-to-lending gate"
          body="When these buyer-side requirements are satisfied, the AI can suggest the handoff. After the agent confirms, the funding-side Lending AI takes over with loan requirements, document verification, underwriter tasks, and calendar due dates."
          style={{ marginBottom: 16 }}
        />
        <p style={{ fontSize: 13, color: t.ink3, margin: "0 0 16px" }}>
          Before your AI suggests sending a buyer to lending, require:
        </p>

        <div style={{ marginBottom: 18 }}>
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
            border: `1px solid ${t.line}`, marginBottom: 16,
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
      </Card>

      <div style={{ marginTop: 20 }}>
        <AIPreviewPanel mode="handoff" />
      </div>
    </div>
  );
}


// ─── MESSAGE STYLE ──────────────────────────────────────────────────


function MessageStyleTab() {
  const { t } = useTheme();
  const cadence = useAgentPlaybook("cadence");
  const patch = usePatchAgentPlaybookRules("cadence");

  type Style = {
    tone?: "professional" | "warm" | "concise" | "friendly";
    follow_up_style?: "soft" | "balanced" | "direct";
    signature?: string;
  };
  const initial: Style = (cadence.data?.rules?.style as Style) || {};
  const [s, setS] = useState<Style>(initial);
  useEffect(() => { setS((cadence.data?.rules?.style as Style) || {}); }, [cadence.data?.rules?.style]);

  async function save() {
    const next = { ...(cadence.data?.rules || {}), style: s };
    try { await patch.mutateAsync(next); } catch { /* banner covers it */ }
  }

  if (isAINotDeployed(cadence.error)) {
    return <AINotDeployedBanner surface="AI Assistant" />;
  }

  return (
    <Card pad={20}>
      <BehaviorNote
        icon="chat"
        title="This changes how the agent AI talks, not what lending requires"
        body="Use this for the relationship assistant's tone and signature. Funding-side borrower messaging is controlled in Lending AI Settings."
        style={{ marginBottom: 18 }}
      />
      <Field label="Tone" t={t}>
        <ChipRow
          options={[
            { value: "professional", label: "Professional" },
            { value: "warm", label: "Warm" },
            { value: "concise", label: "Concise" },
            { value: "friendly", label: "Friendly" },
          ]}
          value={s.tone || "professional"}
          onChange={(v) => setS({ ...s, tone: v as Style["tone"] })}
          t={t}
        />
      </Field>
      <Field label="Follow-up style" t={t}>
        <ChipRow
          options={[
            { value: "soft", label: "Soft" },
            { value: "balanced", label: "Balanced" },
            { value: "direct", label: "Direct" },
          ]}
          value={s.follow_up_style || "balanced"}
          onChange={(v) => setS({ ...s, follow_up_style: v as Style["follow_up_style"] })}
          t={t}
        />
      </Field>
      <Field label="Signature" t={t}>
        <input
          value={s.signature || ""}
          onChange={e => setS({ ...s, signature: e.target.value })}
          placeholder="— [Your name], Qualified Commercial"
          style={inputStyle(t)}
        />
      </Field>
      <Field label="Example message preview" t={t}>
        <div style={{
          padding: 12, borderRadius: 8, background: t.surface2,
          fontSize: 13, color: t.ink, lineHeight: 1.5,
          fontStyle: "italic",
        }}>
          {previewMessage(s)}
        </div>
      </Field>
      <button onClick={save} disabled={patch.isPending} style={btnPrimary(t)}>
        {patch.isPending ? "Saving…" : "Save style"}
      </button>
    </Card>
  );
}


function previewMessage(s: { tone?: string; follow_up_style?: string; signature?: string }): string {
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


// ─── shared primitives ──────────────────────────────────────────────


function AgentAIWorkflowMap() {
  const { t } = useTheme();
  const steps = [
    {
      icon: "clients",
      label: "Agent AI",
      title: "Buyer / seller relationship",
      body: "Collects intent, agreements, preferences, listing prep, and follow-up context.",
    },
    {
      icon: "check",
      label: "Handoff gate",
      title: "Buyer ready for lending",
      body: "Seller work stops here. Buyer requirements decide whether the AI can suggest the funding handoff.",
    },
    {
      icon: "shieldChk",
      label: "Lending AI",
      title: "Funding workflow",
      body: "Collects loan facts, requests documents, verifies evidence, creates AI tasks, and emits calendar due dates.",
    },
  ];
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: 10,
      marginBottom: 20,
    }}>
      {steps.map((step, i) => (
        <div key={step.label} style={{
          border: `1px solid ${i === 1 ? t.petrol : t.line}`,
          borderRadius: 8,
          padding: 14,
          background: i === 1 ? t.petrolSoft : t.surface,
          minHeight: 132,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: i === 1 ? t.petrol : t.surface2,
              color: i === 1 ? "#fff" : t.petrol,
            }}>
              <Icon name={step.icon} size={15} />
            </span>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: t.ink3 }}>
              {step.label}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: t.ink, marginBottom: 5 }}>
            {step.title}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.45, color: t.ink3 }}>
            {step.body}
          </div>
        </div>
      ))}
    </div>
  );
}


function BehaviorNote({
  icon,
  title,
  body,
  style,
}: {
  icon: string;
  title: string;
  body: string;
  style?: React.CSSProperties;
}) {
  const { t } = useTheme();
  return (
    <div style={{
      display: "flex",
      gap: 10,
      padding: 12,
      borderRadius: 8,
      border: `1px solid ${t.line}`,
      background: t.surface2,
      ...style,
    }}>
      <span style={{ color: t.petrol, display: "inline-flex", paddingTop: 1 }}>
        <Icon name={icon} size={16} />
      </span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: t.ink, marginBottom: 3 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.45 }}>
          {body}
        </div>
      </div>
    </div>
  );
}


function Field({ label, children, t }: { label: string; children: React.ReactNode; t: ReturnType<typeof useTheme>["t"] }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: t.ink3,
        marginBottom: 6, textTransform: "uppercase",
      }}>{label}</div>
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
    padding: 8, fontSize: 13, fontFamily: "inherit",
    borderRadius: 6, border: `1px solid ${t.line}`,
    background: t.surface, color: t.ink, width: "100%",
  } as const;
}


function radioLabel(t: ReturnType<typeof useTheme>["t"]) {
  return {
    fontSize: 13, color: t.ink, display: "flex",
    alignItems: "center", gap: 6, cursor: "pointer",
  } as const;
}


function btnPrimary(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "8px 14px", fontSize: 13, fontWeight: 600,
    borderRadius: 6, border: `1px solid ${t.line}`,
    background: t.petrol, color: "#fff", cursor: "pointer",
  } as const;
}


function btnSecondary(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "8px 14px", fontSize: 13, fontWeight: 600,
    borderRadius: 6, border: `1px solid ${t.line}`,
    background: t.surface, color: t.ink, cursor: "pointer",
  } as const;
}
