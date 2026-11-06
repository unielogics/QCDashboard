"use client";

import type { RefinanceEbitda } from "@/lib/ebitdaRefinance";
import { metricAmountLabel, metricCurrency } from "@/lib/financialMetrics";
import styles from "./CoverageEbitdaMetric.module.css";

export function CoverageEbitdaMetric({ value, side, unsaved = false, scenarioActive = false, corrected = false }: {
  value: RefinanceEbitda | undefined; side: "today" | "plan";
  unsaved?: boolean; scenarioActive?: boolean; corrected?: boolean;
}) {
  const annual = value?.annual_before != null;
  const amount = side === "today" ? annual ? value?.annual_before : value?.before : annual ? value?.annual_after : value?.after;
  const periodBasis = annual ? value?.annualization_factor === 1 ? "annual" : "annualized" : "source period";
  const adjusted = value?.adjusted_annual;
  const showAdjusted = side === "plan" && adjusted?.status === "hypothetical_adjusted" && adjusted.after != null;
  const tax = value?.tax_estimate;
  const label = side === "today" ? "EBITDA today" : "EBITDA with the plan";
  const currency = metricCurrency(value?.currency, value?.source_refs);
  return <section className={styles.metric} aria-label={side === "today" ? "Today EBITDA" : "With the plan EBITDA"}>
    <div className={styles.heading}><span>{label}{amount != null ? ` · ${periodBasis}` : ""}</span>{value?.provisional && amount != null ? <small>Provisional source</small> : null}</div>
    <strong className={amount != null && amount < 0 ? styles.negative : undefined}>{amount == null ? "Not available" : metricAmountLabel(amount, currency, 0)}</strong>
    <small>{amount == null ? "A reconciled P&L is needed to establish EBITDA." : [value?.period, annual && value?.annualization_factor != null && value.annualization_factor !== 1 ? `annualization × ${value.annualization_factor}` : null, currency || "currency unconfirmed", corrected ? "staff-corrected source" : null].filter(Boolean).join(" · ")}</small>
    {side === "plan" ? <small>{unsaved ? "Unsaved scenario preview." : scenarioActive ? "Saved scenario." : "No refinance scenario saved."} Source EBITDA stays unchanged by financing alone.</small> : null}
    {showAdjusted ? <div className={styles.adjusted}><span>Adjusted EBITDA · hypothetical annual</span><strong>{metricAmountLabel(adjusted.after, adjusted.currency, 0)}</strong><small>Includes operating assumptions; unverified.</small></div> : null}
    {amount == null && tax?.value != null ? <small>Tax-derived earnings estimate: <b>{metricAmountLabel(tax.value, metricCurrency(tax.currency, tax.source_refs), 0)}</b>{tax.period ? ` · ${tax.period}` : ""}. This estimate does not establish P&L EBITDA.</small> : null}
  </section>;
}
