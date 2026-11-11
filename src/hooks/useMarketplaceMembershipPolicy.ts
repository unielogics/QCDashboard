"use client";

import { useQuery } from "@tanstack/react-query";
import { Role } from "@/lib/enums.generated";
import type { MarketplaceMembershipPolicy } from "@/lib/marketplaceMembership";
import { useAuthedApi, useCurrentUser } from "./useApi";

export function useMarketplaceMembershipPolicy() {
  const api = useAuthedApi(), staff = useCurrentUser();
  const identity = staff.authScope ?? staff.data?.id ?? null;
  const allowed = staff.authReady !== false && staff.data?.role === Role.SUPER_ADMIN && Boolean(identity);
  const query = useQuery({ queryKey: ["cp-membership-policy", identity], queryFn: ({ signal }) => api<MarketplaceMembershipPolicy>("/capital/admin/membership-policy", { signal }), enabled: allowed, retry: false, staleTime: 15_000 });
  return { ...query, data: allowed ? query.data : undefined, allowed };
}
