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
  const run = async (work: (controller: AbortController, isCurrent: () => boolean) => Promise<MarketplacePpm | null>) => {
    if (!allowed || request.current) throw new Error("Wait for the current PPM operation to finish.");
    const capturedScope = scope, controller = new AbortController(); request.current = controller; setBusy(true);
    try {
      await client.cancelQueries({ queryKey: key });
      const isCurrent = () => mounted.current && !controller.signal.aborted && current.current === capturedScope;
      if (!isCurrent()) return null;
      const result = await work(controller, isCurrent);
      if (!isCurrent()) return null;
      if (result) client.setQueryData(key, result);
      return result;
    } finally { if (request.current === controller) { request.current = null; if (mounted.current && current.current === capturedScope) setBusy(false); } }
  };
  const mutate = (action: "generate" | "draft" | "review", body: PpmGenerate | PpmSave | PpmReview) => run(controller =>
    api<MarketplacePpm>(`/capital/admin/listings/${listingId}/ppm/${action}`, { method: action === "draft" ? "PATCH" : "POST", body: JSON.stringify(body), signal: controller.signal }));
  const prepare = (body: PpmGenerate, linked: boolean) => run(async (controller, isCurrent) => {
    await client.cancelQueries({ queryKey: ["cp-listing", listingId] });
    if (!isCurrent()) return null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (linked) {
        const listing = await api<CpListing>(`/capital/admin/listings/${listingId}/refresh-snapshot`, { method: "POST", body: "{}", signal: controller.signal });
        if (!isCurrent()) return null;
        client.setQueryData(["cp-listing", listingId], listing);
      }
      const latest = await api<MarketplacePpm>(`/capital/admin/listings/${listingId}/ppm`, { signal: controller.signal });
      if (!isCurrent()) return null;
      client.setQueryData(key, latest);
      // A retry against the same saved facts keeps its exact request identity;
      // newer saved facts are a different generation intent.
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([body.idempotency_key, latest.source_fingerprint])));
      if (!isCurrent()) return null;
      const idempotency_key = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
      try {
        return await api<MarketplacePpm>(`/capital/admin/listings/${listingId}/ppm/generate`, { method: "POST", body: JSON.stringify({ ...body, expected_source_fingerprint: latest.source_fingerprint, idempotency_key }), signal: controller.signal });
      } catch (error) {
        const code = (error as { body?: { detail?: { code?: string } } } | null)?.body?.detail?.code;
        if (attempt || code !== "ppm_source_changed" || !isCurrent()) throw error;
      }
    }
    return null;
  });
  const refreshListing = async () => {
    const capturedScope = scope;
    await client.cancelQueries({ queryKey: ["cp-listing", listingId] });
    const listing = await api<CpListing>(`/capital/admin/listings/${listingId}`);
    if (!mounted.current || current.current !== capturedScope) return;
    client.setQueryData(["cp-listing", listingId], listing);
    void client.invalidateQueries({ queryKey: ["cp-listings"] });
  };
  return { ...query, data: allowed ? query.data : undefined, allowed, scope, busy, mutate, prepare, refreshListing };
}
