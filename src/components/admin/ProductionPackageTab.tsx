"use client";
// The "Production Package" tab on a car-industry AI intake file. Resolves the
// application profile, then the package, then hands the mirrored workspace an
// authed transport. Everything under src/production-package is shared with the
// rep app byte-for-byte; this wrapper is the dashboard-specific glue.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthedApi } from "@/hooks/useApi";
import type { ApplicationProfile } from "@/lib/applicationProfile";
import { createOperatorClient, resolvePackage } from "@/production-package/client";
import { ProductionPackageWorkspace } from "@/production-package/ProductionPackageWorkspace";
import { PBtn } from "@/production-package/ui";
import { errorDetail, errorMessage, errorStatus } from "@/production-package/format";
import type { ApiCall, ProductionPackage } from "@/production-package/types";

export function ProductionPackageTab({ intakeId, shareOpen, onShareClose }: { intakeId: string; shareOpen: boolean; onShareClose: () => void }) {
  const apiCall = useAuthedApi();
  const call = useMemo<ApiCall>(() => (path, init) => apiCall(path, {
    method: init?.method,
    body: typeof init?.body === "string" ? init.body : init?.body === undefined ? undefined : JSON.stringify(init.body),
    headers: init?.headers,
  }), [apiCall]);
  const [pkg, setPkg] = useState<ProductionPackage | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profile = await call<ApplicationProfile>("/application-profiles/resolve", { method: "POST", body: { source_kind: "intake", source_id: intakeId } });
      if (profile.vertical !== "dealer") {
        setError({ code: "not_dealer_vertical", message: "Production packages exist only on car-industry files. Classify this file as a dealer file first." });
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
  if (error) return <div className="pp-root"><div className="pp-notice t-warn"><span>{error.message}</span><PBtn size="sm" onClick={load}>Try again</PBtn></div></div>;
  if (!pkg) return null;
  const client = createOperatorClient(call, pkg.id);
  return <ProductionPackageWorkspace client={client} initial={pkg} shareOpen={shareOpen} onShareClose={onShareClose} />;
}
