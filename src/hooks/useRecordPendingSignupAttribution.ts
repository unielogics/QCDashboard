"use client";

import { useEffect, useRef } from "react";
import { useCurrentUser, useRecordSignupAttribution } from "./useApi";

export const PENDING_SIGNUP_ATTRIBUTION_KEY = "qc.pendingSignupAttribution";

type PendingSignupAttribution = {
  source: string;
  page?: string;
  program?: string;
  vertical?: string;
  campaign?: string;
  cta?: string;
};

export function useRecordPendingSignupAttribution() {
  const { data: user } = useCurrentUser();
  const record = useRecordSignupAttribution();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !user || typeof window === "undefined") return;
    const raw = window.localStorage.getItem(PENDING_SIGNUP_ATTRIBUTION_KEY);
    if (!raw) return;
    let parsed: PendingSignupAttribution;
    try {
      parsed = JSON.parse(raw) as PendingSignupAttribution;
    } catch {
      window.localStorage.removeItem(PENDING_SIGNUP_ATTRIBUTION_KEY);
      return;
    }
    fired.current = true;
    record.mutate(parsed, {
      onSuccess: () => window.localStorage.removeItem(PENDING_SIGNUP_ATTRIBUTION_KEY),
      onError: () => { fired.current = false; },
    });
  }, [record, user]);
}
