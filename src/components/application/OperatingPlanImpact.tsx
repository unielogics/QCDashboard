"use client";

import { useState } from "react";
import { metricAmountLabel } from "@/lib/financialMetrics";
import type { OperatingEvaluation, OperatingMetricValues } from "@/lib/operatingPlan";
import styles from "./OperatingPlanImpact.module.css";

const metrics: Array<[keyof OperatingMetricValues, string]> = [
  ["earnings", "Annual earnings"], ["noi", "Annual NOI"], ["dscr", "DSCR"],
  ["cash_after_debt", "Cash after debt"], ["operating_margin", "Operating margin"], ["debt_service", "Annual debt service"],
];

export function OperatingPlanImpact({ evaluation, baselineEvaluation, pending, strip }: {
  evaluation?: OperatingEvaluation | null; baselineEvaluation?: OperatingEvaluation | null; pending?: boolean; strip?: boolean;
}) {
  const [scenario, setScenario] = useState<"proposed" | "approved">("proposed");
  const comparison = evaluation?.comparison;
  const baseline = evaluation?.baseline ?? baselineEvaluation?.baseline;
  const noReviews = scenario === "approved" && evaluation?.totals?.approved?.count === 0;
  const loanLabel = comparison?.loan_basis === "saved_terms" ? "Saved loan terms" : comparison?.loan_basis === "incomplete_terms" ? "Loan terms need inputs" : "Current debt";
  const format = (key: keyof OperatingMetricValues, value: number | null | undefined) => {
    if (value == null) return "—";
    if (key === "dscr") return `${value.toFixed(2)}×`;
    if (key === "operating_margin") return `${value.toFixed(1)}%`;
    const currency = key === "noi" ? baseline?.noi_currency ?? baseline?.noi_governance?.currency : key === "debt_service" ? "USD" : baseline?.currency;
    return metricAmountLabel(value, currency, 0);
  };
  return <section className={`${styles.impact} ${strip ? styles.strip : ""}`} aria-label="Plan impact comparison" aria-busy={Boolean(pending)}>
    <header><strong>{strip ? "Financial impact" : "Live impact"}</strong>
      <div className={styles.switcher} role="group" aria-label="Plan scenario">
        {(["proposed", "approved"] as const).map(key => <button key={key} type="button" aria-pressed={scenario === key}
          onClick={() => setScenario(key)}>{key === "approved" ? "Reviewed" : "Proposed"}</button>)}
      </div>
    </header>
    <dl>{metrics.map(([key, title]) => {
      const label = key === "earnings" && baseline?.earnings_kind?.includes("ebitda") ? "Annual EBITDA" : title;
      const current = (comparison?.baseline ?? baselineEvaluation?.comparison?.baseline)?.[key];
      const plan = comparison?.[scenario][key];
      return <div key={key}><dt>{label}</dt><dd>
        <span aria-label={`Current ${label}`}>{format(key, current)}</span><span aria-hidden="true">→</span>
        <b aria-label={`${scenario === "approved" ? "Reviewed" : "Proposed"} ${label}`}>{pending ? "…" : format(key, plan)}</b>
      </dd></div>;
    })}</dl>
    {!pending && comparison?.target_gap?.[scenario] != null ? <p className={styles.target}>
      {comparison.target_gap[scenario] === 0 ? "1.25× coverage target met" :
        `${metricAmountLabel(comparison.target_gap[scenario], "USD", 0)} more annual earnings to reach 1.25×`}
    </p> : null}
    <small>{pending ? "Recalculating the plan…" : !comparison ? "Awaiting financial inputs" : noReviews ? "Awaiting reviewed operating changes" :
      `Current → ${scenario === "approved" ? "reviewed" : "proposed"} · ${loanLabel}${scenario === "proposed" && comparison.proposed_basis === "before_implementation_costs_and_timing" ? " · Before setup costs" : ""}`}</small>
  </section>;
}
