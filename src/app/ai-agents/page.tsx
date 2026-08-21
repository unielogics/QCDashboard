"use client";

// AI Outreach Agents — the broker's roster of configurable outreach workers. Each card
// links into the 11-step builder. Agent-only surface.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/design-system/Icon";
import { useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import {
  Btn,
  Card,
  CellChip,
  Input,
  PageHeader,
  Panel,
  Select,
  type ChipTone,
} from "@/components/ds";
import {
  useAiAgents,
  useCreateAiAgent,
  useSetDefaultAgent,
  type AiAgentKind,
  type AiAgentListRow,
  type AiAgentStatus,
  type StepStates,
} from "@/hooks/useAiAgents";

const KIND_LABELS: Record<AiAgentKind, string> = {
  new_deal_buyer: "New deal — buyer",
  new_deal_seller: "New deal — seller",
  buyer_nurture: "Buyer nurture",
  seller_followup: "Seller / listing follow-up",
  past_client: "Past-client re-engagement",
  investor_outreach: "Investor outreach",
  open_house: "Open-house follow-up",
  review_request: "Review request",
  custom: "Custom",
};

// The three-way status distinction the old Pill carried (green / amber / grey),
// expressed as chip tones instead of hand-mixed token pairs.
const STATUS_TONE: Record<AiAgentStatus, ChipTone> = {
  draft: "mut",
  needs_training: "warn",
  training_in_progress: "warn",
  needs_review: "warn",
  ready_to_activate: "warn",
  active: "ok",
  paused: "warn",
  archived: "mut",
};

const STEP_KEYS = [
  "basics",
  "goal",
  "knowledge",
  "targeting",
  "training",
  "playbook",
  "showing_guide",
  "followups",
  "test",
  "launch",
  "warmup",
];

function StepDots({ steps }: { steps: StepStates }) {
  return (
    // Eleven 8px dots want a 4px rhythm; .row's 10px gap would run the strip
    // past the card. Bespoke, so it stays inline.
    <div style={{ display: "flex", gap: 4 }}>
      {STEP_KEYS.map((k) => {
        const s = steps[k] ?? "missing";
        const color =
          s === "done"
            ? "var(--ok)"
            : s === "attention"
              ? "var(--warn)"
              : "var(--line2)";
        return (
          <span
            key={k}
            title={`${k}: ${s}`}
            className="repdot"
            style={{ background: color }}
          />
        );
      })}
    </div>
  );
}

export default function AiAgentsPage() {
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const router = useRouter();
  const { data: agents = [], isLoading } = useAiAgents();
  const create = useCreateAiAgent();
  const setDefault = useSetDefaultAgent();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AiAgentKind>("new_deal_buyer");
  // Right-click context menu on agent cards.
  const [agentMenu, setAgentMenu] = useState<{
    agent: AiAgentListRow;
    x: number;
    y: number;
  } | null>(null);

  // Only redirect a confirmed non-agent — never on the pre-/auth/me
  // fallback, which would bounce a real broker mid-load.
  useEffect(() => {
    if (!meLoading && me && me.role !== Role.BROKER) router.replace("/");
  }, [meLoading, me, router]);
  if (!meLoading && me && me.role !== Role.BROKER) return null;

  const submit = async () => {
    if (!name.trim()) return;
    const agent = await create.mutateAsync({ name: name.trim(), kind });
    setCreating(false);
    setName("");
    router.push(`/ai-agents/${agent.id}`);
  };

  return (
    <>
      <PageHeader
        title="AI Outreach Agents"
        actions={
          <Btn variant="pri" onClick={() => setCreating((v) => !v)}>
            <Icon name="plus" size={15} /> New outreach agent
          </Btn>
        }
      />
      <p className="sub" style={{ maxWidth: 560 }}>
        Build broker-controlled outreach agents for new-deal follow-up,
        past-client nurture, review requests, and other internal workflows.
        Each one is trained, tested, and pointed at a slice of your pipeline.
      </p>

      {creating && (
        <Panel className="mt" title="Create an outreach agent">
          <div className="row">
            <Input
              autoFocus
              grow
              placeholder="Agent name — e.g. New-deal follow-up"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value as AiAgentKind)}
            >
              {Object.entries(KIND_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
            <Btn
              variant="pri"
              disabled={!name.trim() || create.isPending}
              onClick={submit}
            >
              {create.isPending ? "Creating…" : "Create & build"}
            </Btn>
          </div>
        </Panel>
      )}

      {isLoading ? (
        <Card className="mt">
          <span className="sub">Loading…</span>
        </Card>
      ) : agents.length === 0 ? (
        <Card className="mt">
          <div style={{ textAlign: "center" }}>
            <Icon name="spark" size={26} />
            <p className="sub">
              No outreach agents yet. Start with one of the two real-estate
              starters below — you can edit everything once it&apos;s drafted.
            </p>
          </div>
          <div className="cg mt">
            {(
              [
                {
                  kind: "new_deal_buyer" as AiAgentKind,
                  title: "New deal — buyer",
                  desc: "Works a brand-new buyer purchase — gather contract docs, push to under-contract, hand off to lending.",
                  agentName: "New deal — buyer",
                  audience: "Brand-new buyer deals from my pipeline.",
                },
                {
                  kind: "new_deal_seller" as AiAgentKind,
                  title: "New deal — seller",
                  desc: "Works a brand-new listing — confirmations, photo / staging nudges, offer follow-ups.",
                  agentName: "New deal — seller",
                  audience: "Brand-new seller listings from my pipeline.",
                },
              ]
            ).map((preset) => (
              <Card key={preset.kind} className="s6">
                <b>{preset.title}</b>
                <div className="sub" style={{ margin: "6px 0 14px" }}>
                  {preset.desc}
                </div>
                <Btn
                  variant="pri"
                  style={{ width: "100%" }}
                  disabled={create.isPending}
                  onClick={async () => {
                    const agent = await create.mutateAsync({
                      name: preset.agentName,
                      kind: preset.kind,
                      audience: preset.audience,
                    });
                    router.push(`/ai-agents/${agent.id}`);
                  }}
                >
                  <Icon name="plus" size={13} /> Start with this
                </Btn>
              </Card>
            ))}
          </div>
        </Card>
      ) : (
        <>
          <SuggestedWorkflows
            agents={agents}
            onCreate={async (preset) => {
              const agent = await create.mutateAsync(preset);
              router.push(`/ai-agents/${agent.id}`);
            }}
            disabled={create.isPending}
          />
          <div className="grid cols-auto mt">
            {agents.map((a) => (
              <Link
                key={a.id}
                href={`/ai-agents/${a.id}`}
                // An <a> is accent-coloured and the card's body text has to
                // read as body text; neither is owned by a class here.
                style={{ textDecoration: "none", color: "var(--ink)" }}
                onContextMenu={(e) => {
                  if (
                    a.kind === "new_deal_buyer" ||
                    a.kind === "new_deal_seller"
                  ) {
                    e.preventDefault();
                    e.stopPropagation();
                    setAgentMenu({ agent: a, x: e.clientX, y: e.clientY });
                  }
                }}
              >
                <Card style={{ cursor: "pointer", height: "100%" }}>
                  <div className="row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b>
                        {(a.is_default_new_deal_buyer ||
                          a.is_default_new_deal_seller) && (
                          <span
                            title={
                              a.is_default_new_deal_buyer
                                ? "Default for New Deal — Buyer"
                                : "Default for New Deal — Seller"
                            }
                            style={{ color: "var(--gold)" }}
                          >
                            ★{" "}
                          </span>
                        )}
                        {a.name}
                      </b>
                      {a.ai_display_name && (
                        <div className="sub">
                          Introduces as {a.ai_display_name}
                        </div>
                      )}
                    </div>
                    <CellChip tone={STATUS_TONE[a.status]}>
                      {a.status.replace(/_/g, " ")}
                    </CellChip>
                  </div>
                  <div className="sub">{KIND_LABELS[a.kind]}</div>
                  <div className="mt">
                    <StepDots steps={a.steps} />
                  </div>
                  <div className="sub mt">
                    {a.lead_count} contact{a.lead_count === 1 ? "" : "s"} enrolled
                    {a.warmup_mode ? " · warm-up" : ""}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
      {agentMenu ? (
        <AgentCardContextMenu
          agent={agentMenu.agent}
          x={agentMenu.x}
          y={agentMenu.y}
          onSetDefault={(slot, on) => {
            void setDefault.mutateAsync({ id: agentMenu.agent.id, slot, on });
            setAgentMenu(null);
          }}
          onClose={() => setAgentMenu(null)}
        />
      ) : null}
    </>
  );
}

function AgentCardContextMenu({
  agent,
  x,
  y,
  onSetDefault,
  onClose,
}: {
  agent: AiAgentListRow;
  x: number;
  y: number;
  onSetDefault: (slot: "new_deal_buyer" | "new_deal_seller", on: boolean) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = () => onClose();
    window.addEventListener("keydown", onKey);
    const id = window.setTimeout(() => {
      window.addEventListener("click", onClick);
    }, 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
      window.clearTimeout(id);
    };
  }, [onClose]);

  const slot: "new_deal_buyer" | "new_deal_seller" =
    agent.kind === "new_deal_seller" ? "new_deal_seller" : "new_deal_buyer";
  const isDefault =
    slot === "new_deal_buyer"
      ? agent.is_default_new_deal_buyer
      : agent.is_default_new_deal_seller;
  const slotLabel =
    slot === "new_deal_buyer" ? "New Deal — Buyer" : "New Deal — Seller";

  return (
    // .popmenu anchors itself to a trigger; this one is pinned to the pointer,
    // so the surface stays inline — but on tokens, not a theme object. The row
    // below is .toollink, which carries its own :hover.
    <div
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        top: y,
        left: x,
        zIndex: 80,
        minWidth: 240,
        background: "var(--surface)",
        border: "1px solid var(--line2)",
        borderRadius: 12,
        boxShadow: "var(--sh2)",
        padding: 5,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <div className="lbl" style={{ padding: "8px 10px 4px" }}>
        {agent.name}
      </div>
      <button
        type="button"
        className="toollink"
        onClick={(e) => {
          e.stopPropagation();
          onSetDefault(slot, !isDefault);
        }}
      >
        <span style={{ color: "var(--gold)" }}>★</span>
        {isDefault ? `Unset as default ${slotLabel}` : `Set as default ${slotLabel}`}
      </button>
    </div>
  );
}

// Heuristic suggestion strip: surface starter workflows the broker
// hasn't built yet. Frontend-only — no backend AI call.
const SUGGESTION_CATALOG: { kind: AiAgentKind; title: string; desc: string; agentName: string; audience: string }[] = [
  {
    kind: "past_client",
    title: "Past-client re-engagement",
    desc: "Reach out to clients you've closed with — referrals, anniversaries, market check-ins.",
    agentName: "Past-client nurture",
    audience: "Clients I've closed with at least once.",
  },
  {
    kind: "investor_outreach",
    title: "Investor outreach",
    desc: "Work investor leads — DSCR opportunities, off-market chatter, repeat-buyer rhythms.",
    agentName: "Investor outreach",
    audience: "Investor-side clients in my pipeline.",
  },
  {
    kind: "open_house",
    title: "Open-house follow-up",
    desc: "Same-week nudges to walk-through visitors who didn't book a private showing.",
    agentName: "Open-house follow-up",
    audience: "Buyers who attended my open houses.",
  },
  {
    kind: "review_request",
    title: "Post-close review request",
    desc: "After a deal closes, ask for the review on Google / Zillow that drives your next lead.",
    agentName: "Review request",
    audience: "Clients who closed in the last 90 days.",
  },
];

function SuggestedWorkflows({
  agents,
  onCreate,
  disabled,
}: {
  agents: AiAgentListRow[];
  onCreate: (preset: { name: string; kind: AiAgentKind; audience: string }) => void | Promise<void>;
  disabled: boolean;
}) {
  const haveKinds = new Set(agents.map((a) => a.kind));
  const missing = SUGGESTION_CATALOG.filter((s) => !haveKinds.has(s.kind));
  if (missing.length === 0) return null;
  return (
    <div className="mt">
      <div className="lbl">Suggested workflows</div>
      <div className="sub">
        Standard real-estate workflows you haven&apos;t built yet — one click to draft.
      </div>
      <div className="grid cols-auto mt">
        {missing.map((s) => (
          <Card key={s.kind}>
            <b>{s.title}</b>
            <div className="sub" style={{ margin: "5px 0 10px" }}>
              {s.desc}
            </div>
            <Btn
              disabled={disabled}
              onClick={() =>
                onCreate({ name: s.agentName, kind: s.kind, audience: s.audience })
              }
            >
              <Icon name="plus" size={12} /> Create
            </Btn>
          </Card>
        ))}
      </div>
    </div>
  );
}
