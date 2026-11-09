import { metricAmountLabel, type EarningsPotential, type EarningsPotentialCoverage } from "@/lib/financialMetrics";
import styles from "./EarningsPotentialPanel.module.css";

const ratio = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "Not established" : `${value.toFixed(2)}x`;
const percent = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "Not established" : `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

/** A sensitivity bridge is not a replacement for documented earnings or program qualification. */
export function EarningsPotentialPanel({ value, planIsCurrent = true }: { value: EarningsPotential | undefined; planIsCurrent?: boolean }) {
  if (!value) return null;
  const baseline = value.baseline;
  const amount = (number: number | null | undefined) => metricAmountLabel(number, baseline?.currency, 0, false);
  const coverage = (item: EarningsPotentialCoverage, title: string) => <section className={styles.coverage} aria-label={title}>
    <div className={styles.heading}><b>{title}</b><span>{amount(item.annual_debt_service)} annual debt service · {ratio(item.dscr)}</span></div>
    {item.earnings_less_debt_service != null || item.funding_shortfall != null ? <dl className={styles.baseline}>{item.earnings_less_debt_service != null ? <div><dt>Earnings less debt service</dt><dd>{amount(item.earnings_less_debt_service)}</dd></div> : null}{item.funding_shortfall != null && item.funding_shortfall > 0 ? <div><dt>Annual funding shortfall</dt><dd>{amount(item.funding_shortfall)}</dd></div> : null}</dl> : null}
    <div className={styles.tableWrap}><table><thead><tr><th scope="col">Coverage goal</th><th scope="col">Annual earnings needed</th><th scope="col">Margin needed</th><th scope="col">Improvement needed</th></tr></thead><tbody>{item.targets.map((target) => <tr key={target.ratio}><th scope="row">{ratio(target.ratio)}</th><td>{amount(target.earnings_required)}</td><td>{percent(target.margin_pct)}</td><td>{amount(target.improvement_required)}</td></tr>)}</tbody></table></div>
  </section>;
  return <details className={styles.panel}>
    <summary><span>DSCR and earnings potential</span>{value.available && baseline ? <b>{percent(baseline.margin_pct)} baseline margin</b> : null}</summary>
    <div className={styles.body}>
      {!value.available || !baseline ? <p>{value.reason || "A current business earnings baseline and compatible debt service are needed."}</p> : <>
        <div className={styles.heading}><b>{baseline.period || "Latest business period"}</b><span>{baseline.provisional ? "Provisional source" : "Documented source"}{baseline.basis ? ` · ${baseline.basis}` : ""}</span></div>
        <dl className={styles.baseline}><div><dt>Revenue baseline</dt><dd>{amount(baseline.revenue)}</dd></div><div><dt>{baseline.kind === "tax_estimate" ? "Tax earnings estimate" : "Earnings baseline"}</dt><dd>{amount(baseline.earnings)}</dd></div>{value.operating_break_even ? <div><dt>Improvement to operating break-even</dt><dd>{amount(value.operating_break_even.improvement_required)}</dd></div> : null}</dl>
        <p>These are earnings targets at the latest revenue baseline. A target is not a forecast or an accepted add-back.</p>
        {value.current ? coverage(value.current, "Current obligations") : null}
        {value.plan && planIsCurrent ? coverage(value.plan, "With saved loan plan") : null}
        {!planIsCurrent ? <p>Save the working loan plan to refresh its earnings targets. Current-obligation targets remain based on the published schedule.</p> : null}
        {value.forecast?.status === "illustration" ? <section className={styles.coverage} aria-label="Illustrative operating outlook"><b>Illustrative operating outlook</b><dl className={styles.baseline}><div><dt>Revenue</dt><dd>{amount(value.forecast.revenue)}</dd></div><div><dt>Estimated earnings</dt><dd>{amount(value.forecast.earnings)}</dd></div><div><dt>Coverage · current obligations</dt><dd>{ratio(value.forecast.dscr_current)}</dd></div>{planIsCurrent && value.plan ? <div><dt>Coverage · saved plan</dt><dd>{ratio(value.forecast.dscr_plan)}</dd></div> : null}</dl>{value.forecast.assumptions.map((note, index) => <p key={index}>{note}</p>)}</section> : null}
      </>}
      {value.notes.map((note, index) => <p key={index}>{note}</p>)}
    </div>
  </details>;
}
