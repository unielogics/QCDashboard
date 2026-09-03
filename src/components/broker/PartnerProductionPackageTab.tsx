"use client";
// The "Production package" tab on a dealer partner's own lead. Resolves the
// application profile for the intake (partner-owned intakes are admitted by
// the backend), then the stage-one package, and mounts the shared workspace
// on the operator transport. The transport is only a transport: the
// backend derives mode="partner" from the role and the capabilities decide
// what renders — a partner edits and sends stage one, never picks the
// sponsor, and never sees a final.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import type { ApplicationProfile } from "@/lib/applicationProfile";
import { createOperatorClient, resolvePackage } from "@/production-package/client";
import { ProductionPackageWorkspace } from "@/production-package/ProductionPackageWorkspace";
import { PBtn } from "@/production-package/ui";
import { errorDetail, errorMessage, errorStatus } from "@/production-package/format";
import type { ApiCall, ProductionPackage } from "@/production-package/types";

type Failure = { code?: string; message: string };

export function PartnerProductionPackageTab({ intakeId }: { intakeId: string }) {
  const authedFetch = useAuthedFetch();
  const call = useMemo<ApiCall>(() => (path, init) => authedFetch(path, {
    method: init?.method,
    body: typeof init?.body === "string" ? init.body : init?.body === undefined ? undefined : JSON.stringify(init.body),
    headers: init?.headers,
  }), [authedFetch]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [pkg, setPkg] = useState<ProductionPackage | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profile = await call<ApplicationProfile>("/application-profiles/resolve", { method: "POST", body: { source_kind: "intake", source_id: intakeId } });
      if (profile.vertical !== "dealer") {
        setError({ code: "not_dealer_vertical", message: "Production packages exist only on car-industry files. Ask the desk to classify this lead as a dealer file." });
        return;
      }
      setProfileId(profile.id);
      setPkg(await resolvePackage(call, profile.id));
    } catch (err) {
      const detail = errorDetail(err);
      const code = typeof detail?.code === "string" ? detail.code : undefined;
      const status = errorStatus(err);
      setError({
        code,
        message: status === 404 && code === "not_dealer_vertical"
          ? "Production packages exist only on car-industry files. Ask the desk to classify this lead as a dealer file."
          : status === 404
            ? "No production package is available on this lead yet."
            : errorMessage(err, "The production package could not be opened."),
      });
    } finally {
      setLoading(false);
    }
  }, [call, intakeId]);

  useEffect(() => { load().catch(() => undefined); }, [load]);

  const client = useMemo(() => (pkg ? createOperatorClient(call, pkg.id) : null), [call, pkg?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
  if (!pkg || !client || !profileId) return null;
  return (
    <div className="pp-root" style={{ height: "100%", minHeight: 0, overflow: "auto" }}>
      <ProductionPackageWorkspace key={pkg.id} client={client} initial={pkg} profileId={profileId} onPackage={setPkg} />
    </div>
  );
}
