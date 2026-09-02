"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { QCMark } from "@/components/QCMark";
import { apiBase } from "@/lib/api";

// One-tap stop for the pre-call prep emails and texts. Reached from the signed
// link in every pre-call email; nothing to sign in to. Meeting confirmations
// and reminders are untouched — only the prep nudges stop.

type State = { ok: boolean; invitee_first: string; host_name: string; starts_at: string | null; stopped: boolean; completed: boolean };

export default function PrepStopPage() {
  const params = useParams<{ notice: string; sig: string }>();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${apiBase}/api/v1/public/prep/${params.notice}/${params.sig}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("This link is no longer valid."))))
      .then((data: State) => setState(data))
      .catch((err: Error) => setError(err.message));
  }, [params.notice, params.sig]);

  async function stop() {
    setBusy(true);
    try {
      const response = await fetch(`${apiBase}/api/v1/public/prep/${params.notice}/${params.sig}/stop`, { method: "POST" });
      if (!response.ok) throw new Error("This link is no longer valid.");
      setState(await response.json());
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  const when = state?.starts_at ? new Date(state.starts_at).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

  return <main className="application-room is-light">
    <div className="application-room-topline" />
    <section className="application-room-gate">
      <div className="application-room-brand"><QCMark size={36} /><div><b>QUALIFIED COMMERCIAL</b><span>Financing & Capital Advisory</span></div></div>
      <div className="application-room-gate-copy">
        <span className="application-room-eyebrow">Pre-call messages</span>
        {error ? <><h1>Link not valid</h1><p>{error}</p></> : null}
        {!error && !state ? <h1>One moment…</h1> : null}
        {state && state.stopped ? <><h1>Stopped</h1><p>You will not get any more “before your call” messages for this booking{when ? ` (${when})` : ""}. Your meeting confirmation and reminders are unaffected.</p></> : null}
        {state && !state.stopped && state.completed ? <><h1>Already done</h1><p>Your checklist is complete, so there is nothing more to send{when ? ` before your call on ${when}` : ""}.</p></> : null}
        {state && !state.stopped && !state.completed ? <><h1>Stop these messages?</h1><p>{state.invitee_first ? `${state.invitee_first}, ` : ""}we send a couple of reminders to finish your secure room before your call{when ? ` on ${when}` : ""} with {state.host_name}. Stopping them keeps your meeting and its reminders as they are.</p></> : null}
      </div>
      {state && !state.stopped && !state.completed ? <button className="application-room-primary" disabled={busy} onClick={() => void stop()}>{busy ? "Stopping…" : "Stop the pre-call messages"}</button> : null}
    </section>
  </main>;
}
