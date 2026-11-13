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
  const currency = (key: keyof OperatingMetricValues) => key === "noi" ? baseline?.noi_currency ?? baseline?.noi_governance?.currency : key === "debt_service" ? "USD" : baseline?.currency;
  const format = (key: keyof OperatingMetricValues, value: number | null | undefined) => {
    if (value == null) return "—";
    if (key === "dscr") return `${value.toFixed(2)}x`;
    if (key === "operating_margin") return `${value.toFixed(1)}%`;
    return metricAmountLabel(value, currency(key), 0);
  };
  const currentRatio = (comparison?.baseline ?? baselineEvaluation?.comparison?.baseline)?.dscr;
  const planRatio = pending ? null : comparison?.[scenario].dscr;
  const scale = Math.max(1.5, currentRatio ?? 0, planRatio ?? 0);
  const gap = pending ? null : comparison?.target_gap?.[scenario];
  return <div className={`${styles.stack} ${strip ? styles.stripStack : ""}`}>
    <section className={`${styles.impact} ${strip ? styles.strip : ""}`} aria-label="Plan impact comparison" aria-busy={Boolean(pending)}>
      <header><strong>{strip ? "Financial impact" : "Live impact"}</strong>
        <div className={styles.switcher} role="group" aria-label="Plan scenario">
          {(["proposed", "approved"] as const).map(key => <button key={key} type="button" aria-pressed={scenario === key}
            onClick={() => setScenario(key)}>{key === "approved" ? "Reviewed" : "Proposed"}</button>)}
        </div>
      </header>
      <dl>{metrics.map(([key, title]) => {
        const label = key === "earnings" && baseline?.earnings_kind?.includes("ebitda") ? "Annual EBITDA" : title;
        const current = (comparison?.baseline ?? baselineEvaluation?.comparison?.baseline)?.[key];
        const planned = pending ? null : comparison?.[scenario][key];
        const delta = current != null && planned != null ? planned - current : null;
        const improvement = delta == null ? null : key === "debt_service" ? -delta : delta;
        const deltaText = delta == null ? "" : `${delta > 0 ? "+" : ""}${key === "operating_margin" ? `${delta.toFixed(1)} pts` : format(key, delta)}`;
        return <div key={key} className={styles.metric}>
          <div className={styles.metricNumbers}><dt>{label}</dt><dd>
            <span className={`${styles.before} ${current != null && current < 0 ? styles.loss : ""}`} aria-label={`Current ${label}`}>{format(key, current)}</span>
            <span className={styles.arrow} aria-hidden="true">→</span>
            <b className={styles.after} aria-label={`${scenario === "approved" ? "Reviewed" : "Proposed"} ${label}`}>{pending ? "Updating…" : format(key, planned)}</b>
          </dd></div>
          {!strip && delta != null ? <span className={`${styles.delta} ${improvement != null && improvement > 0 ? styles.positive : improvement != null && improvement < 0 ? styles.negative : styles.neutral}`}>{deltaText}</span> : null}
        </div>;
      })}</dl>
      <small className={styles.note}>{pending ? "Recalculating the plan." : !comparison ? "Awaiting financial inputs" : noReviews ? "Awaiting reviewed operating changes" :
        `Current → ${scenario === "approved" ? "reviewed" : "proposed"} · ${loanLabel}${scenario === "proposed" && comparison.proposed_basis === "before_implementation_costs_and_timing" ? " · Before setup costs" : ""}`}</small>
    </section>
    {!strip ? <section className={styles.coverage} aria-label="DSCR lender threshold" aria-busy={Boolean(pending)}>
      <div className={styles.coverageHeading}><strong>DSCR · Lender threshold</strong>{planRatio != null ? <span className={`${styles.delta} ${planRatio >= 1.25 ? styles.positive : styles.neutral}`}>{planRatio >= 1.25 ? "Target met" : planRatio >= 1 ? "Covers debt" : "Below 1.00x"}</span> : null}</div>
      <div className={styles.coverageScale}><span>0x</span><span>1.25x target</span></div>
      <div className={styles.coverageBars}>{[["Baseline", currentRatio], [scenario === "approved" ? "Reviewed" : "Plan", planRatio]].map(([label, ratio]) => <div key={String(label)}>
        <span>{label}</span><div className={styles.barTrack} aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, typeof ratio === "number" ? ratio : 0) / scale * 100)}%` }} /><b style={{ left: `${1.25 / scale * 100}%` }} /></div><strong>{format("dscr", typeof ratio === "number" ? ratio : null)}</strong>
      </div>)}</div>
      {gap != null ? <p className={gap === 0 ? styles.positiveText : styles.target}>{gap === 0 ? "1.25x coverage target met" : `${metricAmountLabel(gap, "USD", 0)} more annual earnings to reach 1.25x`}</p> : <p>Confirm earnings and debt inputs to calculate coverage.</p>}
    </section> : null}
  </div>;
}
