"use client";

// One financial form, opened by a link, by someone who is not signed in.
//
// Three things make this page different from the rest of the app.
//
// It must never send an Authorization header. `api<T>()` injects Clerk's token
// and a dev-user header; a visitor here has neither and the backend route takes
// no user at all, so this hand-writes fetch against apiBase the same way
// buckets/request/[token] does. Using the wrapper would not fail loudly — it
// would just quietly attach the wrong identity.
//
// It carries its own visual world. The console's palette puts the page ground
// at #f5f7fa, cards at #ffffff and field fills at #eef1f6 — three neutrals
// within a few percent of each other, which is legible once you know the
// software and tiring when you do not. A borrower gets one visit and a long
// form, so the surfaces here separate properly: a real ground under real cards,
// fields that read as fields, and one accent that only ever means "press this".
//
// And it ends. The borrower presses Save once, and the page says thank you and
// tells them they can close the window, which is the whole interaction. It does
// not bounce them somewhere or leave them wondering whether it went through.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { apiBase } from "@/lib/api";
import { Pfs413Form, type PfsBody, type PfsSchema } from "@/components/application/Pfs413Form";
import { DebtScheduleForm, type DebtBody } from "@/components/application/DebtScheduleForm";

type Prefill = {
  business_name: string | null;
  owner_name: string | null;
  home_address: string | null;
  business_phone: string | null;
  owner_count: number;
};

type FormState = {
  kind: "pfs" | "debt_schedule";
  schema: PfsSchema;
  body: PfsBody & DebtBody;
  completed: boolean;
  business_name: string | null;
  prefill?: Prefill;
};

const TITLES = {
  debt_schedule: "Business Debt Schedule",
  pfs: "Personal Financial Statement",
} as const;

export default function FinancialFormPage() {
  const params = useParams<{ kind: string; token: string }>();
  const token = params?.token ?? "";

  const [state, setState] = useState<FormState | null>(null);
  const [body, setBody] = useState<PfsBody & DebtBody>({});
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "done" | "gone">("loading");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // `apiBase` is the bare origin — `api<T>()` appends /api/v1 itself, and every
  // hand-written fetch in this app has to add it too. This one did not, so every
  // link minted for a borrower 404'd on load while the token behind it was fine.
  const base = `${apiBase}/api/v1/application-profiles/public/financial-forms/${encodeURIComponent(token)}`;

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
    setSaving(true);
    try {
      await fetch(`${base}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, owners: [] }),
      });
      setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    } catch {
      // Silent: a failed autosave must not interrupt someone mid-form. The
      // explicit Save below reports its own failure.
    } finally {
      setSaving(false);
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

  const title = state ? TITLES[state.kind] : "";

  // Which identity fields came off the file, so the page says so once rather
  // than decorating every input with a badge.
  const seeded = useMemo(() => {
    const pre = state?.prefill;
    if (!pre) return [] as string[];
    const out: string[] = [];
    if (pre.business_name) out.push("business name");
    if (pre.owner_name) out.push("owner name");
    if (pre.home_address) out.push("address");
    if (pre.business_phone) out.push("phone");
    return out;
  }, [state]);

  if (status === "loading") {
    return (
      <div className="fp">
        <header className="fp-header">
          <div className="fp-header-inner">
            <span className="fp-mark">Qualified Commercial</span>
            <span className="fp-skel fp-skel-title" />
          </div>
        </header>
        <main className="fp-main" aria-busy="true" aria-live="polite">
          <span className="fp-sr">Loading your form</span>
          <div className="fp-card">
            <span className="fp-skel fp-skel-line w60" />
            <span className="fp-skel fp-skel-line w90" />
            <div className="fp-grid fp-grid-skel">
              {Array.from({ length: 6 }).map((_, index) => (
                <span key={index} className="fp-skel fp-skel-field" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (status === "gone") {
    return (
      <div className="fp">
        <header className="fp-header">
          <div className="fp-header-inner">
            <span className="fp-mark">Qualified Commercial</span>
          </div>
        </header>
        <main className="fp-main fp-centered">
          <div className="fp-card fp-terminal">
            <span className="fp-terminal-glyph" aria-hidden="true">
              ⧗
            </span>
            <h1>This link is no longer available</h1>
            <p>
              It may have expired or been replaced. Ask your contact at Qualified Commercial to
              send you a new one.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="fp">
        <header className="fp-header">
          <div className="fp-header-inner">
            <span className="fp-mark">Qualified Commercial</span>
          </div>
        </header>
        <main className="fp-main fp-centered">
          <div className="fp-card fp-terminal">
            <span className="fp-check" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="40" height="40">
                <circle className="fp-check-ring" cx="16" cy="16" r="14" />
                <path className="fp-check-tick" d="M9.5 16.5l4.5 4.5 8.5-9" />
              </svg>
            </span>
            <h1>Thank you — you can close this window.</h1>
            <p>
              {state?.kind === "debt_schedule"
                ? "Your debt schedule has been received and added to your file."
                : "Your financial statement has been received and added to your file."}{" "}
              Nothing else is needed from you here.
            </p>
            <p className="fp-quiet">
              If you spot a mistake, this link still works — reopen it and correct the figure.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="fp">
      <header className="fp-header">
        <div className="fp-header-inner">
          <span className="fp-mark">Qualified Commercial</span>
          <h1>{title}</h1>
          {state?.business_name ? <p className="fp-for">For {state.business_name}</p> : null}
        </div>
      </header>

      <main className="fp-main">
        <div className="fp-intro">
          <p>
            {state?.kind === "debt_schedule"
              ? "List every loan, line of credit, card, lease or advance the business is currently paying. Anything we already know is filled in — check it and correct what has changed."
              : "This follows the standard SBA Form 413 that lenders ask for. Leave anything that does not apply blank."}
          </p>
          {seeded.length > 0 ? (
            <p className="fp-note">
              <span aria-hidden="true">✎</span>
              <span>
                We filled in the {listOf(seeded)} from your file. Type over anything that is
                wrong — what you enter is what we use.
              </span>
            </p>
          ) : null}
          {state?.kind === "pfs" && (state.prefill?.owner_count ?? 0) > 1 ? (
            <p className="fp-note">
              <span aria-hidden="true">◆</span>
              <span>
                This file has more than one owner. A financial statement belongs to one person —
                fill this in for yourself, and each other owner gets a link of their own.
              </span>
            </p>
          ) : null}
        </div>

        <div className="fp-card">
          {state?.kind === "debt_schedule" ? (
            <DebtScheduleForm value={body} onChange={setBody} disabled={status === "saving"} />
          ) : state ? (
            <Pfs413Form
              schema={state.schema}
              value={body}
              onChange={setBody}
              disabled={status === "saving"}
            />
          ) : null}
        </div>

        {error ? (
          <p className="fp-error" role="alert">
            {error}
          </p>
        ) : null}
      </main>

      <div className="fp-actions">
        <div className="fp-actions-inner">
          <button
            type="button"
            className="fp-submit"
            disabled={status === "saving"}
            onClick={submit}
          >
            {status === "saving" ? (
              <>
                <span className="fp-spinner" aria-hidden="true" /> Saving…
              </>
            ) : (
              "Save and send"
            )}
          </button>
          <span className="fp-autosave" aria-live="polite">
            {saving ? (
              <>
                <span className="fp-pulse" aria-hidden="true" /> Saving your progress…
              </>
            ) : savedAt ? (
              `Progress saved at ${savedAt}.`
            ) : (
              "Your progress saves as you type."
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

/** "business name, owner name and address" — read once, so the serial comma is
 *  not worth the extra character. */
function listOf(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
