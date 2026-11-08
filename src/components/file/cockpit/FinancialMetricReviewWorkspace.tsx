"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn, Callout, Select } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { BucketFileReviewPanel, type BucketFileReview } from "@/components/buckets/BucketFileReviewPanel";
import { useAuthedApi, useDevUser } from "@/hooks/useApi";
import { useConsoleAuth } from "@/lib/consoleAuth";
import { apiBase } from "@/lib/api";
import { financialVersionPdfPath } from "@/lib/financialWorkspaceApi";
import { loadFinancialSourcePreview } from "@/lib/financialSourcePreview";
import { metricEntry, type FinancialKpiKey, type FinancialKpiOptions } from "@/lib/financialKpiReview";
import { metricAmountLabel, readFinancialMetrics, type MetricCorrectionDraft, type MetricSourceRef } from "@/lib/financialMetrics";
import type { FinancialCockpit } from "@/lib/financialCockpit";
import { FinancialCalculationReview } from "./FinancialCalculationReview";
import { FinancialCalculationComposition, type CompositionDraft } from "./FinancialCalculationComposition";
import { FinancialMetricStatementInputs } from "./FinancialMetricStatementInputs";
import { currentFinancialMetricScope } from "./financialMetricScope";
import { compactMetricSources, metricSourceDocumentIdentity } from "./financialMetricSources";
import styles from "./FinancialMetricReview.module.css";

type View = "calculation" | "evidence" | "history";
const sourceIdentity = (source: MetricSourceRef) => JSON.stringify([source.file_id, source.analysis_id, source.version_id, source.content_hash, source.pages, source.citations]);
const pageFor = (source: MetricSourceRef) => source.citations?.find((citation) => citation.page != null)?.page ?? source.pages?.[0];
const quoteFor = (source: MetricSourceRef) => source.citations?.find((citation) => citation.page === pageFor(source) && citation.quote)?.quote;
const dateLabel = (value: string) => Number.isNaN(new Date(value).getTime()) ? value : new Date(value).toLocaleString();

