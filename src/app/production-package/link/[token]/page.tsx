"use client";

// A production package forwarded to someone with no account.
//
// Two doors. If the visitor is signed in and the link was issued to them as a
// rep, they stay here on their own session — the same access the rep app used
// to give them. If they are signed in and their own access reaches the package
// (the desk, a partner), they are sent to /production-package/[id]: a person
// with a login never sits behind a PIN for a file they already own. Otherwise
// the link opens with the six-digit PIN whoever shared it told them
// separately, and a short-lived session the backend mints on the unlock.
//
// Bare layout, like every other public page here: middleware.ts and
// shellRoutes.ts both opt this path out. Nothing on this page may use the
// authed api() wrapper for the anonymous branch — it would quietly attach the
// wrong identity. The public client hand-writes fetch.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useConsoleAuth } from "@/lib/consoleAuth";
import { useProductionCall } from "@/lib/productionTrainingCall";
import {
  createPublicShareClient, createShareClient, publicLinkCall, resolveShareForUser, unlockPublicLink, type PackageClient,
} from "@/production-package/client";
import { PackageActions } from "@/production-package/PackageActions";
import { ProductionPackageWorkspace, type WorkspaceHandle } from "@/production-package/ProductionPackageWorkspace";
import { errorDetail, errorMessage, errorStatus } from "@/production-package/format";
import { PBtn } from "@/production-package/ui";
import type { ProductionPackage } from "@/production-package/types";

type Phase =
  | { kind: "checking" }
  | { kind: "pin"; label: string | null; problem: string | null }
  | { kind: "open"; client: PackageClient; pkg: ProductionPackage }
  | { kind: "closed" }
  | { kind: "gone"; message: string };

function sessionKey(token: string) { return `pp-link:${token}`; }
function readSession(token: string): string | null { try { return window.sessionStorage.getItem(sessionKey(token)); } catch { return null; } }
function writeSession(token: string, session: string) { try { window.sessionStorage.setItem(sessionKey(token), session); } catch { /* private window */ } }
function clearSession(token: string) { try { window.sessionStorage.removeItem(sessionKey(token)); } catch { /* private window */ } }

