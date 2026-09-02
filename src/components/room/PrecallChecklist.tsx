"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { RoomActions } from "@/components/room/RoomActions";
import { apiBase } from "@/lib/api";

// The "Before your call" tab of the secure room. Three steps in the order the
// desk needs them: who owns the business (the only mandatory minimum), the
// business bank (Plaid, reusing the room's own connect block), and a soft
// credit authorization per 20%+ owner. Everything else in the room stays
// optional. Styling: bare route, so it uses the room's own `application-room-*`
// classes rather than the app shell.

export type RoomOwner = {
  id: string; first_name: string; last_name: string; ownership_pct: number | null; is_primary: boolean;
  required: boolean; has_email: boolean; has_phone: boolean; credit_status: string; editable: boolean;
};
export type RoomPrecall = {
  enabled: boolean; starts_at: string | null; host_name: string | null; business_name: string | null;
  passcode_needs_setup: boolean; ownership_complete: boolean; ownership_total: number; contact_complete: boolean;
  owners: RoomOwner[]; max_owners: number; credit_threshold_pct: number; bank_complete: boolean; bank_detail: string;
  credit_complete: boolean; credit_required: number; credit_done: number; complete: boolean; done_count: number; completed_at: string | null;
};

type OwnerDraft = { first_name: string; last_name: string; ownership_pct: string; email: string; phone: string };
const EMPTY_OWNER: OwnerDraft = { first_name: "", last_name: "", ownership_pct: "", email: "", phone: "" };

