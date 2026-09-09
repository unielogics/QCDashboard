"use client";
// The "Production Package" tab on a car-industry AI intake file. The workspace
// itself lives on its own page now (/production-package/[id]); this tab
// resolves the application profile, then the stage-one package and the final
// when one exists, and shows where each stands with a way in. Two file-level
// concerns stay here because the file page drives them: the share drawer is
// opened on the workspace page (?share=1), and the term-sheet drawer — the
// page-action "Record loan terms" and the Underwriting tab both ask for it.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApplicationProfile } from "@/lib/applicationProfile";
import { useProductionCall } from "@/lib/productionTrainingCall";
import { createOperatorClient, loadPackage, resolvePackage } from "@/production-package/client";
import { TermSheetDrawer } from "@/production-package/TermSheetDrawer";
import { KV, PBtn, PChip, PPanel } from "@/production-package/ui";
import { errorDetail, errorMessage, errorStatus, whenLabel } from "@/production-package/format";
import type { ProductionPackage } from "@/production-package/types";

function statusChip(pkg: ProductionPackage) {
  const tone = pkg.status === "executed" ? "ok" : pkg.status === "out_for_signature" ? "warn" : pkg.status === "void" ? "mut" : "acc";
  return <PChip tone={tone}>{pkg.status.replace(/_/g, " ")}</PChip>;
}

export function ProductionPackageTab({ intakeId, shareOpen, onShareClose, termSheetOpen = false, onTermSheetClose }: {
  intakeId: string;
  shareOpen: boolean;
  onShareClose: () => void;
  /** The host asks for the term-sheet drawer (Underwriting tab, page-action menu). */
  termSheetOpen?: boolean;
  onTermSheetClose?: () => void;
}) {
  const call = useProductionCall();
  const router = useRouter();
  const [parent, setParent] = useState<ProductionPackage | null>(null);
  const [finalPkg, setFinalPkg] = useState<ProductionPackage | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
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
      setFinalPkg(stageOne.final_package_id ? await loadPackage(call, stageOne.final_package_id) : null);
    } catch (err) {
      const detail = errorDetail(err);
      const code = typeof detail?.code === "string" ? detail.code : undefined;
      setError({ code, message: errorStatus(err) === 404 && code === "not_dealer_vertical" ? "Production packages exist only on car-industry files." : errorMessage(err, "The production package could not be opened.") });
    } finally {
      setLoading(false);
    }
  }, [call, intakeId]);

  useEffect(() => { load().catch(() => undefined); }, [load]);

  // "Share with a rep" from the page-action menu: the drawer lives on the workspace page.
  useEffect(() => {
    if (shareOpen && parent) { router.push(`/production-package/${parent.id}?share=1`); onShareClose(); }
  }, [shareOpen, parent, router, onShareClose]);

  const closeTermSheet = useCallback(() => {
    onTermSheetClose?.();
    // Recording terms re-applies them to a draft final and may unlock "Draft final package": refresh, quietly.
    load({ silent: true }).catch(() => undefined);
  }, [load, onTermSheetClose]);

  const client = useMemo(() => (parent ? createOperatorClient(call, parent.id) : null), [call, parent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !parent) return <div className="pp-root"><div className="pp-notice t-mut">Opening the production package…</div></div>;
  if (error && !parent) return <div className="pp-root"><div className="pp-notice t-warn"><span>{error.message}</span>{error.code !== "not_dealer_vertical" ? <PBtn size="sm" onClick={() => load()}>Try again</PBtn> : null}</div></div>;
  if (!parent || !client) return null;

  const open = (pkg: ProductionPackage) => router.push(`/production-package/${pkg.id}`);
  return (
    <div className="pp-root">
      {error ? <div className="pp-notice t-warn" style={{ marginBottom: 10 }}><span>{error.message}</span><PBtn size="sm" onClick={() => setError(null)}>Dismiss</PBtn></div> : null}
      <PPanel title="Engagement agreement" sub="Stage one — the commitment. Five steps, on its own page." right={statusChip(parent)}>
        <div className="pp-grid">
          <KV label="Status" value={parent.status.replace(/_/g, " ")} />
          <KV label="Last saved" value={whenLabel(parent.updated_at)} />
          <KV label="Open items" value={String(parent.computed?.attention?.length ?? 0)} />
        </div>
        <div className="pp-row" style={{ marginTop: 10 }}>
          <PBtn variant="pri" onClick={() => open(parent)}>Open the arrangement →</PBtn>
          {parent.executed_url ? <a className="pp-btn v-link s-sm" href={parent.executed_url} target="_blank" rel="noreferrer">Open the executed commitment</a> : null}
        </div>
      </PPanel>
      {finalPkg ? (
        <PPanel title="Production agreement" sub="Stage two — the final, drafted from the executed commitment and the term sheet." right={statusChip(finalPkg)}>
          <div className="pp-row"><PBtn onClick={() => open(finalPkg)}>Open the final →</PBtn></div>
        </PPanel>
      ) : null}
      {termSheetOpen ? (
        <TermSheetDrawer
          open={termSheetOpen}
          onClose={closeTermSheet}
          client={client}
          profileId={parent.profile_id}
          pkg={finalPkg ?? parent}
          onSaved={(result) => { if (result.final) setFinalPkg(result.final); }}
        />
      ) : null}
    </div>
  );
}
