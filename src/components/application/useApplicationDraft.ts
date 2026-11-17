"use client";

// Saves application answers as they are given, one request at a time, against
// the revision the server last returned. Edits made while a save is in flight
// are batched into the next one, so two quick answers never race each other
// into a revision conflict.
//
// A save that fails is never retried in a tight loop. An answer the server
// refuses for good (signing has started, the link cannot edit) is shown and
// dropped; a session that ended sends the person back to the code; a dropped
// connection or a busy server is tried again a few times, a little later each
// time, and then waits for the person.

import { useCallback, useEffect, useRef, useState } from "react";
import { setAt, type ApplicationView } from "@/lib/reApplication";

export type DraftPayload = { changes: Record<string, unknown>; confirm: string[]; has_coborrower?: boolean | null; revision: number };
export type SaveError = Error & { status?: number; detail?: unknown };

type Pending = { changes: Record<string, unknown>; confirm: string[]; has_coborrower?: boolean };

const EMPTY: Pending = { changes: {}, confirm: [] };
const RETRY_AFTER_MS = [2_000, 5_000, 15_000, 30_000];
const waiting = (batch: Pending) => Object.keys(batch.changes).length > 0 || batch.confirm.length > 0 || batch.has_coborrower !== undefined;

export function useApplicationDraft(view: ApplicationView | null, save: (payload: DraftPayload) => Promise<ApplicationView>, onView: (view: ApplicationView) => void, onConflict: () => void, onAuthLost?: () => void) {
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending>(EMPTY);
  const queued = useRef<Pending>(EMPTY);
  const inFlight = useRef(false);
  const viewRef = useRef(view);
  const attempts = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const run = useCallback(async () => {
    if (inFlight.current || !viewRef.current) return;
    const batch = queued.current;
    if (!waiting(batch)) return;
    queued.current = EMPTY;
    inFlight.current = true;
    setSaving(true);
    setError("");
    let later = false;
    try {
      const next = await save({ changes: batch.changes, confirm: batch.confirm, has_coborrower: batch.has_coborrower ?? null, revision: viewRef.current.revision });
      viewRef.current = next;
      attempts.current = 0;
      onView(next);
      setProblems((current) => {
        const kept = { ...current };
        for (const path of Object.keys(batch.changes)) delete kept[path];
        return kept;
      });
    } catch (caught) {
      const failure = caught as SaveError;
      const detail = failure.detail as { code?: string; fields?: Record<string, string>; message?: string } | undefined;
      const refused = Object.keys(detail?.fields ?? {}).filter((path) => path in batch.changes);
      if (failure.status === 422 && refused.length) {
        setProblems((current) => ({ ...current, ...detail?.fields }));
        // Good answers in the same batch are sent again without the refused ones.
        const retry = Object.fromEntries(Object.entries(batch.changes).filter(([path]) => !refused.includes(path)));
        queued.current = { changes: { ...retry, ...queued.current.changes }, confirm: [...batch.confirm, ...queued.current.confirm], has_coborrower: queued.current.has_coborrower ?? batch.has_coborrower };
      } else if (failure.status === 409 && detail?.code === "revision_conflict") {
        setError("This application changed in another window, so it was reloaded. Check your last answer.");
        onConflict();
      } else if (failure.status === 401) {
        // The session ended: nothing more can be saved until the person opens the form again.
        queued.current = EMPTY;
        setError("Your session ended, so your last answer was not saved. Open the application again to continue.");
        onAuthLost?.();
      } else if (failure.status && failure.status >= 400 && failure.status < 500 && failure.status !== 408 && failure.status !== 429) {
        // Refused for good (signing has started, this link cannot edit): show why, drop it and show what is saved.
        setError(detail?.message || failure.message || "That change could not be saved.");
        onConflict();
      } else {
        // No connection, a busy server or a throttle: keep the answers and try again later, never at once.
        queued.current = { changes: { ...batch.changes, ...queued.current.changes }, confirm: [...batch.confirm, ...queued.current.confirm], has_coborrower: queued.current.has_coborrower ?? batch.has_coborrower };
        later = true;
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
      setPending({ ...queued.current });
      if (waiting(queued.current)) {
        if (!later) {
          void run();
        } else if (attempts.current < RETRY_AFTER_MS.length) {
          setError("Your last answer is not saved yet. Trying again…");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => { timer.current = null; void run(); }, RETRY_AFTER_MS[attempts.current]);
          attempts.current += 1;
        } else {
          setError("Your last answers are not saved. Check your connection, then change an answer or reload the page to try again.");
        }
      }
    }
  }, [save, onView, onConflict, onAuthLost]);

  const enqueue = useCallback((patch: Partial<Pending>) => {
    queued.current = {
      changes: { ...queued.current.changes, ...(patch.changes ?? {}) },
      confirm: [...queued.current.confirm, ...(patch.confirm ?? [])],
      has_coborrower: patch.has_coborrower ?? queued.current.has_coborrower,
    };
    setPending({ ...queued.current });
    // A new answer is the person asking again: any wait is over.
    attempts.current = 0;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
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
