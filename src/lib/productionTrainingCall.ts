// The transport the Production Package uses from the dashboard: the authed
// fetcher, plus the training-file confirm-and-retry. A 409
// training_live_action_confirmation_required on send/remind asks the super
// admin to confirm the real external action, then retries with
// x-qc-training-live-action: confirmed. Lived inside the admin tab while the
// workspace was a tab; the workspace is a page now and the page needs it.

import { useMemo } from "react";
import { useAuthedApi } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";
import type { ApiCall, ApiInit } from "@/production-package/types";

type TrainingLiveAction = {
  code: "training_live_action_confirmation_required";
  action?: string;
  provider?: string;
  recipient?: string | null;
  effect?: string;
};

function trainingLiveAction(err: unknown): TrainingLiveAction | null {
  if (!(err instanceof ApiError) || err.status !== 409 || typeof window === "undefined") return null;
  const detail = (err.body as { detail?: unknown } | null)?.detail;
  if (!detail || typeof detail !== "object") return null;
  const action = detail as Partial<TrainingLiveAction>;
  return action.code === "training_live_action_confirmation_required" ? (action as TrainingLiveAction) : null;
}

function confirmTrainingLiveAction(detail: TrainingLiveAction): boolean {
  const lines = [
    detail.action || "Run live action",
    "",
    detail.provider ? `Provider: ${detail.provider}` : null,
    detail.recipient ? `Recipient: ${detail.recipient}` : null,
    detail.effect ? `Effect: ${detail.effect}` : null,
    "",
    "This is a Training file. Continue with the real external action?",
  ].filter((line): line is string => line !== null);
  return window.confirm(lines.join("\n"));
}

export function useProductionCall(): ApiCall {
  const apiCall = useAuthedApi();
  return useMemo<ApiCall>(() => async <T,>(path: string, init?: ApiInit): Promise<T> => {
    const body = typeof init?.body === "string" ? init.body : init?.body === undefined ? undefined : JSON.stringify(init.body);
    const opts = { method: init?.method, body, headers: init?.headers };
    try {
      return await apiCall<T>(path, opts);
    } catch (err) {
      const liveAction = trainingLiveAction(err);
      if (liveAction && confirmTrainingLiveAction(liveAction)) {
        return apiCall<T>(path, { ...opts, headers: { ...(init?.headers ?? {}), "x-qc-training-live-action": "confirmed" } });
      }
      throw err;
    }
  }, [apiCall]);
}
