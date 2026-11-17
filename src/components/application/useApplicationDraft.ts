"use client";

// Saves application answers as they are given, one request at a time, against
// the revision the server last returned. Edits made while a save is in flight
// are batched into the next one, so two quick answers never race each other
// into a revision conflict.

import { useCallback, useEffect, useRef, useState } from "react";
import { setAt, type ApplicationView } from "@/lib/reApplication";

export type DraftPayload = { changes: Record<string, unknown>; confirm: string[]; has_coborrower?: boolean | null; revision: number };
export type SaveError = Error & { status?: number; detail?: unknown };

type Pending = { changes: Record<string, unknown>; confirm: string[]; has_coborrower?: boolean };

const EMPTY: Pending = { changes: {}, confirm: [] };

export function useApplicationDraft(view: ApplicationView | null, save: (payload: DraftPayload) => Promise<ApplicationView>, onView: (view: ApplicationView) => void, onConflict: () => void) {
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending>(EMPTY);
  const queued = useRef<Pending>(EMPTY);
  const inFlight = useRef(false);
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);

  const run = useCallback(async () => {
    if (inFlight.current || !viewRef.current) return;
    const batch = queued.current;
    if (!Object.keys(batch.changes).length && !batch.confirm.length && batch.has_coborrower === undefined) return;
    queued.current = EMPTY;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const next = await save({ changes: batch.changes, confirm: batch.confirm, has_coborrower: batch.has_coborrower ?? null, revision: viewRef.current.revision });
      viewRef.current = next;
      onView(next);
      setProblems((current) => {
        const kept = { ...current };
        for (const path of Object.keys(batch.changes)) delete kept[path];
        return kept;
      });
    } catch (caught) {
      const failure = caught as SaveError;
      const detail = failure.detail as { code?: string; fields?: Record<string, string>; message?: string } | undefined;
      if (failure.status === 422 && detail?.fields) {
        setProblems((current) => ({ ...current, ...detail.fields }));
        // Good answers in the same batch are sent again without the refused ones.
        const retry = Object.fromEntries(Object.entries(batch.changes).filter(([path]) => !(path in (detail.fields ?? {}))));
        queued.current = { changes: { ...retry, ...queued.current.changes }, confirm: [...batch.confirm, ...queued.current.confirm], has_coborrower: queued.current.has_coborrower ?? batch.has_coborrower };
      } else if (failure.status === 409 && detail?.code === "revision_conflict") {
        setError("This application changed in another window, so it was reloaded. Check your last answer.");
        onConflict();
      } else {
        setError(detail?.message || failure.message || "Your answer could not be saved. Try again.");
        queued.current = { changes: { ...batch.changes, ...queued.current.changes }, confirm: [...batch.confirm, ...queued.current.confirm], has_coborrower: queued.current.has_coborrower ?? batch.has_coborrower };
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
      setPending({ ...queued.current });
      if (Object.keys(queued.current.changes).length || queued.current.confirm.length || queued.current.has_coborrower !== undefined) {
        void run();
      }
    }
  }, [save, onView, onConflict]);

  const enqueue = useCallback((patch: Partial<Pending>) => {
    queued.current = {
      changes: { ...queued.current.changes, ...(patch.changes ?? {}) },
      confirm: [...queued.current.confirm, ...(patch.confirm ?? [])],
      has_coborrower: patch.has_coborrower ?? queued.current.has_coborrower,
    };
    setPending({ ...queued.current });
    void run();
  }, [run]);

  const body = view ? Object.entries(pending.changes).reduce((acc, [path, value]) => setAt(acc, path, value), view.body) : {};
  if (view && pending.has_coborrower !== undefined) body.has_coborrower = pending.has_coborrower;

  return {
    body,
    problems,
    saving,
    error,
    setValue: (path: string, value: unknown) => enqueue({ changes: { [path]: value } }),
    confirm: (path: string) => enqueue({ confirm: [path] }),
    setCoborrower: (on: boolean) => enqueue({ has_coborrower: on }),
    idle: !saving && !Object.keys(pending.changes).length && !pending.confirm.length && pending.has_coborrower === undefined,
  };
}
