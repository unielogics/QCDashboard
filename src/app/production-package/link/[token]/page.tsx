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

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useConsoleAuth } from "@/lib/consoleAuth";
import { useProductionCall } from "@/lib/productionTrainingCall";
import {
  createPublicShareClient, createShareClient, publicLinkCall, resolveShareForUser, unlockPublicLink, type PackageClient,
} from "@/production-package/client";
import { ProductionPackageWorkspace } from "@/production-package/ProductionPackageWorkspace";
import { errorDetail, errorMessage, errorStatus } from "@/production-package/format";
import { PBtn } from "@/production-package/ui";
import type { ProductionPackage } from "@/production-package/types";

type Phase =
  | { kind: "checking" }
  | { kind: "pin"; label: string | null; problem: string | null }
  | { kind: "open"; client: PackageClient; pkg: ProductionPackage }
  | { kind: "gone"; message: string };

function sessionKey(token: string) { return `pp-link:${token}`; }
function readSession(token: string): string | null { try { return window.sessionStorage.getItem(sessionKey(token)); } catch { return null; } }
function writeSession(token: string, session: string) { try { window.sessionStorage.setItem(sessionKey(token), session); } catch { /* private window */ } }

export default function ForwardedProductionPackagePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const router = useRouter();
  const { isLoaded, isSignedIn } = useConsoleAuth();
  const authedCall = useProductionCall();

  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

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

  useEffect(() => {
    if (!token || !isLoaded) return;
    let cancelled = false;
    (async () => {
      if (isSignedIn) {
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
  }, [token, isLoaded, isSignedIn, authedCall, router, openAnonymously]);

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
  return (
    <div className={shell}>
      <ProductionPackageWorkspace key={phase.pkg.id} client={phase.client} initial={phase.pkg} onPackage={(next) => setPhase({ kind: "open", client: phase.client, pkg: next })} />
    </div>
  );
}