export function PrecallChecklist({ token, passcode, precall, onChanged, onGoToDocuments }: {
  token: string; passcode: string; precall: RoomPrecall; onChanged: () => Promise<void> | void; onGoToDocuments: () => void;
}) {
  const [status, setStatus] = useState<{ tone: "ok" | "bad" | ""; text: string }>({ tone: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<OwnerDraft>(EMPTY_OWNER);
  const [adding, setAdding] = useState(false);
  const [consentTabOpen, setConsentTabOpen] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [pinDismissed, setPinDismissed] = useState(false);

  const call = useCallback(async (path: string, method: string, body: Record<string, unknown>) => {
    const res = await fetch(`${apiBase}/api/v1/dealer-os/public/room/${token}${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode, ...body }) });
    if (!res.ok) { const payload = await res.json().catch(() => null) as { detail?: string } | null; throw new Error(payload?.detail || "That did not work. Please try again."); }
    return res.status === 204 ? null : res.json();
  }, [token, passcode]);

  // While an authorization tab is open on audit.*, poll so the step turns green
  // without the client having to refresh.
  useEffect(() => {
    if (!consentTabOpen || precall.credit_complete) return;
    const id = window.setInterval(() => { void onChanged(); }, 15000);
    return () => window.clearInterval(id);
  }, [consentTabOpen, precall.credit_complete, onChanged]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true); setStatus({ tone: "", text: "" });
    try { await fn(); await onChanged(); setStatus({ tone: "ok", text: label }); }
    catch (error) { setStatus({ tone: "bad", text: error instanceof Error ? error.message : "That did not work." }); }
    finally { setBusy(false); }
  }

  function startEdit(owner: RoomOwner) {
    setAdding(false); setEditing(owner.id);
    setDraft({ first_name: owner.first_name, last_name: owner.last_name, ownership_pct: owner.ownership_pct == null ? "" : String(owner.ownership_pct), email: "", phone: "" });
  }
  function ownerBody(): Record<string, unknown> {
    const pct = draft.ownership_pct.trim() === "" ? null : Number(draft.ownership_pct);
    const body: Record<string, unknown> = { first_name: draft.first_name.trim(), last_name: draft.last_name.trim(), ownership_pct: pct };
    if (draft.email.trim()) body.email = draft.email.trim();
    if (draft.phone.trim()) body.phone = draft.phone.trim();
    return body;
  }
  const requiresContact = Number(draft.ownership_pct || 0) >= precall.credit_threshold_pct;

  const when = precall.starts_at ? new Date(precall.starts_at).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  const total = precall.ownership_total;
  const creditLocked = !(precall.ownership_complete && precall.contact_complete);
  const requiredOwners = precall.owners.filter((owner) => owner.required);

  return <section className="application-room-section application-room-precall">
    <div className="application-room-section-head">
      <div>
        <span className="application-room-eyebrow">Before your call{when ? ` · ${when}` : ""}{precall.host_name ? ` with ${precall.host_name}` : ""}</span>
        <h2>{precall.complete ? "You're all set" : `${precall.done_count} of 3 done`}</h2>
        <p>{precall.complete ? "Everything is on your file. See you on the call." : `About 10 minutes. Doing this first lets ${precall.host_name || "your advisor"} talk real numbers instead of estimates.`}</p>
      </div>
    </div>

    {precall.passcode_needs_setup && !pinDismissed ? <div className="application-room-card application-room-pin-setup">
      <div><b>Choose a PIN you'll remember</b><p>We sent you a generated PIN. Replace it with six digits of your own — you'll use it every time you open this room.</p></div>
      <div className="application-room-pin-row">
        <input inputMode="numeric" maxLength={6} placeholder="New 6-digit PIN" value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 6))} />
        <button className="application-room-primary" disabled={busy || newPin.length !== 6} onClick={() => void run("Your PIN is updated. Use it next time you open the room.", async () => { await call("/passcode", "POST", { new_passcode: newPin }); setNewPin(""); })}>Save PIN</button>
        <button className="application-room-secondary" disabled={busy} onClick={() => setPinDismissed(true)}>Keep the one you sent</button>
      </div>
      <span className="application-room-note">Note: after saving, use your new PIN for any further changes in this visit.</span>
    </div> : null}

    <ol className="application-room-steps">
      <li className={precall.ownership_complete && precall.contact_complete ? "done" : "open"}>
        <header><span className="application-room-step-num"><Icon name={precall.ownership_complete && precall.contact_complete ? "check" : "user"} size={14} /></span><div><b>Who owns {precall.business_name || "the business"}?</b><small>Everyone with a share, totalling 100%. Owners with {precall.credit_threshold_pct}% or more also need an email and mobile number for their own credit authorization.</small></div><span className="application-room-step-meta">{total.toFixed(2)}% / 100%</span></header>
        <div className="application-room-owners">
          {precall.owners.map((owner) => <div key={owner.id} className="application-room-owner">
            <div>
              <b>{owner.first_name} {owner.last_name}{owner.is_primary ? <span className="application-room-tag">you</span> : null}</b>
              <small>{owner.ownership_pct == null ? "Ownership % not set" : `${owner.ownership_pct}%`}{owner.required ? ` · ${owner.has_email && owner.has_phone ? "contact on file" : "needs email and mobile"}` : ""}</small>
            </div>
            {editing === owner.id ? null : <div className="application-room-owner-actions">
              {owner.editable ? <button className="application-room-link" disabled={busy} onClick={() => startEdit(owner)}>Edit</button> : <span className="application-room-note">Locked — credit authorization in progress</span>}
              {owner.editable && !owner.is_primary ? <button className="application-room-link danger" disabled={busy} onClick={() => void run("Owner removed.", () => call(`/owners/${owner.id}`, "DELETE", {}))}>Remove</button> : null}
            </div>}
            {editing === owner.id ? <OwnerForm draft={draft} setDraft={setDraft} requiresContact={requiresContact} busy={busy} submitLabel="Save"
              onCancel={() => setEditing(null)}
              onSubmit={() => void run("Saved.", async () => { await call(`/owners/${owner.id}`, "PATCH", ownerBody()); setEditing(null); })} /> : null}
          </div>)}
          {adding ? <OwnerForm draft={draft} setDraft={setDraft} requiresContact={requiresContact} busy={busy} submitLabel="Add owner"
            onCancel={() => setAdding(false)}
            onSubmit={() => void run("Owner added.", async () => { await call("/owners", "POST", ownerBody()); setAdding(false); setDraft(EMPTY_OWNER); })} /> : null}
          {!adding && precall.owners.length < precall.max_owners ? <button className="application-room-secondary" disabled={busy} onClick={() => { setEditing(null); setDraft(EMPTY_OWNER); setAdding(true); }}><Icon name="plus" size={14} />Add another owner</button> : null}
          {!precall.ownership_complete && precall.owners.some((owner) => owner.ownership_pct != null) ? <span className="application-room-note">The percentages need to add up to exactly 100%.</span> : null}
        </div>
      </li>

      <li className={precall.bank_complete ? "done" : "open"}>
        <header><span className="application-room-step-num"><Icon name={precall.bank_complete ? "check" : "building"} size={14} /></span><div><b>Connect the business bank</b><small>{precall.bank_complete ? precall.bank_detail || "Connected" : "Read-only, through Plaid. Use the company's operating account login, not a personal one."}</small></div></header>
        {!precall.bank_complete ? <div className="application-room-step-body">
          <RoomActions token={token} passcode={passcode} view="banking" onChanged={() => { void onChanged(); }} />
          <button className="application-room-link" onClick={onGoToDocuments}>Upload bank statements instead</button>
        </div> : null}
      </li>

      <li className={precall.credit_complete ? "done" : creditLocked ? "locked" : "open"}>
        <header><span className="application-room-step-num"><Icon name={precall.credit_complete ? "check" : creditLocked ? "lock" : "shield"} size={14} /></span><div><b>Authorize a soft credit check</b><small>{creditLocked ? "Finish the owners list first." : "No impact on your score. Each owner with 20% or more authorizes their own; we send the others their own private link."}</small></div><span className="application-room-step-meta">{precall.credit_done} / {precall.credit_required || "–"}</span></header>
        {!creditLocked && !precall.credit_complete ? <div className="application-room-step-body application-room-credit">
          {requiredOwners.map((owner) => <div key={owner.id} className="application-room-owner">
            <div><b>{owner.first_name} {owner.last_name}</b><small>{creditLabel(owner.credit_status)}</small></div>
            {owner.credit_status === "done" || owner.credit_status === "declined" ? null : <button className="application-room-primary" disabled={busy} onClick={() => void run(owner.is_primary ? "Authorization form opened in a new tab." : `Link sent to ${owner.first_name}.`, async () => {
              const result = await call(`/owners/${owner.id}/credit-link`, "POST", {}) as { mode: "self" | "sent"; path?: string; detail?: string };
              if (result.mode === "self" && result.path) {
                const returnTo = encodeURIComponent(`${window.location.origin}/buckets/request/${token}?tab=precall`);
                window.open(`${auditOrigin()}${result.path}&return=${returnTo}`, "_blank", "noopener");
                setConsentTabOpen(true);
              }
            })}>{owner.is_primary ? (owner.credit_status === "sent" ? "Open my authorization again" : "I'm " + owner.first_name + " — authorize now") : (owner.credit_status === "sent" ? `Resend ${owner.first_name}'s link` : `Send ${owner.first_name} their link`)}</button>}
          </div>)}
          {consentTabOpen ? <span className="application-room-note">Waiting for the authorization to complete — this updates on its own.</span> : null}
        </div> : null}
      </li>
    </ol>
    {status.text ? <div className={`application-room-status ${status.tone}`}>{status.text}</div> : null}
  </section>;
}

function OwnerForm({ draft, setDraft, requiresContact, busy, submitLabel, onCancel, onSubmit }: {
  draft: OwnerDraft; setDraft: (next: OwnerDraft) => void; requiresContact: boolean; busy: boolean; submitLabel: string; onCancel: () => void; onSubmit: () => void;
}) {
  const valid = draft.first_name.trim() && draft.last_name.trim() && (draft.ownership_pct === "" || (Number(draft.ownership_pct) >= 0 && Number(draft.ownership_pct) <= 100));
  return <div className="application-room-owner-form">
    <label className="application-room-field"><span>First name</span><input value={draft.first_name} onChange={(event) => setDraft({ ...draft, first_name: event.target.value })} /></label>
    <label className="application-room-field"><span>Last name</span><input value={draft.last_name} onChange={(event) => setDraft({ ...draft, last_name: event.target.value })} /></label>
    <label className="application-room-field"><span>Ownership %</span><input inputMode="decimal" value={draft.ownership_pct} onChange={(event) => setDraft({ ...draft, ownership_pct: event.target.value.replace(/[^0-9.]/g, "") })} placeholder="e.g. 50" /></label>
    {requiresContact ? <>
      <label className="application-room-field"><span>Personal email</span><input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="For their own credit authorization link" /></label>
      <label className="application-room-field"><span>Mobile</span><input inputMode="tel" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
    </> : null}
    <div className="application-room-owner-form-actions">
      <button className="application-room-primary" disabled={busy || !valid} onClick={onSubmit}>{submitLabel}</button>
      <button className="application-room-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}

function creditLabel(status: string) {
  switch (status) {
    case "done": return "Authorized ✓";
    case "sent": return "Link sent — waiting";
    case "declined": return "Declined — your advisor will follow up";
    case "failed": return "Could not complete — we'll sort it on the call";
    default: return "Not started";
  }
}

function auditOrigin() {
  if (typeof window !== "undefined" && window.location.hostname.startsWith("app.")) return window.location.origin.replace("//app.", "//audit.");
  return process.env.NEXT_PUBLIC_AUDIT_APP_URL || "https://audit.qualifiedcommercial.com";
}
