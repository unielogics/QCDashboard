"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/lib/api";
import { requireSecureConnection, type SsnReceipt } from "@/components/room/SecureSsnPanel";

export function FileSsnPanel({ profileId }: { profileId: string }) {
  const { getToken } = useAuth();
  const [rows, setRows] = useState<SsnReceipt[] | null>(null);
  const [shown, setShown] = useState<{ id: string; ssn: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const path = `/secure-ssns/files/${profileId}`;

  function hide() {
    request.current?.abort();
    clearTimeout(timer.current);
    setShown(null);
    setBusy(false);
  }

  useEffect(() => {
    const visibility = () => { if (document.hidden) hide(); };
    window.addEventListener("blur", hide);
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      request.current?.abort(); clearTimeout(timer.current);
      window.removeEventListener("blur", hide);
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  async function load(id?: string) {
    hide(); setError(""); setBusy(true);
    const { signal } = request.current = new AbortController();
    try {
      requireSecureConnection();
      const options = { authToken: (await getToken()) ?? undefined, cache: "no-store" as const, signal };
      if (id) {
        const result = await api<{ ssn: string }>(`${path}/${id}/reveal`, { ...options, method: "POST" });
        if (!signal.aborted && !document.hidden) {
          setShown({ id, ssn: result.ssn });
          timer.current = setTimeout(hide, 30_000);
        }
      } else {
        const result = await api<SsnReceipt[]>(path, options);
        if (!signal.aborted) setRows(result);
      }
    } catch (reason) {
      if (!signal.aborted) setError(reason instanceof Error ? reason.message : "SSNs could not be opened.");
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  return <section className="grid g8" aria-label="Client-shared SSNs" data-private="true">
    <strong>Client-shared SSNs</strong>
    {rows === null ? <button className="btn" type="button" disabled={busy} onClick={() => void load()}>View masked entries</button> : <>
      {rows.length === 0 && <span className="sub">No full SSNs shared yet.</span>}
      {rows.length > 0 && <span className="sub">Each reveal is logged and hides after 30 seconds.</span>}
      {rows.map(row => <div key={row.id} className="grid g4">
        <span>{row.person_name}</span>
        <span data-private="true">{shown?.id === row.id ? shown.ssn.replace(/^(...)(..)(....)$/, "$1-$2-$3") : `•••-••-${row.last_four}`}</span>
        <button className="btn" type="button" disabled={busy} aria-label={`${shown?.id === row.id ? "Hide" : "Reveal"} SSN for ${row.person_name}`} onClick={() => shown?.id === row.id ? hide() : void load(row.id)}>{shown?.id === row.id ? "Hide" : "Reveal SSN"}</button>
      </div>)}
      <button className="btn" type="button" onClick={() => { hide(); setRows(null); setError(""); }}>Close SSN list</button>
    </>}
    {error && <span role="alert">{error}</span>}
  </section>;
}
