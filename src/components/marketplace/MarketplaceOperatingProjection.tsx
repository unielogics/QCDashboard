import { CellChip } from "@/components/ds";
import { marketplaceOperatingRows, marketplaceProjectionMoney, marketplaceProjectionNumber, marketplaceProjectionValue, type MarketplaceOperatingProjection as Projection } from "@/lib/marketplaceOperatingProjection";
import styles from "./MarketplaceOperatingProjection.module.css";

export function MarketplaceOperatingProjection({ projection }: { projection: Projection }) {
  const points = [projection.current, projection.refinance_only, projection.proposed_operating];
  const rows = marketplaceOperatingRows(projection).filter(row => points.some(point => marketplaceProjectionNumber(point?.[row.value]) != null));
  const saved = projection.saved_version;
  const terms = projection.saved_terms;
  const basis = projection.proposed_operating.basis === "before_implementation_costs_and_timing" ? " Annual run rate before setup costs and timing." : projection.proposed_operating.basis === "after_setup_before_timing" ? " Annual run rate after recurring setup costs, before timing." : "";
  return <section className={styles.projection} aria-label="Saved operating plan projections">
    <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}><strong>Saved operating plan · v{saved.version_number}</strong><CellChip tone={projection.qualification === "needs_inputs" ? "warn" : "mut"}>{projection.qualification === "reviewed" ? "Staff-reviewed scenario" : projection.qualification === "needs_inputs" ? "Inputs need review" : "Proposed · awaiting review"}</CellChip></div>
    <p className="sub">Proposed operating changes for the coming months depend on execution{projection.qualification === "reviewed" ? "." : " and required review."}{basis} Historical source figures are unchanged.</p>
    {terms ? <small className="sub">Saved financing: {[terms.recorded_terms_ref, terms.program_name, terms.amount != null ? marketplaceProjectionMoney(terms.amount, terms.currency) : null, terms.rate_pct != null ? `${terms.rate_pct}%` : null, terms.term_months != null ? `${terms.term_months} months` : null].filter(Boolean).join(" · ") || "Terms need review"}.</small> : null}
    {rows.length ? <div className={styles.scroll}><table className="tbl fc-impact" aria-label="Current, refinance and proposed operating figures"><thead><tr><th>Figure</th><th className="r">Current source</th><th className="r">Refinance only</th><th className="r">Proposed operating plan</th><th className="r">Change from source</th></tr></thead><tbody>{rows.map(row => { const delta = marketplaceProjectionNumber(projection.proposed_operating[row.delta]); return <tr key={row.value}><td>{row.label}</td>{points.map((point, index) => <td className="r num" key={index}>{marketplaceProjectionValue(point, row)}</td>)}<td className={`r num ${delta == null || delta === 0 ? "" : delta > 0 ? styles.positive : styles.negative}`}>{marketplaceProjectionValue(projection.proposed_operating, row, true)}</td></tr>; })}</tbody></table></div> : null}
    {projection.status === "incomplete" || projection.missing?.length ? <small className="sub">Some proposed figures need saved-plan inputs or source review. Unavailable figures are not treated as zero.</small> : null}
    <small className="sub">Cash after debt is an earnings-less-debt-service illustration, not an ending bank balance. Monthly figures are run-rate amounts.</small>
    {projection.notes?.length ? <details><summary className="sub">Projection notes</summary>{projection.notes.map((note, index) => <p className="sub" key={index}>{note}</p>)}</details> : null}
  </section>;
}
