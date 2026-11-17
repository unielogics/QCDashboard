"use client";

// The client's real-estate loan application. Opened from an emailed link (a
// one-time code sent to their email unlocks it) or from their room (the room
// hands over a session in the URL fragment, so no code). Everything the file
// already knows is filled in; the client answers the rest, reviews the whole
// application and submits it for signature.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiBase } from "@/lib/api";
import { ReApplicationForm, ReApplicationReview } from "@/components/application/ReApplicationForm";
import { useApplicationDraft, type DraftPayload, type SaveError } from "@/components/application/useApplicationDraft";
import { SignedFormSignStep, type SignPayload } from "@/components/application/SignedFormSignStep";
import type { ApplicationView, SigningView } from "@/lib/reApplication";

type Gate = { needs_code: true; title: string; email_hint: string | null };

const storageKey = (token: string) => `re-application-session:${token}`;

function readStored(token: string): string | null {
  try { return window.sessionStorage.getItem(storageKey(token)); } catch { return null; }
}

function store(token: string, session: string | null) {
  try {
    if (session) window.sessionStorage.setItem(storageKey(token), session);
    else window.sessionStorage.removeItem(storageKey(token));
  } catch { /* the session stays in memory for this tab */ }
}

async function call<T>(path: string, init: RequestInit & { session?: string | null } = {}): Promise<T> {
  const { session, ...rest } = init;
  const response = await fetch(`${apiBase}/api/v1/public/forms${path}`, {
    ...rest,
    headers: { "Content-Type": "application/json", ...(session ? { "X-Form-Session": session } : {}), ...(rest.headers ?? {}) },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    const detail = body?.detail;
    const message = typeof detail === "string" ? detail : (detail as { message?: string } | undefined)?.message || "Something went wrong. Try again.";
    const error = new Error(message) as SaveError;
    error.status = response.status;
    error.detail = detail;
    throw error;
  }
  return (await response.json()) as T;
}

export default function ReApplicationPage() {
  const { token } = useParams<{ token: string }>();
  const [session, setSession] = useState<string | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [view, setView] = useState<ApplicationView | null>(null);
  const [stage, setStage] = useState<"fill" | "review" | "sign">("fill");
  const [signing, setSigning] = useState<SigningView | null>(null);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);

  const load = useCallback(async (current: string | null) => {
    try {
      const reply = await call<ApplicationView | Gate>(`/${token}`, { session: current });
      if ("needs_code" in reply && reply.needs_code) {
        if (current) store(token, null);
        setSession(null);
        setGate(reply as Gate);
        setView(null);
      } else {
        setGate(null);
        setView(reply as ApplicationView);
        if ((reply as ApplicationView).status === "submitted") {
          setStage("sign");
          setSigning(await call<SigningView>(`/${token}/signing`, { session: current }));
        }
      }
    } catch (caught) {
      if ((caught as SaveError).status === 404) setGone(true);
      else setMessage((caught as Error).message);
    }
  }, [token]);

  useEffect(() => {
    const fragment = typeof window !== "undefined" ? new URLSearchParams(window.location.hash.slice(1)).get("s") : null;
    if (fragment) {
      store(token, fragment);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    const current = fragment || readStored(token);
    setSession(current);
    void load(current);
  }, [token, load]);

  const save = useCallback((payload: DraftPayload) => call<ApplicationView>(`/${token}/draft`, { method: "PUT", body: JSON.stringify(payload), session }), [token, session]);
  const draft = useApplicationDraft(view, save, setView, () => void load(session));

  async function sendCode() {
    setBusy(true);
    setMessage("");
    try {
      await call(`/${token}/code`, { method: "POST" });
      setSent(true);
    } catch (caught) {
      setMessage((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setMessage("");
    try {
      const reply = await call<{ session: string }>(`/${token}/verify`, { method: "POST", body: JSON.stringify({ code }) });
      store(token, reply.session);
      setSession(reply.session);
      await load(reply.session);
    } catch (caught) {
      setMessage((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sign(payload: SignPayload) {
    setBusy(true);
    setMessage("");
    try {
      setSigning(await call<SigningView>(`/${token}/sign`, { method: "POST", body: JSON.stringify(payload), session }));
    } catch (caught) {
      setMessage((caught as Error).message);
      try { setSigning(await call<SigningView>(`/${token}/signing`, { session })); } catch { /* keep the last view */ }
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!view) return;
    setBusy(true);
    setMessage("");
    try {
      const reply = await call<ApplicationView>(`/${token}/submit`, { method: "POST", body: JSON.stringify({ revision: view.revision, idempotency_key: `submit-${view.revision}-${Object.keys(view.provenance).length}-${token.slice(0, 8)}` }), session });
      setView(reply);
      setStage("sign");
      setSigning(await call<SigningView>(`/${token}/signing`, { session }));
    } catch (caught) {
      const failure = caught as SaveError;
      const detail = failure.detail as { code?: string } | undefined;
      if (detail?.code === "incomplete") setStage("fill");
      setMessage(failure.message);
      await load(session);
    } finally {
      setBusy(false);
    }
  }

  async function openPreview() {
    const response = await fetch(`${apiBase}/api/v1/public/forms/${token}/preview.pdf`, { headers: session ? { "X-Form-Session": session } : {} });
    if (!response.ok) { setMessage("The PDF could not be opened. Try again."); return; }
    const url = URL.createObjectURL(await response.blob());
    window.open(url, "_blank", "noopener");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const header = (
    <header className="fp-header">
      <div className="fp-header-inner">
        <span className="fp-mark">Qualified Commercial</span>
        <span className="fp-for">Real estate loan application</span>
      </div>
    </header>
  );

  if (gone) {
    return <div className="fp">{header}<main className="fp-main fp-centered"><div className="fp-card fp-terminal"><h1>This link is no longer available</h1><p>Ask your advisor for a new link to your application.</p></div></main></div>;
  }

  if (gate) {
    return (
      <div className="fp">
        {header}
        <main className="fp-main fp-centered">
          <div className="fp-card ra-gate">
            <h1>Open your application</h1>
            <p className="fp-intro">To keep your details private, we email a 6-digit code{gate.email_hint ? <> to <strong>{gate.email_hint}</strong></> : null}. It works once and expires in 15 minutes.</p>
            {!sent ? (
              <button type="button" className="fp-submit" disabled={busy} onClick={() => void sendCode()}>{busy ? "Sending…" : "Email me a code"}</button>
            ) : (
              <div className="fp-field">
                <label htmlFor="ra-code">Code from the email</label>
                <input id="ra-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
                <div className="ra-gate-actions">
                  <button type="button" className="fp-submit" disabled={busy || code.length !== 6} onClick={() => void verify()}>{busy ? "Checking…" : "Open my application"}</button>
                  <button type="button" className="fp-link-btn" disabled={busy} onClick={() => void sendCode()}>Send a new code</button>
                </div>
              </div>
            )}
            {message ? <p className="fp-error" role="alert">{message}</p> : null}
          </div>
        </main>
      </div>
    );
  }

  if (!view) {
    return <div className="fp">{header}<main className="fp-main" aria-busy="true"><div className="fp-card"><span className="fp-skel fp-skel-line w60" /><span className="fp-skel fp-skel-line w90" /></div>{message ? <p className="fp-error" role="alert">{message}</p> : null}</main></div>;
  }

  if (stage === "sign") {
    const others = signing ? signing.required_roles.filter((role) => role !== signing.role && !signing.signed[role]) : [];
    const mine = signing?.role ? signing.signed[signing.role] : null;
    const nobodySigned = !signing || Object.keys(signing.signed).length === 0;
    let content;
    if (!signing) content = <div className="fp-card"><span className="fp-skel fp-skel-line w60" /></div>;
    else if (signing.status === "executed") content = <div className="fp-card fp-terminal"><h1>Your application is signed</h1><p>Everyone has signed. We emailed each signer a copy, and your advisor has the signed application.</p></div>;
    else if (mine) content = <div className="fp-card fp-terminal"><h1>You signed</h1><p>{others.length ? "We emailed your co-borrower a link to review and sign. The signed application is filed once they sign." : "Thank you."}</p></div>;
    else if (signing.held) content = <div className="fp-card fp-terminal"><h1>One more step with your advisor</h1><p>Your advisor needs to confirm a few details with you before you sign. They will be in touch.</p></div>;
    else if (!signing.signing_open) content = <div className="fp-card fp-terminal"><h1>Your application is submitted</h1><p>Signing opens once our documents are finalized. Your advisor will let you know; nothing else is needed from you right now.</p></div>;
    else if (signing.can_sign) content = <SignedFormSignStep signing={signing} busy={busy} error={message} onSign={(payload) => void sign(payload)} />;
    else content = <div className="fp-card fp-terminal"><h1>Your application is submitted</h1><p>Version {view.version?.number ?? 1} is saved.</p></div>;
    return (
      <div className="fp">
        {header}
        <main className="fp-main">
          <h1 className="ra-title">Review and sign</h1>
          {content}
          <div className="ra-gate-actions">
            <button type="button" className="fp-link-btn" onClick={() => void openPreview()}>Read the whole application (PDF)</button>
            {nobodySigned && signing?.role !== "coborrower" ? <button type="button" className="fp-link-btn" onClick={() => setStage("fill")}>Change an answer</button> : null}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="fp">
      {header}
      <main className="fp-main">
        <h1 className="ra-title">{view.schema.title}</h1>
        {stage === "fill" ? (
          <ReApplicationForm view={view} body={draft.body} problems={draft.problems} busy={busy} audience="client" onValue={draft.setValue} onConfirm={draft.confirm} onCoborrower={draft.setCoborrower} />
        ) : (
          <ReApplicationReview view={view} body={draft.body} onEdit={() => setStage("fill")} />
        )}
      </main>
      <div className="fp-actions">
        <div className="fp-actions-inner">
          {stage === "fill" ? (
            <button type="button" className="fp-submit" disabled={busy || !draft.idle || !view.completion.complete || view.please_check.length > 0} onClick={() => setStage("review")}>Review my application</button>
          ) : (
            <button type="button" className="fp-submit" disabled={busy || !draft.idle} onClick={() => void submit()}>{busy ? "Submitting…" : "Submit application"}</button>
          )}
          <span className="fp-autosave" aria-live="polite">{draft.saving ? "Saving…" : draft.error || (stage === "fill" && !view.completion.complete ? `${view.completion.total - view.completion.filled} answers left` : stage === "fill" && view.please_check.length ? `${view.please_check.length} to check` : "All changes saved")}</span>
          {message ? <p className="fp-error" role="alert">{message}</p> : null}
          <button type="button" className="fp-link-btn" onClick={() => void openPreview()}>Preview PDF</button>
        </div>
      </div>
    </div>
  );
}
