"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn, Callout, CellChip, Input, Textarea } from "@/components/ds";
import { ActionIcon } from "@/components/ds/ActionIcon";
import { useAuthedApi, useDevUser } from "@/hooks/useApi";
import { multiple, type FinancialCockpit } from "@/lib/financialCockpit";
import { metricAmountLabel, metricCurrency, metricDraftIsStale, metricDraftValue, metricInputCurrency, metricInputProvenance, readFinancialMetrics, saveFinancialMetricCorrection, type MetricCorrection, type MetricCorrectionDraft, type MetricInput, type MetricSourceRef } from "@/lib/financialMetrics";
import styles from "./FinancialCalculationReview.module.css";

const valueLabel = (value: number | null | undefined, unit = "currency", currency?: string | null) => value == null ? "Unknown" : unit === "ratio" ? multiple(value) : unit === "currency" ? metricAmountLabel(value, currency) : `${value}${unit === "months" ? " months" : ""}`;
const when = (value: string) => Number.isNaN(new Date(value).getTime()) ? value : new Date(value).toLocaleString();
function Sources({ sources, onPreview, disabled }: { sources: MetricSourceRef[]; onPreview?: (fileId: string, page?: number) => void; disabled: boolean }) {
  return <div className={styles.sources}>{sources.length ? sources.map((source, index) => <div key={`${source.file_id}:${source.version_id}:${index}`}>
    {source.file_id && onPreview ? <button type="button" className={styles.source} disabled={disabled} onClick={() => onPreview(source.file_id!, source.pages?.[0] ?? source.citations?.[0]?.page)}>{source.file_name || "Source document"}{source.pages?.length ? ` · p${source.pages.join(", ")}` : ""}</button> : <span className={styles.note}>{source.file_name || "Source document"}</span>}
    <small>{[source.entity, source.period_start && source.period_end ? `${source.period_start} – ${source.period_end}` : source.period_start || source.period_end, source.currency, source.basis, source.accepted === false ? "Provisional source" : null, source.entity_comparable === false ? "Business association differs — review" : null, source.version_id ? "Saved version" : null].filter(Boolean).join(" · ")}</small>
  </div>) : <span className={styles.note}>No source reference supplied</span>}</div>;
}

