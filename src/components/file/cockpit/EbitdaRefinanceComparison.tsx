"use client";
import { Btn, CellChip } from "@/components/ds";
import type { RefinanceEbitda } from "@/lib/ebitdaRefinance";
import { metricAmountLabel } from "@/lib/financialMetrics";
import styles from "./EbitdaRefinanceComparison.module.css";

export function EbitdaRefinanceComparison({ value, compact = false, unsaved = false, scenarioActive = false, onPreviewSource, onRequestEvidence }: {
  value: RefinanceEbitda | undefined; compact?: boolean; unsaved?: boolean; scenarioActive?: boolean;
  onPreviewSource?: (fileId: string, page?: number) => void; onRequestEvidence?: () => void;
}) {
  const annual = value?.annual_before != null;
  const adjusted = value?.adjusted_annual;
  const amount = (number: number | null | undefined, currency = value?.currency) => number == null ? "Not available" : metricAmountLabel(number, currency, 0);
  return <section className={styles.panel} aria-label={compact ? "EBITDA refinance comparison" : "Advanced EBITDA refinance comparison"}>
    <div className={styles.actions}><h4>EBITDA and refinancing</h4>{unsaved ? <CellChip tone="acc">Unsaved scenario preview</CellChip> : <CellChip tone="mut">{scenarioActive ? "Saved scenario comparison" : "Current baseline · no refinance saved"}</CellChip>}{value?.provisional ? <CellChip tone="warn">Provisional source</CellChip> : null}</div>
    <p className={styles.note}>Refinancing changes debt service and cash retained. Interest, principal and financing proceeds do not change EBITDA by themselves.</p>
    <div className={styles.values}>
      <div><small>Current EBITDA · {annual ? "annualized" : "source period"}</small><strong>{amount(annual ? value?.annual_before : value?.before)}</strong><small>{value?.period || "P&L evidence needed"}{value?.months_covered != null ? ` · ${value.months_covered} months` : ""}{value?.basis ? ` · ${value.basis}` : ""}</small></div>
      <div><small>After refinance EBITDA · {annual ? "annualized" : "source period"}{!scenarioActive && !unsaved ? " illustration" : ""}</small><strong>{amount(annual ? value?.annual_after : value?.after)}</strong><small>Source earnings baseline unchanged.{annual && value?.annualization_factor != null ? ` Annualization × ${value.annualization_factor}.` : ""}</small></div>
      {adjusted && (adjusted.adjustments.length || adjusted.excluded_adjustments.length || !compact) ? <div><small>Hypothetical adjusted EBITDA · annual</small><strong>{amount(adjusted.after, adjusted.currency)}</strong><small>{adjusted.status === "hypothetical_adjusted" ? "Operating assumptions only · unverified" : adjusted.status === "unavailable" ? "Verified comparable USD P&L baseline needed" : "No operating addbacks applied"}</small></div> : null}
    </div>
    {value?.status === "tax_estimate_only" ? <p className={styles.note}>A tax-derived earnings estimate is available separately. It is not the documented P&L EBITDA baseline used here.</p> : null}
    {value?.provisional ? <p className={styles.note}>{value.baseline?.notes[0] || "Review the P&L source, period, currency and reconciliation before relying on these figures."}</p> : null}
    {value && annual && !compact ? <p className={styles.note}>Period EBITDA: {amount(value.before)} → {amount(value.after)}. Annualized EBITDA: {amount(value.annual_before)} → {amount(value.annual_after)}. Currency: {value.currency || "unknown"}.</p> : null}
    {!compact && value ? <>
      <div className={styles.support}><div className={styles.actions}><strong>{value.replacement_payment_missing ? "Debt-service reduction before replacement payment" : value.debt_service_override_applied ? "Debt-service change · hypothetical override" : "Projected debt-service savings"}</strong><span>{amount(value.debt_service_savings_monthly, value.debt_service_savings_currency || "USD")} / month</span></div>{value.replacement_payment_missing ? <p className={styles.note}>Replacement payment or loan terms are missing. This is not the final refinance savings.</p> : null}<p className={styles.note}>Projected change in bank cash retained: {amount(value.cash_flow_change_monthly, value.cash_flow_currency ?? null)} / month. This is separate from EBITDA.</p></div>
      {adjusted?.adjustments.length ? <details open><summary>Operating assumptions included ({adjusted.adjustments.length}) · unverified</summary><ul className={styles.adjustments}>{adjusted.adjustments.map((row, index) => <li key={`${row.id}:${index}`}><strong>{row.label || row.kind.replaceAll("_", " ")}</strong> · {amount(row.amount_annual, "USD")} / year<p className={styles.note}>{row.note} · Source: {row.source || "not stated"}</p></li>)}</ul></details> : null}
      {adjusted?.excluded_adjustments.length ? <details><summary>Not applied to adjusted EBITDA ({adjusted.excluded_adjustments.length})</summary><ul className={styles.adjustments}>{adjusted.excluded_adjustments.map((row, index) => <li key={`${row.id}:${index}`}><strong>{row.label || row.kind.replaceAll("_", " ")}</strong><p className={styles.note}>{row.reason}</p></li>)}</ul></details> : null}
      {value.notes.map((note, index) => <p className={styles.note} key={index}>{note}</p>)}
      <p className={styles.note}>Program qualification uses the verified factual annual USD P&L baseline. Hypothetical adjusted EBITDA does not satisfy a program’s factual EBITDA threshold.</p>
    </> : null}
    <div className={styles.actions}>{value?.source_refs.filter((source) => source.file_id).map((source, index) => onPreviewSource ? <button type="button" key={`${source.file_id}:${index}`} className={styles.source} onClick={() => onPreviewSource(source.file_id!, source.pages?.[0])}>{source.file_name || "Review P&L source"}</button> : null)}{(!value || value.status !== "projected_unchanged" || !compact && adjusted?.status === "unavailable") && onRequestEvidence ? <Btn size="sm" onClick={onRequestEvidence}>Request P&amp;L evidence</Btn> : null}</div>
  </section>;
}
