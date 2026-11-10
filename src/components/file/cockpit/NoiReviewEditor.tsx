"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Btn, Callout, Input, Select, Textarea } from "@/components/ds";
import { useAuthedApi } from "@/hooks/useApi";
import { metricAmountLabel, type MetricSourceRef } from "@/lib/financialMetrics";
import { draftForNoiSource, initialNoiReviewDraft, noiReviewDraftStale, noiReviewIssues, saveNoiReview, type NoiReviewDraft, type NoiReviewMode, type NoiReviewRead } from "@/lib/noiReview";
import type { FinancialCockpit } from "@/lib/financialCockpit";
import styles from "./NoiReviewEditor.module.css";

export function NoiReviewEditor({ profileId, review, currentSourceFileId, draft: keptDraft, onDraft, canEdit, externallyBusy = false, onPending, onSaved, onReload, onPreviewSource }: {
  profileId: string; review?: NoiReviewRead; draft: NoiReviewDraft | null; onDraft: (draft: NoiReviewDraft | null) => void;
  currentSourceFileId?: string | null;
  canEdit: boolean; externallyBusy?: boolean; onPending: (pending: boolean) => void;
  onSaved: (next: FinancialCockpit) => Promise<unknown> | void; onReload: () => Promise<unknown> | void;
  onPreviewSource?: (source: MetricSourceRef) => void;
}) {
  const api = useAuthedApi();
  const validationId = useId();
  const seed = useMemo(() => review ? initialNoiReviewDraft(review, crypto.randomUUID(), currentSourceFileId) : null, [currentSourceFileId, review]);
  const draft = keptDraft ?? seed;
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const pendingRef = useRef(false), live = useRef(true), onPendingRef = useRef(onPending);
  onPendingRef.current = onPending;
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; if (pendingRef.current) { pendingRef.current = false; onPendingRef.current(false); } };
  }, [profileId]);
  const disabled = busy || externallyBusy || !canEdit;
  const source = review?.sources.find((item) => item.file_id === draft?.selectedFileId);
  const stale = Boolean(review && draft && noiReviewDraftStale(draft, review));
  const issues = review && draft ? noiReviewIssues(draft, review) : [];
  const change = (patch: Partial<NoiReviewDraft>) => {
    if (!draft || disabled) return;
    onDraft({ ...draft, ...patch, idempotencyKey: crypto.randomUUID() }); setError(""); setNotice("");
  };
  const chooseMode = (mode: NoiReviewMode) => {
    if (!draft || !review) return;
    const next = { ...draft, mode };
    const candidate = review.sources.find((item) => item.file_id === draft.selectedFileId && item.eligible)
      ?? review.sources.find((item) => item.file_id === currentSourceFileId && item.eligible && item.automatic_eligible !== false)
      ?? review.sources.find((item) => item.eligible && item.automatic_eligible !== false);
    change(mode === "source" && candidate ? draftForNoiSource(next, candidate) : next);
  };
  const chooseSource = (fileId: string) => {
    if (!draft || !review) return;
    const candidate = review.sources.find((item) => item.file_id === fileId);
    change(draft.mode === "source" && candidate ? draftForNoiSource(draft, candidate) : { selectedFileId: fileId });
  };
  const save = async () => {
    if (!review || !draft || disabled || stale || conflict || issues.length || pendingRef.current) return;
    pendingRef.current = true; setBusy(true); onPendingRef.current(true); setError(""); setNotice("");
    // Retain the exact request identity and entries if the response is lost.
    onDraft(draft);
    try {
      const next = await saveNoiReview(api, profileId, draft, review);
      if (!live.current) return;
      await onSaved(next);
      if (!live.current) return;
      onDraft(null); setConflict(false);
      setNotice(draft.mode === "automatic" ? "Automatic NOI calculation restored." : "Current NOI saved. The financial figure and review history have been updated.");
    } catch (failure) {
      if (!live.current) return;
      setError(failure instanceof Error ? failure.message : "NOI review could not be saved. Your entries are retained.");
      if (failure && typeof failure === "object" && "status" in failure && failure.status === 409) {
        setConflict(true);
        try { await onReload(); } catch { /* Keep the draft until fresh evidence can be read. */ }
      }
    } finally {
      if (pendingRef.current) { pendingRef.current = false; onPendingRef.current(false); }
      if (live.current) setBusy(false);
    }
  };
  return <section className={styles.editor} aria-label="Calculate or override NOI">
    <header className={styles.heading}><div><h3>Calculate / override NOI</h3><p>Review a business tax return or P&amp;L, or enter a documented annual NOI amount.</p></div><Btn size="sm" disabled={busy || externallyBusy} onClick={() => void onReload()}>Refresh NOI sources</Btn></header>
    {!review || !draft ? <Callout tone="warn">NOI review sources are not available yet. Refresh the sources to continue.</Callout> : <>
      {review.current ? <div className={styles.saved}><strong>{review.stale ? "Previous NOI review · not current" : "Saved NOI review"}</strong><span>{review.current.mode === "automatic" ? "Automatic source calculation" : `${metricAmountLabel(review.current.annual_value, review.current.currency)} annually · ${review.current.year ?? "Year unknown"}`}</span><small>{review.current.reason}</small></div> : null}
      {review.stale ? <Callout tone="warn">Relevant evidence changed since this NOI review. The previous amount is retained in history and is not the current NOI. Review the source and annual amount, then save a new review or restore automatic calculation.</Callout> : null}
      {error ? <Callout tone="warn"><span role="alert">{error}</span></Callout> : null}
      {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
      {stale || conflict ? <Callout tone="warn">Your entries are retained. Review the latest evidence, then acknowledge it before saving.<div className={styles.actions}><Btn size="sm" disabled={disabled} onClick={() => void onReload()}>Reload latest NOI evidence</Btn><Btn size="sm" disabled={disabled} onClick={() => { change({ revision: review.revision, sourceStamp: review.source_stamp }); setConflict(false); }}>Use latest evidence, keep entries</Btn></div></Callout> : null}
      <div className={styles.fields}>
        <label>NOI review method<Select aria-label="NOI review method" value={draft.mode} disabled={disabled} onChange={(event) => chooseMode(event.target.value as NoiReviewMode)}><option value="source">Review tax return or P&amp;L</option><option value="manual">Manual annual NOI</option><option value="automatic">Use automatic calculation</option></Select></label>
        {draft.mode !== "automatic" ? <label>{draft.mode === "source" ? "NOI source document" : "Supporting NOI document (optional)"}<Select aria-label="NOI source document" value={draft.selectedFileId} disabled={disabled} onChange={(event) => chooseSource(event.target.value)}><option value="">{draft.mode === "source" ? "Choose a business tax return or P&L" : "No document · explain the source in the reason"}</option>{review.sources.map((item) => <option key={item.file_id} value={item.file_id} disabled={!item.eligible}>{item.file_name || "Business source"} · {item.kind === "business_tax_return" ? "Business tax return" : "P&L"}{item.year ? ` · ${item.year}` : ""}{item.eligible ? "" : " · unavailable for this file"}</option>)}</Select></label> : null}
      </div>
      {draft.mode === "automatic" ? <p className={styles.note}>Saving restores the automatic source calculation. The current figure may be unknown when the required P&amp;L inputs are missing.</p> : <>
        {source ? <div className={styles.source}><strong>{source.kind === "business_tax_return" ? "Tax-return NOI estimate" : "P&L operating-income calculation"}</strong><span>Suggested annual value: {metricAmountLabel(source.proposed_annual_value, source.currency)}</span>{source.kind === "business_tax_return" ? <p>Tax return suggestions are estimates based on ordinary business income plus known interest. Depreciation and amortization remain expenses. Review the amount and year before saving.</p> : null}{source.reason ? <p>{source.reason}</p> : null}{source.notes.map((note, index) => <p key={index}>{note}</p>)}<div className={styles.actions}><Btn size="sm" disabled={disabled || !source.eligible || source.proposed_annual_value == null} onClick={() => change(draftForNoiSource(draft, source))}>Use source calculation</Btn>{onPreviewSource && source.source_refs.length ? <Btn size="sm" disabled={busy || externallyBusy} onClick={() => onPreviewSource(source.source_refs[0])}>Review source inputs</Btn> : null}</div></div> : null}
        {!review.sources.some((item) => item.eligible) ? <p className={styles.note}>No eligible source calculation is available. You can enter a manual annual NOI with its year, currency, and supporting reason.</p> : null}
        <div className={styles.fields}>
          <label>Annual NOI (reviewed amount)<Input aria-label="Reviewed annual NOI" type="number" step="0.01" value={draft.annualValue} disabled={disabled} onChange={(event) => change({ annualValue: event.target.value })} placeholder="Enter the annual amount" /></label>
          <label>Reviewed year<Input aria-label="NOI reviewed year" type="number" min={1900} max={2100} step={1} value={draft.year} disabled={disabled} onChange={(event) => change({ year: event.target.value })} placeholder="YYYY" /></label>
          <label>Currency<Input aria-label="NOI reviewed currency" maxLength={3} value={draft.currency} disabled={disabled} onChange={(event) => change({ currency: event.target.value.toUpperCase() })} placeholder="USD" /></label>
          <label>Period start (optional)<Input aria-label="NOI period start" type="date" value={draft.periodStart} disabled={disabled} onChange={(event) => change({ periodStart: event.target.value })} /></label>
          <label>Period end (optional)<Input aria-label="NOI period end" type="date" value={draft.periodEnd} disabled={disabled} onChange={(event) => change({ periodEnd: event.target.value })} /></label>
        </div><p className={styles.note}>The amount is annual. Omit both dates when you are recording an annual review for the chosen year.</p>
      </>}
      <label className={styles.reason}>NOI review reason<Textarea aria-label="NOI review reason" rows={3} maxLength={2000} value={draft.reason} disabled={disabled} onChange={(event) => change({ reason: event.target.value })} placeholder="Identify the source, calculation and any reviewed adjustments" /></label>
      {canEdit && issues.length ? <ul id={validationId} className={styles.validation} aria-label="NOI review requirements">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
      {canEdit ? <div className={styles.actions}><Btn variant="pri" aria-describedby={issues.length ? validationId : undefined} disabled={disabled || stale || conflict || issues.length > 0} onClick={() => void save()}>{busy ? "Saving NOI…" : draft.mode === "automatic" ? "Restore automatic NOI" : "Save current NOI"}</Btn>{keptDraft ? <Btn disabled={busy || externallyBusy} onClick={() => { onDraft(null); setError(""); setNotice(""); setConflict(false); }}>Discard NOI edits</Btn> : null}</div> : <p className={styles.note}>This review is read only.</p>}
      <p className={styles.note}>A saved source or manual review sets the current annual NOI until relevant evidence changes or you restore automatic calculation. Automatic calculation uses the latest supported business period, preferring P&amp;L within that period. A business tax return fallback remains provisional. Saving does not accept source documents or approve program criteria. EBITDA remains separately recorded.</p>
    </>}
  </section>;
}

export function NoiReviewHistory({ review }: { review?: NoiReviewRead }) {
  return <section className={styles.editor} aria-label="NOI review history"><h3>NOI reviews</h3>{review?.history.length ? <ol className={styles.history}>{[...review.history].reverse().map((event) => <li key={event.id}><strong>{event.mode === "automatic" ? "Automatic NOI restored" : `${event.mode === "source" ? "Source-based" : "Manual"} annual NOI · ${metricAmountLabel(event.annual_value, event.currency)} · ${event.year}`}</strong><span>{event.actor_name || "Staff"} · {new Date(event.at).toLocaleString()}</span>{event.source_refs[0]?.file_name ? <small>{event.source_refs[0].file_name}</small> : null}<p>{event.reason}</p></li>)}</ol> : <p>No saved NOI reviews yet.</p>}</section>;
}
