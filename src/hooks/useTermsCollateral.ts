"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthedApi } from "@/hooks/useApi";
import type { InvestorCollateral } from "@/lib/investorCollateral";
import { collateralDraftKey, type CollateralWorkingDraft } from "@/lib/collateralWorkingDraft";

/** Share the displayed collateral revision with every loan editor. */
export function useTermsCollateral(profileId: string) {
  const api = useAuthedApi();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["file-collateral", profileId], queryFn: () => api<InvestorCollateral>(`/application-profiles/${profileId}/collateral`), refetchOnMount: "always" });
  const verifyRevision = async () => {
    if (queryClient.getQueryData<CollateralWorkingDraft>(collateralDraftKey(profileId))?.dirty) throw new Error("Collateral has unsaved changes. Save or discard those collateral changes before saving loan terms.");
    if (query.data?.revision == null) throw new Error("Load and review this file’s collateral before saving the terms.");
    const latest = await api<InvestorCollateral>(`/application-profiles/${profileId}/collateral`);
    if (latest.revision !== query.data.revision) {
      await query.refetch();
      throw new Error("Collateral changed in another session. Review the current collateral, then save the terms again.");
    }
    return latest.revision;
  };
  return { ...query, verifyRevision };
}