export function FinancialCalculationReview({ cockpit, profileId, canEdit, draft: suppliedDraft, onDraft, onPending, onRefresh, onOpenDebt, onPreviewSource }: {
  cockpit: FinancialCockpit; profileId: string; canEdit: boolean;
  draft: MetricCorrectionDraft | null; onDraft: (draft: MetricCorrectionDraft | null) => void;
  onPending: (pending: boolean) => void; onRefresh: () => Promise<unknown> | void;
  onOpenDebt: () => void; onPreviewSource?: (fileId: string, page?: number) => void;
}) {
  const api = useAuthedApi();
  const devUser = useDevUser();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["financial-metrics", profileId, devUser], queryFn: () => readFinancialMetrics(api, profileId), initialData: cockpit.metric_review ? cockpit : undefined, initialDataUpdatedAt: 0, staleTime: 0, refetchOnWindowFocus: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const origin = useRef<HTMLElement | null>(null);
  const data = query.data ?? cockpit;
  const review = data.metric_review;
  const draft = canEdit && suppliedDraft?.profileId === profileId ? suppliedDraft : null;
  const stale = Boolean(draft && review && metricDraftIsStale(draft, review));
  const proposed = draft ? metricDraftValue(draft) : undefined;
  const currentInput = review?.inputs.find((input) => input.key === draft?.input.key);
  const inputs = new Map(review?.inputs.map((input) => [input.key, input]));
  const calculationNames = new Map(review?.calculations.map((calculation) => [calculation.key, calculation.label]));
  const usageLabels = (keys: string[]) => keys.map((key) => calculationNames.get(key) || key.replaceAll(/[_.:]/g, " ")).join(", ");
  const history = [...new Map([...(review?.history ?? []), ...(review?.stale_corrections ?? []).map((event) => ({ ...event, stale: true }))].map((event) => [event.id, event])).values()];
  const historyCurrency = (event: MetricCorrection) => event.currency !== undefined ? event.currency : event.source_refs?.length ? metricCurrency(undefined, event.source_refs) : inputs.get(event.input_key)?.source_stamp === event.source_stamp ? metricInputCurrency(inputs.get(event.input_key)) : null;
  const editingDisabled = busy || query.isFetching || Boolean(query.error);
  const edit = (input: MetricInput, action: "correct" | "restore") => {
    if (!review || !canEdit || !input.editable || editingDisabled) return;
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    onDraft({ profileId, input: structuredClone(input), revision: review.revision, action, value: input.value == null ? "" : String(input.value), unknown: false, reason: "", idempotencyKey: crypto.randomUUID() });
    setError(""); setNotice(""); setConflict(false); requestAnimationFrame(() => { editorHeading.current?.focus(); editorHeading.current?.scrollIntoView({ block: "nearest" }); });
  };
  const cancel = () => { onDraft(null); setError(""); setConflict(false); requestAnimationFrame(() => { if (origin.current?.isConnected) origin.current.focus(); }); };
  const change = (patch: Partial<MetricCorrectionDraft>) => { if (draft) onDraft({ ...draft, ...patch, idempotencyKey: crypto.randomUUID() }); setError(""); };
  const save = async () => {
    if (!draft || !canEdit || !currentInput?.editable || stale || conflict || proposed === undefined || draft.reason.trim().length < 8 || editingDisabled) return;
    setBusy(true); onPending(true); setError(""); setNotice("");
    try {
      const next = await saveFinancialMetricCorrection(api, profileId, draft);
      queryClient.setQueriesData({ queryKey: ["financial-metrics", profileId] }, next);
      queryClient.setQueriesData({ queryKey: ["financial-cockpit", profileId] }, next);
      for (const key of ["application-profile-audit", "application-evidence-workspace", "application-intelligence", "application-assessment"]) void queryClient.invalidateQueries({ queryKey: [key, profileId] });
      onDraft(null); setNotice(draft.action === "restore" ? "Source value restored. Current calculations have been refreshed." : "Staff correction saved. Current calculations have been refreshed.");
      try { await onRefresh(); } catch { setNotice("Correction saved. Refresh calculation sources to reload the rest of the financial interface."); }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The correction could not be saved.");
      if (reason && typeof reason === "object" && "status" in reason && reason.status === 409) { setConflict(true); await query.refetch(); }
    } finally { setBusy(false); onPending(false); }
  };
  return <section className={styles.section} aria-label="Financial calculation inputs">
    <div className={styles.heading}><h3>Calculation inputs</h3><Btn size="sm" disabled={busy || query.isFetching} onClick={() => void query.refetch()}>Refresh calculation sources</Btn></div>
    <p className={styles.note}>These are the current calculation inputs and their evidence. Working debt edits affect published service only after Save version. Coverage plan changes are hypothetical and use Save plan. A staff correction updates these current inputs and keeps the source document intact.</p>
    {query.isLoading ? <p className={styles.note} role="status">Reading calculation sources…</p> : null}
    {query.error ? <Callout tone="warn">Calculation sources could not be refreshed. Editing is unavailable until a fresh read succeeds.</Callout> : null}
    {notice ? <p className={styles.note} role="status">{notice}</p> : null}
    {!review ? <Callout tone="warn">Exact calculation inputs are not available for this read. Refresh the calculation sources.</Callout> : <>
      {data.ebitda?.reason ? <p className={styles.note}>{data.ebitda.reason}</p> : null}
      <div className={styles.calculations}>{review.calculations.map((calculation) => <article key={calculation.key} className={styles.calculation}>
        <div className={styles.heading}><h4>{calculation.label}</h4><strong>{valueLabel(calculation.value, calculation.unit ?? (calculation.key.startsWith("dscr") ? "ratio" : "currency"), metricCurrency(calculation.currency, calculation.source_refs))}</strong></div>
        {calculation.selected ? <CellChip tone="acc">Current DSCR basis</CellChip> : null}
        <p className={styles.note}>{calculation.period || "Reporting period unknown"}{calculation.annualization_factor != null ? ` · annualization × ${calculation.annualization_factor}` : ""}</p>
        <pre className={styles.formula}>{calculation.formula}</pre>
        <dl className={styles.operands}>{calculation.numerator !== undefined ? <div><dt>Annual DSCR numerator</dt><dd>{valueLabel(calculation.numerator, "currency", calculation.numerator_currency !== undefined ? metricCurrency(calculation.numerator_currency) : metricCurrency(calculation.currency, calculation.source_refs))}</dd></div> : null}{calculation.denominator !== undefined ? <div><dt>Annual debt service</dt><dd>{valueLabel(calculation.denominator, "currency", calculation.denominator_currency || "USD")}</dd></div> : null}{calculation.annualized_value !== undefined ? <div><dt>Annualized EBITDA</dt><dd>{valueLabel(calculation.annualized_value, "currency", metricCurrency(calculation.currency, calculation.source_refs))}</dd></div> : null}{calculation.difference !== undefined ? <div><dt>Reported less reconciled EBITDA</dt><dd>{valueLabel(calculation.difference, "currency", metricCurrency(calculation.currency, calculation.source_refs))}</dd></div> : null}{calculation.input_keys.map((key) => { const input = inputs.get(key); return <div key={key}><dt>{input?.label || key}</dt><dd>{valueLabel(input?.value, input?.unit, metricInputCurrency(input))}</dd></div>; })}</dl>
        {calculation.basis_status ? <p className={styles.note}>Debt service: {calculation.basis_status.replaceAll("_", " ")}</p> : null}
        {calculation.missing_inputs.length ? <p className={styles.note}>Unknown inputs: {calculation.missing_inputs.map((key) => inputs.get(key)?.label || key).join(", ")}</p> : null}
        {calculation.currency_status && calculation.currency_status !== "comparable" ? <Callout tone="warn">{calculation.currency_note || "The source currency is not comparable to the application debt currency. Review the currencies before relying on this ratio."}</Callout> : null}{calculation.denominator_currency_basis ? <p className={styles.note}>{calculation.denominator_currency_basis}</p> : null}{calculation.notes.filter((note) => note !== calculation.currency_note).map((note, index) => <p className={styles.note} key={index}>{note}</p>)}
        <Sources sources={calculation.source_refs} onPreview={onPreviewSource} disabled={busy} />
      </article>)}</div>
      <div className={draft ? styles.split : undefined}><div className={styles.section}>
        <div className={styles.table} tabIndex={0} role="region" aria-label="Current financial calculation inputs, scroll across columns">
          <table className="tbl"><caption>Unknown values remain unknown. Corrections require a reason and an explicit Save correction.</caption><thead><tr><th>Input / period</th><th>Source value</th><th>Current value</th><th>Origin</th><th>Evidence</th><th>Review</th></tr></thead><tbody>{review.inputs.map((input) => <tr key={input.key}>
            <td><strong>{input.label}</strong><small>{input.period || "Period unknown"}</small>{input.used_by_headline?.length ? <small>Used by: {usageLabels(input.used_by_headline)}</small> : input.used_by?.length ? <small>Comparison inputs: {usageLabels(input.used_by)}</small> : null}</td><td className="num">{valueLabel(input.original_value, input.unit, metricInputCurrency(input))}</td><td className="num">{valueLabel(input.value, input.unit, metricInputCurrency(input))}{input.missing ? <small>Required value not established</small> : null}</td>
            <td><CellChip tone={input.correction ? "acc" : "mut"}>{metricInputProvenance(input)}</CellChip>{input.correction ? <small>{input.correction.actor_name || "Staff"} · {when(input.correction.at)}<br />{input.correction.reason}</small> : null}</td>
            <td><Sources sources={input.source_refs} onPreview={onPreviewSource} disabled={busy} /></td><td><div className={styles.actions}>{canEdit && input.editable ? <><ActionIcon icon="pencil" label={`Correct ${input.label}`} disabled={editingDisabled} onClick={() => edit(input, "correct")} />{input.correction ? <Btn size="sm" disabled={editingDisabled} onClick={() => edit(input, "restore")}>Restore source value</Btn> : null}</> : null}{input.editor_action === "debt_schedule" && canEdit ? <Btn size="sm" disabled={busy} onClick={onOpenDebt}>Edit debt schedule</Btn> : !input.editable ? <small>{input.unavailable_reason || "Calculated / read only"}</small> : null}</div></td>
          </tr>)}</tbody></table>
        </div>
      </div>{draft ? <aside className={styles.editor} aria-label="Financial input correction">
        <h4 ref={editorHeading} tabIndex={-1}>{draft.action === "restore" ? "Restore source value" : "Correct input"}: {draft.input.label}</h4>
        <p className={styles.note}>{draft.input.period || "Reporting period unknown"}</p>
        <dl className={styles.operands}><div><dt>Current</dt><dd>{valueLabel(currentInput ? currentInput.value : draft.input.value, draft.input.unit, metricInputCurrency(draft.input))}</dd></div><div><dt>{draft.action === "restore" ? "Restore to source" : "Proposed correction"}</dt><dd>{proposed === undefined ? "Enter a valid value" : valueLabel(proposed, draft.input.unit, metricInputCurrency(draft.input))}</dd></div></dl>
        {draft.action === "correct" ? <><label>Corrected {draft.input.unit === "months" ? "period length" : "amount"}<Input aria-label="Corrected calculation input" inputMode="decimal" type={draft.input.unit === "months" ? "number" : "text"} min={draft.input.unit === "months" ? 1 : undefined} max={draft.input.unit === "months" ? 12 : undefined} value={draft.value} disabled={busy || draft.unknown} onChange={(event) => change({ value: event.target.value })} /></label>{draft.input.unit !== "months" ? <label className={styles.unknown}><input type="checkbox" checked={draft.unknown} disabled={busy} onChange={(event) => change({ unknown: event.target.checked })} />Mark this input unknown</label> : <p className={styles.note}>Changes the annualization period, from 1 to 12 months. Source document dates stay unchanged.</p>}</> : null}
        <label>Correction reason<Textarea aria-label="Calculation correction reason" rows={3} value={draft.reason} disabled={busy} onChange={(event) => change({ reason: event.target.value })} placeholder="Explain the source error and the reviewed correction" /></label>
        <Sources sources={draft.input.source_refs} onPreview={onPreviewSource} disabled={busy} />
        {stale || conflict ? <Callout tone="warn">The source or another correction changed while you were editing. Your draft is retained. Cancel and reopen this input against the latest source before saving.</Callout> : null}
        {error ? <Callout tone="bad">{error}</Callout> : null}
        <div className={styles.actions}><Btn size="sm" disabled={busy} onClick={cancel}>Cancel correction</Btn><Btn size="sm" variant="pri" disabled={editingDisabled || stale || conflict || !currentInput?.editable || proposed === undefined || draft.reason.trim().length < 8 || draft.action === "correct" && proposed === draft.input.value} onClick={() => void save()}>{busy ? "Saving correction…" : draft.action === "restore" ? "Save source restoration" : "Save correction"}</Btn></div>
        <p className={styles.note}>Review the current and proposed values above. Nothing saves on blur.</p>
      </aside> : null}</div>
      {review.stale_corrections.length ? <Callout tone="warn">{review.stale_corrections.length} earlier {review.stale_corrections.length === 1 ? "correction no longer matches" : "corrections no longer match"} the current source. These corrections are retained in history and require a new review.</Callout> : null}
      {data.ebitda?.candidates.length ? <details><summary>EBITDA by reporting source and period ({data.ebitda.candidates.length})</summary><div className={styles.table} tabIndex={0} role="region" aria-label="EBITDA reporting periods"><table className="tbl"><thead><tr><th>Basis / period</th><th>Period EBITDA</th><th>Annualized EBITDA</th><th>Status</th><th>Evidence</th></tr></thead><tbody>{data.ebitda.candidates.map((result) => <tr key={result.key}><td><strong>{result.label}</strong><small>{result.period || "Period unknown"}</small><small>{result.months_covered == null ? "Reporting length unknown" : `${result.months_covered} months`}</small></td><td>{valueLabel(result.value, "currency", metricCurrency(result.currency, result.source_refs))}</td><td>{valueLabel(result.annualized_value, "currency", metricCurrency(result.currency, result.source_refs))}</td><td>{result.provisional ? "Provisional" : result.complete ? "Inputs complete" : "Unknown inputs"}</td><td><Sources sources={result.source_refs} onPreview={onPreviewSource} disabled={busy} /></td></tr>)}</tbody></table></div></details> : null}
      {history.length ? <details><summary>Correction history ({history.length})</summary><ol className={styles.history}>{history.map((event) => <li key={event.id}><strong>{inputs.get(event.input_key)?.label || event.input_key}</strong> · {event.action === "restore" ? "Restored source" : "Staff correction"}{event.stale ? " · Source changed" : ""}<br />{valueLabel(event.previous_value, inputs.get(event.input_key)?.unit, historyCurrency(event))} → {event.effective_value !== undefined ? valueLabel(event.effective_value, inputs.get(event.input_key)?.unit, historyCurrency(event)) : event.action === "restore" ? "source value restored" : valueLabel(event.value, inputs.get(event.input_key)?.unit, historyCurrency(event))} · {event.actor_name || "Staff"} · {when(event.at)}<br />{event.reason}</li>)}</ol></details> : null}
    </>}
  </section>;
}
