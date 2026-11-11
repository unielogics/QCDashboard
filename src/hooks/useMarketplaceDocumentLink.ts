"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthedApi } from "./useApi";

/** Create the protected tab synchronously, before waiting for the scoped URL. */
export function useMarketplaceDocumentLink(scopeId: string) {
  const api = useAuthedApi(), [busy, setBusy] = useState(false);
  const active = useRef(scopeId); active.current = scopeId;
  const pending = useRef<{ controller: AbortController; popup: Window } | null>(null);
  useEffect(() => { setBusy(false); return () => { pending.current?.controller.abort(); pending.current?.popup.close(); pending.current = null; }; }, [scopeId]);
  const open = async (path: string) => {
    if (pending.current) return;
    const popup = window.open("about:blank", "_blank");
    if (!popup) throw new Error("Allow a new tab for this document, then try again.");
    popup.opener = null;
    popup.document.title = "Opening document"; popup.document.body.textContent = "Preparing the document link…";
    const controller = new AbortController(), request = { controller, popup };
    pending.current = request; setBusy(true);
    try {
      const result = await api<{ url: string }>(path, { method: "POST", signal: controller.signal });
      if (controller.signal.aborted || active.current !== scopeId) return;
      if (popup.closed) throw new Error("The document tab was closed. Select View or Download again.");
      const url = new URL(result.url, window.location.origin);
      if (!["https:", "http:"].includes(url.protocol)) throw new Error("The document service returned an invalid link. Try again.");
      popup.location.replace(url.href);
    } catch (error) { popup.close(); if (!controller.signal.aborted) throw error; }
    finally { if (pending.current === request) { pending.current = null; if (!controller.signal.aborted) setBusy(false); } }
  };
  return { open, busy };
}
