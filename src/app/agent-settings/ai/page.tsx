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
        Agent AI Base Template
      </h1>
      <p style={{ fontSize: 13, color: t.ink3, margin: "0 0 20px", maxWidth: 640 }}>
        Configure the relationship assistant for buyer and seller workflows.
        These defaults stay agent-side until a buyer is deliberately handed to
        the lending workflow.
      </p>

      <AgentAIOperatingStrip />
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

function AgentAIOperatingStrip() {
  const { t } = useTheme();
  const items = [
    { label: "Buyer", body: "Collect intent, criteria, agreement status, and handoff readiness." },
    { label: "Seller", body: "Track listing prep, seller agreement, pricing context, and follow-up." },
    { label: "Handoff", body: "Only finance-ready buyer work crosses into Lending AI." },
  ];
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 8,
      marginBottom: 12,
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
          <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.4 }}>{item.body}</div>
        </div>
      ))}
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
  // Per-row Configure editor — opens an inline panel under the chosen
  // requirement with the new Deal Secretary fields (owner / link /
  // objective / cadence). null = closed.
  const [configureFor, setConfigureFor] = useState<{ req: PlaybookRequirement; owner: "platform" | "agent" } | null>(null);

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
          <Group title="Required" t={t} rows={groups.required} onSetLevel={setLevel} onConfigure={(req, owner) => setConfigureFor({ req, owner })} side={side} />
          <Group title="Recommended" t={t} rows={groups.recommended} onSetLevel={setLevel} onConfigure={(req, owner) => setConfigureFor({ req, owner })} side={side} />
          <Group title="Optional" t={t} rows={groups.optional} onSetLevel={setLevel} onConfigure={(req, owner) => setConfigureFor({ req, owner })} side={side} />

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
                } catch {
                  // swallow — AINotDeployedBanner above will explain
                }
              }}
            />
          ) : null}

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
  title, t, rows, onSetLevel, onConfigure, side,
}: {
  title: string;
  t: ReturnType<typeof useTheme>["t"];
  rows: { req: PlaybookRequirement; owner: "platform" | "agent"; enabled: boolean }[];
  onSetLevel: (req: PlaybookRequirement, owner: "platform" | "agent", level: "required" | "recommended" | "optional" | "disable") => Promise<void>;
  onConfigure: (req: PlaybookRequirement, owner: "platform" | "agent") => void;
  side: "buyer" | "seller";
}) {
  void side; // reserved for future "applies_when" hints; keeps signature stable
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
        const ownerTone = req.default_owner_type === "ai"
          ? { bg: t.brandSoft, fg: t.brand }
          : req.default_owner_type === "shared"
          ? { bg: t.warnBg, fg: t.warn }
          : { bg: t.surface2, fg: t.ink3 };
        const hasBrief = (req.objective_text && req.objective_text.length > 0) || (req.completion_criteria && req.completion_criteria.length > 0);
        return (
          <div key={`${owner}-${req.id}`} style={{
            display: "grid",
            gridTemplateColumns: "22px minmax(0, 1fr) auto",
            gap: 10,
            padding: "10px 0",
            borderBottom: `1px solid ${t.line}`,
            alignItems: "center",
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
                <ChipText t={t}>{categoryShort(req.category)}</ChipText>
                <ChipText t={t} bg={ownerTone.bg} fg={ownerTone.fg}>
                  {ownerLabel(req.default_owner_type)}
                </ChipText>
                {req.link_kind === "docusign" ? (
                  <ChipText t={t} bg={t.profitBg} fg={t.profit}>✍ DocuSign</ChipText>
                ) : req.link_url ? (
                  <ChipText t={t} bg={t.profitBg} fg={t.profit}>🔗 Link set</ChipText>
                ) : null}
                {hasBrief ? <ChipText t={t}>AI brief set</ChipText> : null}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {locked ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#a06000" }} title="Locked by funding team">
                  <Icon name="lock" size={10} stroke={2.5} /> Locked
                </span>
              ) : owner === "agent" ? (
                <span style={{ fontSize: 10, fontWeight: 700, color: t.petrol }}>
                  YOURS
                </span>
              ) : null}
              {!locked ? (
                <button
                  type="button"
                  onClick={() => onConfigure(req, owner)}
                  style={{
                    padding: "5px 9px",
                    borderRadius: 7,
                    border: `1px solid ${t.line}`,
                    background: t.surface2,
                    color: t.ink2,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
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
      background: bg ?? t.chip,
      color: fg ?? t.ink3,
      letterSpacing: 0.3, textTransform: "uppercase",
    }}>
      {children}
    </span>
  );
}

function categoryShort(category: string): string {
  const map: Record<string, string> = {
    borrower_info: "Borrower",
    property_data: "Property",
    financials: "Financials",
    credit: "Credit",
    agreements: "Agreement",
    insurance: "Insurance",
    title_and_escrow: "Title",
    appraisal_and_inspection: "Appraisal",
    scheduling: "Schedule",
    compliance: "Compliance",
    communication: "Comms",
    ai_internal: "Internal",
    // Legacy
    fact: "Borrower",
    document: "Document",
    appointment: "Schedule",
    agreement: "Agreement",
    task: "Task",
  };
  return map[category] ?? category;
}

function ownerLabel(owner?: string): string {
  switch (owner) {
    case "ai": return "AI handles";
    case "shared": return "Shared";
    case "funding_locked": return "🔒 Funding";
    default: return "Human handles";
  }
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

// ─── Per-requirement configuration popup ─────────────────────────────
//
// Opens when the operator clicks "Configure" on a row. Exposes the
// new Deal Secretary fields (owner / DocuSign link / AI objective /
// cadence) so the agent can tell the AI exactly what to do for this
// requirement on every future deal. Saves via the upsert hook —
// platform rows fork to an agent-overlay row on first edit.

function RequirementConfigurePopup({
  t, row, owner, candidates, onClose, onSave,
}: {
  t: ReturnType<typeof useTheme>["t"];
  row: PlaybookRequirement;
  owner: "platform" | "agent";
  /** Other rows on the same playbook — used for depends_on + parent_key pickers. */
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
  // Per the user direction: per-task config is just owner + what + done.
  // Cadence hours and channel picker were dropped — the system itself
  // sequences work via a single timeline so the user doesn't have to
  // hand-tune times. Channels are inferred at dispatch time from the
  // borrower's contact prefs + consent state.
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
  const [dependsOn, setDependsOn] = useState<string[]>(row.depends_on ?? []);
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
        depends_on: dependsOn,
        parent_key: parentKey || null,
      });
    } finally {
      setSaving(false);
    }
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
            Configure baseline
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
                    padding: "9px 10px",
                    borderRadius: 9,
                    border: `1px solid ${ownerType === opt ? t.brand : t.line}`,
                    background: ownerType === opt ? t.brandSoft : t.surface2,
                    color: ownerType === opt ? t.brand : t.ink2,
                    cursor: "pointer",
                    fontSize: 12, fontWeight: 800, fontFamily: "inherit",
                  }}
                >
                  {opt === "human" ? "Human handles" : opt === "ai" ? "AI handles" : "Shared"}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: t.ink3 }}>
              When AI handles: it will reach out to the client on your behalf for every new lead with this requirement.
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

          {/* Timeline + grouping pickers (alembic 0040). Determines
              where this task lands in Next Up / In Progress / Upcoming
              on the AI Secretary tab. */}
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

          <FieldBlock label="Depends on (must finish first)" t={t}>
            <DependsOnPicker
              t={t}
              candidates={candidates.filter((c) => c.requirement_key !== parentKey)}
              value={dependsOn}
              onChange={setDependsOn}
            />
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
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 14px", borderRadius: 9,
              background: t.surface2, color: t.ink2,
              border: `1px solid ${t.line}`, cursor: "pointer",
              fontSize: 12, fontWeight: 800, fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              padding: "8px 14px", borderRadius: 9,
              background: t.brand, color: t.inverse,
              border: "none",
              cursor: saving ? "wait" : "pointer",
              fontSize: 12, fontWeight: 800, fontFamily: "inherit",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
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

