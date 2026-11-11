"use client";

import { useState } from "react";
import { apiBase } from "@/lib/api";
import { clientApiErrorDetail } from "@/lib/clientRoomDocuments";
import { chosenRoomPinProblem } from "@/lib/roomPin";
import { RoomPinFields } from "./RoomPinFields";

/** A generated invitation proves access, but setup must finish before the room opens. */
export function RoomPinSetup({ token, passcode, onSaved }: {
  token: string;
  passcode: string;
  onSaved: (pin: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = chosenRoomPinProblem(pin, confirmation, "en", passcode) === null;
  async function save() {
    const problem = chosenRoomPinProblem(pin, confirmation, "en", passcode);
    if (problem || busy) { if (problem) setError(problem); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`${apiBase}/api/v1/buckets/request/${encodeURIComponent(token)}/passcode`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, new_passcode: pin }),
      });
      if (!response.ok) throw new Error(clientApiErrorDetail(await response.json().catch(() => null), "That PIN could not be saved. Please try again.").message);
      onSaved(pin);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "That PIN could not be saved. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="application-room-section application-room-pin-gate is-required" aria-labelledby="room-pin-title">
    <div className="application-room-section-head"><div><span className="application-room-eyebrow">Secure return access</span><h2 id="room-pin-title">Create your 6-digit PIN</h2><p>Complete this step before continuing to your application, forms and uploads. Your existing file stays together.</p></div></div>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <RoomPinFields pin={pin} confirmation={confirmation} onPinChange={setPin} onConfirmationChange={setConfirmation} disabled={busy} currentPin={passcode} />
      {error ? <div className="application-room-status bad" role="alert">{error}</div> : null}
      <button type="submit" className="application-room-primary" disabled={busy || !ready}>{busy ? "Saving…" : "Save PIN and open my room"}</button>
    </form>
  </section>;
}
