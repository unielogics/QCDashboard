"use client";

// Four financial forms behind one link, for someone who is not signed in.
//
// The desk copies one URL and forwards it to the borrower — or the borrower
// forwards it to their accountant. Behind it are four ordinary form links
// whose tokens derive from this one (`{base}.{kind}`), so this page is the
// single-form page four times over: the same public endpoints, the same
// no-Authorization fetch (see forms/[kind]/[token] for why the `api<T>()`
// wrapper must not be used here), the same four-second autosave and the same
// "Save and send" per form. Nothing new on the server was needed for it.
//
// One form on screen at a time. A P&L, a balance sheet, a debt schedule and a
// 413 stacked on one scrolling page is the spreadsheet this replaces; the rail
// at the top says what is done and what is left, and the page moves to the
// next open form when one is sent.
//
// A packet can be closed from the desk while somebody has it open. Every save
// here treats a non-ok answer as "this link is gone" rather than reporting
// saved — the single-form page can afford to be quiet about a failed
// autosave; a forwarded credential cannot.

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { apiBase } from "@/lib/api";
import { Pfs413Form, type PfsBody, type PfsSchema } from "@/components/application/Pfs413Form";
import { DebtScheduleForm, type DebtBody } from "@/components/application/DebtScheduleForm";
import {
  BusinessStatementForm,
  type StatementBody,
  type StatementSchema,
} from "@/components/application/BusinessStatementForm";

type Kind = "p_and_l" | "balance_sheet" | "debt_schedule" | "pfs";

/** The order the desk reads them in: the business first, the owner last. */
const KINDS: Kind[] = ["p_and_l", "balance_sheet", "debt_schedule", "pfs"];

const TITLES: Record<Kind, string> = {
  p_and_l: "Profit & loss",
  balance_sheet: "Balance sheet",
  debt_schedule: "Debt schedule",
  pfs: "Personal financial statement",
};

const INTROS: Record<Kind, string> = {
  p_and_l:
    "Enter the figures for the period at the top — year to date, the last fiscal year, or the months you have. Totals are worked out as you type.",
  balance_sheet:
    "What the business owns and owes as of one date. If you do not have equity broken out, leave that section blank and it is taken as assets less liabilities.",
  debt_schedule:
    "Every loan, line of credit, card, lease or advance the business is currently paying. Anything we already know is filled in — check it and correct what has changed.",
  pfs: "This follows the standard SBA Form 413 that lenders ask for. Leave anything that does not apply blank.",
};

type Prefill = {
  business_name: string | null;
  owner_name: string | null;
  home_address: string | null;
  business_phone: string | null;
  owner_count: number;
};

type FormBody = PfsBody & DebtBody & StatementBody;

type ChildState = {
  kind: Kind;
  schema: PfsSchema | StatementSchema;
  body: FormBody;
  completed: boolean;
  business_name: string | null;
  prefill?: Prefill;
};

type Child = {
  state: ChildState;
  body: FormBody;
  /** The body as it came off the server, so an untouched form is never autosaved. */
  loaded: FormBody;
  saving: boolean;
  savedAt: string | null;
  submitting: boolean;
  error: string | null;
};

const NO_STORE: RequestInit = { cache: "no-store" };

