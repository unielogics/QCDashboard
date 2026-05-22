"use client";

// AI Agents — the broker's roster of configurable AI workers. Each card
// links into the 11-step builder. Agent-only surface.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtnPrimary } from "@/components/design-system/buttons";
import { useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import {
  useAiAgents,
  useCreateAiAgent,
  type AiAgentKind,
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
        <Card pad={28}>
          <div style={{ textAlign: "center", color: t.ink3 }}>
            <Icon name="spark" size={26} />
            <p style={{ fontSize: 14, marginTop: 10 }}>
              No AI Agents yet. Create your first one to get started.
            </p>
          </div>
        </Card>
      ) : (
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
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.ink }}>
                    {a.name}
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
      )}
    </div>
  );
}
