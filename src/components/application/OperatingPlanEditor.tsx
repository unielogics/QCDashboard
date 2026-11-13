"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import type { OperatingSuggestionClient, OperatingSuggestionReply, OperatingSuggestionApplied } from "@/lib/operatingSuggestions";
import { useFileWorkspace } from "@/components/file/FileWorkspaceContext";
import { useOperatingPlanGoal } from "@/hooks/useOperatingPlanGoal";
import { StaffOperatingGoal } from "./OperatingGoalSummary";
import { operatingGoalReady } from "@/lib/operatingGoal";
import { useDocumentWindow } from "@/hooks/useDocumentWindow";
import { Role } from "@/lib/enums.generated";
import type { FinancialWorkspaceSnapshot } from "@/lib/financialWorkspaceApi";
import { clearOperatingReview, normalizeOperatingPlanBody, operatingMoney, operatingLabel, operatingNumber, operatingReviewedWorkspace, type OperatingAction, type OperatingEvaluation, type OperatingPlanBody } from "@/lib/operatingPlan";
import { OperatingPlanForm } from "./OperatingPlanForm";
import styles from "./OperatingPlanForm.module.css";
import { addOperatingCandidate, draftOperatingSourceCosts, type OperatingGuidance, type OperatingExpenseCandidate } from "@/lib/operatingGuidance";
import { StaffOperatingSources, type StaffSourceDraftResult } from "./StaffOperatingSources";

export type OperatingEvidenceCandidate = OperatingExpenseCandidate;
type MerchantSource = { source_key: string; file_id: string; file_name: string; processor: string | null; account_last4: string | null; period_start: string | null; period_end: string | null; currency: string | null; volume: number | null; total_fees: number | null; transactions: number | null; effective_rate_pct: number | null; rate_basis: string; eligible_for_review: boolean; warnings?: string[] };
type MerchantOffer = { id: string; source_file_id?: string | null; provider_name?: string | null; proposed_effective_rate_pct?: number | null; proposed_pricing_model?: string | null; proposed_markup_bps?: number | null; proposed_per_item_fee?: number | null; proposed_fixed_monthly_fees?: number | null; early_termination_fee?: number | null; notes?: string | null };
export type OperatingEvidence = { guidance?: OperatingGuidance; files?: Array<{ file_id: string; file_name: string }>; expense_candidates?: OperatingEvidenceCandidate[]; merchant_sources?: MerchantSource[]; merchant_offers?: MerchantOffer[]; warnings?: string[] };
type EvaluationReply = { evaluation: OperatingEvaluation; evidence?: OperatingEvidence; guidance?: OperatingGuidance; context_stamp: string };