export default function FinancialPacketPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [children, setChildren] = useState<Partial<Record<Kind, Child>>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "gone">("loading");
  const [active, setActive] = useState<Kind>("p_and_l");
  // All four sent, and the person has chosen to look at them again.
  const [reviewing, setReviewing] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  // `apiBase` is the bare origin — every hand-written fetch adds /api/v1
  // itself. The child token is `{base}.{kind}`; `secrets.token_urlsafe` never
  // emits a dot, so the join is unambiguous on the server.
  const childUrl = useCallback(
    (kind: Kind) =>
      `${apiBase}/api/v1/application-profiles/public/financial-forms/${encodeURIComponent(`${token}.${kind}`)}`,
    [token],
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const answers = await Promise.all(
          KINDS.map(async (kind) => {
            const response = await fetch(childUrl(kind), NO_STORE);
            if (!response.ok) return null;
            return (await response.json()) as ChildState;
          }),
        );
        if (cancelled) return;
        // One missing child means the packet is closed or expired: the four
        // links share a lifetime and are revoked together.
        if (answers.some((answer) => answer === null)) {
          setStatus("gone");
          return;
        }
        const next: Partial<Record<Kind, Child>> = {};
        answers.forEach((answer, index) => {
          if (!answer) return;
          const kind = KINDS[index];
          const body = answer.body ?? {};
          next[kind] = {
            state: { ...answer, kind },
            body,
            loaded: body,
            saving: false,
            savedAt: null,
            submitting: false,
            error: null,
          };
        });
        setChildren(next);
        setActive(KINDS.find((kind) => !next[kind]?.state.completed) ?? "p_and_l");
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("gone");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [childUrl, token]);

  const patch = useCallback((kind: Kind, changes: Partial<Child>) => {
    setChildren((current) => {
      const child = current[kind];
      if (!child) return current;
      return { ...current, [kind]: { ...child, ...changes } };
    });
  }, []);

  const setBody = useCallback(
    (kind: Kind, body: FormBody) => {
      patch(kind, { body });
    },
    [patch],
  );

  /** Autosave for one form. A non-ok answer flips the whole page: the packet
   *  has been closed, and "Progress saved" would be a lie. A network failure
   *  is neither — it stays silent, and the explicit Save reports its own. */
  const saveDraft = useCallback(
    async (kind: Kind, body: FormBody) => {
      patch(kind, { saving: true });
      try {
        const response = await fetch(`${childUrl(kind)}/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, owners: [] }),
        });
        if (!response.ok) {
          setStatus("gone");
          return;
        }
        patch(kind, {
          loaded: body,
          savedAt: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        });
      } catch {
        // Silent: a failed autosave must not interrupt someone mid-form.
      } finally {
        patch(kind, { saving: false });
      }
    },
    [childUrl, patch],
  );

  /** Switching forms flushes what was typed on the one being left: the
   *  four-second timer below is cancelled by the switch, and a borrower who
   *  hops between steps should not lose a field to it. */
  const switchTo = (kind: Kind) => {
    const leaving = children[active];
    if (leaving && leaving.body !== leaving.loaded && !leaving.submitting) {
      void saveDraft(active, leaving.body);
    }
    setActive(kind);
  };

  const current = children[active];
  const currentBody = current?.body;
  const currentLoaded = current?.loaded;
  const currentSubmitting = current?.submitting ?? false;

  useEffect(() => {
    if (status !== "ready" || !currentBody || currentBody === currentLoaded || currentSubmitting) return;
    const kind = activeRef.current;
    const timer = window.setTimeout(() => void saveDraft(kind, currentBody), 4000);
    return () => window.clearTimeout(timer);
  }, [currentBody, currentLoaded, currentSubmitting, saveDraft, status]);

  const submit = async (kind: Kind) => {
    const child = children[kind];
    if (!child) return;
    patch(kind, { submitting: true, error: null });
    try {
      const response = await fetch(`${childUrl(kind)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: child.body, owners: [] }),
      });
      if (!response.ok) {
        setStatus("gone");
        return;
      }
      setChildren((currentChildren) => {
        const done = currentChildren[kind];
        if (!done) return currentChildren;
        return {
          ...currentChildren,
          [kind]: {
            ...done,
            submitting: false,
            loaded: done.body,
            state: { ...done.state, completed: true },
          },
        };
      });
      // Move on to the next open form, if there is one.
      const remaining = KINDS.find((other) => other !== kind && !children[other]?.state.completed);
      if (remaining) {
        setActive(remaining);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      patch(kind, { submitting: false, error: "We could not save that. Please try again in a moment." });
    }
  };

  const businessName =
    KINDS.map((kind) => children[kind]?.state.business_name).find((name) => Boolean(name)) ?? null;
  const doneCount = KINDS.filter((kind) => children[kind]?.state.completed).length;
  const allDone = status === "ready" && doneCount === KINDS.length;

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
          <span className="fp-sr">Loading your forms</span>
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

  if (allDone && !reviewing) {
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
              All four forms have been received and added to{" "}
              {businessName ? `the file for ${businessName}` : "your file"}. Nothing else is needed
              from you here.
            </p>
            <p className="fp-quiet">
              If you spot a mistake, this link still works — reopen a form and correct the figure.
            </p>
            <button type="button" className="fp-link-btn" onClick={() => setReviewing(true)}>
              Open the forms again
            </button>
          </div>
        </main>
      </div>
    );
  }

  const child = children[active];
  const ownerCount = child?.state.prefill?.owner_count ?? 0;

  return (
    <div className="fp">
      <header className="fp-header">
        <div className="fp-header-inner">
          <span className="fp-mark">Qualified Commercial</span>
          <h1>Financial package{businessName ? ` for ${businessName}` : ""}</h1>
          <p className="fp-for">
            Four forms, one link. Each one saves as you type and is sent on its own.
          </p>
        </div>
      </header>

      <main className="fp-main">
        <div className="fp-intro">
          <div className="fp-packet-progress">
            <span>
              <strong>
                {doneCount} of {KINDS.length}
              </strong>{" "}
              sent
            </span>
            <span>This link works for 30 days from when it was sent.</span>
          </div>
          <ol className="fp-packet-rail" aria-label="Forms in this package">
            {KINDS.map((kind, index) => {
              const step = children[kind];
              const done = step?.state.completed ?? false;
              const draft = !done && Boolean(step && (step.savedAt || step.body !== step.loaded));
              return (
                <li key={kind}>
                  <button
                    type="button"
                    className="fp-packet-step"
                    aria-current={kind === active ? "step" : undefined}
                    onClick={() => switchTo(kind)}
                  >
                    <span>Step {index + 1}</span>
                    <strong>{TITLES[kind]}</strong>
                    <span
                      className={
                        done ? "fp-packet-chip is-done" : draft ? "fp-packet-chip is-draft" : "fp-packet-chip"
                      }
                    >
                      {done ? "Sent" : draft ? "Draft" : "To do"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="fp-note">
            <span aria-hidden="true">✎</span>
            <span>
              You can forward this link to your accountant. One person should fill in a form at a
              time — the last save wins.
            </span>
          </p>
          {active === "pfs" && ownerCount > 1 ? (
            <p className="fp-note">
              <span aria-hidden="true">◆</span>
              <span>
                This file has more than one owner. A financial statement belongs to one person —
                fill this in for yourself, and each other owner gets a link of their own.
              </span>
            </p>
          ) : null}
        </div>

        {child ? (
          <div className="fp-card">
            <div className="fp-packet-form-head">
              <h2>{TITLES[active]}</h2>
              <p>{INTROS[active]}</p>
            </div>
            {child.state.completed ? (
              <div className="fp-packet-done">
                <b>Sent.</b> You can still correct a figure here — saving again replaces what we
                have.
              </div>
            ) : null}
            {active === "debt_schedule" ? (
              <DebtScheduleForm
                value={child.body}
                onChange={(next) => setBody("debt_schedule", next)}
                disabled={child.submitting}
              />
            ) : active === "pfs" ? (
              <Pfs413Form
                schema={child.state.schema as PfsSchema}
                value={child.body}
                onChange={(next) => setBody("pfs", next)}
                disabled={child.submitting}
              />
            ) : (
              <BusinessStatementForm
                schema={child.state.schema as StatementSchema}
                value={child.body}
                onChange={(next) => setBody(active, next)}
                disabled={child.submitting}
              />
            )}
          </div>
        ) : null}

        {child?.error ? (
          <p className="fp-error" role="alert">
            {child.error}
          </p>
        ) : null}
      </main>

      {child ? (
        <div className="fp-actions">
          <div className="fp-actions-inner">
            <button
              type="button"
              className="fp-submit"
              disabled={child.submitting}
              onClick={() => void submit(active)}
            >
              {child.submitting ? (
                <>
                  <span className="fp-spinner" aria-hidden="true" /> Saving…
                </>
              ) : child.state.completed ? (
                "Save this form again"
              ) : (
                "Save and send this form"
              )}
            </button>
            <span className="fp-autosave" aria-live="polite">
              {child.saving ? (
                <>
                  <span className="fp-pulse" aria-hidden="true" /> Saving your progress…
                </>
              ) : child.savedAt ? (
                `Progress saved at ${child.savedAt}.`
              ) : (
                "Your progress saves as you type."
              )}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
