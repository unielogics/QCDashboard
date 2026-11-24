"use client";

import { useState, type FormEvent } from "react";
import { Btn, Input, Select } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useAuthedApi } from "@/hooks/useApi";

export default function RecordMarketingConsent({ email, onSaved }: { email: string; onSaved: () => void }) {
  const api = useAuthedApi();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/admin/email-marketing/consent-evidence", {
        method: "POST",
        body: JSON.stringify({
          email, source: fields.get("source"), reference: fields.get("reference"), locale: fields.get("locale"),
          granted_on: fields.get("granted_on"), confirmed: fields.get("confirmed") === "on",
        }),
      });
      setOpen(false);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save consent. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Btn size="sm" type="button" onClick={() => { setOpen(true); setError(""); }}>Record opt-in</Btn>
    <Drawer width="md" open={open} title="Record existing email consent" sub={email} onClose={() => { if (!busy) setOpen(false); }}>
      <form onSubmit={save} style={{ display: "grid", gap: 15 }}>
        <p>Use a record where this person asked to receive QC financing guides or lending updates at this address.</p>
        <label><span className="lbl">Evidence source</span>
          <Select name="source" required defaultValue=""><option value="" disabled>Choose a source</option>
            <option value="written_request">Written request from the contact</option>
            <option value="signed_form">Signed marketing opt-in form</option>
            <option value="subscription_record">Existing subscription record</option>
          </Select></label>
        <label><span className="lbl">Record reference</span><Input name="reference" required minLength={5} maxLength={300}
          placeholder="Email thread, form ID, or subscription record ID" /></label>
        <label><span className="lbl">Date permission was granted</span><Input type="date" name="granted_on" required /></label>
        <label><span className="lbl">Email language</span><Select name="locale" required defaultValue="">
          <option value="" disabled>Choose a language</option><option value="en">English</option><option value="es">Spanish</option>
        </Select></label>
        <label><input type="checkbox" name="confirmed" required /> I verified this person’s permission in the referenced record.</label>
        {error && <p role="alert">{error}</p>}
        <div><Btn variant="pri" type="submit" disabled={busy}>{busy ? "Saving…" : "Save consent"}</Btn></div>
      </form>
    </Drawer>
  </>;
}
