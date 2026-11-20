"use client";

// The client's real-estate loan application. Opened from an emailed link (a
// one-time code sent to their email unlocks it) or from their room (the room
// hands over a session in the URL fragment, so no code). Everything the file
// already knows is filled in; the client answers the rest, reviews the whole
// application and submits it for signature.
//
// It is one journey with the secure application room, so the page wears the
// room's own shell: the brand block with the mark, the room's header, tokens,
// buttons and footer (app-extras.css, ".application-room" and ".fp-room"). A
// client who chose the room's Obsidian theme keeps it here, and one who came
// from the room gets a way back to it.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { apiBase } from "@/lib/api";
import { FormRoomFooter } from "@/components/room/FormRoom";
import { RoomBrand } from "@/components/room/RoomBrand";
import { SecureSsnPanel } from "@/components/room/SecureSsnPanel";
import { ReApplicationForm, ReApplicationReview } from "@/components/application/ReApplicationForm";
import { useApplicationDraft, type DraftPayload, type SaveError } from "@/components/application/useApplicationDraft";
import { SignedFormSignStep, type SignPayload } from "@/components/application/SignedFormSignStep";
import { getAt, type ApplicationView, type SigningView } from "@/lib/reApplication";

type Gate = { needs_code: true; title: string; email_hint: string | null };

const storageKey = (token: string) => `re-application-session:${token}`;
const returnKey = (token: string) => `re-application-return:${token}`;

