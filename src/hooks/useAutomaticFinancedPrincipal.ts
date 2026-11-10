"use client";

import { useEffect, useRef } from "react";
import { hasPrincipalBudgetMismatch, principalBudgetAmount, principalBudgetSolution } from "@/lib/principalBudget";
import type { useDealBudgetPreview } from "./useDealBudgetPreview";

/** Apply only the server response that belongs to this exact working draft. */
export function useAutomaticFinancedPrincipal(preview: ReturnType<typeof useDealBudgetPreview>, currentAmount: number | null, onChange: (amount: number) => void, enabled = true) {
  const callback = useRef(onChange); callback.current = onChange;
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || preview.pending || preview.isFetching || preview.isError || !preview.data || !hasPrincipalBudgetMismatch(preview.data.calculation, currentAmount)) return;
    const amount = principalBudgetAmount(principalBudgetSolution(preview.data.calculation)?.gross_loan_amount);
    if (amount == null || applied.current === preview.fingerprint) return;
    applied.current = preview.fingerprint; callback.current(amount);
  }, [enabled, preview.pending, preview.isFetching, preview.isError, preview.data, preview.fingerprint, currentAmount]);
}
