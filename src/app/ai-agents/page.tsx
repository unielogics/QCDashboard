"use client";

// AI Agents — the broker's roster of configurable AI workers. Each card
// links into the 11-step builder. Agent-only surface.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import {
  useAiAgents,
  useCreateAiAgent,
  type AiAgentKind,
  type AiAgentListRow,
  type AiAgentStatus,
  type StepStates,
} from "@/hooks/useAiAgents";

const KIND_LABELS: Record<AiAgentKind, string> = {
  buyer_nurture: "Buyer nurture",
  seller_followup: "Seller / listing follow-up",
  past_client: "Past-client re-engagement",
  investor_outreach: "Investor outreach",
  open_house: "Open-house follow-up",
  review_request: "Review request",
  custom: "Custom",
};

const STATUS_TONE: Record<AiAgentStatus, "g" | "a" | "n"> = {
  draft: "n",
  needs_training: "a",
  training_in_progress: "a",
  needs_review: "a",
  ready_to_activate: "a",
  active: "g",
  paused: "a",
  archived: "n",
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
  const { t } = useTheme();
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {STEP_KEYS.map((k) => {
        const s = steps[k] ?? "missing";
        const color =
          s === "done" ? t.profit : s === "attention" ? t.warn : t.line;
        return (
          <span
            key={k}
            title={`${k}: ${s}`}
            style={{
              width: 9,
              height: 9,
              borderRadius: 999,
              background: color,
            }}
          />
        );
      })}
    </div>
  );
}

