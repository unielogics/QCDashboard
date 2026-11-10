"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Btn, Callout, CellChip, Input, cx } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { ClosingStipulationsPanel } from "@/components/file/ClosingStipulationsPanel";
import { FeeAllocationEditor } from "@/components/payments/FeeAllocationEditor";
import { OfferDeliveryHistory } from "@/components/communications/OfferDeliveryHistory";
import { useClosingStipulations } from "@/hooks/useApi";
import type { OfferDeliveryReceipt, OfferSelection } from "@/components/communications/OfferDeliveryComposer";
import type { AcceptedTermsRef, ApplicationUnderwritingPatch, ApplicationUnderwritingState } from "@/lib/applicationProfile";
import type { UnderwritingLifecycleStatus } from "@/lib/unifiedOperator";
import type { UnderwritingDraft } from "./leadFile";
import type { WorkingFinancing } from "@/lib/workingFinancing";
import { currentTermsDelivery, termsReferenceMatches, type OfferDelivery } from "@/lib/offerDeliveryState";
import { FinancingProposalSummary } from "./FinancingProposalSummary";

/** The immutable terms saved by the same editor used in Financials. */
export type TermsOnFile = {
  kind: "production_term_sheet" | "application_term_sheet";
  id: string; version: number; status: string; label: string;
  amount: number | null; ratePct: number | null; termMonths: number | null;
  structureLabel: string | null; interestOnlyMonths: number; paymentMonthly: number | null; paymentAmount?: number | null; paymentLabel?: string;
  coverageAfter: number | null; recordedAt: string | null; sentToClient: boolean;
};
type StepState = "todo" | "current" | "done" | "warn";
type StepKey = "terms" | "offer" | "accepted" | "close";
const money = (v: number | null | undefined, digits = 0) => v == null || !Number.isFinite(v) ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
const when = (v: string | null | undefined) => v ? new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
const ratio = (v: number | null | undefined) => v == null ? "—" : `${v.toFixed(2)}x`;

function Step({ n, title, state, chip, sub, children, step, active }: { n: number; title: string; state: StepState; chip: string; sub: string; children: ReactNode; step: StepKey; active: StepKey }) {
  return <section className={cx("uw-step", state)} id={`uw-${step}`} role="tabpanel" aria-labelledby={`uw-tab-${step}`} hidden={active !== step}>
    <header className="uw-step-head"><span className="uw-step-n" aria-hidden>{state === "done" ? <Icon name="check" size={14} /> : n}</span><div className="uw-step-title"><h3>{title}</h3><p className="sub">{sub}</p></div><CellChip tone={state === "done" ? "ok" : state === "warn" ? "warn" : state === "current" ? "acc" : "mut"}>{chip}</CellChip></header>
    <div className="uw-step-body">{children}</div>
  </section>;
}

