"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import type { FinancialWorkspaceSnapshot } from "@/lib/financialWorkspaceApi";
import { clearOperatingReview, normalizeOperatingPlanBody, operatingMoney, operatingLabel, operatingNumber, operatingReviewedWorkspace, type OperatingAction, type OperatingEvaluation, type OperatingPlanBody } from "@/lib/operatingPlan";
import { OperatingPlanForm } from "./OperatingPlanForm";
import styles from "./OperatingPlanForm.module.css";
import type { ReleasedCashFlowEvaluation } from "@/lib/operatingPlan";
import { addOperatingCandidate, type OperatingGuidance, type OperatingExpenseCandidate } from "@/lib/operatingGuidance";

export type OperatingEvidenceCandidate = OperatingExpenseCandidate;
type MerchantSource = { source_key: string; file_id: string; file_name: string; processor: string | null; account_last4: string | null; period_start: string | null; period_end: string | null; currency: string | null; volume: number | null; total_fees: number | null; transactions: number | null; effective_rate_pct: number | null; rate_basis: string; eligible_for_review: boolean; warnings?: string[] };
type MerchantOffer = { id: string; source_file_id?: string | null; provider_name?: string | null; proposed_effective_rate_pct?: number | null; proposed_pricing_model?: string | null; proposed_markup_bps?: number | null; proposed_per_item_fee?: number | null; proposed_fixed_monthly_fees?: number | null; early_termination_fee?: number | null; notes?: string | null };
export type OperatingEvidence = { guidance?: OperatingGuidance; files?: Array<{ file_id: string; file_name: string }>; expense_candidates?: OperatingEvidenceCandidate[]; merchant_sources?: MerchantSource[]; merchant_offers?: MerchantOffer[]; warnings?: string[] };
type EvaluationReply = { evaluation: OperatingEvaluation; evidence?: OperatingEvidence; guidance?: OperatingGuidance; context_stamp: string };