export default function ForwardedProductionPackagePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const router = useRouter();
  const { isLoaded, isSignedIn } = useConsoleAuth();
  const authedCall = useProductionCall();

  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const ws = useRef<WorkspaceHandle | null>(null);
  const [presBusy, setPresBusy] = useState(false);

  // The anonymous branch: a live session opens the package; no session asks for the PIN.
  const openAnonymously = useCallback(async () => {
    const session = readSession(token);
    if (session) {
      try {
        const pkg = await publicLinkCall<ProductionPackage>(token, "", { session });
        setPhase({ kind: "open", client: createPublicShareClient(token, session), pkg });
        return;
      } catch (err) {
        if (errorStatus(err) === 404) { setPhase({ kind: "gone", message: errorMessage(err, "This link is no longer available.") }); return; }
        // A stale session falls through to the PIN.
      }
    }
    try {
      await publicLinkCall<ProductionPackage>(token, "");
    } catch (err) {
      const detail = errorDetail(err);
      if (errorStatus(err) === 401 && detail?.code === "pin_required") { setPhase({ kind: "pin", label: typeof detail.label === "string" ? detail.label : null, problem: null }); return; }
      setPhase({ kind: "gone", message: errorMessage(err, "This link is no longer available.") });
    }
  }, [token]);

  // The door check runs once per token. It must not re-run when a callback
  // identity changes — with the API unreachable that re-fired both fetches on
  // every render — and it must not wait forever for Clerk: a visitor whose
  // Clerk script never loads still gets the PIN.
  const checked = useRef<string | null>(null);
  const [clerkTimedOut, setClerkTimedOut] = useState(false);
  useEffect(() => {
    if (isLoaded) return;
    const t = window.setTimeout(() => setClerkTimedOut(true), 4000);
    return () => window.clearTimeout(t);
  }, [isLoaded]);

  useEffect(() => {
    if (!token || (!isLoaded && !clerkTimedOut) || checked.current === token) return;
    checked.current = token;
    let cancelled = false;
    (async () => {
      if (isLoaded && isSignedIn) {
        try {
          const where = await resolveShareForUser(authedCall, token);
          if (cancelled) return;
          if (where.direct) { router.replace(`/production-package/${where.package_id}`); return; }
          const client = createShareClient(authedCall, token);
          setPhase({ kind: "open", client, pkg: await client.load() });
          return;
        } catch {
          // Signed in, but the link is not theirs: the PIN is the way in.
        }
      }
      if (!cancelled) await openAnonymously();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per token, by design
  }, [token, isLoaded, clerkTimedOut]);

  const unlock = async () => {
    if (pin.length !== 6 || busy) return;
    setBusy(true);
    try {
      const out = await unlockPublicLink(token, pin);
      writeSession(token, out.session);
      setPhase({ kind: "open", client: createPublicShareClient(token, out.session), pkg: out.package });
    } catch (err) {
      const detail = errorDetail(err);
      const status = errorStatus(err);
      if (status === 404) setPhase({ kind: "gone", message: errorMessage(err, "This link is no longer available.") });
      else setPhase((p) => ({ kind: "pin", label: p.kind === "pin" ? p.label : null,
        problem: status === 429 ? errorMessage(err, "Too many attempts. Try again in a few minutes.") : detail?.code === "pin_invalid" ? "That PIN is not right." : errorMessage(err, "The PIN did not work.") }));
      setPin("");
    } finally { setBusy(false); }
  };

  const shell = useMemo(() => "pp-root", []);

  if (phase.kind === "checking") return <div className={shell}><div className="pp-notice t-mut">Opening the production arrangement…</div></div>;
  if (phase.kind === "closed") {
    return (
      <div className={`${shell} pp-end`}>
        <div className="pp-panel"><div className="pp-panel-b">
          <div className="pp-eyebrow">Production arrangement</div>
          <h1 className="pp-title">You&apos;re done here</h1>
          <p className="pp-sub">Everything you entered is saved. You can close this window. The link keeps working until it expires, so you can come back with the PIN.</p>
          <div className="pp-row" style={{ marginTop: 12 }}><PBtn onClick={() => { checked.current = null; setPhase({ kind: "checking" }); void openAnonymously(); }}>Open it again</PBtn></div>
        </div></div>
      </div>
    );
  }
  if (phase.kind === "gone") return <div className={shell}><div className="pp-notice t-warn"><span>{phase.message}</span></div></div>;
  if (phase.kind === "pin") {
    return (
      <div className={shell} style={{ maxWidth: 520, margin: "48px auto", padding: "0 16px" }}>
        <div className="pp-panel">
          <div className="pp-panel-b">
            <div className="pp-eyebrow">Production arrangement</div>
            <h1 className="pp-title">Enter the PIN</h1>
            <p className="pp-sub">Whoever sent you this link has a six-digit PIN for it. It is not in the link — ask them if you were not given it.{phase.label ? <> This link is marked <b>{phase.label}</b>.</> : null}</p>
            <label className={`pp-field${phase.problem ? " bad" : ""}`} style={{ marginTop: 12 }}>
              <span className="pp-lbl">PIN</span>
              <input className="pp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => { if (e.key === "Enter") void unlock(); }} placeholder="6 digits" autoFocus />
              {phase.problem ? <span className="pp-hint bad">{phase.problem}</span> : null}
            </label>
            <div className="pp-row" style={{ marginTop: 12 }}>
              <PBtn variant="pri" onClick={unlock} busy={busy} disabled={pin.length !== 6}>Open the arrangement</PBtn>
            </div>
          </div>
        </div>
      </div>
    );
  }
  const name = phase.pkg.business_name || String(phase.pkg.arrangement?.dealer_name || "").trim() || "Production arrangement";
  return (
    <div className={shell}>
      <header className="pp-linkbar">
        <div className="pp-linkbar-t">
          <div className="pp-eyebrow">Production arrangement</div>
          <div className="pp-linkbar-name">{name}</div>
        </div>
        <PackageActions pkg={phase.pkg} size="sm" busy={presBusy}
          onPresentation={() => { void ws.current?.generatePresentation(); }}
          onSend={() => ws.current?.goTo("agreement", "send")}
          onClose={() => { clearSession(token); setPhase({ kind: "closed" }); }} />
      </header>
      <ProductionPackageWorkspace key={phase.pkg.id} ref={ws} client={phase.client} initial={phase.pkg} onBusy={setPresBusy}
        onPackage={(next) => setPhase({ kind: "open", client: phase.client, pkg: next })} />
    </div>
  );
}