// ─── DependsOnPicker — chip-style multi-select for prerequisite tasks
//
// User adds dependency rows by typing in a search box (filters
// candidates). Selected deps render as removable chips above the
// box. Used inside RequirementConfigurePopup to set the
// requirement's depends_on array.

function DependsOnPicker({
  t, candidates, value, onChange,
}: {
  t: ReturnType<typeof useTheme>["t"];
  candidates: PlaybookRequirement[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const labelByKey = useMemo(() => {
    const m = new Map<string, string>();
    candidates.forEach((c) => m.set(c.requirement_key, c.label));
    return m;
  }, [candidates]);
  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates
      .filter((c) => !value.includes(c.requirement_key))
      .filter((c) => !q || c.label.toLowerCase().includes(q) || c.requirement_key.toLowerCase().includes(q))
      .slice(0, 6);
  }, [candidates, value, query]);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
        {value.length === 0 ? (
          <span style={{ fontSize: 11, color: t.ink3 }}>No dependencies — this task is ready on day one.</span>
        ) : null}
        {value.map((key) => (
          <span
            key={key}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "3px 8px", borderRadius: 999,
              background: t.brandSoft, color: t.brand,
              fontSize: 11, fontWeight: 800,
            }}
          >
            {labelByKey.get(key) ?? key}
            <button
              type="button"
              onClick={() => onChange(value.filter((k) => k !== key))}
              style={{
                all: "unset", cursor: "pointer",
                width: 14, height: 14, borderRadius: 999,
                background: t.surface, color: t.brand,
                display: "inline-grid", placeItems: "center",
                fontSize: 10, fontWeight: 900, lineHeight: 1,
              }}
              aria-label={`Remove ${key}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type to search and add a prerequisite…"
        style={inputStyle(t)}
      />
      {query.trim() ? (
        <div style={{
          marginTop: 6,
          border: `1px solid ${t.line}`,
          borderRadius: 8,
          background: t.surface,
          maxHeight: 200, overflow: "auto",
        }}>
          {available.length === 0 ? (
            <div style={{ padding: 9, fontSize: 11, color: t.ink3 }}>No matches.</div>
          ) : available.map((c) => (
            <button
              key={c.requirement_key}
              type="button"
              onClick={() => {
                onChange([...value, c.requirement_key]);
                setQuery("");
              }}
              style={{
                all: "unset", cursor: "pointer",
                display: "block", width: "calc(100% - 24px)",
                padding: "8px 12px",
                fontSize: 12, color: t.ink,
                borderBottom: `1px solid ${t.line}`,
              }}
            >
              <div style={{ fontWeight: 700 }}>{c.label}</div>
              <div style={{ fontSize: 10, color: t.ink3, marginTop: 2 }}>{c.requirement_key}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
