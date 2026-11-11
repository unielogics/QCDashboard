import type { DealBudget, DealBudgetDraft, DealBudgetWrite } from "./dealBudget";
import type { FinancialPlanRead, FinancialPlanWrite } from "./financialCockpit";

export type MarketplaceBudgetReceipt = { budget: DealBudget; planSaved: boolean; submittedPlan: FinancialPlanWrite | null };
export type MarketplaceBudgetControls = { profileId: string; needsSave: boolean; busy: boolean; blocker: string | null; persist: () => Promise<MarketplaceBudgetReceipt> };
export type MarketplacePlanControls = { profileId: string; dirty: boolean; busy: boolean; blocker: string | null; persist: (receipt?: MarketplaceBudgetReceipt) => Promise<FinancialPlanRead | null>; assertCurrent: () => void };

export function marketplaceBudgetDraftFingerprint(value: DealBudgetWrite, removed: DealBudgetDraft["removed"] = []) {
  return JSON.stringify({ value, removed });
}

export function hasNewerMarketplaceBudgetDraft(profileId: string, submittedFingerprint: string, latest: DealBudgetDraft | null | undefined) {
  return latest?.profileId === profileId && marketplaceBudgetDraftFingerprint(latest.value, latest.removed ?? []) !== submittedFingerprint;
}

/** Budget/principal writes acknowledge their full plan before any later listing write. */
export async function prepareMarketplaceFinancing(profileId: string, budget: MarketplaceBudgetControls | null, plan: MarketplacePlanControls | null, stage: (message: string) => void, guard: () => void = () => {}) {
  guard();
  if (!budget || budget.profileId !== profileId || !plan || plan.profileId !== profileId) throw new Error("The shared financial editors are still loading. Try again in a moment.");
  if (budget.busy || plan.busy) throw new Error("A financial save is in progress. Wait for it to finish, then try again.");
  if (plan.blocker) throw new Error(plan.blocker);
  let receipt: MarketplaceBudgetReceipt | undefined;
  if (budget.needsSave) {
    if (budget.blocker) throw new Error(budget.blocker);
    stage("Saving costs and shared loan…");
    receipt = await budget.persist();
    guard();
  }
  if (receipt?.planSaved || plan.dirty) {
    stage(receipt?.planSaved ? "Confirming saved shared loan…" : "Saving shared coverage plan…");
    await plan.persist(receipt);
    guard();
  }
}

export function explicitMarketplaceCopy(head: { name: string; summary: string }, touched: { title: boolean; summary: boolean }) {
  return {
    ...(head.name.trim() ? { name: head.name.trim() } : {}),
    ...(head.summary.trim() || touched.summary ? { summary: head.summary.trim() } : {}),
  };
}

export function existingMarketplaceListingId(error: unknown): string | null {
  const detail = (error as { body?: { detail?: { code?: string; listing_id?: unknown } } } | null)?.body?.detail;
  return detail?.code === "listing_exists" && typeof detail.listing_id === "string" ? detail.listing_id : null;
}
