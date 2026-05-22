"use client";

// AI Agent builder — left rail of 11 steps + the active step's panel.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import { useAiAgent, type StepState } from "@/hooks/useAiAgents";
import { STEP_DEFS, StepPanel } from "./steps";

function StateDot({ state }: { state: StepState }) {
  const { t } = useTheme();
  const color =
    state === "done" ? t.profit : state === "attention" ? t.warn : t.lineStrong;
  return (
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: 999,
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

export default function AiAgentBuilderPage() {
  const { t } = useTheme();
  const params = useParams();
  const router = useRouter();
  const profile = useActiveProfile();
  const id = typeof params.id === "string" ? params.id : null;
  const { data: agent, isLoading } = useAiAgent(id);
  const [active, setActive] = useState("basics");

  useEffect(() => {
    if (profile.role !== Role.BROKER) router.replace("/");
  }, [profile.role, router]);
  if (profile.role !== Role.BROKER) return null;

  if (isLoading || !agent) {
    return (
      <Card pad={20}>
        <span style={{ color: t.ink3, fontSize: 13 }}>Loading AI Agent…</span>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link
          href="/ai-agents"
          style={{ color: t.ink3, display: "inline-flex", alignItems: "center" }}
        >
          <Icon name="arrowL" size={16} />
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: t.ink }}>
          {agent.name}
        </h1>
        <Pill
          color={agent.status === "active" ? t.profit : t.ink3}
          bg={agent.status === "active" ? t.profitBg : t.chip}
        >
          {agent.status.replace(/_/g, " ")}
        </Pill>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* Step rail */}
        <Card pad={10} style={{ width: 240, flexShrink: 0 }}>
          {STEP_DEFS.map((step, i) => {
            const state = (agent.steps?.[step.key] ?? "missing") as StepState;
            const selected = active === step.key;
            return (
              <button
                key={step.key}
                onClick={() => setActive(step.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "9px 10px",
                  borderRadius: 9,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                  background: selected ? t.surface2 : "transparent",
                  color: t.ink,
                }}
              >
                <StateDot state={state} />
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: selected ? 800 : 600,
                    color: selected ? t.ink : t.ink2,
                  }}
                >
                  {i + 1}. {step.label}
                </span>
              </button>
            );
          })}
        </Card>

        {/* Active panel */}
        <Card pad={22} style={{ flex: 1, minWidth: 0 }}>
          <StepPanel stepKey={active} agent={agent} />
        </Card>
      </div>
    </div>
  );
}
