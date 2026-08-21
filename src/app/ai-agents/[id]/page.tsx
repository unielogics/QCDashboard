"use client";

// AI Agent builder — left rail of 11 steps + the active step's panel.

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/design-system/Icon";
import { useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { useAiAgent, type StepState } from "@/hooks/useAiAgents";
import { Card, CellChip, cx } from "@/components/ds";
import { Btn, BuilderStepProvider } from "./ui";
import { STEP_DEFS, StepPanel } from "./steps";

type SaveFn = () => Promise<void>;

function StateDot({ state }: { state: StepState }) {
  const color =
    state === "done"
      ? "var(--ok)"
      : state === "attention"
        ? "var(--warn)"
        : "var(--line2)";
  // Data-derived colour on a class that owns the geometry.
  return <span className="repdot" style={{ background: color }} />;
}

export default function AiAgentBuilderPage() {
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
      <Card>
        <span className="sub">Loading…</span>
      </Card>
    );
  }
  if (me && me.role !== Role.BROKER) return null;

  if (!id) {
    return (
      <Card>
        <span className="sub">Invalid AI Agent link.</span>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <span className="sub">Loading AI Agent…</span>
      </Card>
    );
  }

  if (isError || !agent) {
    return (
      <Card>
        <b>Couldn&apos;t load this AI Agent.</b>
        <p className="sub">
          It may have been removed, or the connection dropped.
        </p>
        <div className="row mt">
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
    <>
      <div className="hd">
        <Link
          href="/ai-agents"
          aria-label="Back to AI Agents"
          // A bare back-chevron on the title baseline — no class owns it.
          style={{ color: "var(--muted)", display: "inline-flex", alignItems: "center" }}
        >
          <Icon name="arrowL" size={16} />
        </Link>
        <h1>{agent.name}</h1>
        <CellChip tone={agent.status === "active" ? "ok" : "mut"}>
          {agent.status.replace(/_/g, " ")}
        </CellChip>
      </div>

      <div className="cg mt">
        {/* Step rail */}
        <Card className="s3">
          {STEP_DEFS.map((step, i) => {
            const state = (agent.steps?.[step.key] ?? "missing") as StepState;
            const selected = active === step.key;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => void goTo(step.key, { save: true })}
                disabled={advancing}
                className={cx("pick", selected && "on")}
                // .pick is authored for a <div>; a <button> needs these three
                // back. `cursor` is only claimed while a save is in flight —
                // otherwise .pick owns it.
                style={{
                  width: "100%",
                  fontFamily: "inherit",
                  textAlign: "left",
                  ...(advancing ? { cursor: "wait" } : {}),
                }}
              >
                <StateDot state={state} />
                <span>
                  {i + 1}. {step.label}
                </span>
              </button>
            );
          })}
        </Card>

        {/* Active panel + step footer */}
        <div className="s9 grid">
          <Card>
            <BuilderStepProvider saveHandlerRef={saveHandlerRef}>
              <StepPanel stepKey={active} agent={agent} />
            </BuilderStepProvider>
          </Card>

          {/* Wizard footer — present on every step */}
          <Card>
            <div className="pagebar">
              <span className="sub">
                Step {activeIdx + 1} of {STEP_DEFS.length}
              </span>
              <span className="spacer" />
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
          </Card>
        </div>
      </div>
    </>
  );
}