/** The seven cockpit tiles use one source-bound review and one document reader. */
export function FinancialMetricReviewWorkspace({ open, metricKey, cockpit, options, profileId, canEdit, onClose, onRefresh, onOpenDebt, onOpenPlan }: {
  open: boolean; metricKey: FinancialKpiKey; cockpit: FinancialCockpit; options: FinancialKpiOptions; profileId: string; canEdit: boolean;
  onClose: () => void; onRefresh: () => Promise<unknown> | void; onOpenDebt: () => void; onOpenPlan: () => void;
}) {
  const api = useAuthedApi(), devUser = useDevUser(), queryClient = useQueryClient();
  const { isSignedIn, getToken } = useConsoleAuth();
  const query = useQuery({ queryKey: ["financial-metrics", profileId, devUser], queryFn: () => readFinancialMetrics(api, profileId), initialData: cockpit.metric_review ? cockpit : undefined, initialDataUpdatedAt: 0, enabled: open, staleTime: 0, refetchOnWindowFocus: false });
  const data = query.data ?? cockpit;
  const scope = currentFinancialMetricScope(data, options);
  const entry = metricEntry(data, metricKey, scope.options);
  const inspection = !entry.canEditScope && ["deposits", "cash_flow", "average_balance", "nsf_overdrafts"].includes(metricKey);
  const calculations = data.metric_review?.calculations.filter((calculation) => entry.calculationKeys.includes(calculation.key)) ?? [];
  const relevantInputs = new Set([...entry.inputKeys, ...calculations.flatMap((calculation) => calculation.input_keys)]);
  const sourceRefs = compactMetricSources([...new Map([...entry.sourceRefs, ...(inspection ? [] : data.metric_review?.inputs.filter((input) => relevantInputs.has(input.key)).flatMap((input) => input.source_refs) ?? [])].map((source) => [sourceIdentity(source), source])).values()]);
  const [view, setView] = useState<View>(metricKey === "net_profit" ? "evidence" : "calculation");
  const [expanded, setExpanded] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const pending = pendingCount > 0;
  const setPending = (value: boolean) => setPendingCount((count) => Math.max(0, count + (value ? 1 : -1)));
  const [notice, setNotice] = useState("");
  const [corrections, setCorrections] = useState<Partial<Record<FinancialKpiKey, MetricCorrectionDraft | null>>>({});
  const correction = corrections[metricKey] ?? null;
  const setCorrection = (draft: MetricCorrectionDraft | null) => setCorrections((current) => ({ ...current, [metricKey]: draft }));
  const [drafts, setDrafts] = useState<Record<string, CompositionDraft | undefined>>({});
  const [calculationKey, setCalculationKey] = useState(entry.calculation?.key ?? entry.calculationKeys[0] ?? "");
  const [activeSource, setActiveSource] = useState<MetricSourceRef | null>(sourceRefs[0] ?? null);
  const [requestedPage, setRequestedPage] = useState<number | undefined>();
  const [sourceRequest, setSourceRequest] = useState(0);
  const id = useId();
  const profile = useRef<string | null>(profileId);
  const versionUrl = useRef<string | null>(null);
  const sourceLoad = useRef(0);
  profile.current = profileId;
  useEffect(() => () => { ++sourceLoad.current; if (versionUrl.current) URL.revokeObjectURL(versionUrl.current); }, []);
  const previousMetric = useRef(metricKey);
  useEffect(() => {
    if (previousMetric.current === metricKey) return;
    previousMetric.current = metricKey;
    setView(metricKey === "net_profit" ? "evidence" : "calculation");
    setCalculationKey(entry.calculation?.key ?? entry.calculationKeys[0] ?? "");
    setActiveSource(sourceRefs[0] ?? null); setRequestedPage(undefined); setSourceRequest((value) => value + 1); setNotice("");
  }, [metricKey, entry.calculation?.key, entry.calculationKeys, sourceRefs]);
  const evidenceStamp = JSON.stringify(sourceRefs.map(sourceIdentity));
  useEffect(() => {
    setActiveSource((current) => current && sourceRefs.some((source) => sourceIdentity(source) === sourceIdentity(current)) ? current : sourceRefs[0] ?? null);
    // Source identity is stable across equivalent refetches; replacement files must be reviewed anew.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidenceStamp]);
  const calculation = calculations.find((item) => item.key === calculationKey) ?? calculations[0] ?? entry.calculation;
  const compositionHistory = inspection ? [] : data.metric_review?.composition_history?.filter((event) => entry.calculationKeys.includes(event.calculation_key)) ?? [];
  const factualHistory = inspection ? [] : data.metric_review?.history.filter((event) => relevantInputs.has(event.input_key)) ?? [];
  const source = activeSource ? sourceRefs.find((candidate) => sourceIdentity(candidate) === sourceIdentity(activeSource)) ?? null : null;
  const sourceFileId = source?.file_id ?? (source?.version_id ? `version:${source.version_id}` : undefined);
  const knownHash = source?.content_hash && /^[a-f0-9]{64}$/i.test(source.content_hash) ? source.content_hash : undefined;
  const sourcePage = requestedPage ?? (source ? pageFor(source) : undefined);
  const sourceQuote = source?.citations?.find((citation) => citation.page === sourcePage && citation.quote)?.quote;
  const loadSource = useCallback(async (): Promise<BucketFileReview> => {
    const request = ++sourceLoad.current;
    if (!source || profile.current !== profileId) throw new Error("This source no longer belongs to the active review.");
    if (source.file_id) {
      const loaded = await loadFinancialSourcePreview({ profileId, fileId: source.file_id, expectedContentHash: knownHash }, api, () => request === sourceLoad.current ? profile.current : null);
      if (request !== sourceLoad.current) throw new Error("The selected evidence changed. Reopen its current source.");
      return loaded.review;
    }
    if (!source.version_id || !sourceFileId) throw new Error("This evidence reference has no linked document or saved PDF version.");
    const token = isSignedIn ? await getToken() : null;
    if (request !== sourceLoad.current || profile.current !== profileId) throw new Error("The active financial review changed.");
    const response = await fetch(`${apiBase}/api/v1${financialVersionPdfPath(profileId, source.version_id)}`, { cache: "no-store", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(devUser ? { "X-Dev-User": devUser } : {}) } });
    if (!response.ok) throw new Error("The cited saved version PDF could not be opened. Refresh this review and try again.");
    const blob = await response.blob();
    if (request !== sourceLoad.current || profile.current !== profileId) throw new Error("The active financial review changed.");
    const url = URL.createObjectURL(blob); if (versionUrl.current) URL.revokeObjectURL(versionUrl.current); versionUrl.current = url;
    return { file: { id: sourceFileId, file_name: source.file_name || "Saved financial version.pdf", content_type: "application/pdf", size_bytes: blob.size }, preview_url: url, annotations: [] };
  }, [api, devUser, getToken, isSignedIn, knownHash, profileId, source, sourceFileId]);
  const selectSource = (next: MetricSourceRef, page?: number) => { if (pending) return; const current = sourceRefs.find((candidate) => sourceIdentity(candidate) === sourceIdentity(next)) ?? sourceRefs.find((candidate) => metricSourceDocumentIdentity(candidate) === metricSourceDocumentIdentity(next)); if (!current) return; setActiveSource(current); setRequestedPage(page); setSourceRequest((value) => value + 1); setView("evidence"); };
  const previewSource = (fileId: string, page?: number) => {
    const next = sourceRefs.find((candidate) => candidate.file_id === fileId && (page == null || candidate.pages?.includes(page) || candidate.citations?.some((citation) => citation.page === page))) ?? sourceRefs.find((candidate) => candidate.file_id === fileId);
    if (next) selectSource(next, page);
  };
  const saved = async (next: FinancialCockpit) => {
    queryClient.setQueriesData({ queryKey: ["financial-metrics", profileId] }, next);
    queryClient.setQueriesData({ queryKey: ["financial-cockpit", profileId] }, next);
    for (const key of ["application-profile-audit", "application-evidence-workspace", "application-intelligence", "application-assessment", "lead-program-fit"]) void queryClient.invalidateQueries({ queryKey: [key, profileId] });
    if (profile.current !== profileId) return;
    try { await onRefresh(); } catch { setNotice("Review saved. Refresh Financials to reload other sections."); }
  };
  const dirty = Object.values(drafts).some(Boolean) || correction != null;
  const labelAfter = entry.projection.source === "filed_offer" ? "With filed offer · illustration" : entry.projection.source === "working_plan" ? "With working plan · unsaved" : "With saved plan";
  return <Drawer open={open} onClose={() => { if (!pending) onClose(); }} title={`${entry.title} · sources and calculation`} sub={entry.scopeLabel} width="xl" fullscreen={expanded} closeOnBackdrop={false} ariaLabel="Financial metric review"
    headerActions={<Btn size="sm" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Restore metric review size" : "Expand metric review"}>{expanded ? "Restore" : "Expand"}</Btn>}
    footer={<div className={styles.heading}><span className={styles.note}>{pending ? "Saving reviewed calculation…" : dirty ? "Working review changes are kept here until explicitly saved." : "Source figures, reviewed math and scenario effects are identified separately."}</span><Btn size="sm" disabled={pending} onClick={onClose}>Close review</Btn></div>}>
    {!scope.available ? <Callout tone="warn">This account selection is no longer available in the current financial evidence. Close this review and choose an available account before inspecting or correcting its figures.</Callout> : <div className={styles.workspace}>
      <div className={styles.intro}><div><span className="sub">Current financial figure</span><strong>{entry.valueLabel}</strong><small>{entry.subLabel}</small></div><div><span className="sub">{entry.projection.source === "none" ? "Loan effect" : labelAfter}</span><strong>{entry.projection.source === "none" ? "No loan scenario applied" : entry.projection.valueLabel}</strong><small>{entry.projection.basis}</small></div></div>
      <nav className={styles.tabs} role="tablist" aria-label="Metric review views" onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); const views: View[] = ["calculation", "evidence", "history"], index = views.indexOf(view);
        const next = event.key === "Home" ? views[0] : event.key === "End" ? views[2] : views[(index + (event.key === "ArrowLeft" ? -1 : 1) + views.length) % views.length]; setView(next); document.getElementById(`${id}-${next}-tab`)?.focus();
      }}>{([ ["calculation", "Calculation and inputs"], ["evidence", "Source documents"], ["history", "Review history"] ] as const).map(([key, label]) => <button key={key} type="button" id={`${id}-${key}-tab`} role="tab" aria-selected={view === key} aria-controls={`${id}-${key}-panel`} tabIndex={view === key ? 0 : -1} onClick={() => setView(key)}>{label}</button>)}</nav>
      {notice ? <p className={styles.note} role="status">{notice}</p> : null}
      {query.isFetching ? <p className={styles.note} role="status">Refreshing current calculation evidence…</p> : null}
      {query.error ? <Callout tone="warn">The latest calculation evidence could not be read. Refresh before changing financial inputs.</Callout> : null}
      <section className={styles.tabPanel} id={`${id}-calculation-panel`} role="tabpanel" aria-labelledby={`${id}-calculation-tab`} hidden={view !== "calculation"}>
        <div className={styles.section}><h3>How the current figure is calculated</h3><pre className={styles.formula}>{entry.formula}</pre>{entry.notes.map((note, index) => <p className={styles.note} key={index}>{note}</p>)}
          {entry.projection.source !== "none" ? <details open><summary>Loan effect · {entry.projection.status}</summary><div className={styles.section}><pre className={styles.formula}>{entry.projection.formula}</pre>{entry.projection.inputs.map((input, index) => <p className={styles.note} key={index}>{input.label}: {input.value == null ? "Unknown" : input.unit === "ratio" ? `${input.value.toFixed(2)}x` : input.unit === "currency" ? metricAmountLabel(input.value, "USD") : input.value}</p>)}{entry.projection.notes.map((note, index) => <p className={styles.note} key={index}>{note}</p>)}<Btn size="sm" disabled={pending} onClick={onOpenPlan}>Review loan and scenario assumptions</Btn></div></details> : null}
          {!entry.canEditScope ? <Callout tone="warn">This account selection is an inspection view. Switch to the counted accounts to save a profile-wide financial correction.</Callout> : null}
          {!inspection && calculations.length > 1 ? <label>Calculation basis<Select aria-label="Metric calculation basis" disabled={pending} value={calculation?.key ?? ""} onChange={(event) => setCalculationKey(event.target.value)}>{calculations.map((item) => <option key={item.key} value={item.key}>{item.label}{item.selected ? " · current DSCR" : ""}</option>)}</Select></label> : null}
          {!inspection && calculation && data.metric_review ? <FinancialCalculationComposition profileId={profileId} calculation={calculation} revision={data.metric_review.revision} externallyBusy={pending} canEdit={canEdit && entry.canEditScope && !query.isFetching && !query.error} draft={drafts[calculation.key]} onDraft={(next) => setDrafts((current) => ({ ...current, [calculation.key]: next }))} onPending={setPending} onSaved={saved} onConflict={() => query.refetch()} onOpenDebt={onOpenDebt} /> : null}
          {["deposits", "cash_flow", "average_balance", "nsf_overdrafts"].includes(metricKey) ? <FinancialMetricStatementInputs metricKey={metricKey} months={scope.options.months} currency={entry.currency} sources={sourceRefs} onPreview={selectSource} inspection={inspection} /> : null}
          {!inspection ? <FinancialCalculationReview externallyBusy={pending} cockpit={data} profileId={profileId} canEdit={canEdit && entry.canEditScope} draft={correction} onDraft={setCorrection} onPending={setPending} onRefresh={onRefresh} onOpenDebt={onOpenDebt} onPreviewSource={previewSource} onPreviewReference={selectSource} calculationKeys={entry.calculationKeys} inputKeys={entry.inputKeys} title="Source operands and factual corrections" hideSourceNotices description="These are the source-bound inputs used for this metric. A factual correction updates the current input with an audit trail; a reviewed component recipe changes the underwriting math while retaining source figures." /> : null}
        </div>
      </section>
      <section className={styles.tabPanel} id={`${id}-evidence-panel`} role="tabpanel" aria-labelledby={`${id}-evidence-tab`} hidden={view !== "evidence"}>
        {sourceRefs.length ? <div className={styles.evidence}><aside className={styles.sourceList} aria-label="Documents used for this metric">{sourceRefs.map((item, index) => <button type="button" className={styles.source} key={`${sourceIdentity(item)}:${index}`} aria-pressed={!!source && sourceIdentity(item) === sourceIdentity(source)} disabled={!(item.file_id || item.version_id) || pending} onClick={() => selectSource(item)}><b>{item.file_name || "Source document"}</b><small>{[item.period_start && item.period_end ? `${item.period_start} – ${item.period_end}` : item.period_start || item.period_end, item.entity, item.currency || "Currency not supplied", item.version_id ? "Saved financial version" : item.analysis_id ? "Analyzed source" : null, pageFor(item) ? `Cited page ${pageFor(item)}` : "Page location not supplied"].filter(Boolean).join(" · ")}</small>{quoteFor(item) ? <small><q>{quoteFor(item)}</q></small> : null}</button>)}</aside><div className={styles.sourcePreview}>{source && sourceFileId ? <BucketFileReviewPanel embedded visible={view === "evidence" && open} title="Metric source evidence" reviewKey={`${profileId}:${sourceIdentity(source)}`} loadReview={loadSource} activeFileId={sourceFileId} initialPage={sourcePage} pageRequestId={sourceRequest} annotationsEnabled={false} onClose={() => setView("calculation")} reviewContext={<div className={styles.note}>Source analysis: {source.analysis_id || "Not supplied"} · content version: {knownHash ? `${knownHash.slice(0, 12)}…` : source.version_id && !source.file_id ? "Immutable saved PDF" : "Not supplied; exact highlighting is unavailable"}{source.version_id ? ` · financial version ${source.version_id}` : ""}{!sourcePage ? " · The exact source page was not supplied." : ""}</div>} sourceHighlight={knownHash || source.version_id && !source.file_id ? { file_id: sourceFileId, page: sourcePage, quote: sourceQuote } : undefined} /> : <Callout tone="warn">This evidence reference has no linked document identifier.</Callout>}</div></div> : <Callout tone="warn">No document references were supplied for this metric. The system cannot highlight a source section until document-level evidence is available.</Callout>}
      </section>
      <section className={styles.tabPanel} id={`${id}-history-panel`} role="tabpanel" aria-labelledby={`${id}-history-tab`} hidden={view !== "history"}>
        <div className={styles.section}><h3>Saved financial reviews</h3>{inspection ? <p className={styles.note}>Profile-wide bank reviews belong to Counted accounts. They are not shown as reviews of this selected account.</p> : null}{!compositionHistory.length && !factualHistory.length ? <p className={styles.note}>No staff calculation reviews or input corrections are recorded for this metric.</p> : null}
          {compositionHistory.length ? <><h4>Calculation composition</h4><ol className={styles.history}>{[...compositionHistory].reverse().map((event) => <li key={event.id}><b>{event.action === "restore" ? "Original calculation restored" : "Reviewed calculation saved"}</b>{event.stale ? " · Evidence changed; earlier review retained" : ""}<br />{event.actor_name || "Staff"} · {dateLabel(event.at)} · revision {event.revision}<br />{event.reason}{event.adjustments?.length ? <div>{event.adjustments.map((row) => <div key={row.id}>{row.label}: {row.amount > 0 ? "+" : ""}{row.amount.toLocaleString()} in the source reporting period</div>)}</div> : null}</li>)}</ol></> : null}
          {factualHistory.length ? <><h4>Source input corrections</h4><ol className={styles.history}>{[...factualHistory].reverse().map((event) => <li key={event.id}><b>{event.input_key}</b> · {event.action === "restore" ? "Source restored" : "Factual correction"}{event.stale ? " · Earlier source" : ""}<br />{event.actor_name || "Staff"} · {dateLabel(event.at)}<br />{event.reason}</li>)}</ol></> : null}
        </div>
      </section>
    </div>}
  </Drawer>;
}
