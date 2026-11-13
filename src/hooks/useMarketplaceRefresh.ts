"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthedApi, useCurrentUser } from "./useApi";
import { Role } from "@/lib/enums.generated";
import { checkedMarketplaceRefresh, marketplaceRefreshCompletionKey, marketplaceRefreshPending, type MarketplaceRefreshJob } from "@/lib/marketplaceRefresh";

export function useMarketplaceRefresh(listingId: string, linked: boolean) {
  const api = useAuthedApi(), staff = useCurrentUser(), client = useQueryClient();
  const identity = staff.authScope ?? staff.data?.id ?? null;
  const allowed = linked && staff.authReady !== false && staff.data?.role === Role.SUPER_ADMIN && Boolean(identity);
  const scope = `${listingId}:${identity || "unresolved"}:${allowed}`;
  const current = useRef(scope); current.current = scope;
  const mounted = useRef(true), request = useRef<AbortController | null>(null), intent = useRef<string | null>(null);
  const observed = useRef<string | null>(null), failedObservation = useRef<string | null>(null);
  const [starting, setStarting] = useState(false), [error, setError] = useState("");
  const key = ["cp-refresh", listingId, identity] as const;
  useEffect(() => { mounted.current = true; intent.current = null; observed.current = null; failedObservation.current = null; setStarting(false); setError(""); return () => { mounted.current = false; request.current?.abort(); request.current = null; }; }, [scope]);
  const query = useQuery({ queryKey: key, enabled: allowed, retry: false, staleTime: 0,
    queryFn: async ({ signal }) => checkedMarketplaceRefresh(await api<MarketplaceRefreshJob>(`/capital/admin/listings/${listingId}/refresh`, { signal }), listingId),
    refetchInterval: state => marketplaceRefreshPending(state.state.data) ? 1500 : 30_000,
  });
  const job = allowed ? query.data : undefined;
  const completion = marketplaceRefreshCompletionKey(job);
  const observation = JSON.stringify([job?.job_id, job?.status, job?.requested_at, job?.completed_at]);
  useEffect(() => { if (error && job?.job_id && failedObservation.current !== observation) { setError(""); intent.current = null; failedObservation.current = null; } }, [error, observation, job?.job_id]);
  useEffect(() => {
    if (!allowed || !completion || observed.current === completion) return;
    observed.current = completion;
    // Only canonical reads update listing/PPM caches. Local terms and PPM wording retain their own dirty guards.
    void client.invalidateQueries({ queryKey: ["cp-listing", listingId] });
    void client.invalidateQueries({ queryKey: ["cp-listings"] });
    void client.invalidateQueries({ queryKey: ["cp-ppm", listingId, identity] });
  }, [allowed, completion, client, listingId, identity]);
  const refresh = async () => {
    if (!allowed || request.current || marketplaceRefreshPending(job)) return;
    const captured = scope, priorObservation = observation, controller = new AbortController(); request.current = controller;
    intent.current ||= crypto.randomUUID(); setStarting(true); setError("");
    try {
      await client.cancelQueries({ queryKey: key });
      const reply = checkedMarketplaceRefresh(await api<MarketplaceRefreshJob>(`/capital/admin/listings/${listingId}/refresh`, { method: "POST", body: JSON.stringify({ idempotency_key: intent.current }), signal: controller.signal }), listingId);
      if (!mounted.current || controller.signal.aborted || current.current !== captured) return;
      intent.current = null; client.setQueryData(key, reply);
      void query.refetch();
    } catch (reason) {
      if (mounted.current && !controller.signal.aborted && current.current === captured) { failedObservation.current = priorObservation; setError(reason instanceof Error ? reason.message : "The saved figures could not be refreshed. Try again."); }
    } finally { if (request.current === controller) { request.current = null; if (mounted.current && current.current === captured) setStarting(false); } }
  };
  return { job, allowed, starting, pending: starting || marketplaceRefreshPending(job), error, statusError: query.isError, refresh, retryStatus: query.refetch };
}
