"use client";

import { useEffect } from "react";

const STALE_CHUNK = /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
const KEY = "qc:stale-build-reload-at";
const MIN_GAP_MS = 2 * 60 * 1000;

/** After a deploy, a tab that was open on the previous build asks for chunks that no longer exist
 *  (a 404 on /_next/static/chunks/… during a client-side navigation). Reload once so the tab picks
 *  up the current build instead of dying on a missing file; never more than once every two minutes. */
export default function StaleBuildReload() {
  useEffect(() => {
    const reloadOnce = (reason: string) => {
      try {
        const last = Number(window.sessionStorage.getItem(KEY) || 0);
        if (Date.now() - last < MIN_GAP_MS) return;
        window.sessionStorage.setItem(KEY, String(Date.now()));
      } catch {
        // storage unavailable: still reload once per page life
        if ((window as unknown as { __qcReloaded?: boolean }).__qcReloaded) return;
        (window as unknown as { __qcReloaded?: boolean }).__qcReloaded = true;
      }
      console.warn(`Reloading for the current build after a stale chunk: ${reason}`);
      window.location.reload();
    };
    const onError = (event: ErrorEvent) => {
      const target = event.target as HTMLElement | null;
      const src = target && (target as HTMLScriptElement).src;
      if (src && /\/_next\/static\//.test(src)) {
        reloadOnce(src);
        return;
      }
      if (event.message && STALE_CHUNK.test(event.message)) reloadOnce(event.message);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const text = typeof reason === "string" ? reason : reason && typeof reason === "object" ? `${(reason as { name?: string }).name ?? ""} ${(reason as { message?: string }).message ?? ""}` : "";
      if (STALE_CHUNK.test(text)) reloadOnce(text);
    };
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
