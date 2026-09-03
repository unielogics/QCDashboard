"use client";
// The "Production Package" tab on a car-industry AI intake file. Resolves the
// application profile, then the stage-one package, then the final (stage two)
// when one exists, and hands the mirrored workspace an authed transport.
// Everything under src/production-package is shared with the rep app
// byte-for-byte; this wrapper is the dashboard-specific glue:
//   - the Commitment | Final switcher once a final has been drafted,
//   - the term-sheet drawer (opened from Step 10, from the Underwriting tab or
//     from the page-action menu), re-resolving both packages when it closes
//     because recording terms re-applies them to a draft final,
//   - the training-file confirm-and-retry: a 409
//     training_live_action_confirmation_required on send/remind asks the
//     super admin to confirm the real external action, then retries with
//     x-qc-training-live-action: confirmed (ported from QCRep src/lib/api.ts).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthedApi } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";
import type { ApplicationProfile } from "@/lib/applicationProfile";
import { createOperatorClient, loadPackage, resolvePackage } from "@/production-package/client";
import { ProductionPackageWorkspace } from "@/production-package/ProductionPackageWorkspace";
import { TermSheetDrawer } from "@/production-package/TermSheetDrawer";
import { PBtn } from "@/production-package/ui";
import { errorDetail, errorMessage, errorStatus } from "@/production-package/format";
import type { ApiCall, ApiInit, ProductionPackage } from "@/production-package/types";

type TrainingLiveAction = {
  code: "training_live_action_confirmation_required";
  action?: string;
  provider?: string;
  recipient?: string | null;
  effect?: string;
};

function trainingLiveAction(err: unknown): TrainingLiveAction | null {
  if (!(err instanceof ApiError) || err.status !== 409 || typeof window === "undefined") return null;
  const detail = (err.body as { detail?: unknown } | null)?.detail;
  if (!detail || typeof detail !== "object") return null;
  const action = detail as Partial<TrainingLiveAction>;
  return action.code === "training_live_action_confirmation_required" ? (action as TrainingLiveAction) : null;
}

function confirmTrainingLiveAction(detail: TrainingLiveAction): boolean {
  const lines = [
    detail.action || "Run live action",
    "",
    detail.provider ? `Provider: ${detail.provider}` : null,
    detail.recipient ? `Recipient: ${detail.recipient}` : null,
    detail.effect ? `Effect: ${detail.effect}` : null,
    "",
    "This is a Training file. Continue with the real external action?",
  ].filter((line): line is string => line !== null);
  return window.confirm(lines.join("\n"));
}

type View = "commitment" | "final";