export default function AiAgentsPage() {
  const { t } = useTheme();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const router = useRouter();
  const { data: agents = [], isLoading } = useAiAgents();
  const create = useCreateAiAgent();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AiAgentKind>("buyer_nurture");

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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: t.ink }}>
            AI Agents
          </h1>
          <p style={{ fontSize: 13, color: t.ink3, margin: "6px 0 0", maxWidth: 560 }}>
            Build trained AI workers for your different workflows — new-deal
            follow-up, past-client nurture, review requests. Each one is
            trained, tested, and pointed at a slice of your pipeline.
          </p>
        </div>
        <button
          style={qcBtnPrimary(t)}
          onClick={() => setCreating((v) => !v)}
        >
          <Icon name="plus" size={15} /> New AI Agent
        </button>
      </div>

      {creating && (
        <Card pad={18}>
          <SectionLabel>Create an AI Agent</SectionLabel>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
            <input
              autoFocus
              placeholder="Agent name — e.g. New-deal follow-up"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                flex: "1 1 280px",
                padding: "9px 12px",
                borderRadius: 10,
                border: `1px solid ${t.lineStrong}`,
                background: t.surface,
                color: t.ink,
                fontSize: 14,
              }}
            />
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as AiAgentKind)}
              style={{
                padding: "9px 12px",
                borderRadius: 10,
                border: `1px solid ${t.lineStrong}`,
                background: t.surface,
                color: t.ink,
                fontSize: 14,
              }}
            >
              {Object.entries(KIND_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <button
              style={qcBtnPrimary(t)}
              disabled={!name.trim() || create.isPending}
              onClick={submit}
            >
              {create.isPending ? "Creating…" : "Create & build"}
            </button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <Card pad={20}>
          <span style={{ color: t.ink3, fontSize: 13 }}>Loading…</span>
        </Card>
      ) : agents.length === 0 ? (
        <Card pad={26}>
          <div style={{ textAlign: "center", color: t.ink3 }}>
            <Icon name="spark" size={26} />
            <p style={{ fontSize: 14, marginTop: 10 }}>
              No AI Agents yet. Start with one of the two real-estate
              starters below — you can edit everything once it's drafted.
            </p>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
              marginTop: 18,
            }}
          >
            {(
              [
                {
                  kind: "buyer_nurture" as AiAgentKind,
                  title: "Buyer-side starter",
                  desc: "Works new buyer leads + buyer searches — first touch through to under-contract.",
                  agentName: "Buyer follow-up",
                  audience: "Buyer leads I've added to my pipeline.",
                },
                {
                  kind: "seller_followup" as AiAgentKind,
                  title: "Seller-side starter",
                  desc: "Works active listings + seller leads — confirmations, listing-prep nudges, offer follow-ups.",
                  agentName: "Listing follow-up",
                  audience: "Seller leads + active listings I'm working.",
                },
              ]
            ).map((preset) => (
              <Card key={preset.kind} pad={16} style={{ cursor: "pointer" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.ink }}>
                  {preset.title}
                </div>
                <div style={{ fontSize: 12.5, color: t.ink3, margin: "6px 0 14px" }}>
                  {preset.desc}
                </div>
                <button
                  style={{ ...qcBtnPrimary(t), width: "100%" }}
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
                </button>
              </Card>
            ))}
          </div>
        </Card>
      ) : (
        <>
          <SuggestedWorkflows
            agents={agents}
            t={t}
            onCreate={async (preset) => {
              const agent = await create.mutateAsync(preset);
              router.push(`/ai-agents/${agent.id}`);
            }}
            disabled={create.isPending}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 14,
            }}
          >
          {agents.map((a) => (
            <Link
              key={a.id}
              href={`/ai-agents/${a.id}`}
              style={{ textDecoration: "none" }}
            >
              <Card pad={18} style={{ cursor: "pointer", height: "100%" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: t.ink }}>
                      {a.name}
                    </div>
                    {a.ai_display_name && (
                      <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>
                        Introduces as {a.ai_display_name}
                      </div>
                    )}
                  </div>
                  <Pill
                    color={
                      STATUS_TONE[a.status] === "g"
                        ? t.profit
                        : STATUS_TONE[a.status] === "a"
                          ? t.warn
                          : t.ink3
                    }
                    bg={
                      STATUS_TONE[a.status] === "g"
                        ? t.profitBg
                        : STATUS_TONE[a.status] === "a"
                          ? t.warnBg
                          : t.chip
                    }
                  >
                    {a.status.replace(/_/g, " ")}
                  </Pill>
                </div>
                <div style={{ fontSize: 12, color: t.ink3, marginTop: 4 }}>
                  {KIND_LABELS[a.kind]}
                </div>
                <div style={{ marginTop: 14 }}>
                  <StepDots steps={a.steps} />
                </div>
                <div style={{ fontSize: 12, color: t.ink3, marginTop: 12 }}>
                  {a.lead_count} contact{a.lead_count === 1 ? "" : "s"} enrolled
                  {a.warmup_mode ? " · warm-up" : ""}
                </div>
              </Card>
            </Link>
          ))}
          </div>
        </>
      )}
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
  t,
  onCreate,
  disabled,
}: {
  agents: AiAgentListRow[];
  t: ReturnType<typeof useTheme>["t"];
  onCreate: (preset: { name: string; kind: AiAgentKind; audience: string }) => void | Promise<void>;
  disabled: boolean;
}) {
  const haveKinds = new Set(agents.map((a) => a.kind));
  const missing = SUGGESTION_CATALOG.filter((s) => !haveKinds.has(s.kind));
  if (missing.length === 0) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <SectionLabel>Suggested workflows</SectionLabel>
      <div style={{ fontSize: 12.5, color: t.ink3, margin: "6px 0 12px" }}>
        Standard real-estate workflows you haven&apos;t built yet — one click to draft.
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        {missing.map((s) => (
          <Card key={s.kind} pad={14}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: t.ink }}>
              {s.title}
            </div>
            <div style={{ fontSize: 12, color: t.ink3, margin: "5px 0 10px" }}>
              {s.desc}
            </div>
            <button
              style={qcBtn(t)}
              disabled={disabled}
              onClick={() =>
                onCreate({ name: s.agentName, kind: s.kind, audience: s.audience })
              }
            >
              <Icon name="plus" size={12} /> Create
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
