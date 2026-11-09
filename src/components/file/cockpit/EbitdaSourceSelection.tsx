"use client";

import { useRef, useState } from "react";
import { Btn, Callout, Input, Select, Textarea } from "@/components/ds";
import { useAuthedApi } from "@/hooks/useApi";
import type { FinancialCockpit } from "@/lib/financialCockpit";
import { metricAmountLabel, saveEbitdaSources, type EbitdaSourceSelection as SourceSelection, type MetricSourceRef } from "@/lib/financialMetrics";
import { ebitdaBaselineEligible, ebitdaSourceDraft, ebitdaSourceDraftStale, ebitdaSourceStatus, ebitdaSourceWrite, type EbitdaSourceDraft } from "./ebitdaSourceReview";
import styles from "./FinancialMetricReview.module.css";

export function EbitdaSourceSelection({ profileId, selection, canEdit, externallyBusy = false, draft: suppliedDraft, onDraft, onPending, onSaved, onReload, onPreview, onDirty }: {
  profileId: string; selection: SourceSelection; canEdit: boolean; externallyBusy?: boolean;
  draft?: EbitdaSourceDraft | null; onDraft?: (draft: EbitdaSourceDraft | null) => void;
  onPending: (value: boolean) => void; onSaved: (next: FinancialCockpit) => Promise<unknown> | void; onReload: () => Promise<unknown> | void; onPreview: (source: MetricSourceRef) => void; onDirty?: (dirty: boolean) => void;
}) {
  const api = useAuthedApi();
  const [localDraft, setLocalDraft] = useState<EbitdaSourceDraft | null>(null);
  const draft = suppliedDraft === undefined ? localDraft : suppliedDraft;
  const setDraft = (next: EbitdaSourceDraft | null) => { setLocalDraft(next); onDraft?.(next); };
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const activeProfile = useRef(profileId); activeProfile.current = profileId;
  const currentDraft = draft?.profileId === profileId ? draft : null;
  const stale = !!currentDraft && ebitdaSourceDraftStale(currentDraft, selection);
  const disabled = busy || externallyBusy;
  const edit = (patch: Partial<EbitdaSourceDraft>) => {
    setDraft({ ...(currentDraft ?? ebitdaSourceDraft(profileId, selection)), ...patch, idempotencyKey: crypto.randomUUID() });
    setError(""); setNotice(""); onDirty?.(true);
  };
  const currentManual = selection.mode === "manual" && selection.sources.some((source) => source.file_id === selection.selected_file_id && ebitdaBaselineEligible(source, selection));
  const mode = currentDraft?.mode ?? (currentManual ? "manual" : "automatic");
  const selected = currentDraft?.selectedFileId ?? (currentManual ? selection.selected_file_id ?? "" : "");
  const excluded = currentDraft?.excludedFileIds ?? selection.excluded_file_ids;
  const proposed = mode === "manual" ? selection.sources.find((source) => source.file_id === selected) : null;
  const latestSources = selection.sources.filter((source) => ebitdaBaselineEligible(source, selection));
  const save = async () => {
    if (!currentDraft || !canEdit || disabled || stale || conflict) return;
    let payload; try { payload = ebitdaSourceWrite(profileId, selection, currentDraft); } catch (reason) { setError(reason instanceof Error ? reason.message : "Review the source selection."); return; }
    setBusy(true); onPending(true); setError(""); setNotice("");
    try {
      const next = await saveEbitdaSources(api, profileId, payload);
      if (activeProfile.current !== profileId) return;
      setDraft(null); onDirty?.(false); setNotice("EBITDA source selection saved. Historical sources remain available for comparison.");
      try { await onSaved(next); } catch { setNotice("Source selection saved. Refresh Financials to reload the other sections."); }
    } catch (reason) {
      if (activeProfile.current !== profileId) return;
      setError(reason instanceof Error ? reason.message : "The source selection could not be saved. Your changes are retained.");
      if (reason && typeof reason === "object" && "status" in reason && reason.status === 409) { setConflict(true); try { await onReload(); } catch { /* The retained draft requires an explicit fresh reload before saving. */ } }
    } finally { setBusy(false); onPending(false); }
  };
  const reset = () => { setDraft(null); setConflict(false); setError(""); onDirty?.(false); };
  return <section className={styles.sourceControls} aria-label="EBITDA source selection">
    <div className={styles.heading}><h3>Latest business earnings baseline</h3><span className={styles.note}>Latest reporting period{selection.stale ? " · earlier selection needs review" : ""}</span></div>
    <p className={styles.note}>The latest business year supplies the baseline. Prior years only establish whether revenue is up, down or neutral; they are never substituted for missing or excluded current figures. Personal returns cannot supply business EBITDA.</p>
    <div className={styles.sourceChoices}>{selection.sources.map((source) => <div className={styles.sourceChoice} key={source.file_id}>
      <label><input type="checkbox" aria-label={`Allow ${source.file_name || "source"} for EBITDA`} disabled={!canEdit || disabled || !ebitdaBaselineEligible(source, selection) || stale || conflict} checked={ebitdaBaselineEligible(source, selection) && !excluded.includes(source.file_id)} onChange={(event) => edit({ excludedFileIds: event.target.checked ? excluded.filter((id) => id !== source.file_id) : [...excluded, source.file_id] })} /><span><b>{source.file_name || "Source document"}</b><small>{ebitdaSourceStatus(source, selection)}</small><small>{[source.entity, source.period].filter(Boolean).join(" · ")}</small>{source.reason ? <small>{source.reason}</small> : null}{source.missing_inputs?.length ? <small>Missing inputs: {source.missing_inputs.map((key) => (key.split(".").pop() || key).replaceAll("_", " ")).join(", ")}</small> : null}</span></label>
      <Btn size="sm" disabled={disabled} onClick={() => onPreview(source.source_refs?.[0] ?? { file_id: source.file_id, file_name: source.file_name, analysis_id: source.analysis_id, content_hash: source.content_hash, entity: source.entity, currency: source.currency })}>View source</Btn>
    </div>)}</div>
    {canEdit ? <>{latestSources.length > 1 ? <label className={styles.reviewReason}>Source within the latest reporting period<Select aria-label="EBITDA baseline source" value={mode === "automatic" ? "automatic" : selected} disabled={disabled || stale || conflict} onChange={(event) => edit({ mode: event.target.value === "automatic" ? "automatic" : "manual", selectedFileId: event.target.value === "automatic" ? "" : event.target.value })}><option value="automatic">Automatic · latest business period</option><option value="" disabled>Choose a current business source…</option>{latestSources.filter((source) => !excluded.includes(source.file_id)).map((source) => <option key={source.file_id} value={source.file_id}>{source.file_name || "Business source"}{source.period ? ` · ${source.period}` : ""}</option>)}</Select></label> : null}
      <details className={styles.forecast}><summary>Optional reviewed operating outlook</summary><p className={styles.note}>Historical growth is not automatically repeated. Add explicit assumptions to illustrate future revenue and earnings separately from the historical EBITDA and loan scenario.</p><label className={styles.sourceChoice}><input type="checkbox" aria-label="Add reviewed operating forecast" checked={currentDraft?.forecast ?? !!selection.forecast_assumptions} disabled={disabled || stale || conflict} onChange={(event) => edit({ forecast: event.target.checked })} />Add reviewed operating forecast</label>{currentDraft?.forecast ?? !!selection.forecast_assumptions ? <div className={styles.trendPeriods}><label className={styles.reviewReason}>Expected revenue growth, %<Input aria-label="Reviewed revenue growth percent" inputMode="decimal" value={currentDraft?.growth ?? String(selection.forecast_assumptions?.revenue_growth_pct ?? "")} disabled={disabled || stale || conflict} onChange={(event) => edit({ growth: event.target.value })} placeholder="Enter a reviewed assumption" /></label><label className={styles.reviewReason}>EBITDA margin, % (optional)<Input aria-label="Reviewed EBITDA margin percent" inputMode="decimal" value={currentDraft?.margin ?? (selection.forecast_assumptions?.ebitda_margin_pct != null ? String(selection.forecast_assumptions.ebitda_margin_pct) : "")} disabled={disabled || stale || conflict} onChange={(event) => edit({ margin: event.target.value })} placeholder="Use known baseline margin" /></label></div> : null}</details>
      {currentDraft ? <div className={styles.section}><p className={styles.note} role="status">Source changes awaiting Save. {proposed ? `Proposed baseline: ${proposed.file_name || "selected business source"}. ${proposed.annualized_ebitda != null || proposed.ebitda_value != null ? `Source earnings: ${metricAmountLabel(proposed.annualized_ebitda ?? proposed.ebitda_value, proposed.currency)}.` : "Financial inputs remain incomplete; source selection alone does not supply missing amounts."}` : latestSources.some((source) => !excluded.includes(source.file_id)) ? "The system will use the latest business reporting period." : "No current business source remains. EBITDA stays unavailable; prior years remain comparison only."}</p><label className={styles.reviewReason}>Review reason<Textarea aria-label="EBITDA source selection reason" maxLength={2000} value={currentDraft.reason} disabled={disabled} onChange={(event) => edit({ reason: event.target.value })} rows={2} placeholder="Explain the source, period and any operating assumptions" /></label></div> : null}
      {stale || conflict ? <Callout tone="warn">Sources or another review changed. Your draft is retained. Reload the latest selection before saving.</Callout> : null}
      {error ? <Callout tone="bad">{error}</Callout> : null}{notice ? <p className={styles.note} role="status">{notice}</p> : null}
      {currentDraft ? <div className={styles.actions}><Btn size="sm" disabled={disabled} onClick={() => { reset(); void onReload(); }}>{stale || conflict ? "Reload latest selection" : "Cancel source changes"}</Btn><Btn size="sm" variant="pri" disabled={disabled || stale || conflict || currentDraft.reason.trim().length < 8 || mode === "manual" && (!proposed || excluded.includes(selected))} onClick={() => void save()}>{busy ? "Saving sources…" : "Save EBITDA sources"}</Btn></div> : null}
    </> : null}
  </section>;
}
