"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCurrentUser } from "@/hooks/useApi";
import { fileWorkspaceHref, isFileWorkspaceSaved, type FileWorkspaceRequest, type FileWorkspaceSaved, type FileWorkspaceTool } from "@/lib/fileWorkspace";
import styles from "./FileWorkspaceContext.module.css";

type Scope = { intakeId: string; profileId?: string | null; pageMode: boolean; tool?: FileWorkspaceTool };
type Context = Scope & { href: (request: FileWorkspaceRequest) => string; saved: () => void; registerExit: (guard: () => Promise<void>) => () => void; exit: () => Promise<boolean> };
const WorkspaceContext = createContext<Context | null>(null);
export const FILE_WORKSPACE_CHANNEL = "qc-file-workspaces-v1";
export function FileWorkspaceProvider({ value, children }: { value: Scope; children: ReactNode }) {
  const staff = useCurrentUser(), staffId = staff.data?.id, authScope = staff.authReady !== false ? staff.authScope ?? staffId ?? null : null;
  const scope = `${authScope ?? ""}:${value.intakeId}:${value.profileId ?? ""}`;
  const current = useRef(scope); current.current = scope;
  const [notice, setNotice] = useState(false), channel = useRef<BroadcastChannel | null>(null);
  const exitGuard = useRef<(() => Promise<void>) | null>(null);
  const registerExit = useCallback((guard: () => Promise<void>) => { exitGuard.current = guard; return () => { if (exitGuard.current === guard) exitGuard.current = null; }; }, []);
  const exit = useCallback(async () => { const captured = scope; try { await exitGuard.current?.(); return current.current === captured; } catch { return false; } }, [scope]);
  useEffect(() => {
    setNotice(false);
    if (!authScope || !staffId || typeof BroadcastChannel === "undefined") return;
    const opened = new BroadcastChannel(FILE_WORKSPACE_CHANNEL), seen = new Set<string>(); channel.current = opened;
    opened.onmessage = event => {
      const row: unknown = event.data;
      if (current.current !== scope || !isFileWorkspaceSaved(row) || row.authScope !== authScope || row.intakeId !== value.intakeId || value.profileId && row.profileId !== value.profileId || seen.has(row.eventId)) return;
      seen.add(row.eventId); if (seen.size > 100) seen.clear(); setNotice(true);
    };
    return () => { opened.close(); if (channel.current === opened) channel.current = null; };
  }, [authScope, scope, staffId, value.intakeId, value.profileId]);
  const saved = useCallback(() => {
    if (!authScope || !value.profileId || !value.tool || current.current !== scope) return;
    const message: FileWorkspaceSaved = { version: 1, type: "saved", eventId: crypto.randomUUID(), intakeId: value.intakeId, profileId: value.profileId, authScope, tool: value.tool };
    channel.current?.postMessage(message);
  }, [authScope, scope, value.intakeId, value.profileId, value.tool]);
  const href = useCallback((request: FileWorkspaceRequest) => fileWorkspaceHref(value.intakeId, request), [value.intakeId]);
  const context = useMemo(() => ({ intakeId: value.intakeId, profileId: value.profileId, pageMode: value.pageMode, tool: value.tool, href, saved, registerExit, exit }), [value.intakeId, value.profileId, value.pageMode, value.tool, href, saved, registerExit, exit]);
  return <WorkspaceContext.Provider value={context}>{notice ? <div className={styles.notice} role="status"><strong>Changes were saved in another tab.</strong><p>This tab and its drafts are unchanged.</p><div className={styles.actions}><a className="btn btn-sm" href={`/files/${encodeURIComponent(value.intakeId)}`} target="_blank" rel="noopener noreferrer">Refresh file in a new tab</a><button type="button" className="btn btn-sm" onClick={() => setNotice(false)}>Dismiss</button></div></div> : null}{children}</WorkspaceContext.Provider>;
}
export const useFileWorkspace = () => useContext(WorkspaceContext);
export function useFileWorkspaceDirty(dirty: boolean, busy = false) {
  const workspace = useFileWorkspace();
  useEffect(() => { if (!workspace?.pageMode) return; const warn = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ""; } }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [workspace?.pageMode, dirty, busy]);
}
export function FileWorkspaceBackLink() {
  const context = useFileWorkspace();
  if (!context) return null;
  const href = `/files/${encodeURIComponent(context.intakeId)}`;
  return <a className="btn btn-sm" href={href} onClick={event => { event.preventDefault(); void context.exit().then(ok => { if (ok) window.location.assign(href); }); }}>Back to file</a>;
}
export function FileWorkspaceLink({ children, className = "btn btn-sm", disabled, ...request }: FileWorkspaceRequest & { children: ReactNode; className?: string; disabled?: boolean }) {
  const context = useFileWorkspace();
  if (!context) return null;
  return <a className={className} href={disabled ? undefined : context.href(request)} target="_blank" rel="noopener noreferrer" aria-disabled={disabled || undefined}>{children}</a>;
}