/** No second draft: previews read the workspace body; staff review flushes its revision first. */
export function OperatingPlanEditor({ profileId, snapshot, value, onChange, disabled, prepare, onReviewed, onPreviewSource, onBusyChange }: {
  profileId: string; snapshot: FinancialWorkspaceSnapshot; value: OperatingPlanBody; onChange: (value: OperatingPlanBody) => void;
  disabled?: boolean; prepare: () => Promise<FinancialWorkspaceSnapshot | null>; onReviewed: (snapshot: FinancialWorkspaceSnapshot) => void;
  onPreviewSource: (fileId: string) => void; onBusyChange: (busy: boolean) => void;
}) {
  const api = useAuthedApi();
  const role = useCurrentUser().data?.role;
  const canReview = role === Role.SUPER_ADMIN || role === Role.LOAN_EXEC;
  const [evaluation, setEvaluation] = useState<OperatingEvaluation | null>(null);
  const [releasedCashFlow, setReleasedCashFlow] = useState<ReleasedCashFlowEvaluation | null>(null);
  const [evidence, setEvidence] = useState<OperatingEvidence | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState(""); const [reviewing, setReviewing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]); const [reason, setReason] = useState("");
  const [treatment, setTreatment] = useState("unreconciled"); const [reconciliation, setReconciliation] = useState("");
  const [showCandidates, setShowCandidates] = useState(false);
  const [merchantQuote, setMerchantQuote] = useState("");
  const request = useRef(0); const live = useRef(true); const valueRef = useRef(value); valueRef.current = value;
  const root = `/application-profiles/${encodeURIComponent(profileId)}/operating-plan`;
  useEffect(() => { live.current = true; return () => { live.current = false; request.current += 1; }; }, []);
  useEffect(() => {
    let cancelled = false;
    void api<OperatingEvidence>(`${root}/evidence`).then((reply) => { if (!cancelled) setEvidence(reply); }).catch((failure) => { if (!cancelled) setError(failure instanceof Error ? failure.message : "Evidence suggestions could not be loaded."); });
    return () => { cancelled = true; };
  }, [api, root]);
  useEffect(() => {
    const sequence = ++request.current; setEvaluation(null); setEvaluating(true);
    const timer = setTimeout(() => {
      void api<EvaluationReply>(`${root}/evaluate`, { method: "POST", body: JSON.stringify({ body: normalizeOperatingPlanBody(value), family_id: snapshot.family_id }) }).then((reply) => { if (live.current && sequence === request.current) { setEvaluation(reply.evaluation); setReleasedCashFlow(reply.evaluation.released_cash_flow ?? null); if (reply.evidence || reply.guidance) setEvidence(current => ({ ...(reply.evidence ?? current), ...(reply.guidance ? { guidance: reply.guidance } : {}) })); setError(""); } }).catch((failure) => { if (live.current && sequence === request.current) setError(failure instanceof Error ? failure.message : "The working plan could not be evaluated."); }).finally(() => { if (live.current && sequence === request.current) setEvaluating(false); });
    }, 500);
    return () => clearTimeout(timer);
  }, [api, root, snapshot.family_id, value]);
  const review = async (decision: "approved" | "rejected") => {
    if (!canReview || reviewing || !selected.length || !reason.trim()) return;
    setReviewing(true); onBusyChange(true); setError("");
    try {
      const saved = await prepare(); if (!saved) throw new Error("The working plan is not available.");
      const context = await api<EvaluationReply>(`${root}/evaluate`, { method: "POST", body: JSON.stringify({ body: normalizeOperatingPlanBody(saved.body), family_id: saved.family_id }) });
      const reply = await api<Partial<FinancialWorkspaceSnapshot> & { workspace?: FinancialWorkspaceSnapshot; evaluation: OperatingEvaluation }>(`${root}/review`, { method: "POST", body: JSON.stringify({ family_id: saved.family_id, expected_revision: saved.draft.revision, action_ids: selected, decision, reason: reason.trim(), context_stamp: context.context_stamp, baseline_treatment: treatment, baseline_reconciliation_note: reconciliation.trim(), idempotency_key: crypto.randomUUID() }) });
      const next = operatingReviewedWorkspace(reply, saved.family_id);
      if (live.current) { onReviewed(next); setEvaluation(reply.evaluation); setReleasedCashFlow(reply.evaluation.released_cash_flow ?? null); setSelected([]); setReason(""); }
    } catch (failure) { if (live.current) setError(failure instanceof Error ? failure.message : "Review could not be saved. Your draft is preserved."); }
    finally { if (live.current) { setReviewing(false); onBusyChange(false); } }
  };
  const candidates = evidence?.expense_candidates ?? [];
  const addCandidate = (candidate: OperatingEvidenceCandidate) => {
    onChange(addOperatingCandidate(valueRef.current, candidate, crypto.randomUUID()));
  };
  const addProcessing = (source: MerchantSource) => {
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
  return <div className={styles.plan}>
    {error ? <div role="alert">{error}</div> : null}
    <div className={styles.toolbar}><span className={styles.muted}>Working plan · Save version creates its dated PDF and package record.</span><button type="button" aria-expanded={showCandidates} onClick={() => setShowCandidates((open) => !open)}>Statement suggestions ({candidates.length + (evidence?.merchant_sources?.length ?? 0)})</button></div>
    {showCandidates ? <section className={styles.details}>
      <h4>Statement evidence · review before adding</h4><p className={styles.muted}>Recurring payments may be transfers, financing or operating costs. Select the right category and verify the current amount before using a proposal.</p>
      <div className={styles.scroll}><table><thead><tr><th>Observed item</th><th>Current reference</th><th>Evidence</th><th>Add to disclosure</th></tr></thead><tbody>{candidates.map((candidate, index) => {
        const key = candidate.bank_vendor_key ?? candidate.key ?? candidate.id; const exists = key && value.expenses?.some((row) => row.bank_vendor_key === key);
        return <tr key={key ?? index}><th>{candidate.label ?? candidate.payee ?? "Statement expense"}</th><td>{operatingMoney(operatingNumber(candidate.current_amount), value.currency)} · {candidate.cadence ?? "monthly"}{candidate.warning ? <small>{candidate.warning}</small> : null}</td><td>{candidate.source_file_ids?.map((id) => <button key={id} type="button" className={styles.link} onClick={() => onPreviewSource(id)}>{snapshot.evidence.find((file) => file.file_id === id)?.file_name ?? "View statement"}</button>)}</td><td><button type="button" disabled={disabled || Boolean(exists)} onClick={() => addCandidate(candidate)}>{exists ? "Already disclosed" : "Add for review"}</button></td></tr>;
      })}{!candidates.length ? <tr><td colSpan={4}>No detailed candidates available. Enter disclosed costs or link supporting statements.</td></tr> : null}</tbody></table></div>
      {evidence?.merchant_sources?.length ? <><div className={styles.toolbar} style={{ marginTop: 14 }}><h4>Card processing · current statements and proposed quotes</h4><label>Optional proposed quote <select value={merchantQuote} onChange={(event) => setMerchantQuote(event.target.value)}><option value="">Choose later in the action</option>{evidence.merchant_offers?.map((offer) => <option key={offer.id} value={offer.id}>{offer.provider_name || "Processing quote"}</option>)}</select></label></div><div className={styles.scroll}><table><thead><tr><th>Processor / statement</th><th>Card volume</th><th>Current fees</th><th>Effective rate</th><th>Compare</th></tr></thead><tbody>{evidence.merchant_sources.map((source) => {
        const exists = value.adjustments?.some((row) => row.merchant_source_key === source.source_key && !row.excluded);
        return <tr key={source.source_key}><th><button type="button" className={styles.link} onClick={() => onPreviewSource(source.file_id)}>{source.file_name}</button><small>{source.period_start} – {source.period_end}</small></th><td>{operatingMoney(source.volume, source.currency ?? value.currency)}</td><td>{operatingMoney(source.total_fees, source.currency ?? value.currency)}</td><td>{source.effective_rate_pct == null ? "—" : `${source.effective_rate_pct}%`} · {operatingLabel(source.rate_basis || "unknown")}</td><td><button type="button" disabled={disabled || Boolean(exists)} onClick={() => addProcessing(source)}>{exists ? "Already proposed" : "Draft cost comparison"}</button>{!source.eligible_for_review ? <small>Source needs review</small> : null}</td></tr>;
      })}</tbody></table></div><p className={styles.muted}>A quote is a proposal. All-in rates and processor markup cannot be compared directly. Verify period, volume, pass-through charges and transition costs in action details.</p></> : null}
      {evidence?.warnings?.map((note) => <p key={note} className={styles.muted}>{note}</p>)}
    </section> : null}
    <OperatingPlanForm guidance={evidence?.guidance} evidence={evidence} value={value} onChange={onChange} disabled={disabled || reviewing} staff sources={snapshot.evidence} onPreviewSource={onPreviewSource} evaluation={evaluation} releasedCashFlow={releasedCashFlow ?? snapshot.completion?.released_cash_flow} evaluating={evaluating} processingReferences={{ sources: (evidence?.merchant_sources ?? []).map((source) => ({ key: source.source_key, label: source.file_name })), offers: (evidence?.merchant_offers ?? []).map((offer) => ({ id: offer.id, label: offer.provider_name || "Processing quote" })) }} onProcessingReference={processingReference} reviewControls={canReview ? <section className={styles.details}><h4>Staff review</h4><div className={styles.fields}><label>Actions to review<select multiple aria-label="Actions to review" value={selected} disabled={disabled || reviewing} onChange={(event) => setSelected([...event.target.selectedOptions].map((option) => option.value))}>{actions.map((row) => <option key={row.id} value={row.id}>{row.label || "Unnamed action"} · {operatingLabel(row.status ?? "proposed")}</option>)}</select></label><label>Relation to earnings baseline<select value={treatment} disabled={disabled || reviewing} onChange={(event) => setTreatment(event.target.value)}><option value="unreconciled">Not yet reconciled</option><option value="included_in_baseline">Current cost / revenue included in baseline</option><option value="incremental_to_baseline">Incremental to baseline</option><option value="outside_operating_earnings">Outside operating earnings</option></select></label><label>Reconciliation to source / period<textarea value={reconciliation} disabled={disabled || reviewing} onChange={(event) => setReconciliation(event.target.value)} placeholder="Identify the current source and period; explain differences from the baseline" /></label><label className={styles.wide}>Review reason<textarea value={reason} disabled={disabled || reviewing} onChange={(event) => setReason(event.target.value)} placeholder="Document evidence, feasibility and any conditions" /></label></div><div className={styles.toolbar}><span className={styles.muted}>Reviewed proposals remain projections. Save version publishes the reviewed plan.</span><div className={styles.tools}><button type="button" disabled={disabled || reviewing || !selected.length || !reason.trim()} onClick={() => void review("rejected")}>Reject selected</button><button type="button" disabled={disabled || reviewing || !selected.length || !reason.trim() || treatment === "unreconciled" || !reconciliation.trim()} onClick={() => void review("approved")}>{reviewing ? "Saving review…" : "Approve selected"}</button></div></div></section> : <p className={styles.muted}>Underwriting reviews proposed adjustments before they can enter a reviewed projection.</p>} />
  </div>;
}
