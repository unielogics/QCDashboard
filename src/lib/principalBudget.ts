import type { DealBudgetCalculation } from "./dealBudget";

export function principalBudgetSolution(calculation?: DealBudgetCalculation | null) {
  const value = calculation?.principal_solution;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function principalBudgetAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function hasPrincipalBudgetMismatch(calculation: DealBudgetCalculation | null | undefined, currentAmount: number | null) {
  const solution = principalBudgetSolution(calculation);
  const gross = principalBudgetAmount(solution?.gross_loan_amount);
  return solution?.status === "calculated" && gross != null && gross > 0
    && (currentAmount == null || Math.abs(gross - currentAmount) > 0.005);
}

export function isPrincipalBudgetError(message: string) {
  return message.includes("Apply the calculated gross principal to the shared loan");
}
