"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, apiBase, ApiError } from "@/lib/api";
import styles from "./SecureSsnPanel.module.css";

export type SsnReceipt = { id: string; person_name: string; last_four: string };
type Person = { id: string; name: string; ssn: string };
type Props = { endpoint: string; pin?: string; session?: string; getToken?: () => Promise<string | null> };

export function requireSecureConnection() {
  if (!window.isSecureContext || new URL(apiBase, window.location.origin).protocol !== "https:") {
    throw new Error("Open the HTTPS portal to share or view Social Security numbers.");
  }
}

function emptyPerson(): Person {
  return { id: crypto.randomUUID(), name: "", ssn: "" };
}

export function SecureSsnPanel({ endpoint, pin, session, getToken }: Props) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<SsnReceipt[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    function leavePage() {
      controller.current?.abort();
      pending.current = false;
      setBusy(false); setOpen(false); setPeople([]); setSaved([]); setConsent(false); setUncertain(false);
      setError(""); setNotice("");
    }
    window.addEventListener("pagehide", leavePage);
    return () => { controller.current?.abort(); window.removeEventListener("pagehide", leavePage); };
  }, []);

  async function send(entries: Person[], signal: AbortSignal) {
    requireSecureConnection();
    return api<SsnReceipt[]>(endpoint, {
      method: "POST", cache: "no-store", signal, referrerPolicy: "no-referrer",
      authToken: getToken ? (await getToken()) ?? undefined : undefined,
      headers: { ...(pin ? { "X-Room-Pin": pin } : {}), ...(session ? { "X-Form-Session": session } : {}) },
      body: JSON.stringify({ authorized: entries.length > 0 && consent, entries: entries.map(row => ({
        id: row.id, person_name: row.name.trim(), ssn: row.ssn,
      })) }),
    });
  }

  async function request(entries: Person[]) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setNotice(""); setError("");
    const { signal } = controller.current = new AbortController();
    try {
      const receipts = await send(entries, signal);
      if (signal.aborted) return;
      setSaved(receipts);
      setUncertain(false);
      setPeople(!receipts.length ? [emptyPerson()] : []);
      setConsent(false);
      setOpen(true);
      if (entries.length) setNotice(entries.length === 1 ? "SSN received." : "SSNs received.");
    } catch (reason) {
      if (signal.aborted) return;
      // A lost response can leave a completed batch on file. Reconcile its immutable
      // IDs before asking the client to retry, without resending the numbers.
      if (entries.length && (!(reason instanceof ApiError) || reason.status === 409 || reason.status >= 500)) {
        try {
          const receipts = await send([], signal);
          if (signal.aborted) return;
          setSaved(receipts);
          if (entries.every(entry => receipts.some(receipt => receipt.id === entry.id))) {
            setPeople([]); setConsent(false); setUncertain(false); setNotice("SSNs received."); return;
          }
          setUncertain(false);
        } catch {
          if (!signal.aborted) { setUncertain(true); setError("Receipt could not be confirmed. Retry this submission to check it safely."); }
          return;
        }
      }
      if (!signal.aborted) setError(reason instanceof Error ? reason.message : "Secure submission is unavailable. Try again.");
    } finally {
      if (!signal.aborted) { pending.current = false; setBusy(false); }
    }
  }

  function edit(id: string, field: "name" | "ssn", value: string) {
    setNotice(""); setError(""); setConsent(false);
    setPeople(current => current.map(row => row.id === id ? { ...row, [field]: value } : row));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (people.length && consent) void request(people);
  }

  function close() {
    setPeople([]); setConsent(false); setOpen(false); setUncertain(false); setError(""); setNotice("");
  }

  return <section className={styles.card} aria-label="Secure SSN sharing" data-private="true">
    <div className={styles.heading}>
      <div><h2>Share a full Social Security number</h2>
        <p>Use this form when your financing team requests a full SSN. You can add a separate line for each borrower, owner, or guarantor.</p></div>
      {!open ? <button type="button" className={styles.action} disabled={busy} onClick={() => void request([])}>{busy ? "Opening…" : "Open secure form"}</button>
        : <button type="button" className={styles.secondary} disabled={busy} onClick={close}>Close</button>}
    </div>
    <p className={styles.safety}>An encrypted connection protects your submission. Each full number is encrypted in storage. Your portal shows only the last four digits. Authorized underwriting staff can reveal a number, and each reveal is recorded.</p>
    {open && saved.length > 0 && <ul className={styles.receipts} aria-label="Received SSNs">
      {saved.map(row => <li key={row.id}><strong>{row.person_name}</strong><span>Received · ending in {row.last_four}</span></li>)}
    </ul>}
    {open && <form onSubmit={submit} autoComplete="off">
      {people.map((row, index) => <fieldset className={styles.row} key={row.id} disabled={busy || uncertain}>
        <legend>Person {index + 1}</legend>
        <label>Full legal name<input required maxLength={120} value={row.name} autoComplete="off" onChange={e => edit(row.id, "name", e.target.value)} /></label>
        <label>Full SSN<input required type="password" inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={11}
          pattern="[0-9]{9}|[0-9]{3}-[0-9]{2}-[0-9]{4}" title="Enter nine digits, with or without hyphens" placeholder="Nine digits"
          data-1p-ignore data-lpignore="true" value={row.ssn} onChange={e => edit(row.id, "ssn", e.target.value)} /></label>
        <button type="button" className={styles.secondary} aria-label={`Remove person ${index + 1}`} onClick={() => { setPeople(current => current.filter(person => person.id !== row.id)); setConsent(false); }}>Remove</button>
      </fieldset>)}
      {saved.length + people.length < 25 && <button className={styles.secondary} type="button" disabled={busy || uncertain} onClick={() => { setPeople(current => [...current, emptyPerson()]); setConsent(false); setNotice(""); }}>+ Add {people.length || saved.length ? "another person" : "a person"}</button>}
      {people.length > 0 && <>
        <label className={styles.consent}><input type="checkbox" required checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} />I am authorized to share each listed person’s SSN with Qualified Commercial for this financing application.</label>
        <button type="submit" className={styles.action} disabled={busy || !consent}>{busy ? "Submitting…" : uncertain ? "Retry submission" : people.length === 1 ? "Submit SSN securely" : "Submit SSNs securely"}</button>
      </>}
    </form>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
