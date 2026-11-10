import type { OperatingPlanCoverage } from "@/lib/financialCockpit";
import { operatingMoney } from "@/lib/operatingPlan";
import styles from "./OperatingCoverageSummary.module.css";

/** The backend decides which reviewed, dated improvements enter coverage. */
export function OperatingCoverageSummary({ coverage, currentDscr, projectedDscr, currency, pending, onReview }: {
  coverage?: OperatingPlanCoverage | null;
  currentDscr?: number | null;
  projectedDscr?: number | null;
  currency?: string | null;
  pending?: boolean;
  onReview?: () => void;
}) {
  if (!coverage || coverage.status === "none") return null;
  const applied = coverage.applied && coverage.status === "applied";
  const ratio = (value: number | null | undefined) => value == null ? "Needs evidence" : `${value.toFixed(2)}x`;
  const money = (value: number | null | undefined) => currency ? operatingMoney(value, currency) : value == null ? "Unknown" : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)} (currency unconfirmed)`;
  const title = applied ? "Reviewed earnings plan included" : coverage.status === "awaiting_review" ? "Earnings proposal awaiting review" : "Earnings plan needs reconciliation";
  return <section className={styles.summary} aria-label="Earnings plan effect on coverage" data-state={coverage.status}>
    <div className={styles.heading}><strong>{title}{coverage.version_number != null ? ` · v${coverage.version_number}` : ""}</strong>{onReview ? <button type="button" onClick={onReview}>{applied ? "View earnings plan" : "Review earnings plan"}</button> : null}</div>
    {coverage.reason ? <p>{coverage.reason}</p> : null}
    {applied ? <>
      <dl><div><dt>Current DSCR</dt><dd>{ratio(currentDscr)}</dd></div><div><dt>With the plan</dt><dd>{pending ? "Calculating…" : ratio(projectedDscr === undefined ? coverage.projected_dscr : projectedDscr)}</dd></div><div><dt>First-year earnings change applied</dt><dd>{pending ? "Calculating…" : money(coverage.applied_annual_impact)}</dd></div><div><dt>Full-year run-rate change</dt><dd>{money(coverage.annual_impact)}</dd></div></dl>
      <p>Coverage uses the reviewed first-year change after effective dates and implementation costs. The historical earnings baseline stays unchanged.</p>
    </> : <>
      {coverage.proposed_dscr != null ? <dl><div><dt>Potential DSCR · if reviewed</dt><dd>{ratio(coverage.proposed_dscr)}</dd></div><div><dt>Proposed first-year change</dt><dd>{money(coverage.proposed_first_year_impact)}</dd></div></dl> : null}
      <p>Client proposals remain conditional. Review the amounts, timing and source baseline, then save a version to include eligible changes in projected coverage.</p>
    </>}
  </section>;
}