export function UnderwritingFlow({ profileId, terms, termsLoading, termsActions, onEditTerms, financing, requestedAmount, onCoveragePlan, underwriting, statusLabel, draft, onDraftChange, saving, error, onRecordAcceptance, onStatusChange, onResponseRecorded, forecastEarnings, feeInfo, offer, marketplace, publication, loanId, onCreateFundingFile, canUnderwrite }: {
  profileId: string; terms: TermsOnFile | null; termsLoading: boolean; termsActions?: ReactNode; onEditTerms: () => void;
  financing?: WorkingFinancing | null; requestedAmount?: number | null; onCoveragePlan?: () => void;
  underwriting: ApplicationUnderwritingState | null; statusLabel: string; draft: UnderwritingDraft;
  onDraftChange: (patch: Partial<UnderwritingDraft>) => void; saving: boolean; error: string | null;
  onRecordAcceptance: (patch: ApplicationUnderwritingPatch) => void; onStatusChange: (status: UnderwritingLifecycleStatus) => void;
  onEditFees: () => void; onResponseRecorded?: () => Promise<unknown> | void; forecastEarnings: number | null;
  feeInfo: { vertical?: "real_estate" | "main_street" | "dealer" | "mca"; capPercent?: number | null; reviewRequired?: boolean; reviewReason?: string | null; label?: string | null };
  marketplace?: ReactNode; publication?: { published: boolean; label?: string };
  offer: { termsSelection: OfferSelection | null; merchantSelection: OfferSelection | null; merchantStatus: string | null; merchantStrip: ReactNode; selectedKeys: string[]; onSelectedKeys: (keys: string[]) => void; onCompose: () => void; receipt: OfferDeliveryReceipt | null; contactSuppressed: boolean };
  loanId: string | null; onCreateFundingFile: () => void; canUnderwrite: boolean;
}) {
  const [active, setActive] = useState<StepKey>("terms");
  const [deliveries, setDeliveries] = useState<OfferDelivery[]>([]);
  const [achOpen, setAchOpen] = useState(false);
  const [merchantOpen, setMerchantOpen] = useState(false);
  const [offlineConfirmed, setOfflineConfirmed] = useState(false);
  useEffect(() => { setActive("terms"); setDeliveries([]); setAchOpen(false); setMerchantOpen(false); setOfflineConfirmed(false); }, [profileId]);
  useEffect(() => { setOfflineConfirmed(false); }, [terms?.id, terms?.version]);
  const response = useMemo(() => currentTermsDelivery(deliveries, terms), [deliveries, terms]);
  const decision = response?.item.decision_status ?? response?.item.status;
  const declined = decision === "declined";
  const accepted = underwriting?.accepted_amount != null;
  const acceptedRef = underwriting?.accepted_terms_ref ?? null;
  const termsMoved = accepted && !termsReferenceMatches(acceptedRef, terms);
  const currentAccepted = !termsMoved && (decision === "accepted" || Boolean(accepted && !declined));
  const offerSent = Boolean(response) || Boolean(terms?.sentToClient);
  const closed = underwriting?.underwriting_status === "closed_won";
  const stips = useClosingStipulations(profileId, accepted);
  const openStips = stips.data?.open_count ?? null;
  const readyToClose = Boolean(stips.data?.ready_to_close);
  const responseLabel = declined ? "Client declined" : currentAccepted ? "Accepted" : termsMoved ? "Review accepted version" : offerSent ? "Awaiting client response" : "Not delivered";
  const states: Record<StepKey, StepState> = {
    terms: terms ? "done" : "current", offer: publication?.published ? "done" : terms ? "current" : "todo",
    accepted: declined || termsMoved ? "warn" : currentAccepted ? "done" : offerSent ? "current" : "todo",
    close: closed ? "done" : currentAccepted ? "current" : "todo",
  };
  useEffect(() => {
    if (offer.termsSelection && offer.selectedKeys.length === 0) offer.onSelectedKeys([offer.termsSelection.key]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.termsSelection?.key]);
  const acceptedAmount = draft.accepted_amount.trim() === "" ? null : Number(draft.accepted_amount);
  const amountValid = acceptedAmount != null && Number.isFinite(acceptedAmount) && acceptedAmount > 0;
  const acceptanceDirty = draft.accepted_amount.trim() !== (underwriting?.accepted_amount == null ? "" : String(underwriting.accepted_amount)) || (draft.estimated_close_date || "") !== (underwriting?.estimated_close_date ?? "");
  const points = underwriting?.forecast_fee_points ?? null, consulting = underwriting?.forecast_consulting_fee ?? null;
  const originationFee = underwriting?.accepted_amount != null && points != null ? underwriting.accepted_amount * points / 100 : null;
  const ref: AcceptedTermsRef | null = terms ? { kind: terms.kind, id: terms.id, version: terms.version, amount: terms.amount, rate_pct: terms.ratePct, term_months: terms.termMonths, label: terms.label } : null;
  const rail = [
    { key: "terms", title: "Client terms", summary: terms ? `v${terms.version} · ${money(terms.amount)}${terms.ratePct != null ? ` · ${terms.ratePct}%` : ""}` : "Create the loan and preview" },
    { key: "offer", title: "Offer published", summary: publication?.label ?? "Prepare and share marketplace offer" },
    { key: "accepted", title: "Client response", summary: responseLabel },
    { key: "close", title: "Closing", summary: closed ? "Closed / funded" : currentAccepted ? (openStips == null ? "Review closing conditions" : readyToClose ? "Ready to close" : `${openStips} conditions open`) : "After client acceptance" },
  ] as const;
  return <div className="uw-flow">
    <div className="uw-workspace-bar"><span className="sub">One shared loan · Financials and Underwriting</span><CellChip tone={closed ? "ok" : "mut"}>{statusLabel}</CellChip></div>
    <div className="uw-rail" role="tablist" aria-label="Underwriting steps">
      {rail.map((step, i) => <button type="button" key={step.key} id={`uw-tab-${step.key}`} role="tab" aria-selected={active === step.key} aria-controls={`uw-${step.key}`} tabIndex={active === step.key ? 0 : -1} className={cx("uw-rail-step", states[step.key], active === step.key && "on")} onClick={() => setActive(step.key)} onKeyDown={event => {
        const next = event.key === "ArrowRight" ? (i + 1) % rail.length : event.key === "ArrowLeft" ? (i + rail.length - 1) % rail.length : event.key === "Home" ? 0 : event.key === "End" ? rail.length - 1 : null;
        if (next != null) { event.preventDefault(); setActive(rail[next].key); document.getElementById(`uw-tab-${rail[next].key}`)?.focus(); }
      }}><span className="uw-rail-n" aria-hidden>{states[step.key] === "done" ? <Icon name="check" size={12} /> : i + 1}</span><span className="uw-rail-text"><b>{step.title}</b><small>{step.summary}</small></span></button>)}
    </div>
    {error ? <Callout tone="bad">{error}</Callout> : null}

    <Step n={1} step="terms" active={active} title="Client terms" state={states.terms} chip={terms ? `Saved v${terms.version}` : "Not started"} sub="Preview the saved offer, then open the full editor to adjust the loan, collateral and closing costs.">
      <div className="uw-terms-layout">
        <div className="grid g12">
          <FinancingProposalSummary value={financing ?? null} saved={underwriting?.financing} requestedAmount={requestedAmount} onEdit={onEditTerms} onCoverage={onCoveragePlan} />
          <div className="uw-actions"><Btn variant="pri" onClick={onEditTerms} disabled={termsLoading || saving}><Icon name="maximize" size={14} />Open full terms</Btn><span className="sub">Loan terms · Amortization & risk · Collateral · Investment & costs</span></div>
          {financing?.dirty ? <Callout tone="warn">The working loan has unsaved changes. The preview shows the last saved terms version. Open full terms to review the draft and save a new version.</Callout> : null}
          {termsActions ? <div className="uw-terms-actions">{termsActions}</div> : null}
        </div>
        <button className="uw-terms-preview" type="button" onClick={onEditTerms} disabled={termsLoading || saving} aria-label={terms ? `Preview and edit client terms version ${terms.version}` : "Create client terms"}>
          <div className="uw-preview-brand"><span className="qc-mini">QC</span><span><b>Qualified Commercial</b><small>Financing terms</small></span><Icon name="maximize" size={16} /></div>
          <div className="uw-preview-content"><small>{termsLoading ? "Reading saved terms…" : terms ? `Saved terms · version ${terms.version}` : "Client-ready offer preview"}</small><strong>{terms ? money(terms.amount) : "Create client terms"}</strong><span>{terms?.label ?? "Structure the loan in the full editor"}</span><div className="uw-terms-figures"><div><small>Rate</small><b>{terms?.ratePct != null ? `${terms.ratePct}%` : "—"}</b></div><div><small>Maturity</small><b>{terms?.termMonths ? `${terms.termMonths} months` : "—"}</b></div><div><small>{terms?.paymentLabel ?? "Payment / month"}</small><b>{money(terms?.paymentAmount ?? terms?.paymentMonthly, 2)}</b></div><div><small>Coverage after</small><b>{ratio(terms?.coverageAfter)}</b></div></div><small>{terms?.structureLabel}{terms?.interestOnlyMonths ? ` · ${terms.interestOnlyMonths} interest-only months` : ""}{terms?.recordedAt ? ` · ${when(terms.recordedAt)}` : ""}</small><span className="uw-preview-edit"><Icon name="pencil" size={13} />Open to edit and view the full preview</span></div>
        </button>
      </div>
    </Step>

    <Step n={2} step="offer" active={active} title="Offer published" state={states.offer} chip={publication?.label ?? "Not published"} sub="Prepare the investor package, review its marketplace listing, then publish and share it with members.">
      {marketplace ?? <p className="sub">Marketplace preparation is unavailable on this file.</p>}
      <p className="sub">The marketplace link opens the investor offer. Client delivery and acceptance are managed in Client response.</p>
      <div className="uw-actions"><Btn onClick={() => setActive("accepted")}>Client delivery & response<Icon name="chevR" size={14} /></Btn></div>
    </Step>

    <Step n={3} step="accepted" active={active} title="Client response" state={states.accepted} chip={responseLabel} sub="Deliver the exact terms version and record the client’s acceptance or decline.">
      {declined ? <Callout tone="warn"><b>The client declined these terms.</b>{response?.item.responded_name ? ` ${response.item.responded_name}` : ""}{response?.item.responded_at ? ` · ${when(response.item.responded_at)}` : ""}. Edit the terms to prepare a revised offer.</Callout> : termsMoved ? <Callout tone="warn">{acceptedRef ? `The recorded acceptance answers ${acceptedRef.label} v${acceptedRef.version}.` : "A legacy accepted amount has no linked terms version."} Review the accepted version before proceeding with current terms.</Callout> : currentAccepted ? <Callout tone="ok"><b>Client accepted.</b> {terms?.label}{response?.item.responded_name ? ` · ${response.item.responded_name}` : ""}{response?.item.responded_at || underwriting?.accepted_at ? ` · ${when(response?.item.responded_at || underwriting?.accepted_at)}` : ""}.</Callout> : null}
      <section className="uw-delivery" aria-label="Deliver terms to client"><div className="uw-terms-actions"><strong>Client delivery</strong><CellChip tone={offerSent ? "ok" : "mut"}>{offerSent ? "Available to client" : "Not delivered"}</CellChip></div>
        <div className="uw-offer-items">{[offer.termsSelection, offer.merchantSelection].filter((item): item is OfferSelection => Boolean(item)).map(item => <label className="uw-offer-item" key={item.key}><input type="checkbox" checked={offer.selectedKeys.includes(item.key)} onChange={event => offer.onSelectedKeys(event.target.checked ? [...new Set([...offer.selectedKeys, item.key])] : offer.selectedKeys.filter(key => key !== item.key))} /><span><b>{item.label}</b><small>{item.description}</small></span></label>)}</div>
        {!terms ? <p className="sub">Save a terms version in Client terms first.</p> : null}
        <div className="uw-actions"><Btn variant="pri" disabled={!canUnderwrite || !offer.selectedKeys.length || offer.contactSuppressed || saving} onClick={offer.onCompose} title={offer.contactSuppressed ? "Direct client contact is suppressed on this file" : undefined}><Icon name="send" size={14} />{offerSent ? "Review client delivery" : "Prepare client delivery"}</Btn><button type="button" className="linklike" onClick={() => setMerchantOpen(value => !value)}>{merchantOpen ? "Hide processing offer" : "Processing offer (optional)"}</button></div>
        {merchantOpen ? <div className="uw-sub">{offer.merchantStrip}</div> : null}
      </section>
      <OfferDeliveryHistory key={profileId} profileId={profileId} refreshKey={offer.receipt?.id} expanded responseActions canRecordResponse={canUnderwrite && !saving} onRead={setDeliveries} onResponseRecorded={onResponseRecorded} />
      <p className="sub">Acceptance and decline apply to the version shown in the delivery history. Record a response only after the client has communicated it.</p>
      <details className="uw-sub"><summary>Offline acceptance and closing date</summary><div className="grid g10">
        <p className="sub">Use this for a client acceptance received outside the delivery workflow. Record sent-offer responses above when available.</p>
        <div className="uw-accept-grid"><label className="grid g2"><span className="sub">Accepted amount</span><Input aria-label="Accepted amount" type="number" inputMode="decimal" min={0} step="0.01" value={draft.accepted_amount} disabled={!canUnderwrite || Boolean(response)} onChange={event => onDraftChange({ accepted_amount: event.target.value })} />{terms?.amount != null && !response ? <button type="button" className="linklike" onClick={() => onDraftChange({ accepted_amount: String(terms.amount) })}>Use {money(terms.amount)} from current terms</button> : null}</label><label className="grid g2"><span className="sub">Estimated closing</span><input className="field" type="date" aria-label="Expected closing date" value={draft.estimated_close_date} disabled={!canUnderwrite} onChange={event => onDraftChange({ estimated_close_date: event.target.value })} /></label></div>
        {!response ? <label className="uw-offline-confirm"><input type="checkbox" checked={offlineConfirmed} disabled={!canUnderwrite || !terms} onChange={event => setOfflineConfirmed(event.target.checked)} />The client confirmed acceptance of the current terms version {terms ? `v${terms.version}` : ""}.</label> : null}
        <div className="uw-actions">{!response ? <Btn disabled={!canUnderwrite || saving || !amountValid || !terms || !offlineConfirmed || (!acceptanceDirty && !termsMoved)} onClick={() => onRecordAcceptance({ accepted_amount: acceptedAmount, estimated_close_date: draft.estimated_close_date || null, accepted_terms_ref: ref })}>{saving ? "Saving…" : "Record offline acceptance"}</Btn> : <Btn disabled={!canUnderwrite || saving || draft.estimated_close_date === (underwriting?.estimated_close_date ?? "")} onClick={() => onRecordAcceptance({ estimated_close_date: draft.estimated_close_date || null })}>{saving ? "Saving…" : "Save closing date"}</Btn>}</div>
      </div></details>
    </Step>

    <Step n={4} step="close" active={active} title="Closing" state={states.close} chip={closed ? "Closed / funded" : !currentAccepted ? "Awaiting acceptance" : readyToClose ? "Ready to close" : `${openStips ?? "—"} conditions open`} sub="Review conditions, fee collection and the funding file before recording the closing outcome.">
      {!currentAccepted ? <Callout tone="mut">Confirm acceptance of the current terms in Client response before closing.</Callout> : null}
      <ClosingStipulationsPanel profileId={profileId} canEdit={canUnderwrite && currentAccepted} onOpenEconomics={() => setActive("accepted")} />
      {accepted ? <>
        <div className="uw-accept-grid"><div><span className="sub">{feeInfo.label || "Origination fee"}{points != null ? ` · ${points}%` : ""}</span><strong>{money(originationFee)}</strong></div><div><span className="sub">Consulting fee</span><strong>{money(consulting ?? 0)}</strong></div><div><span className="sub">Accepted-basis earnings</span><strong>{money(forecastEarnings)}</strong></div></div>
        {feeInfo.reviewRequired ? <Callout tone="bad">{feeInfo.reviewReason || "The proposed fees require review."}</Callout> : null}
        <div className="uw-actions"><Btn size="sm" onClick={() => setAchOpen(value => !value)}>{achOpen ? "Hide fee collection" : "Fee collection (ACH)"}</Btn><Btn size="sm" onClick={onEditTerms}>Review costs in full terms</Btn></div>
        {achOpen ? <div className="uw-sub"><FeeAllocationEditor profileId={profileId} originationFee={originationFee ?? 0} consultingFee={consulting ?? 0} compact /></div> : null}
        <div className="uw-actions">{loanId ? <a className="btn" href={`/loans/${loanId}`}>Open funding file</a> : <Btn onClick={onCreateFundingFile} disabled={saving || !canUnderwrite || !currentAccepted}>Create funding file</Btn>}{!closed ? <><Btn variant="pri" onClick={() => onStatusChange("closed_won")} disabled={saving || !canUnderwrite || !currentAccepted || !readyToClose}>Record funded closing</Btn><Btn onClick={() => onStatusChange("closed_lost")} disabled={saving || !canUnderwrite}>Closed lost</Btn></> : null}</div>
      </> : null}
    </Step>
  </div>;
}
