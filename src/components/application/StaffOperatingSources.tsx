"use client";

import { useState, type ReactNode } from "react";
import { metricAmountLabel } from "@/lib/financialMetrics";
import { operatingCandidateKey, type draftOperatingSourceCosts } from "@/lib/operatingGuidance";
import type { OperatingPlanBody } from "@/lib/operatingPlan";
import type { OperatingEvidence, OperatingEvidenceCandidate } from "./OperatingPlanEditor";
import styles from "./StaffOperatingSources.module.css";

export type StaffSourceDraftResult = Omit<ReturnType<typeof draftOperatingSourceCosts>, "body">;
const FIELD_LABELS: Record<string, string> = { business_name: "Business name", period_start: "Period start", period_end: "Period end", currency: "Currency", basis: "Accounting basis" };

export function StaffOperatingSources({ evidence, files, value, loading, error, disabled, onRetry, onDraft, onAddCandidate, onPreviewSource, result, children, embedded = false }: {
  evidence: OperatingEvidence | null; files: Array<{ file_id: string; file_name: string }>;
  value: OperatingPlanBody; loading: boolean; error: string; disabled?: boolean;
  onRetry: () => void; onDraft: () => void; onAddCandidate: (candidate: OperatingEvidenceCandidate) => void;
  onPreviewSource: (fileId: string) => void; result?: StaffSourceDraftResult | null; children?: ReactNode; embedded?: boolean;
}) {
  const [showStatements, setShowStatements] = useState(false);
  const guidance = evidence?.guidance;
  const reporting = guidance?.reporting;
  const groups = guidance?.expense_groups ?? [];
  const sourceId = reporting?.source_file_id || groups.flatMap(group => group.source_file_ids)[0];
  const sourceFile = [...(evidence?.files ?? []), ...files].find(file => file.file_id === sourceId);
  const year = groups.find(group => group.source_file_ids.includes(sourceId || ""))?.year;
  const candidates = (evidence?.expense_candidates ?? []).filter(candidate => !candidate.source_group_key);
  const bankCount = candidates.length;
  const processingCount = evidence?.merchant_sources?.length ?? 0;
  const ready = !loading && !error;
  const knownGroups = groups.filter(group => group.baseline_annual_amount != null && Number.isFinite(group.baseline_annual_amount) && group.baseline_annual_amount >= 0).length;
  const activeRows = (value.expenses ?? []).filter(row => !row.excluded && !row.duplicate_of);
  return <section className={styles.panel} aria-label="Source costs and statement suggestions">
    {!embedded ? <header className={styles.header}><div><span className={styles.eyebrow}>Start from the file’s evidence</span><h3>Source costs and statement suggestions</h3><p>Draft known tax/P&amp;L costs explicitly, then confirm current amounts. Statement payments remain unconfirmed suggestions until you choose to add them.</p></div><div className={styles.actions}><button type="button" className={styles.primary} disabled={disabled || !ready || !sourceId || !guidance} onClick={onDraft}>Draft from tax/P&amp;L</button><button type="button" aria-expanded={showStatements} disabled={loading} onClick={() => setShowStatements(open => !open)}>Review statement suggestions</button></div></header> : <button type="button" aria-expanded={showStatements} disabled={loading} onClick={() => setShowStatements(open => !open)}>Supporting statement suggestions</button>}
    {loading ? <p role="status">Loading source costs and statement suggestions…</p> : null}
    {error ? <div className={styles.error} role="alert"><strong>Source suggestions could not be refreshed.</strong><p>{error}</p><p>The financial preview is separate. Retry source suggestions before drafting from these documents.</p><button type="button" disabled={disabled || loading} onClick={onRetry}>Retry source suggestions</button></div> : null}
    {!loading && !error && !guidance ? <div className={styles.notice}><strong>No source guidance is available yet.</strong><p>Retry the source list or enter current costs manually. Existing entries remain in this working plan.</p><button type="button" disabled={disabled} onClick={onRetry}>Retry source suggestions</button></div> : null}
    {guidance ? <div className={styles.overview}>
      <div><span>Selected tax/P&amp;L source</span><strong>{sourceFile?.file_name || reporting?.source_label || "No selected tax/P&L source"}</strong>{reporting?.source_label && reporting.source_label !== sourceFile?.file_name ? <small>{reporting.source_label}</small> : null}{sourceId ? <button type="button" className={styles.link} disabled={disabled || loading} onClick={() => onPreviewSource(sourceId)}>View selected source</button> : null}</div>
      <div><span>Reporting year and period</span><strong>{year ?? "Year unconfirmed"}</strong><small>{reporting?.period_start || "Start unconfirmed"} – {reporting?.period_end || "End unconfirmed"}</small></div>
      <div><span>Currency and basis</span><strong>{reporting?.currency || "Currency unconfirmed"}</strong><small>{reporting?.basis || "Basis unconfirmed"}</small></div>
      <div><span>Tax/P&amp;L expense groups</span><strong>{groups.length}</strong><small>{knownGroups} with known annual amounts</small></div>
      <div><span>Unconfirmed statement payments</span><strong>{ready ? bankCount : "Unavailable"}</strong><small>{ready ? `${processingCount} card-processing statement${processingCount === 1 ? "" : "s"}` : "Retry suggestions to confirm the list"}</small></div>
    </div> : null}
    {ready && guidance && !sourceId ? <p className={styles.notice}>No selected tax/P&amp;L document is available. Review statement suggestions below or disclose costs manually.</p> : null}
    {ready && sourceId && !groups.length ? <p className={styles.notice}>The source is available, but no expense groups were identified. Review the document and enter current costs manually.</p> : null}
    {result ? <div className={result.blocked_reason ? styles.error : styles.notice} role={result.blocked_reason ? "alert" : "status"}>{result.blocked_reason ? <strong>{result.blocked_reason}</strong> : <strong>{result.added} source cost row{result.added === 1 ? "" : "s"} drafted · {result.linked} existing row{result.linked === 1 ? "" : "s"} linked · {result.skipped} group{result.skipped === 1 ? "" : "s"} left unchanged</strong>}{result.filled_fields.length ? <p>Filled missing reporting details: {result.filled_fields.map(field => FIELD_LABELS[field] || field).join(", ")}.</p> : null}{result.reasons.length ? <ul>{result.reasons.map((reason, index) => <li key={`${index}:${reason}`}>{reason}</li>)}</ul> : null}<p>Review these draft costs and current amounts before saving a version. Historical financial results and staff approval remain separate.</p></div> : null}
    {(guidance?.warnings ?? []).map((note, index) => <p className={styles.warning} key={`guidance:${index}`}>{note}</p>)}
    {showStatements ? <section className={styles.statements} aria-label="Unconfirmed statement suggestions"><h4>Review statement suggestions</h4><p>Transfers, loan payments and operating costs can look similar in bank data. Review each source and category; these payments are not booked automatically.</p>{ready && !bankCount && !processingCount ? <p>No statement suggestions are available. You can disclose current costs manually.</p> : null}<div className={styles.candidates}>{candidates.map((candidate, index) => {
      const key = operatingCandidateKey(candidate);
      const exists = key && activeRows.some(row => row.source_candidate_key === key || candidate.bank_vendor_key && row.bank_vendor_key === candidate.bank_vendor_key);
      return <article key={key || index}><strong>{candidate.label || candidate.payee || "Statement payment"}</strong><span>{metricAmountLabel(candidate.current_amount == null ? null : Number(candidate.current_amount), candidate.currency || value.currency)} · {candidate.cadence || "Frequency unconfirmed"}</span>{candidate.source_note ? <p>{candidate.source_note}</p> : null}{candidate.warning ? <p className={styles.warning}>{candidate.warning}</p> : null}<div className={styles.actions}>{(candidate.source_file_ids ?? []).map(id => <button type="button" className={styles.link} disabled={disabled || loading} key={id} onClick={() => onPreviewSource(id)}>{[...(evidence?.files ?? []), ...files].find(file => file.file_id === id)?.file_name || "View statement"}</button>)}<button type="button" disabled={disabled || !ready || Boolean(exists)} onClick={() => onAddCandidate(candidate)}>{exists ? "Already disclosed" : "Add payment for review"}</button></div></article>;
    })}</div>{children}{(evidence?.warnings ?? []).map((note, index) => <p className={styles.warning} key={`evidence:${index}`}>{note}</p>)}</section> : null}
  </section>;
}
