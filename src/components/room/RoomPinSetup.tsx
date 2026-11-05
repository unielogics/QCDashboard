"use client";

import { useState } from "react";
import { apiBase } from "@/lib/api";
import { isValidRoomPin, normalizeRoomPin } from "@/lib/clientRoomDocuments";

// The client chooses their own six-digit room PIN.
//
// Every room is born with a generated PIN that travels to the client by text
// or a separate email, and a client handed into the room from their intake
// never even sees it: the link carries the code. The next time they open the
// room they have nothing to type. This step replaces the generated code with
// one they chose, held to the same rules on both sides (six digits, nothing
// trivial, not the one we sent). It is required the first time they arrive
// with the code in hand, and offered until they do it otherwise.

export function RoomPinSetup({ token, passcode, required, onSaved, onDismiss }: {
  token: string;
  /** The PIN the room was opened with; it proves the request is the client's. */
  passcode: string;
  required: boolean;
  onSaved: (pin: string) => void;
  onDismiss: () => void;
}) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready = isValidRoomPin(pin) && pin === confirm;

  async function save() {
    if (!isValidRoomPin(pin)) { setError("Choose six digits."); return; }
    if (pin !== confirm) { setError("The two entries do not match."); return; }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${apiBase}/api/v1/buckets/request/${token}/passcode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, new_passcode: pin }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { detail?: unknown } | null;
        throw new Error(typeof payload?.detail === "string" ? payload.detail : "That PIN could not be saved. Please try again.");
      }
      onSaved(pin);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That PIN could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <section className={`application-room-section application-room-pin-gate${required ? " is-required" : ""}`} aria-labelledby="room-pin-title">
    <div className="application-room-section-head">
      <div>
        <span className="application-room-eyebrow">Your room PIN</span>
        <h2 id="room-pin-title">{required ? "Create your 6-digit PIN" : "Choose a PIN you'll remember"}</h2>
        <p>{required
          ? "You'll use it every time you open this room, so pick six digits you'll remember. Nobody at Qualified Commercial will ask you for it."
          : "We sent you a generated PIN. Replace it with six digits of your own; you'll use it every time you open this room."}</p>
      </div>
    </div>
    <div className="application-room-pin-row">
      <input inputMode="numeric" maxLength={6} placeholder="New 6-digit PIN" aria-label="New 6-digit PIN" autoComplete="new-password" value={pin} onChange={(event) => setPin(normalizeRoomPin(event.target.value))} disabled={busy} />
      <input inputMode="numeric" maxLength={6} placeholder="Confirm PIN" aria-label="Confirm PIN" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(normalizeRoomPin(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter" && ready) void save(); }} disabled={busy} />
      <button type="button" className="application-room-primary" disabled={busy || !ready} onClick={() => void save()}>{busy ? "Saving..." : required ? "Save PIN and open my room" : "Save PIN"}</button>
      {!required ? <button type="button" className="application-room-secondary" disabled={busy} onClick={onDismiss}>Keep the one you sent</button> : null}
    </div>
    {error ? <div className="application-room-status bad" role="alert">{error}</div> : null}
    <span className="application-room-note">After saving, use your new PIN whenever you come back to this room.</span>
  </section>;
}
