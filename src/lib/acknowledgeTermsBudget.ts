import type { QueryClient } from "@tanstack/react-query";
import { dealBudgetDraftKey, dealBudgetKey, type DealBudget, type DealBudgetCalculation, type DealBudgetDraft, type DealBudgetWrite } from "./dealBudget";
import type { FinancialPlanRead } from "./financialCockpit";

/** Acknowledge the committed snapshot before releasing the matching cost draft. */
export function acknowledgeTermsBudget(client: QueryClient, profileId: string, submitted: DealBudgetWrite | undefined, snapshot: Partial<DealBudget> | undefined, revision: number | undefined, calculation?: DealBudgetCalculation, plan?: FinancialPlanRead | null) {
  if (!submitted) return;
  const previous = client.getQueryData<DealBudget>(dealBudgetKey(profileId));
  const committedRevision = revision ?? snapshot?.revision;
  if (committedRevision != null) client.setQueryData(dealBudgetKey(profileId), { ...previous, ...submitted, ...snapshot, profile_id: profileId, revision: committedRevision, can_edit: previous?.can_edit ?? true, calculation: snapshot?.calculation ?? calculation ?? {}, ...(plan ? { financial_plan: plan, financing_context: { ...previous?.financing_context, ...snapshot?.financing_context, plan_updated_at: plan.record.updated_at ?? null, current_loan_amount: plan.record.new_loan_amount } } : {}) });
  const kept = client.getQueryData<DealBudgetDraft | null>(dealBudgetDraftKey(profileId));
  if (kept && JSON.stringify(kept.value) === JSON.stringify(submitted)) client.setQueryData(dealBudgetDraftKey(profileId), null);
}
