import { CellChip } from "@/components/ds";
import { metricAmountLabel, type FinancialNoi } from "@/lib/financialMetrics";
import { noiBasisLabel, noiGovernancePresentation, type NoiBaselineGovernance } from "@/lib/noiGovernance";
import styles from "./FinancialMetricReview.module.css";

export function NoiGovernanceSummary({ value, baseline, showAmount = false }: {
  value?: FinancialNoi; baseline?: NoiBaselineGovernance; showAmount?: boolean;
}) {
  const governance = baseline ?? value;
  const presentation = noiGovernancePresentation(governance);
  const headline = value?.headline;
  const basis = baseline?.label || (value ? noiBasisLabel(value) : "Current NOI baseline");
  const period = baseline?.period || baseline?.year || headline?.period || headline?.year;
  const currency = baseline?.currency || headline?.currency;
  return <section className={styles.section} aria-label="Current NOI status">
    <div className={styles.heading}><CellChip tone={presentation.tone}>{presentation.label}</CellChip>{showAmount ? <strong>Current annual NOI: {metricAmountLabel(headline?.annualized_value, headline?.currency)}</strong> : null}</div>
    <p className={styles.note}>{[basis, period, currency || "Currency unconfirmed"].filter(Boolean).join(" · ")}</p>
    <p className={styles.note}>{presentation.reason}</p>
  </section>;
}
