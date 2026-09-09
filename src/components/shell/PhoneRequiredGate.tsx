"use client";

// The one-time mobile number. Rendered by AppShell instead of the app for a
// rep, an underwriter or a super admin whose user row has no phone: it prints
// as the relationship manager's phone on both production agreements and it is
// how the desk reaches them, and until now nothing collected it. Saving goes
// through /me/profile, which invalidates /auth/me and lifts the gate.
//
// Reps and underwriters are held here. A super admin gets "Not now" for the
// session: the gate is UI-only, and a super admin who cannot pass it cannot
// reach Team to fix anyone else's.

import { useState } from "react";
import { Btn, Input, PageHeader, Panel, StatusLine, Sub } from "@/components/ds";
import { useCurrentUser, useUpdateProfile } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";

const SKIP_KEY = "qc-phone-gate:not-now";

export function phoneGateSkipped(): boolean {
  try { return window.sessionStorage.getItem(SKIP_KEY) === "1"; } catch { return false; }
}

export function PhoneRequiredGate({ onSkip }: { onSkip?: () => void }) {
  const { data: user } = useCurrentUser();
  const update = useUpdateProfile();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const canSkip = user?.role === Role.SUPER_ADMIN && Boolean(onSkip);

  const submit = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) { setError("Enter a mobile number with at least ten digits."); return; }
    setError("");
    try {
      await update.mutateAsync({ phone: phone.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The number could not be saved.");
    }
  };
  const skip = () => {
    try { window.sessionStorage.setItem(SKIP_KEY, "1"); } catch { /* private window */ }
    onSkip?.();
  };

  return (
    <div className="bareshell" style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px" }}>
      <div className="grid" style={{ width: "min(560px, 100%)" }}>
        <div>
          <PageHeader title="Your mobile number" />
          <Sub>
            Once. It prints as the relationship manager&apos;s phone on production agreements you are named on,
            and it is how the desk reaches you. You can change it later under Profile → Your contact details.
          </Sub>
        </div>
        <Panel>
          <div className="grid g10">
            <label className="grid g4">
              <span className="lbl">Mobile number</span>
              <Input value={phone} inputMode="tel" autoComplete="tel" placeholder="(973) 555-0148" autoFocus
                onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} />
            </label>
            {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
            <div className="row end" style={{ gap: 8 }}>
              {canSkip ? <Btn onClick={skip} disabled={update.isPending}>Not now</Btn> : null}
              <Btn variant="pri" onClick={submit} disabled={update.isPending}>{update.isPending ? "Saving…" : "Save and continue"}</Btn>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
