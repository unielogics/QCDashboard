"use client";

// The Production Package on its own page, for someone who is signed in.
//
// The workspace used to be a tab inside two already-heavy file pages. It is a
// page now: the file's tab links here, and this route loads any package by id —
// the commitment or the final — and hands the workspace an authed transport.
// The backend derives the lens (operator / rep / partner) from the role, never
// from the route; a forwarded link with no account lives at
// /production-package/link/[token] instead.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { IconBtn, PageHeader } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useProductionCall } from "@/lib/productionTrainingCall";
import { createOperatorClient, loadPackage } from "@/production-package/client";
import { ProductionPackageWorkspace } from "@/production-package/ProductionPackageWorkspace";
import { errorMessage, errorStatus } from "@/production-package/format";
import { PBtn, PChip } from "@/production-package/ui";
import type { ProductionPackage } from "@/production-package/types";

function stageLabel(pkg: ProductionPackage): string {
  return pkg.stage === 2 ? "Production agreement · final" : "Engagement agreement · commitment";
}

/** Where "out" is. The desk came from the dealer file's Production Package tab; a partner from their lead. */
function fileHref(pkg: ProductionPackage): string | null {
  if (!pkg.intake_id) return null;
  if (pkg.mode === "partner") return `/broker/ai-underwriter-leads?lead=${pkg.intake_id}`;
  if (pkg.mode === "operator") return `/admin/ai-underwriter-leads?lead=${pkg.intake_id}&view=production`;
  return null;
}

function statusTone(status: string): "ok" | "warn" | "mut" | "acc" {
  return status === "executed" ? "ok" : status === "out_for_signature" ? "warn" : status === "void" ? "mut" : "acc";
}

export default function ProductionPackagePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const search = useSearchParams();
  const call = useProductionCall();

  const [pkg, setPkg] = useState<ProductionPackage | null>(null);
  const [error, setError] = useState<{ message: string; status: number | null } | null>(null);
  // The file page opens the drawer with ?share=1; the workspace's own Share button opens it too.
  const [shareOpen, setShareOpen] = useState(search?.get("share") === "1");

  const load = useCallback(async () => {
    setError(null);
    try {
      setPkg(await loadPackage(call, id));
    } catch (err) {
      setError({ message: errorMessage(err, "The production package could not be opened."), status: errorStatus(err) });
    }
  }, [call, id]);
  useEffect(() => { if (id) load().catch(() => undefined); }, [id, load]);

  const client = useMemo(() => (pkg ? createOperatorClient(call, pkg.id) : null), [call, pkg?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const closeShare = () => setShareOpen(false);
  const open = (packageId: string) => router.push(`/production-package/${packageId}`);
  const back = pkg ? fileHref(pkg) : null;
  const leave = () => { if (back) router.push(back); else if (window.history.length > 1) router.back(); else router.push("/"); };

  if (error) {
    return (
      <div className="pp-root">
        <PageHeader eyebrow="Production package" title={error.status === 404 ? "Not found" : "Could not open"} />
        <div className="pp-notice t-warn"><span>{error.message}</span>{error.status !== 404 ? <PBtn size="sm" onClick={() => load()}>Try again</PBtn> : null}</div>
      </div>
    );
  }
  if (!pkg || !client) return <div className="pp-root"><div className="pp-notice t-mut">Opening the production package…</div></div>;

  const dealer = String(pkg.arrangement?.dealer_name || "").trim() || "Production package";
  return (
    <div className="pp-root">
      {back ? <Link href={back} className="pp-backlink"><Icon name="chevL" size={13} /> Back to the file</Link> : null}
      <PageHeader
        eyebrow={stageLabel(pkg)}
        title={dealer}
        actions={<IconBtn aria-label="Close" title="Close" onClick={leave}><Icon name="x" size={16} /></IconBtn>}
        meta={(
          <div className="pp-row" style={{ gap: 6 }}>
            <PChip tone={statusTone(pkg.status)}>{pkg.status.replace(/_/g, " ")}</PChip>
            {pkg.final_package_id ? <button type="button" className="pp-chip c-mut" style={{ cursor: "pointer" }} onClick={() => open(pkg.final_package_id!)}>Open the final →</button> : null}
            {pkg.parent_package_id ? <button type="button" className="pp-chip c-mut" style={{ cursor: "pointer" }} onClick={() => open(pkg.parent_package_id!)}>← The executed commitment</button> : null}
          </div>
        )}
      />
      <ProductionPackageWorkspace
        key={pkg.id}
        client={client}
        initial={pkg}
        profileId={pkg.profile_id}
        onPackage={setPkg}
        shareOpen={shareOpen}
        onShareClose={closeShare}
        onOpenFinal={open}
        onOpenOriginal={open}
        onShare={pkg.capabilities.can_share ? () => setShareOpen(true) : undefined}
        onClose={leave}
      />
    </div>
  );
}
