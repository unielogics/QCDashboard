"use client";

// AI Agent builder — left rail of 11 steps + the active step's panel.

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { useAiAgent, type StepState } from "@/hooks/useAiAgents";
import { Btn, BuilderStepProvider } from "./ui";
import { STEP_DEFS, StepPanel } from "./steps";

type SaveFn = () => Promise<void>;

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
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const id = typeof params.id === "string" ? params.id : null;
  const { data: agent, isLoading, isError, refetch } = useAiAgent(id);
  const [active, setActive] = useState("basics");
  const [advancing, setAdvancing] = useState(false);
  // The currently-mounted step panel registers its save handler here
  // (see ui.tsx → useRegisterSave). Panels with nothing to save use
  // an async no-op.
  const saveHandlerRef = useRef<SaveFn | null>(null);

  const activeIdx = STEP_DEFS.findIndex((s) => s.key === active);
  const isFirst = activeIdx <= 0;
  const isLast = activeIdx >= STEP_DEFS.length - 1;

  const runSave = async () => {
    if (!saveHandlerRef.current) return;
    try {
      await saveHandlerRef.current();
    } catch (e) {
      // Don't block navigation on a per-panel save error — the panels
      // surface their own error UI.
      console.warn("Step save failed:", e);
    }
  };

  const goTo = async (key: string, opts: { save?: boolean } = {}) => {
    if (key === active) return;
    setAdvancing(true);
    if (opts.save) await runSave();
    setActive(key);
    setAdvancing(false);
  };

  const onPrev = () => {
    if (isFirst) return;
    void goTo(STEP_DEFS[activeIdx - 1].key);
  };
  const onSaveNext = () => {
    if (isLast) return;
    void goTo(STEP_DEFS[activeIdx + 1].key, { save: true });
  };

  // Only redirect once we KNOW the signed-in user isn't an agent —
  // never on the pre-/auth/me fallback (which would bounce a real
  // broker mid-load).
  useEffect(() => {
    if (!meLoading && me && me.role !== Role.BROKER) router.replace("/");
  }, [meLoading, me, router]);

  if (meLoading) {
    return (
      <Card pad={20}>
        <span style={{ color: t.ink3, fontSize: 13 }}>Loading…</span>
      </Card>
    );
  }
  if (me && me.role !== Role.BROKER) return null;

  if (!id) {
    return (
      <Card pad={20}>
        <span style={{ color: t.ink3, fontSize: 13 }}>Invalid AI Agent link.</span>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card pad={20}>
        <span style={{ color: t.ink3, fontSize: 13 }}>Loading AI Agent…</span>
      </Card>
    );
  }

  if (isError || !agent) {
    return (
      <Card pad={22}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.ink }}>
          Couldn&apos;t load this AI Agent.
        </div>
        <p style={{ fontSize: 13, color: t.ink3, margin: "6px 0 14px" }}>
          It may have been removed, or the connection dropped.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="primary" onClick={() => refetch()}>
            Retry
          </Btn>
          <Link href="/ai-agents" style={{ textDecoration: "none" }}>
            <Btn>Back to AI Agents</Btn>
          </Link>
        </div>
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
                onClick={() => void goTo(step.key, { save: true })}
                disabled={advancing}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "9px 10px",
                  borderRadius: 9,
                  border: "none",
                  cursor: advancing ? "wait" : "pointer",
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

        {/* Active panel + step footer */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <Card pad={22}>
            <BuilderStepProvider saveHandlerRef={saveHandlerRef}>
              <StepPanel stepKey={active} agent={agent} />
            </BuilderStepProvider>
          </Card>

          {/* Wizard footer — present on every step */}
          <Card pad={14}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: 12.5, color: t.ink3, fontWeight: 600 }}>
                Step {activeIdx + 1} of {STEP_DEFS.length}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn onClick={onPrev} disabled={isFirst || advancing}>
                  <Icon name="arrowL" size={13} /> Previous
                </Btn>
                {!isLast && (
                  <Btn
                    variant="primary"
                    onClick={onSaveNext}
                    disabled={advancing}
                  >
                    {advancing ? "Saving…" : "Save & next"}{" "}
                    <Icon name="arrowR" size={13} />
                  </Btn>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
