"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthedApi, useCurrentUser } from "./useApi";
import { Role } from "@/lib/enums.generated";
import type { MarketplacePpm, PpmGenerate, PpmReview, PpmSave } from "@/lib/marketplacePpm";
import type { CpListing } from "./useCapitalPartners";

export function useMarketplacePpm(listingId: string, active: boolean) {
  const api = useAuthedApi(), staff = useCurrentUser(), client = useQueryClient();
  const identity = staff.authScope ?? staff.data?.id ?? null;
  const allowed = staff.authReady !== false && staff.data?.role === Role.SUPER_ADMIN && Boolean(identity);
  const [busy, setBusy] = useState(false);
  const scope = `${listingId}:${identity ?? "unresolved"}:${allowed}`;
  const current = useRef(scope); current.current = scope;
  const mounted = useRef(true), request = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; setBusy(false); return () => { mounted.current = false; request.current?.abort(); request.current = null; }; }, [scope]);
  const key = ["cp-ppm", listingId, identity] as const;
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => api<MarketplacePpm>(`/capital/admin/listings/${listingId}/ppm`, { signal }), enabled: active && allowed && !busy, staleTime: 0, retry: false, refetchInterval: active && allowed && !busy ? 15_000 : false, refetchOnWindowFocus: active });
  const mutate = async (action: "generate" | "draft" | "review", body: PpmGenerate | PpmSave | PpmReview) => {
    if (!allowed || request.current) throw new Error("Wait for the current PPM operation to finish.");
    const capturedScope = scope, controller = new AbortController(); request.current = controller; setBusy(true);
    try {
      await client.cancelQueries({ queryKey: key });
      const result = await api<MarketplacePpm>(`/capital/admin/listings/${listingId}/ppm/${action}`, { method: action === "draft" ? "PATCH" : "POST", body: JSON.stringify(body), signal: controller.signal });
      if (!mounted.current || controller.signal.aborted || current.current !== capturedScope) return null;
      client.setQueryData(key, result);
      return result;
    } finally { if (request.current === controller) { request.current = null; if (mounted.current && current.current === capturedScope) setBusy(false); } }
  };
  const refreshListing = async () => {
    const capturedScope = scope;
    await client.cancelQueries({ queryKey: ["cp-listing", listingId] });
    const listing = await api<CpListing>(`/capital/admin/listings/${listingId}`);
    if (!mounted.current || current.current !== capturedScope) return;
    client.setQueryData(["cp-listing", listingId], listing);
    void client.invalidateQueries({ queryKey: ["cp-listings"] });
  };
  return { ...query, data: allowed ? query.data : undefined, allowed, scope, busy, mutate, refreshListing };
}
