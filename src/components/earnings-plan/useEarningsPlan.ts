"use client";

/**
 * A plan session for the screens: the working copy, what the API knows, and the
 * engine's figures for the working copy. The session itself (autosave, the
 * revision check, retries) is lib/earningsPlan/session; this subscribes to it,
 * recomputes the figures when the plan or the baseline changes, and keeps a tab
 * from closing over something that has not been saved.
 */
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { PlanTransport } from "@/lib/earningsPlan/api";
import { evaluate } from "@/lib/earningsPlan/math";
import { PlanSession } from "@/lib/earningsPlan/session";
import type { PlanResult } from "@/lib/earningsPlan/types";

export type { PlanBusy, PlanFacts, SaveStatus } from "@/lib/earningsPlan/session";

export function useEarningsPlan(transport: PlanTransport) {
  const session = useMemo(() => new PlanSession(transport), [transport]);
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  const { body, facts } = state;

  useEffect(() => {
    session.start();
    const warn = (event: BeforeUnloadEvent) => { if (session.unsaved) { event.preventDefault(); event.returnValue = ""; } };
    // A tab sent to the background is the last sure moment to save.
    const hidden = () => { if (document.visibilityState === "hidden" && session.unsaved) void session.flush().catch(() => undefined); };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("visibilitychange", hidden);
      session.dispose();
    };
  }, [session]);

  // The API ignores confirmations given to other source figures; so does the page.
  const counted = useMemo(() => (body && facts?.sourceChanged ? { ...body, source: { ...body.source, confirmations: {} } } : body), [body, facts?.sourceChanged]);
  const baseline = facts?.baseline, questions = facts?.questions;
  const goal = facts?.goal?.status === "set" ? facts.goal.amount : null;
  const result: PlanResult | null = useMemo(
    () => (counted && baseline ? evaluate(counted, baseline, { goal, questions: questions ?? [] }) : null),
    [counted, baseline, goal, questions],
  );

  return {
    ...state, result,
    edit: session.edit, flush: session.flush, reload: session.reload, saveVersion: session.saveVersion,
    resync: session.resync, review: session.review, setGoal: session.setGoal,
  };
}

export type EarningsPlanState = ReturnType<typeof useEarningsPlan>;
