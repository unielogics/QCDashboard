"use client";
// The "Production Package" tab on a dealer partner's own lead. The workspace
// lives on its own page (/production-package/[id]); the backend derives the
// partner lens from the role there, exactly as it did when this was a tab.
// This resolves the profile and the stage-one package and offers the way in.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApplicationProfile } from "@/lib/applicationProfile";
import { useProductionCall } from "@/lib/productionTrainingCall";
import { resolvePackage } from "@/production-package/client";
import { KV, PBtn, PChip, PPanel } from "@/production-package/ui";
import { errorDetail, errorMessage, errorStatus, whenLabel } from "@/production-package/format";
import type { ProductionPackage } from "@/production-package/types";

export function PartnerProductionPackageTab({ intakeId }: { intakeId: string }) {
  const call = useProductionCall();
  const router = useRouter();
  const [pkg, setPkg] = useState<ProductionPackage | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profile = await call<ApplicationProfile>("/application-profiles/resolve", { method: "POST", body: { source_kind: "intake", source_id: intakeId } });
      if (profile.vertical !== "dealer") {
        setError({ code: "not_dealer_vertical", message: "Production packages exist only on car-industry files." });
        return;
      }
      setPkg(await resolvePackage(call, profile.id));
    } catch (err) {
      const detail = errorDetail(err);
      const code = typeof detail?.code === "string" ? detail.code : undefined;
      setError({ code, message: errorStatus(err) === 404 && code === "not_dealer_vertical" ? "Production packages exist only on car-industry files." : errorMessage(err, "The production package could not be opened.") });
    } finally {
      setLoading(false);
    }
  }, [call, intakeId]);

  useEffect(() => { load().catch(() => undefined); }, [load]);

  if (loading && !pkg) return <div className="pp-root"><div className="pp-notice t-mut">Opening the production package…</div></div>;
  if (error) {
    return (
      <div className="pp-root">
        <div className={`pp-notice ${error.code === "not_dealer_vertical" ? "t-mut" : "t-warn"}`}>
          <span>{error.message}</span>
          {error.code !== "not_dealer_vertical" ? <PBtn size="sm" onClick={load}>Try again</PBtn> : null}
        </div>
      </div>
    );
  }
  if (!pkg) return null;
  const tone = pkg.status === "executed" ? "ok" : pkg.status === "out_for_signature" ? "warn" : pkg.status === "void" ? "mut" : "acc";
  return (
    <div className="pp-root">
      <PPanel title="Engagement agreement" sub="Stage one — the commitment. Five steps, on its own page." right={<PChip tone={tone}>{pkg.status.replace(/_/g, " ")}</PChip>}>
        <div className="pp-grid">
          <KV label="Status" value={pkg.status.replace(/_/g, " ")} />
          <KV label="Last saved" value={whenLabel(pkg.updated_at)} />
          <KV label="Open items" value={String(pkg.computed?.attention?.length ?? 0)} />
        </div>
        <div className="pp-row" style={{ marginTop: 10 }}><PBtn variant="pri" onClick={() => router.push(`/production-package/${pkg.id}`)}>Open the arrangement →</PBtn></div>
      </PPanel>
    </div>
  );
}
