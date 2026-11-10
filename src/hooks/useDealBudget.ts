"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthedApi } from "@/hooks/useApi";
import { dealBudgetChanged, dealBudgetDraftKey, dealBudgetKey, type DealBudget, type DealBudgetDraft } from "@/lib/dealBudget";

export function useDealBudget(profileId: string) {
  const api = useAuthedApi(), queryClient = useQueryClient();
  const query = useQuery({ queryKey: dealBudgetKey(profileId), queryFn: () => api<DealBudget>(`/application-profiles/${profileId}/deal-budget`), enabled: !!profileId, staleTime: 15_000 });
  const verifyRevision = async () => {
    const shown = query.data;
    if (!shown) throw new Error("Load and review the deal budget before saving loan terms.");
    const draft = queryClient.getQueryData<DealBudgetDraft | null>(dealBudgetDraftKey(profileId));
    if (draft && dealBudgetChanged(draft.value, shown)) throw new Error("The deal budget has unsaved changes. Save or discard those cost changes before saving the loan terms.");
    const latest = await api<DealBudget>(`/application-profiles/${profileId}/deal-budget`);
    if (latest.revision !== shown.revision) {
      queryClient.setQueryData(dealBudgetKey(profileId), latest);
      throw new Error("The deal budget changed in another session. Review the current costs and investor funding, then save the terms again.");
    }
    return latest.revision;
  };
  return { ...query, verifyRevision };
}
