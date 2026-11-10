import type { FinancialPlanWrite } from "./financialCockpit";

/** Read-only projection of the one loan being structured. It is never an approval. */
export type WorkingFinancing = {
  profileId: string;
  plan: FinancialPlanWrite;
  dirty: boolean;
  currentDscr: number | null;
  projectedDscr: number | null;
  projectedDebtServiceAnnual: number | null;
  source: string;
};
