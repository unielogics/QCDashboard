"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthedApi } from "./useApi";
import type { OperatingGoalRead } from "@/lib/operatingGoal";
export function useOperatingPlanGoal(profileId: string, scope: string, enabled = true) {
  const api = useAuthedApi(), liveScope = useRef(scope), sequence = useRef(0), apiRef = useRef(api), busy = useRef(false);
  liveScope.current = scope; apiRef.current = api;
  const [state, setState] = useState<{ scope: string; goal: OperatingGoalRead | null; loading: boolean; error: string; saving: boolean }>({ scope, goal: null, loading: true, error: "", saving: false });
  const [retry, setRetry] = useState(0);
  const intent = useRef<{ signature: string; key: string } | null>(null);
  const invalidate = useCallback(() => { sequence.current += 1; }, []);
  useEffect(() => {
    const id = ++sequence.current, controller = new AbortController(); busy.current = false; intent.current = null;
    setState({ scope, goal: null, loading: enabled, error: "", saving: false });
    if (enabled) void apiRef.current<OperatingGoalRead>(`/application-profiles/${encodeURIComponent(profileId)}/operating-plan/goal`, { signal: controller.signal }).then(goal => { if (!controller.signal.aborted && id === sequence.current && liveScope.current === scope) setState({ scope, goal, loading: false, error: "", saving: false }); }).catch(error => { if (!controller.signal.aborted && id === sequence.current && liveScope.current === scope) setState({ scope, goal: null, loading: false, error: error instanceof Error ? error.message : "The annual NOI goal could not be loaded.", saving: false }); });
    return () => { controller.abort(); invalidate(); };
  }, [profileId, scope, enabled, retry, invalidate]);
  const current = state.scope === scope ? state : { scope, goal: null, loading: true, error: "", saving: false };
  const save = async (amount: number, currency: string) => {
    if (busy.current || !enabled || !current.goal) return null;
    const signature = JSON.stringify({ amount, currency, expected_revision: current.goal.revision });
    if (intent.current?.signature !== signature) intent.current = { signature, key: crypto.randomUUID() };
    const payload = { amount, currency, expected_revision: current.goal.revision, idempotency_key: intent.current.key }, id = ++sequence.current;
    busy.current = true; setState(s => ({ ...s, saving: true, error: "" }));
    try {
      const goal = await apiRef.current<OperatingGoalRead>(`/application-profiles/${encodeURIComponent(profileId)}/operating-plan/goal`, { method: "PUT", body: JSON.stringify(payload) });
      if (id !== sequence.current || liveScope.current !== scope) return null;
      intent.current = null; setState({ scope, goal, loading: false, saving: false, error: "" }); return goal;
    } catch (error) { if (id === sequence.current && liveScope.current === scope) setState(s => ({ ...s, saving: false, error: error instanceof Error ? error.message : "The goal could not be saved. Your entry is retained." })); return null; }
    finally { if (id === sequence.current && liveScope.current === scope) busy.current = false; }
  };
  return { ...current, save, reload: () => setRetry(value => value + 1) };
}
