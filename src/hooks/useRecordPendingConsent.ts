"use client";

// Bridge from sign-up to backend audit record.
//
// At sign-up time the user checks the consent box, which writes a
// `qc.pendingLegalConsent` blob to localStorage with the document versions
// they saw + the timestamp they checked the box. We can't POST to the
// backend at that moment because the user isn't authenticated yet.
//
// This hook runs inside AppShell on every mount. As soon as `useCurrentUser`
// resolves to a real user, we flush the pending blob to /legal/accept and
// clear localStorage. The server captures the IP + User-Agent — values the
// client can't forge — so the audit row is suitable for TCPA/GLBA defense.

import { useEffect, useRef } from "react";
import { useAcceptLegal, useCurrentUser } from "./useApi";

const PENDING_CONSENT_KEY = "qc.pendingLegalConsent";

interface PendingConsent {
  terms_version: string;
  privacy_version: string;
  accepted_at: string;
}

export function useRecordPendingConsent() {
  const { data: user } = useCurrentUser();
  const accept = useAcceptLegal();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (!user) return;
    if (typeof window === "undefined") return;

    const raw = window.localStorage.getItem(PENDING_CONSENT_KEY);
    if (!raw) return;

    let parsed: PendingConsent;
    try {
      parsed = JSON.parse(raw);
    } catch {
      window.localStorage.removeItem(PENDING_CONSENT_KEY);
      return;
    }

    fired.current = true;
    accept.mutate(
      { terms_version: parsed.terms_version, privacy_version: parsed.privacy_version },
      {
        onSuccess: () => window.localStorage.removeItem(PENDING_CONSENT_KEY),
        onError: () => {
          // Leave the localStorage entry in place so the next session retries.
          // Reset `fired` so a manual refetch (e.g. after Clerk session
          // hiccups) can try again.
          fired.current = false;
        },
      },
    );
  }, [user, accept]);
}
