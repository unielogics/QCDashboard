"use client";

import { useEffect, useRef, useState } from "react";

/** Open a permissioned document without navigating or unmounting its editor. */
export function useDocumentWindow(scope: string) {
  const active = useRef(scope); active.current = scope;
  const pending = useRef<{ controller: AbortController; popup: Window } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setBusy(false); return () => { pending.current?.controller.abort(); pending.current?.popup.close(); pending.current = null; }; }, [scope]);
  const open = async (loadUrl: (signal: AbortSignal) => Promise<string>) => {
    if (pending.current) return;
    const popup = window.open("about:blank", "_blank");
    if (!popup) throw new Error("Allow a new tab for the source document, then try again.");
    popup.opener = null;
    popup.document.title = "Opening source document";
    popup.document.body.textContent = "Preparing the source document…";
    const controller = new AbortController(), request = { controller, popup };
    pending.current = request; setBusy(true);
    try {
      const result = await loadUrl(controller.signal);
      if (controller.signal.aborted || active.current !== scope) { popup.close(); return; }
      if (popup.closed) throw new Error("The source tab was closed. Choose View source again.");
      const url = new URL(result, window.location.origin);
      if (url.protocol !== "https:" && !(url.protocol === "http:" && url.origin === window.location.origin)) throw new Error("The document service returned an invalid link. Try again.");
      popup.location.replace(url.href);
    } catch (error) { popup.close(); if (!controller.signal.aborted && active.current === scope) throw error; }
    finally { if (pending.current === request) { pending.current = null; if (active.current === scope) setBusy(false); } }
  };
  return { open, busy };
}
