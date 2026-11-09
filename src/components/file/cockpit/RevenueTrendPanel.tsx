import { Btn } from "@/components/ds";
import { metricAmountLabel, metricCurrency, type EarningsPotential, type MetricSourceRef, type RevenueTrend } from "@/lib/financialMetrics";
import { EarningsPotentialPanel } from "./EarningsPotentialPanel";
import styles from "./FinancialMetricReview.module.css";

const percent = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "Not established" : `${value > 0 ? "+" : ""}${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;

/** Historical results and an evidence-bound illustration remain separate from financing effects. */
export function RevenueTrendPanel({ value, onPreviewSource, open = false, potential, planIsCurrent = true }: { value: RevenueTrend | undefined; onPreviewSource?: (source: MetricSourceRef) => void; open?: boolean; potential?: EarningsPotential; planIsCurrent?: boolean }) {
  if (!value) return null;
  const comparison = value.comparison;
  const comparable = comparison?.comparable === true;
  const forecast = value.forecast;
  const currentPeriod = value.periods.find((period) => String(period.year) === String(comparison?.current_year));
  const currency = currentPeriod ? metricCurrency(currentPeriod.currency, currentPeriod.source_refs) : metricCurrency(undefined, value.periods.flatMap((period) => period.source_refs));
  const forecastCurrency = forecast?.source_refs.length ? metricCurrency(undefined, forecast.source_refs) : currency;
  const amount = (number: number | null | undefined, known = currency) => metricAmountLabel(number, known, 0, false);
  const direction = comparable ? comparison.direction || (comparison.change_amount == null ? null : comparison.change_amount > 0 ? "up" : comparison.change_amount < 0 ? "down" : "neutral") : null;
  return <details className={styles.revenueTrend} open={open || undefined}>
    <summary><span>Revenue trend and earnings outlook</span><b>{comparable ? `${comparison.prior_year} → ${comparison.current_year} · ${direction ? `${direction} · ` : ""}${percent(comparison.change_pct)}` : "Comparable revenue needed"}</b></summary>
    <div className={styles.section}>
      <p className={styles.note}>The latest business year supplies the earnings baseline. Prior years only show the revenue trend. The outlook is an illustration of operating performance; changing loan payments does not change EBITDA.</p>
      <div className={styles.trendPeriods}>{value.periods.map((period, index) => <article key={`${period.file_id}:${period.year}:${index}`}><div className={styles.heading}><b>{period.year}</b><span className={styles.note}>{period.months_covered != null ? `${period.months_covered} months` : "Period length unconfirmed"}</span></div><dl className={styles.trendNumbers}><div><dt>Revenue</dt><dd>{amount(period.revenue, period.currency)}</dd></div><div><dt>Monthly revenue average</dt><dd>{amount(period.average_monthly_revenue, period.currency)}</dd></div><div><dt>{period.ebitda_kind === "tax_estimate" ? "Tax earnings estimate" : "EBITDA"}</dt><dd>{amount(period.ebitda, period.currency)}</dd></div></dl><small className={styles.note}>{[period.basis, period.currency || "Currency unconfirmed"].filter(Boolean).join(" · ")}</small>{period.source_refs.length && onPreviewSource ? <Btn size="sm" onClick={() => onPreviewSource(period.source_refs[0])}>View {period.year} source</Btn> : null}</article>)}</div>
      {comparison ? <p className={styles.note}>{comparable ? <>Historical revenue change: <b>{amount(comparison.change_amount)}</b> · <b>{percent(comparison.change_pct)}</b>. Monthly average change: {amount(comparison.monthly_change)}.</> : comparison.reason || "The reporting periods, business, currency or revenue basis are not comparable."}</p> : null}
      {forecast ? <div className={styles.forecast}><div className={styles.heading}><h4>{forecast.target_year ? `${forecast.target_year} operating outlook` : "Operating outlook"}</h4><b className={styles.note}>{forecast.status === "illustration" ? forecast.method === "p_and_l_run_rate" ? "P&L run-rate illustration" : forecast.method === "reviewed_assumptions" ? "Reviewed assumptions illustration" : "Historical-growth illustration" : "Outlook unavailable"}</b></div>{forecast.status === "illustration" ? <><dl className={styles.trendNumbers}><div><dt>Estimated revenue</dt><dd>{amount(forecast.projected_revenue, forecastCurrency)}</dd></div><div><dt>Change from baseline</dt><dd>{amount(forecast.change_amount, forecastCurrency)} · {percent(forecast.change_pct)}</dd></div><div><dt>{forecast.ebitda_kind === "tax_estimate" ? "Estimated tax earnings" : "Estimated EBITDA"}</dt><dd>{amount(forecast.projected_ebitda, forecastCurrency)}</dd></div></dl><p className={styles.note}>Projected values are separate from current earnings, program qualification and the loan’s cash-flow effects.</p></> : null}{forecast.reason ? <p className={styles.note}>{forecast.reason}</p> : null}{forecast.assumptions.length ? <details><summary>Outlook assumptions</summary><ul className={styles.trendAssumptions}>{forecast.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul></details> : null}{forecast.source_refs.length && onPreviewSource ? <Btn size="sm" onClick={() => onPreviewSource(forecast.source_refs[0])}>View outlook evidence</Btn> : null}</div> : null}
      <EarningsPotentialPanel value={potential} planIsCurrent={planIsCurrent} />
      {value.bank_context?.note ? <p className={styles.note}>{value.bank_context.note}</p> : null}{value.notes.map((note, index) => <p className={styles.note} key={index}>{note}</p>)}
    </div>
  </details>;
}
