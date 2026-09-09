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
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ds";
import { useProductionCall } from "@/lib/productionTrainingCall";
import { createOperatorClient, loadPackage } from "@/production-package/client";
import { ProductionPackageWorkspace } from "@/production-package/ProductionPackageWorkspace";
import { errorMessage, errorStatus } from "@/production-package/format";
import { PBtn, PChip } from "@/production-package/ui";
import type { ProductionPackage } from "@/production-package/types";

function stageLabel(pkg: ProductionPackage): string {
  return pkg.stage === 2 ? "Production agreement · final" : "Engagement agreement · commitment";
}

function statusTone(status: string): "ok" | "warn" | "mut" | "acc" {
  return status === "executed" ? "ok" : status === "out_for_signature" ? "warn" : status === "void" ? "mut" : "acc";
}

export default function ProductionPackagePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const call = useProductionCall();

  const [pkg, setPkg] = useState<ProductionPackage | null>(null);
  const [error, setError] = useState<{ message: string; status: number | null } | null>(null);

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
  const shareOpen = search?.get("share") === "1";
  const closeShare = () => router.replace(pathname ?? `/production-package/${id}`);
  const open = (packageId: string) => router.push(`/production-package/${packageId}`);

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
      <PageHeader
        eyebrow={stageLabel(pkg)}
        title={dealer}
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
      />
    </div>
  );
}