// Where the client came from, when that was one of our own rooms: the page offers the way back.
function rememberRoom(token: string): string | null {
  try {
    const from = document.referrer ? new URL(document.referrer) : null;
    if (from && from.origin === window.location.origin && (from.pathname.startsWith("/buckets/request/") || from.pathname.startsWith("/funding-review"))) {
      window.sessionStorage.setItem(returnKey(token), from.toString());
    }
    return window.sessionStorage.getItem(returnKey(token));
  } catch {
    return null;
  }
}

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
  const [ssnAccess, setSsnAccess] = useState(false);
  const [gate, setGate] = useState<Gate | null>(null);
  const [view, setView] = useState<ApplicationView | null>(null);
  const [stage, setStage] = useState<"fill" | "review" | "sign">("fill");
  const [signing, setSigning] = useState<SigningView | null>(null);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const [theme, setTheme] = useState<"light" | "obsidian">("light");
  const [returnUrl, setReturnUrl] = useState<string | null>(null);

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
        setSsnAccess((reply as ApplicationView).can_share_ssns === true);
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
    if (new URLSearchParams(window.location.search).get("theme") === "obsidian") setTheme("obsidian");
    setReturnUrl(rememberRoom(token));
    void load(current);
  }, [token, load]);

  // A session lasts twelve hours. When it ends mid-way the page goes back to the code, with what is saved intact.
  const lostSession = useCallback(() => {
    store(token, null);
    setSession(null);
    setView(null);
    setSigning(null);
    setStage("fill");
    setSent(false);
    setCode("");
    setMessage("Your session ended. Ask for a new code to pick up where you left off.");
    void load(null);
  }, [token, load]);

  const save = useCallback((payload: DraftPayload) => call<ApplicationView>(`/${token}/draft`, { method: "PUT", body: JSON.stringify(payload), session }), [token, session]);
  const draft = useApplicationDraft(view, save, setView, () => void load(session), lostSession);

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
      if ((caught as SaveError).status === 401) { lostSession(); return; }
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
      if (failure.status === 401) { lostSession(); return; }
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
    if (response.status === 401) { lostSession(); return; }
    if (!response.ok) { setMessage("The PDF could not be opened. Try again."); return; }
    const url = URL.createObjectURL(await response.blob());
    window.open(url, "_blank", "noopener");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const shell = `application-room ${theme === "obsidian" ? "is-obsidian" : "is-light"} fp-room`;
  const footer = <FormRoomFooter />;

  if (gone) {
    return (
      <main className={shell}>
        <div className="application-room-topline" />
        <section className="application-room-gate">
          <RoomBrand />
          <div className="application-room-gate-copy">
            <span className="application-room-eyebrow">Real estate loan application</span>
            <h1>This link is no longer available</h1>
            <p>Ask your advisor for a new link to your application.</p>
          </div>
        </section>
      </main>
    );
  }

  if (gate) {
    return (
      <main className={shell}>
        <div className="application-room-topline" />
        <section className="application-room-gate">
          <RoomBrand />
          <div className="application-room-gate-copy">
            <span className="application-room-eyebrow">Real estate loan application</span>
            <h1>Open your application</h1>
            <p>To keep your details private, we email a 6-digit code{gate.email_hint ? <> to <strong>{gate.email_hint}</strong></> : null}. It works once and expires in 15 minutes.</p>
          </div>
          {!sent ? (
            <button type="button" className="application-room-primary fp-room-block" disabled={busy} onClick={() => void sendCode()}>{busy ? "Sending…" : "Email me a code"}</button>
          ) : (
            <>
              <label className="application-room-field">
                <span>Code from the email</span>
                <input id="ra-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
              </label>
              <button type="button" className="application-room-primary fp-room-block" disabled={busy || code.length !== 6} onClick={() => void verify()}>{busy ? "Checking…" : "Open my application"}</button>
              <button type="button" className="application-room-theme-link" disabled={busy} onClick={() => void sendCode()}>Send a new code</button>
            </>
          )}
          {message ? <div className="application-room-alert bad" role="alert">{message}</div> : null}
        </section>
      </main>
    );
  }

  if (!view) {
    return (
      <main className={shell} aria-busy="true">
        <div className="application-room-topline" />
        <section className="application-room-shell fp-room-shell">
          <header className="application-room-header"><div className="application-room-header-main"><RoomBrand /></div></header>
          <div className="fp-card"><span className="fp-skel fp-skel-line w60" /><span className="fp-skel fp-skel-line w90" /></div>
          {message ? <div className="application-room-alert bad" role="alert">{message}</div> : null}
        </section>
      </main>
    );
  }

  // The room's own header: the brand, what this page is, and who it was prepared for.
  const borrower = [getAt(view.body, "borrowers.borrower.first_name"), getAt(view.body, "borrowers.borrower.last_name")].filter(Boolean).join(" ");
  const property = [getAt(view.body, "property.street"), getAt(view.body, "property.city"), getAt(view.body, "property.state")].filter(Boolean).join(", ");
  const preparedFor = borrower ? `Prepared for ${borrower}${property ? ` · ${property}` : ""}` : property || "What we already know is filled in for you.";
  const heading = (title: string, chip: ReactNode) => (
    <header className="application-room-header">
      <div className="application-room-header-main">
        <RoomBrand />
        <div>
          <span className="application-room-eyebrow">Secure application</span>
          <h1>{title}</h1>
          <p>{preparedFor}</p>
        </div>
      </div>
      <div className="application-room-header-actions">
        {chip}
        {returnUrl ? <button type="button" className="application-room-secondary" onClick={() => window.location.assign(returnUrl)}>Back to your room</button> : null}
      </div>
    </header>
  );

  const ssnPanel = ssnAccess && session ? <SecureSsnPanel key={token} endpoint={`/secure-ssns/application/${encodeURIComponent(token)}`} session={session} /> : null;

  if (stage === "sign") {
    const others = signing ? signing.required_roles.filter((role) => role !== signing.role && !signing.signed[role]) : [];
    const mine = signing?.role ? signing.signed[signing.role] : null;
    const nobodySigned = !signing || Object.keys(signing.signed).length === 0;
    let content;
    if (!signing) content = <div className="fp-card"><span className="fp-skel fp-skel-line w60" /></div>;
    else if (signing.status === "executed") content = <div className="fp-card fp-terminal"><h2>Your application is signed</h2><p>Everyone has signed. We emailed each signer a copy, and your advisor has the signed application.</p></div>;
    else if (mine) content = <div className="fp-card fp-terminal"><h2>You signed</h2><p>{others.length ? "We emailed your co-borrower a link to review and sign. The signed application is filed once they sign." : "Thank you."}</p></div>;
    else if (signing.held) content = <div className="fp-card fp-terminal"><h2>One more step with your advisor</h2><p>Your advisor needs to confirm a few details with you before you sign. They will be in touch.</p></div>;
    else if (!signing.signing_open) content = <div className="fp-card fp-terminal"><h2>Your application is submitted</h2><p>Signing opens once our documents are finalized. Your advisor will let you know; nothing else is needed from you right now.</p></div>;
    else if (signing.can_sign) content = <SignedFormSignStep signing={signing} busy={busy} error={message} onSign={(payload) => void sign(payload)} />;
    else content = <div className="fp-card fp-terminal"><h2>Your application is submitted</h2><p>Version {view.version?.number ?? 1} is saved.</p></div>;
    const done = signing?.status === "executed";
    const chip = <span className={`application-room-count${done || mine ? "" : " attention"}`}>{done ? "Signed" : mine ? "You signed" : signing?.can_sign ? "Ready to sign" : "Submitted"}</span>;
    return (
      <main className={shell}>
        <div className="application-room-topline" />
        <section className="application-room-shell fp-room-shell">
          {heading("Review and sign", chip)}
          {content}
          {ssnPanel}
          <div className="ra-gate-actions">
            <button type="button" className="fp-link-btn" onClick={() => void openPreview()}>Read the whole application (PDF)</button>
            {nobodySigned && signing?.role !== "coborrower" ? <button type="button" className="fp-link-btn" onClick={() => setStage("fill")}>Change an answer</button> : null}
          </div>
          {message && !signing?.can_sign ? <div className="application-room-alert bad" role="alert">{message}</div> : null}
          {footer}
        </section>
      </main>
    );
  }

  const left = view.completion.total - view.completion.filled;
  const chip = stage === "review"
    ? <span className="application-room-count">Ready to submit</span>
    : <span className={`application-room-count${left || view.please_check.length ? " attention" : ""}`}>{left ? `${left} to answer` : view.please_check.length ? `${view.please_check.length} to check` : "Ready to review"}</span>;
  return (
    <main className={shell}>
      <div className="application-room-topline" />
      <section className="application-room-shell fp-room-shell">
        {heading(stage === "fill" ? "Real estate loan application" : "Review your application", chip)}
        {ssnPanel}
        {stage === "fill" ? (
          <ReApplicationForm view={view} body={draft.body} problems={draft.problems} busy={busy} audience="client" onValue={draft.setValue} onConfirm={draft.confirm} onCoborrower={draft.setCoborrower} />
        ) : (
          <ReApplicationReview view={view} body={draft.body} onEdit={() => setStage("fill")} />
        )}
        {footer}
      </section>
      <div className="fp-actions">
        <div className="fp-actions-inner">
          {stage === "fill" ? (
            <button type="button" className="fp-submit" disabled={busy || !draft.idle || !view.completion.complete || view.please_check.length > 0} onClick={() => setStage("review")}>Review my application</button>
          ) : (
            <button type="button" className="fp-submit" disabled={busy || !draft.idle} onClick={() => void submit()}>{busy ? "Submitting…" : "Submit application"}</button>
          )}
          <span className="fp-autosave" aria-live="polite">{draft.saving ? "Saving…" : draft.error || (stage === "fill" && !view.completion.complete ? `${left} answers left` : stage === "fill" && view.please_check.length ? `${view.please_check.length} to check` : "All changes saved")}</span>
          {message ? <p className="fp-error" role="alert">{message}</p> : null}
          <button type="button" className="fp-link-btn" onClick={() => void openPreview()}>Preview PDF</button>
        </div>
      </div>
    </main>
  );
}