export function ProductionPackageTab({ intakeId, shareOpen, onShareClose, termSheetOpen = false, onTermSheetClose }: {
  intakeId: string;
  shareOpen: boolean;
  onShareClose: () => void;
  /** The host asks for the term-sheet drawer (Underwriting tab, page-action menu). */
  termSheetOpen?: boolean;
  onTermSheetClose?: () => void;
}) {
  const apiCall = useAuthedApi();
  const call = useMemo<ApiCall>(() => async <T,>(path: string, init?: ApiInit): Promise<T> => {
    const body = typeof init?.body === "string" ? init.body : init?.body === undefined ? undefined : JSON.stringify(init.body);
    const opts = { method: init?.method, body, headers: init?.headers };
    try {
      return await apiCall<T>(path, opts);
    } catch (err) {
      const liveAction = trainingLiveAction(err);
      if (liveAction && confirmTrainingLiveAction(liveAction)) {
        return apiCall<T>(path, { ...opts, headers: { ...(init?.headers ?? {}), "x-qc-training-live-action": "confirmed" } });
      }
      throw err;
    }
  }, [apiCall]);

  const [parent, setParent] = useState<ProductionPackage | null>(null);
  const [finalPkg, setFinalPkg] = useState<ProductionPackage | null>(null);
  const [view, setView] = useState<View>("commitment");
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [localTermSheetOpen, setLocalTermSheetOpen] = useState(false);

  // Resolve stage one, then the final it points at. `preferFinal` keeps the
  // switcher on the final after a reload that came from the final itself.
  const load = useCallback(async (opts: { silent?: boolean; preferFinal?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    setError(null);
    try {
      const profile = await call<ApplicationProfile>("/application-profiles/resolve", { method: "POST", body: { source_kind: "intake", source_id: intakeId } });
      if (profile.vertical !== "dealer") {
        setError({ code: "not_dealer_vertical", message: "Production packages exist only on car-industry files. Classify this file as a dealer file first." });
        return;
      }
      const stageOne = await resolvePackage(call, profile.id);
      setParent(stageOne);
      if (stageOne.final_package_id) {
        const child = await loadPackage(call, stageOne.final_package_id);
        setFinalPkg(child);
        if (opts.preferFinal) setView("final");
      } else {
        setFinalPkg(null);
        setView("commitment");
      }
    } catch (err) {
      const detail = errorDetail(err);
      const code = typeof detail?.code === "string" ? detail.code : undefined;
      setError({ code, message: errorStatus(err) === 404 && code === "not_dealer_vertical" ? "Production packages exist only on car-industry files." : errorMessage(err, "The production package could not be opened.") });
    } finally {
      setLoading(false);
    }
  }, [call, intakeId]);

  useEffect(() => { load().catch(() => undefined); }, [load]);

  const drawerOpen = termSheetOpen || localTermSheetOpen;
  const closeTermSheet = useCallback(() => {
    setLocalTermSheetOpen(false);
    onTermSheetClose?.();
    // Recording terms re-applies them to a draft final and may unlock
    // "Draft final package" on the commitment: refresh both, quietly.
    load({ silent: true, preferFinal: view === "final" }).catch(() => undefined);
  }, [load, onTermSheetClose, view]);

  const openFinal = useCallback(async (finalPackageId: string) => {
    try {
      const child = finalPkg && finalPkg.id === finalPackageId ? finalPkg : await loadPackage(call, finalPackageId);
      setFinalPkg(child);
      setView("final");
      // The parent now carries final_package_id / final_status.
      if (parent) loadPackage(call, parent.id).then(setParent).catch(() => undefined);
    } catch (err) {
      setError({ message: errorMessage(err, "The final package could not be opened.") });
    }
  }, [call, finalPkg, parent]);

  const openOriginal = useCallback((parentPackageId: string) => {
    setView("commitment");
    loadPackage(call, parentPackageId).then(setParent).catch(() => undefined);
  }, [call]);

  const current = view === "final" && finalPkg ? finalPkg : parent;
  const client = useMemo(() => (current ? createOperatorClient(call, current.id) : null), [call, current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !parent) return <div className="pp-root"><div className="pp-notice t-mut">Opening the production package…</div></div>;
  if (error && !parent) return <div className="pp-root"><div className="pp-notice t-warn"><span>{error.message}</span><PBtn size="sm" onClick={() => load()}>Try again</PBtn></div></div>;
  if (!parent || !current || !client) return null;

  const finalLabel = finalPkg
    ? finalPkg.status === "executed" ? "Final · executed" : finalPkg.status === "out_for_signature" ? "Final · out for signature" : finalPkg.status === "void" ? "Final · void" : "Final · draft"
    : null;

  return (
    <div className="pp-root">
      {error ? <div className="pp-notice t-warn" style={{ marginBottom: 10 }}><span>{error.message}</span><PBtn size="sm" onClick={() => setError(null)}>Dismiss</PBtn></div> : null}
      {finalPkg ? (
        <div className="pp-row" role="tablist" aria-label="Production package stage" style={{ marginBottom: 10, gap: 6 }}>
          <button type="button" role="tab" aria-selected={view === "commitment"} className={`pp-chip${view === "commitment" ? " c-acc" : " c-mut"}`} style={{ cursor: "pointer" }} onClick={() => setView("commitment")}>
            Commitment{parent.status === "executed" ? " · executed" : ` · ${parent.status.replace(/_/g, " ")}`}
          </button>
          <button type="button" role="tab" aria-selected={view === "final"} className={`pp-chip${view === "final" ? " c-acc" : " c-mut"}`} style={{ cursor: "pointer" }} onClick={() => setView("final")}>
            {finalLabel}
          </button>
          {view === "final" && parent.executed_url ? <a className="pp-btn v-link s-sm" href={parent.executed_url} target="_blank" rel="noreferrer">Open the executed commitment</a> : null}
        </div>
      ) : null}
      <ProductionPackageWorkspace
        key={current.id}
        client={client}
        initial={current}
        profileId={current.profile_id}
        onPackage={(next) => { if (next.stage >= 2) setFinalPkg(next); else setParent(next); }}
        shareOpen={view === "commitment" && shareOpen}
        onShareClose={onShareClose}
        onOpenTermSheet={() => setLocalTermSheetOpen(true)}
        onOpenFinal={(id) => { openFinal(id).catch(() => undefined); }}
        onOpenOriginal={openOriginal}
      />
      {drawerOpen ? (
        <TermSheetDrawer
          open={drawerOpen}
          onClose={closeTermSheet}
          client={client}
          profileId={parent.profile_id}
          pkg={current}
          // A recorded sheet re-applies to a draft final in the same transaction; adopt it straight away.
          onSaved={(result) => { if (result.final) setFinalPkg(result.final); }}
        />
      ) : null}
    </div>
  );
}