/** No second draft: previews read the workspace body; staff review flushes its revision first. */
export function OperatingPlanEditor({ profileId, snapshot, value, onChange, disabled, prepare, onReviewed, onPreviewSource, onBusyChange, onSaveVersion, saveVersionDisabled, saveVersionBusy }: {
  profileId: string; snapshot: FinancialWorkspaceSnapshot; value: OperatingPlanBody; onChange: (value: OperatingPlanBody) => void;
  disabled?: boolean; prepare: () => Promise<FinancialWorkspaceSnapshot | null>; onReviewed: (snapshot: FinancialWorkspaceSnapshot) => void;
  onPreviewSource: (fileId: string) => void; onBusyChange: (busy: boolean) => void; onSaveVersion?: () => void; saveVersionDisabled?: boolean; saveVersionBusy?: boolean;
}) {
  const api = useAuthedApi();
  const actor = useCurrentUser();
  const role = actor.data?.role;
  const canReview = role === Role.SUPER_ADMIN || role === Role.LOAN_EXEC;
  const root = `/application-profiles/${encodeURIComponent(profileId)}/operating-plan`;
  const scope = `${actor.authScope ?? actor.data?.id ?? "unresolved"}:${root}:${snapshot.family_id}`;
  const fileWorkspace = useFileWorkspace();
  const suggestionClient = useMemo<OperatingSuggestionClient>(() => ({ scope, suggest: (body, expenseId, signal) => api<OperatingSuggestionReply>(`${root}/suggestions`, { method: "POST", signal, body: JSON.stringify({ body: normalizeOperatingPlanBody(body), family_id: snapshot.family_id, expense_row_id: expenseId }) }), apply: (body, expenseId, suggestionId, contextStamp, signal) => api<OperatingSuggestionApplied>(`${root}/suggestions/apply`, { method: "POST", signal, body: JSON.stringify({ body: normalizeOperatingPlanBody(body), family_id: snapshot.family_id, expense_row_id: expenseId, suggestion_id: suggestionId, context_stamp: contextStamp }) }) }), [api, root, scope, snapshot.family_id]);
  const goal = useOperatingPlanGoal(profileId, scope, actor.authReady !== false && Boolean(actor.data));
  const [editingGoal, setEditingGoal] = useState(false);
  const sourceWindow = useDocumentWindow(scope);
  const [sourceDocumentError, setSourceDocumentError] = useState("");
  const lastSourceDocument = useRef<string | null>(null);
  const openSourceDocument = (fileId: string) => { lastSourceDocument.current = fileId; setSourceDocumentError(""); void sourceWindow.open(async signal => (await api<{ url: string }>(`/application-profiles/${encodeURIComponent(profileId)}/evidence/files/${encodeURIComponent(fileId)}/url`, { signal })).url).catch(reason => { if (activeScope.current === scope) setSourceDocumentError(reason instanceof Error ? reason.message : "The source document could not be opened."); }); };
  const [source, setSource] = useState<{ scope: string; data: OperatingEvidence | null; loading: boolean; error: string }>({ scope, data: null, loading: true, error: "" });
  const [preview, setPreview] = useState<{ scope: string; value: OperatingEvaluation | null; loading: boolean; error: string }>({ scope, value: null, loading: false, error: "" });
  const [evaluationRetry, setEvaluationRetry] = useState(0);
  const [error, setError] = useState(""); const [reviewing, setReviewing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]); const [reason, setReason] = useState("");
  const [treatment, setTreatment] = useState("unreconciled"); const [reconciliation, setReconciliation] = useState("");
  const [merchantQuote, setMerchantQuote] = useState("");
  const [guided, setGuided] = useState(true);
  const [sourceDraftRequest, setSourceDraftRequest] = useState(0);
  const [guidedStepRequest, setGuidedStepRequest] = useState<{ index: number; key: number } | null>(null);
  const [draftResult, setDraftResult] = useState<{ scope: string; value: StaffSourceDraftResult } | null>(null);
  const request = useRef(0); const sourceRequest = useRef(0); const sourceVersion = useRef(0);
  const live = useRef(true); const activeScope = useRef(scope); activeScope.current = scope;
  const valueRef = useRef(value); valueRef.current = value;
  const sourcePanelElement = useRef<HTMLDivElement>(null);
  const evidence = source.scope === scope ? source.data : null;
  const sourceLoading = source.scope !== scope || source.loading;
  const sourceError = source.scope === scope ? source.error : "";
  const evaluation = preview.scope === scope ? preview.value : null;
  const evaluating = preview.scope === scope && preview.loading;
  const evaluationError = preview.scope === scope ? preview.error : "";
  const releasedCashFlow = evaluation?.released_cash_flow ?? snapshot.completion?.released_cash_flow;
  useEffect(() => { live.current = true; return () => { live.current = false; request.current += 1; sourceRequest.current += 1; }; }, []);
  const loadEvidence = useCallback(async () => {
    const sequence = ++sourceRequest.current;
    const version = sourceVersion.current;
    setSource(current => ({ scope, data: current.scope === scope ? current.data : null, loading: true, error: "" }));
    try {
      const reply = await api<OperatingEvidence>(`${root}/evidence`);
      if (!live.current || activeScope.current !== scope || sequence !== sourceRequest.current || version !== sourceVersion.current) return;
      sourceVersion.current++;
      setSource({ scope, data: reply, loading: false, error: "" });
    } catch (failure) {
      if (live.current && activeScope.current === scope && sequence === sourceRequest.current && version === sourceVersion.current)
        setSource(current => ({ scope, data: current.scope === scope ? current.data : null, loading: false, error: failure instanceof Error ? failure.message : "Evidence suggestions could not be loaded." }));
    }
  }, [api, root, scope]);
  useEffect(() => {
    sourceVersion.current = 0;
    setSourceDocumentError(""); lastSourceDocument.current = null; setEditingGoal(false);
    setDraftResult(null); setGuided(true); setGuidedStepRequest(null); setSourceDraftRequest(0); setMerchantQuote(""); setError("");
    setSelected([]); setReason(""); setReconciliation(""); setTreatment("unreconciled");
    void loadEvidence();
    return () => { sourceRequest.current++; };
  }, [loadEvidence]);
  useEffect(() => {
    const sequence = ++request.current;
    setPreview({ scope, value: null, loading: true, error: "" });
    const timer = setTimeout(() => {
      void api<EvaluationReply>(`${root}/evaluate`, { method: "POST", body: JSON.stringify({ body: normalizeOperatingPlanBody(value), family_id: snapshot.family_id }) }).then((reply) => {
        if (!live.current || activeScope.current !== scope || sequence !== request.current) return;
        setPreview({ scope, value: reply.evaluation, loading: false, error: "" });
        const guidance = reply.guidance ?? reply.evidence?.guidance;
        const fullSources = guidance && typeof guidance.policy_version === "string" && guidance.policy_version.trim() && guidance.reporting && Array.isArray(guidance.expense_groups) && Array.isArray(reply.evidence?.files) && Array.isArray(reply.evidence?.expense_candidates)
          && (guidance.reporting.source_file_id || guidance.expense_groups.length || reply.evidence.files.length || reply.evidence.expense_candidates.length || reply.evidence.merchant_sources?.length);
        if (fullSources) {
          sourceVersion.current++;
          setSource({ scope, data: { ...reply.evidence, guidance }, loading: false, error: "" });
        } else if (guidance) {
          // A partial preview must not erase an evidence failure or pretend the hint list loaded.
          setSource(current => ({ ...current, scope, data: { ...(current.scope === scope ? current.data : null), guidance } }));
        }
      }).catch((failure) => {
        if (live.current && activeScope.current === scope && sequence === request.current)
          setPreview({ scope, value: null, loading: false, error: failure instanceof Error ? failure.message : "The working plan could not be evaluated." });
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [api, root, scope, snapshot.family_id, value, evaluationRetry]);
  const review = async (decision: "approved" | "rejected") => {
    if (!canReview || reviewing || !selected.length || !reason.trim()) return;
    setReviewing(true); onBusyChange(true); setError("");
    try {
      const saved = await prepare(); if (!saved) throw new Error("The working plan is not available.");
      const context = await api<EvaluationReply>(`${root}/evaluate`, { method: "POST", body: JSON.stringify({ body: normalizeOperatingPlanBody(saved.body), family_id: saved.family_id }) });
      const reply = await api<Partial<FinancialWorkspaceSnapshot> & { workspace?: FinancialWorkspaceSnapshot; evaluation: OperatingEvaluation }>(`${root}/review`, { method: "POST", body: JSON.stringify({ family_id: saved.family_id, expected_revision: saved.draft.revision, action_ids: selected, decision, reason: reason.trim(), context_stamp: context.context_stamp, baseline_treatment: treatment, baseline_reconciliation_note: reconciliation.trim(), idempotency_key: crypto.randomUUID() }) });
      const next = operatingReviewedWorkspace(reply, saved.family_id);
      if (live.current && activeScope.current === scope) { onReviewed(next); setPreview({ scope, value: reply.evaluation, loading: false, error: "" }); setSelected([]); setReason(""); }
    } catch (failure) { if (live.current && activeScope.current === scope) setError(failure instanceof Error ? failure.message : "Review could not be saved. Your draft is preserved."); }
    finally { if (live.current && activeScope.current === scope) { setReviewing(false); onBusyChange(false); } }
  };
  const addCandidate = (candidate: OperatingEvidenceCandidate) => {
    if (disabled || reviewing || sourceLoading || sourceError) return;
    const next = addOperatingCandidate(valueRef.current, candidate, crypto.randomUUID());
    if (next !== valueRef.current) { valueRef.current = next; onChange(next); }
  };
  const draftSourceCosts = () => {
    if (disabled || reviewing || sourceLoading || sourceError || !evidence?.guidance) return;
    const current = valueRef.current;
    const { body: next, ...result } = draftOperatingSourceCosts(current, evidence.guidance, () => crypto.randomUUID());
    setDraftResult({ scope, value: result });
    if (result.blocked_reason || next === current) return;
    valueRef.current = next;
    onChange(next);
    setSourceDraftRequest(count => count + 1);
    if (guided) setGuidedStepRequest(previous => ({ index: 1, key: (previous?.key ?? 0) + 1 }));
  };
  const sourceDisabled = disabled || reviewing || sourceLoading || Boolean(sourceError);
  const addProcessing = (source: MerchantSource) => {
    if (sourceDisabled) return;
    const body = valueRef.current; const quote = evidence?.merchant_offers?.find((offer) => offer.id === merchantQuote);
    if (body.adjustments?.some((row) => row.merchant_source_key === source.source_key && !row.excluded)) return;
    const quoteMarkup = quote?.proposed_pricing_model === "processor_markup" || quote?.proposed_pricing_model === "interchange_plus";
    const currentBasis = ["all_in", "processor_markup"].includes(source.rate_basis) ? source.rate_basis as "all_in" | "processor_markup" : "unknown";
    const proposedBasis = quoteMarkup ? "processor_markup" : quote?.proposed_effective_rate_pct != null ? "all_in" : "unknown";
    const action: OperatingAction = { id: crypto.randomUUID(), kind: "processing_cost_change", label: `${source.processor || "Card processing"} cost comparison`, driver_key: source.source_key, merchant_source_key: source.source_key, merchant_offer_id: quote?.id ?? null, cadence: "monthly", processing_volume: source.volume, processing_transaction_count: source.transactions, current_processing_rate_pct: source.effective_rate_pct, proposed_processing_rate_pct: quoteMarkup && quote?.proposed_markup_bps != null ? quote.proposed_markup_bps / 100 : quote?.proposed_effective_rate_pct ?? null, current_processing_rate_basis: currentBasis, proposed_processing_rate_basis: proposedBasis, current_processing_fixed_fee: null, current_processing_per_transaction_fee: null, proposed_processing_fixed_fee: quoteMarkup ? quote?.proposed_fixed_monthly_fees ?? null : null, proposed_processing_per_transaction_fee: quoteMarkup ? quote?.proposed_per_item_fee ?? null : null, implementation_cost: quote?.early_termination_fee ?? null, implementation_cost_cadence: "one_time", status: "proposed", source_file_ids: [...new Set([source.file_id, ...(quote?.source_file_id ? [quote.source_file_id] : [])])], source_note: `Current statement: ${source.period_start || "unknown start"} to ${source.period_end || "unknown end"}. Confirm its period, currency, volume and comparable rate basis before review.${quote?.notes ? ` Quote: ${quote.notes}` : ""}`, explanation: "", owner_name: "" };
    onChange({ ...body, adjustments: [...(body.adjustments ?? []), action] });
  };
  const actions = (value.adjustments ?? []).filter((row) => !row.excluded && !row.duplicate_of);
  const processingReference = (row: OperatingAction, sourceKey: string, offerId: string) => {
    const body = valueRef.current; const source = evidence?.merchant_sources?.find((item) => item.source_key === sourceKey); const quote = evidence?.merchant_offers?.find((item) => item.id === offerId);
    const markup = quote?.proposed_pricing_model === "processor_markup" || quote?.proposed_pricing_model === "interchange_plus";
    const patch: Partial<OperatingAction> = { merchant_source_key: sourceKey || null, merchant_offer_id: offerId || null, source_file_ids: [...new Set([...(source ? [source.file_id] : []), ...(quote?.source_file_id ? [quote.source_file_id] : [])])], ...(source ? { processing_volume: source.volume, processing_transaction_count: source.transactions, current_processing_rate_pct: source.effective_rate_pct, current_processing_rate_basis: ["all_in", "processor_markup"].includes(source.rate_basis) ? source.rate_basis as "all_in" | "processor_markup" : "unknown", current_processing_fixed_fee: null, current_processing_per_transaction_fee: null } : {}), ...(quote ? { proposed_processing_rate_pct: markup && quote.proposed_markup_bps != null ? quote.proposed_markup_bps / 100 : quote.proposed_effective_rate_pct ?? null, proposed_processing_rate_basis: markup ? "processor_markup" : quote.proposed_effective_rate_pct != null ? "all_in" : "unknown", proposed_processing_fixed_fee: markup ? quote.proposed_fixed_monthly_fees ?? null : null, proposed_processing_per_transaction_fee: markup ? quote.proposed_per_item_fee ?? null : null } : {}) };
    onChange({ ...body, adjustments: (body.adjustments ?? []).map((item) => item.id === row.id ? clearOperatingReview({ ...item, ...patch }) : item) });
  };
  const sourceTools = (<div ref={sourcePanelElement}><StaffOperatingSources embedded key={scope} evidence={evidence} files={snapshot.evidence} value={value} loading={sourceLoading} error={sourceError} disabled={disabled || reviewing} onRetry={() => void loadEvidence()} onDraft={draftSourceCosts} onAddCandidate={addCandidate} onPreviewSource={openSourceDocument} result={draftResult?.scope === scope ? draftResult.value : null}>
      {evidence?.merchant_sources?.length ? <><div className={styles.toolbar} style={{ marginTop: 14 }}><h4>Card processing · current statements and proposed quotes</h4><label>Optional proposed quote <select disabled={sourceDisabled} value={merchantQuote} onChange={(event) => setMerchantQuote(event.target.value)}><option value="">Choose later in the action</option>{evidence.merchant_offers?.map((offer) => <option key={offer.id} value={offer.id}>{offer.provider_name || "Processing quote"}</option>)}</select></label></div><div className={styles.scroll}><table><thead><tr><th>Processor / statement</th><th>Card volume</th><th>Current fees</th><th>Effective rate</th><th>Compare</th></tr></thead><tbody>{evidence.merchant_sources.map((source) => {
        const exists = value.adjustments?.some((row) => row.merchant_source_key === source.source_key && !row.excluded);
        return <tr key={source.source_key}><th><button type="button" className={styles.link} disabled={sourceDisabled} onClick={() => openSourceDocument(source.file_id)}>{source.file_name}</button><small>{source.period_start} – {source.period_end}</small></th><td>{operatingMoney(source.volume, source.currency ?? value.currency)}</td><td>{operatingMoney(source.total_fees, source.currency ?? value.currency)}</td><td>{source.effective_rate_pct == null ? "—" : `${source.effective_rate_pct}%`} · {operatingLabel(source.rate_basis || "unknown")}</td><td><button type="button" disabled={sourceDisabled || Boolean(exists)} onClick={() => addProcessing(source)}>{exists ? "Already proposed" : "Draft cost comparison"}</button>{!source.eligible_for_review ? <small>Source needs review</small> : null}</td></tr>;
      })}</tbody></table></div><p className={styles.muted}>A quote is a proposal. All-in rates and processor markup cannot be compared directly. Verify period, volume, pass-through charges and transition costs in action details.</p></> : null}
    </StaffOperatingSources></div>);
  const goalReady = operatingGoalReady(goal.goal);
  const goalControls = <>{evaluation?.goal_progress && evaluation.goal_progress.goal_revision !== goal.goal?.revision ? <button type="button" onClick={goal.reload}>Refresh goal</button> : null}{canReview ? <button type="button" disabled={disabled || goal.saving} onClick={() => setEditingGoal(true)}>Edit goal</button> : null}</>;
  const goalSetup = goal.goal && canReview ? <StaffOperatingGoal key={`${scope}:${goal.goal.revision}`} goal={goal.goal} currencySuggestion={evaluation?.baseline.noi_governance?.currency || evaluation?.baseline.noi_currency || evidence?.guidance?.reporting.currency || evaluation?.baseline.currency} disabled={disabled} saving={goal.saving} error={goal.error} onReload={goal.reload} onCancel={goalReady ? () => setEditingGoal(false) : undefined} onSave={async (amount, currency) => { const saved = await goal.save(amount, currency); if (saved) { fileWorkspace?.saved(); setEditingGoal(false); setEvaluationRetry(count => count + 1); } }} /> : null;
  if (goal.loading || !goal.goal) return <section aria-label="Staff annual NOI goal setup"><p>{goal.loading ? "Reading the annual NOI goal…" : goal.error || "The annual NOI goal is not available."}</p>{!goal.loading ? <button type="button" onClick={goal.reload}>Retry goal</button> : null}</section>;
  if (!goalReady) return goalSetup || <p>Your team must set a positive annual NOI goal before the client plan can be opened.</p>;
  return <div className={styles.plan}>
    {editingGoal ? goalSetup : null}
    {error ? <div role="alert">Staff review could not be saved: {error}</div> : null}
    {evaluationError ? <div role="alert"><p>The financial preview could not be updated: {evaluationError}</p><button type="button" disabled={disabled || reviewing || evaluating} onClick={() => setEvaluationRetry(count => count + 1)}>Retry financial preview</button></div> : null}
    <OperatingPlanForm suggestionClient={suggestionClient} goal={goal.goal} goalControls={goalControls} sourceMessage={sourceDocumentError ? <div role="alert"><p>{sourceDocumentError} Your current step and entries are retained.</p><button type="button" onClick={() => { if (lastSourceDocument.current) openSourceDocument(lastSourceDocument.current); }}>Retry source document</button></div> : null} sourceTools={sourceTools} onConfirmSource={draftSourceCosts} onSaveVersion={onSaveVersion} saveVersionDisabled={saveVersionDisabled} saveVersionBusy={saveVersionBusy} key={scope} guidedDefault onGuidedModeChange={setGuided} guidedStepRequest={draftResult?.scope === scope ? guidedStepRequest : null} sourceDraftRequest={draftResult?.scope === scope ? sourceDraftRequest : 0} onOpenSources={() => sourcePanelElement.current?.scrollIntoView({ block: "start", behavior: "smooth" })} guidance={evidence?.guidance} evidence={evidence} value={value} onChange={onChange} disabled={disabled || reviewing || goal.saving} staff sources={snapshot.evidence} onPreviewSource={openSourceDocument} evaluation={evaluation} releasedCashFlow={releasedCashFlow ?? snapshot.completion?.released_cash_flow} evaluating={evaluating} processingReferences={{ sources: (evidence?.merchant_sources ?? []).map((source) => ({ key: source.source_key, label: source.file_name })), offers: (evidence?.merchant_offers ?? []).map((offer) => ({ id: offer.id, label: offer.provider_name || "Processing quote" })) }} onProcessingReference={processingReference} reviewControls={canReview ? <section className={styles.details}><h4>Staff review</h4><div className={styles.fields}><label>Actions to review<select multiple aria-label="Actions to review" value={selected} disabled={disabled || reviewing} onChange={(event) => setSelected([...event.target.selectedOptions].map((option) => option.value))}>{actions.map((row) => <option key={row.id} value={row.id}>{row.label || "Unnamed action"} · {operatingLabel(row.status ?? "proposed")}</option>)}</select></label><label>Relation to earnings baseline<select value={treatment} disabled={disabled || reviewing} onChange={(event) => setTreatment(event.target.value)}><option value="unreconciled">Not yet reconciled</option><option value="included_in_baseline">Current cost / revenue included in baseline</option><option value="incremental_to_baseline">Incremental to baseline</option><option value="outside_operating_earnings">Outside operating earnings</option></select></label><label>Reconciliation to source / period<textarea value={reconciliation} disabled={disabled || reviewing} onChange={(event) => setReconciliation(event.target.value)} placeholder="Identify the current source and period; explain differences from the baseline" /></label><label className={styles.wide}>Review reason<textarea value={reason} disabled={disabled || reviewing} onChange={(event) => setReason(event.target.value)} placeholder="Document evidence, feasibility and any conditions" /></label></div><div className={styles.toolbar}><span className={styles.muted}>Reviewed proposals remain projections. Save version publishes the reviewed plan.</span><div className={styles.tools}><button type="button" disabled={disabled || reviewing || !selected.length || !reason.trim()} onClick={() => void review("rejected")}>Reject selected</button><button type="button" disabled={disabled || reviewing || !selected.length || !reason.trim() || treatment === "unreconciled" || !reconciliation.trim()} onClick={() => void review("approved")}>{reviewing ? "Saving review…" : "Approve selected"}</button></div></div></section> : <p className={styles.muted}>Underwriting reviews proposed adjustments before they can enter a reviewed projection.</p>} />
  </div>;
}
