import { money } from "@/lib/financialCockpit";
import type { refinanceSelectionTotals } from "@/lib/refinanceSelectionTotals";
import styles from "./FinancialReview.module.css";

function signed(value: number | null): string {
  return value == null ? "Not available" : (value < 0 ? "−" : value > 0 ? "+" : "") + money(Math.abs(value));
}

export function RefinanceSelectionSummary({ totals, coverageEquivalent = false }: {
  totals: ReturnType<typeof refinanceSelectionTotals>;
  coverageEquivalent?: boolean;
}) {
  const blocked = totals.needsReview || totals.monthlyUnknown > 0;
  return <section className={styles.selectionSummary} aria-label="Selected loan and monthly payment totals">
    <div className={styles.selectionSummaryHead}>
      <span><strong>{totals.selectedCount} {totals.selectedCount === 1 ? "loan" : "loans"} selected</strong><small>Payoff total{totals.payoffUnknown ? " · known amounts" : ""}</small></span>
      <div className={styles.selectionPayoff}><strong className="num">{totals.needsReview ? "Needs review" : totals.payoffTotal == null ? "Unknown" : money(totals.payoffTotal)}</strong>{totals.payoffUnknown > 0 ? <small>{totals.payoffUnknown} payoff {totals.payoffUnknown === 1 ? "amount" : "amounts"} unknown</small> : null}</div>
    </div>
    <div className={styles.selectionMetrics}>
      <div><span>Monthly payments removed</span><strong className="num">{totals.needsReview ? "Needs review" : totals.monthlyRemoved == null ? "Unknown" : (totals.monthlyRemoved > 0 ? "−" : "") + money(totals.monthlyRemoved)}{totals.monthlyUnknown > 0 && totals.monthlyRemoved != null ? <small> known</small> : null}</strong></div>
      <div><span>{coverageEquivalent ? "+ New monthly equivalent" : "+ New monthly payment"}</span><strong className="num">{totals.monthlyAdded == null ? "Not set" : (totals.monthlyAdded > 0 ? "+" : "") + money(totals.monthlyAdded)}</strong></div>
      <div><span>Net monthly change</span><strong className="num">{blocked ? "Needs details" : totals.monthlyAdded == null ? "New payment not set" : signed(totals.netMonthly)}</strong></div>
      <div><span>Monthly debt service after plan</span><strong className="num">{blocked ? "Needs details" : totals.monthlyAdded == null ? "New payment not set" : totals.monthlyAfter == null ? "Not available" : money(totals.monthlyAfter)}</strong></div>
    </div>
    {totals.needsReview ? <p className={styles.selectionNote}>Review the previous loan selections before relying on these totals.</p> : null}
    {totals.monthlyUnknown > 0 ? <p className={styles.selectionNote}>{totals.monthlyUnknown} selected monthly {totals.monthlyUnknown === 1 ? "payment is" : "payments are"} not provided. Net and after-plan totals need those details.</p> : null}
    {!blocked && totals.monthlyAdded == null && totals.remainingMonthly != null ? <p className={styles.selectionNote}>Existing monthly payments remaining: <strong>{money(totals.remainingMonthly)}</strong>. Add the new payment to complete the comparison.</p> : null}
    {totals.basisAdjusted && !blocked ? <p className={styles.selectionNote}>Net change follows the current debt-service calculation inputs and overrides.</p> : null}
  </section>;
}
