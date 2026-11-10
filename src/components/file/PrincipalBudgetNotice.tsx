"use client";

import { Btn, Callout } from "@/components/ds";
import type { DealBudgetCalculation } from "@/lib/dealBudget";
import { money } from "@/lib/financialCockpit";
import { hasPrincipalBudgetMismatch, principalBudgetAmount, principalBudgetSolution } from "@/lib/principalBudget";
import styles from "./PrincipalBudgetNotice.module.css";

/** Keep a principal reconciliation actionable without silently changing the offer. */
export function PrincipalBudgetNotice({ calculation, currentAmount, pending = false, budgetDirty = false, canApply = true, onApply, onReview, fallback = false }: {
  calculation?: DealBudgetCalculation | null;
  currentAmount: number | null;
  pending?: boolean;
  budgetDirty?: boolean;
  canApply?: boolean;
  onApply: (amount: number) => void;
  onReview: () => void;
  fallback?: boolean;
}) {
  const solution = principalBudgetSolution(calculation);
  const mismatch = hasPrincipalBudgetMismatch(calculation, currentAmount);
  const unresolved = Boolean(solution && solution.status !== "calculated");
  if (!mismatch && !unresolved && !budgetDirty && !fallback) return null;
  const gross = principalBudgetAmount(solution?.gross_loan_amount);
  const net = principalBudgetAmount(solution?.net_client_cash ?? calculation?.net_client_cash);
  const issues = Array.isArray(solution?.issues) ? solution.issues.filter((value): value is string => typeof value === "string") : [];
  return <div className={styles.notice}><Callout tone="warn"><section className={styles.body} aria-label="Loan amount and fee budget" aria-live="polite">
    <strong>{pending ? "Checking the loan amount and fees…" : mismatch ? "Match the loan amount to your fee budget" : unresolved ? "Complete the fee calculation first" : budgetDirty ? "Save fee changes before saving terms" : "Review the loan amount and fee budget"}</strong>
    {!pending && mismatch ? <>
      <p>The total loan includes the fees and reserves you chose to finance. Review the amounts below before applying it.</p>
      <div className={styles.figures}>
        <div><small>Amount in these terms</small><strong>{money(currentAmount, 2)}</strong></div>
        <div><small>Total loan required</small><strong>{money(gross, 2)}</strong></div>
        <div><small>Client receives at funding</small><strong>{money(net, 2)}</strong></div>
      </div>
      {budgetDirty ? <p>After applying the amount, save the fee changes in Investment &amp; closing costs, then save your terms version.</p> : <p>Use this total loan amount, or review the client net target and fees to change the calculation. Then save your terms version.</p>}
    </> : !pending ? <p>{unresolved ? issues[0] || "Enter the missing amounts or revise the fees so the total loan can be calculated." : budgetDirty ? "Open Investment & closing costs and choose Save budget or Save budget & loan. Then return to save your terms version." : "Open Investment & closing costs to review the calculated total loan and client net proceeds."}</p> : null}
    <div className={styles.actions}>
      {!pending && mismatch && gross != null && canApply ? <Btn size="sm" variant="pri" onClick={() => onApply(gross)}>Use {money(gross, 2)} total loan</Btn> : null}
      <Btn size="sm" onClick={onReview}>{budgetDirty && !mismatch ? "Review & save fee changes" : "Review target & fees"}</Btn>
    </div>
  </section></Callout></div>;
}
