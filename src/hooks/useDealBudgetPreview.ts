"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthedApi } from "@/hooks/useApi";
import { useDealBudget } from "@/hooks/useDealBudget";
import { dealBudgetDraftKey, dealBudgetWrite, type DealBudget, type DealBudgetDraft, type DealBudgetLoan, type DealBudgetWrite } from "@/lib/dealBudget";
import type { FinancialPlanWrite, PlanEvaluation } from "@/lib/financialCockpit";

export type DealBudgetPreviewRead = DealBudget & { financial_plan_evaluation?: PlanEvaluation | null };

/** Exact-input server previews are shared by the editor and the financial cockpit. */
export function useDealBudgetPreview(profileId: string, options: { enabled?: boolean; value?: DealBudgetWrite | null; loan?: DealBudgetLoan | null; financialPlan?: FinancialPlanWrite | null } = {}) {
  const api = useAuthedApi(), budget = useDealBudget(profileId, options.enabled !== false);
  const draft = useQuery<DealBudgetDraft | null>({ queryKey: dealBudgetDraftKey(profileId), queryFn: async () => null, enabled: false, initialData: null, gcTime: Infinity });
  const value = options.value ?? (draft.data?.profileId === profileId ? draft.data.value : budget.data ? dealBudgetWrite(budget.data) : null);
  const fingerprint = JSON.stringify({ profileId, value, loan: options.loan ?? null, financialPlan: options.financialPlan ?? null });
  const [settled, setSettled] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => setSettled(fingerprint), 300); return () => window.clearTimeout(timer); }, [fingerprint]);
  const enabled = options.enabled !== false && Boolean(value);
  const query = useQuery({ queryKey: ["file-deal-budget-preview", profileId, settled], enabled: enabled && settled === fingerprint,
    queryFn: async () => { const input = JSON.parse(settled) as { value: DealBudgetWrite; loan: DealBudgetLoan | null; financialPlan: FinancialPlanWrite | null }; return api<DealBudgetPreviewRead>(`/application-profiles/${profileId}/deal-budget/preview`, { method: "POST", body: JSON.stringify({ ...input.value, ...(input.loan ? { loan: input.loan } : {}), ...(input.financialPlan ? { financial_plan: input.financialPlan } : {}) }) }); },
    staleTime: 15_000, gcTime: 60_000, retry: false,
  });
  const matches = enabled && settled === fingerprint;
  const data = matches ? query.data : undefined;
  return { ...query, data, budget, value, fingerprint, pending: enabled && (!matches || query.isPending), error: matches ? query.error : null };
}
