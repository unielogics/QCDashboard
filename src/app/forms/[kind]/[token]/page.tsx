"use client";

// One financial form, opened by a link, by someone who is not signed in.
//
// Two things make this page different from the rest of the app.
//
// It must never send an Authorization header. `api<T>()` injects Clerk's token
// and a dev-user header; a visitor here has neither and the backend route takes
// no user at all, so this hand-writes fetch against apiBase the same way
// buckets/request/[token] does. Using the wrapper would not fail loudly — it
// would just quietly attach the wrong identity.
//
// And it ends. The borrower presses Save once, and the page says thank you and
// tells them they can close the window, which is the whole interaction. It does
// not bounce them somewhere or leave them wondering whether it went through.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiBase } from "@/lib/api";
import { Pfs413Form, type PfsBody, type PfsSchema } from "@/components/application/Pfs413Form";

type FormState = {
  kind: string;
  schema: PfsSchema;
  body: PfsBody;
  completed: boolean;
  business_name: string | null;
};

export default function FinancialFormPage() {
  const params = useParams<{ kind: string; token: string }>();
  const token = params?.token ?? "";

  const [state, setState] = useState<FormState | null>(null);
  const [body, setBody] = useState<PfsBody>({});
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "done" | "gone">("loading");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const base = `${apiBase}/application-profiles/public/financial-forms/${encodeURIComponent(token)}`;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(base);
        if (!response.ok) {
          if (!cancelled) setStatus("gone");
          return;
        }
        const data = (await response.json()) as FormState;
        if (cancelled) return;
        setState(data);
        setBody(data.body ?? {});
        setStatus(data.completed ? "done" : "ready");
      } catch {
        if (!cancelled) setStatus("gone");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base, token]);

  // Keep what has been typed. Form 413 is long and people fill it in on a
  // phone; losing it to a closed tab is most of why the old form went unused.
  const saveDraft = useCallback(async () => {
    if (status !== "ready") return;
    try {
      await fetch(`${base}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, owners: [] }),
      });
      setSavedAt(new Date().toLocaleTimeString());
    } catch {
      // Silent: a failed autosave must not interrupt someone mid-form. The
      // explicit Save below reports its own failure.
    }
  }, [base, body, status]);

  useEffect(() => {
    if (status !== "ready") return;
    const timer = window.setTimeout(() => void saveDraft(), 4000);
    return () => window.clearTimeout(timer);
  }, [body, saveDraft, status]);

  const submit = async () => {
    setStatus("saving");
    setError(null);
    try {
      const response = await fetch(`${base}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, owners: [] }),
      });
      if (!response.ok) throw new Error("That did not save.");
      setStatus("done");
    } catch {
      setError("We could not save that. Please try again in a moment.");
      setStatus("ready");
    }
  };

  if (status === "loading") {
    return <main className="form-page"><p>Loading…</p></main>;
  }

  if (status === "gone") {
    return (
      <main className="form-page">
        <h1>This link is no longer available</h1>
        <p>
          It may have expired or been replaced. Ask your contact at Qualified Commercial to
          send you a new one.
        </p>
      </main>
    );
  }

  if (status === "done") {
    return (
      <main className="form-page form-page-done">
        <h1>Thank you — you can close this window.</h1>
        <p>
          Your financial statement has been received and added to your file. Nothing else is
          needed from you here.
        </p>
        <p className="sub">
          If you spot a mistake, this link still works — reopen it and correct the figure.
        </p>
      </main>
    );
  }

  return (
    <main className="form-page">
      <header>
        <h1>Personal Financial Statement</h1>
        <p className="sub">
          {state?.business_name ? `For ${state.business_name}. ` : ""}
          This follows the standard SBA Form 413 that lenders ask for. Leave anything that does
          not apply blank.
        </p>
      </header>

      {state ? (
        <Pfs413Form
          schema={state.schema}
          value={body}
          onChange={setBody}
          disabled={status === "saving"}
        />
      ) : null}

      {error ? <p className="form-page-error">{error}</p> : null}

      <div className="form-page-actions">
        <button type="button" className="btn pri" disabled={status === "saving"} onClick={submit}>
          {status === "saving" ? "Saving…" : "Save"}
        </button>
        <span className="sub">
          {savedAt ? `Your progress was saved at ${savedAt}.` : "Your progress saves as you type."}
        </span>
      </div>
    </main>
  );
}
