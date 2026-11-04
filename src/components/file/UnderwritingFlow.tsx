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

/** The loan terms saved on the Financials tab, as the Underwriting flow reads them. */
export type TermsOnFile = {
  kind: "production_term_sheet" | "application_term_sheet";
  id: string;
  version: number;
  status: string;
  label: string;
  amount: number | null;
  ratePct: number | null;
  termMonths: number | null;
  structureLabel: string | null;
  interestOnlyMonths: number;
  paymentMonthly: number | null;
  coverageAfter: number | null;
  recordedAt: string | null;
  /** The client has the terms already (issued to the room, or a delivery went out). */
  sentToClient: boolean;
};

type StepState = "todo" | "current" | "done" | "warn";

const money = (v: number | null | undefined, digits = 0) => (v == null || !Number.isFinite(v) ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v));
const when = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");
const ratio = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(2)}x`);

function Step({ n, title, state, chip, sub, children, id }: { n: number; title: string; state: StepState; chip: string; sub?: ReactNode; children: ReactNode; id: string }) {
  return (
    <section className={cx("uw-step", state)} id={id} aria-label={title}>
      <header className="uw-step-head">
        <span className="uw-step-n" aria-hidden>{state === "done" ? <Icon name="check" size={14} /> : n}</span>
        <div className="uw-step-title"><h3>{title}</h3>{sub ? <p className="sub">{sub}</p> : null}</div>
        <CellChip tone={state === "done" ? "ok" : state === "warn" ? "warn" : state === "current" ? "acc" : "mut"}>{chip}</CellChip>
      </header>
      <div className="uw-step-body">{children}</div>
    </section>
  );
}

/** Terms on file → offer sent → accepted → close: one flow, in the order the deal moves, every step reading
 *  the terms the Financials tab saved. The desk acts once per step; everything else is a reflection. */
export function UnderwritingFlow({ profileId, terms, termsLoading, termsActions, onEditTerms, underwriting, statusLabel, draft, onDraftChange, saving, error, onRecordAcceptance, onStatusChange, onEditFees, forecastEarnings, feeInfo, offer, loanId, onCreateFundingFile, canUnderwrite }: {
  profileId: string;
  terms: TermsOnFile | null;
  termsLoading: boolean;
  /** PDF, preview and email actions for the terms on file (the dealer sheet). */
  termsActions?: ReactNode;
  onEditTerms: () => void;
  underwriting: ApplicationUnderwritingState | null;
  statusLabel: string;
  draft: UnderwritingDraft;
  onDraftChange: (patch: Partial<UnderwritingDraft>) => void;
  saving: boolean;
  error: string | null;
  onRecordAcceptance: (patch: ApplicationUnderwritingPatch) => void;
  onStatusChange: (status: UnderwritingLifecycleStatus) => void;
  onEditFees: () => void;
  forecastEarnings: number | null;
  feeInfo: { vertical?: "real_estate" | "main_street" | "dealer" | "mca"; capPercent?: number | null; reviewRequired?: boolean; reviewReason?: string | null; label?: string | null };
  offer: {
    termsSelection: OfferSelection | null;
    merchantSelection: OfferSelection | null;
    merchantStatus: string | null;
    merchantStrip: ReactNode;
    selectedKeys: string[];
    onSelectedKeys: (keys: string[]) => void;
    onCompose: () => void;
    receipt: OfferDeliveryReceipt | null;
    contactSuppressed: boolean;
  };
  loanId: string | null;
  onCreateFundingFile: () => void;
  canUnderwrite: boolean;
}) {
  const accepted = underwriting?.accepted_amount != null;
  const acceptedRef = underwriting?.accepted_terms_ref ?? null;
  const termsMoved = Boolean(accepted && acceptedRef && terms && (acceptedRef.id !== terms.id || acceptedRef.version !== terms.version));
  const offerSent = Boolean(offer.receipt) || Boolean(terms?.sentToClient);
  const lifecycle = underwriting?.underwriting_status ?? "collecting_docs";
  const closed = lifecycle === "closed_won";
  const stips = useClosingStipulations(profileId, accepted);
  const openStips = stips.data?.open_count ?? null;
  const readyToClose = Boolean(stips.data?.ready_to_close);
  const [achOpen, setAchOpen] = useState(false);
  const [merchantOpen, setMerchantOpen] = useState(Boolean(offer.merchantSelection));

  const states: Record<"terms" | "offer" | "accepted" | "close", StepState> = {
    terms: terms ? (terms.status === "draft" ? "current" : "done") : "current",
    offer: !terms ? "todo" : offerSent ? "done" : "current",
    accepted: !terms ? "todo" : termsMoved ? "warn" : accepted ? "done" : offerSent ? "current" : "todo",
    close: closed ? "done" : !accepted ? "todo" : readyToClose ? "current" : "current",
  };

  // The terms on file are the offer; they are selected for delivery unless the desk unticks them.
  useEffect(() => {
    if (offer.termsSelection && offer.selectedKeys.length === 0 && !offer.receipt) offer.onSelectedKeys([offer.termsSelection.key]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.termsSelection?.key]);

  const acceptedAmountNumber = draft.accepted_amount.trim() === "" ? null : Number(draft.accepted_amount);
  const amountValid = acceptedAmountNumber == null || (Number.isFinite(acceptedAmountNumber) && acceptedAmountNumber >= 0);
  const amountDiffers = Boolean(terms?.amount != null && acceptedAmountNumber != null && Math.abs(acceptedAmountNumber - (terms.amount ?? 0)) > 0.5);
  const points = underwriting?.forecast_fee_points ?? null;
  const consulting = underwriting?.forecast_consulting_fee ?? null;
  const originationFee = acceptedAmountNumber != null && points != null ? (acceptedAmountNumber * points) / 100 : null;
  const ref: AcceptedTermsRef | null = terms ? { kind: terms.kind, id: terms.id, version: terms.version, amount: terms.amount, rate_pct: terms.ratePct, term_months: terms.termMonths, label: terms.label } : null;
  const acceptanceDirty = useMemo(() => {
    const savedAmount = underwriting?.accepted_amount == null ? "" : String(underwriting.accepted_amount);
    const savedDate = underwriting?.estimated_close_date ?? "";
    return draft.accepted_amount.trim() !== savedAmount || (draft.estimated_close_date || "") !== savedDate;
  }, [draft.accepted_amount, draft.estimated_close_date, underwriting?.accepted_amount, underwriting?.estimated_close_date]);

  const rail = [
    { key: "terms", title: "Terms on file", summary: terms ? `${money(terms.amount)}${terms.ratePct != null ? ` at ${terms.ratePct}%` : ""}${terms.termMonths ? ` · ${terms.termMonths} mo` : ""}` : "Structure in Financials" },
    { key: "offer", title: "Offer sent", summary: offer.receipt ? `Sent ${when(offer.receipt.sent_at)}` : terms?.sentToClient ? "With the client" : terms ? "Draft the client email" : "After the terms" },
    { key: "accepted", title: "Accepted", summary: accepted ? `${money(underwriting?.accepted_amount)}${underwriting?.accepted_at ? ` · ${when(underwriting.accepted_at)}` : ""}` : "Record what the client accepted" },
    { key: "close", title: "Close", summary: closed ? "Closed / funded" : accepted ? (openStips == null ? "Stipulations" : openStips === 0 && readyToClose ? "Ready to close" : `${openStips} stipulation${openStips === 1 ? "" : "s"} open`) : "After acceptance" },
  ] as const;

  return (
    <div className="uw-flow">
      <ol className="uw-rail" aria-label="Underwriting steps">
        {rail.map((step, i) => (
          <li key={step.key} className={cx("uw-rail-step", states[step.key])}>
            <a href={`#uw-${step.key}`} onClick={(e) => { e.preventDefault(); document.getElementById(`uw-${step.key}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
              <span className="uw-rail-n" aria-hidden>{states[step.key] === "done" ? <Icon name="check" size={12} /> : i + 1}</span>
              <span className="uw-rail-text"><b>{step.title}</b><small>{step.summary}</small></span>
            </a>
          </li>
        ))}
        <li className="uw-rail-status"><span className="uw-rail-text"><b>{statusLabel}</b><small>{loanId ? "Funding file open" : "No funding file yet"}</small></span></li>
      </ol>
      {error ? <Callout tone="bad">{error}</Callout> : null}

      <Step n={1} id="uw-terms" title="Terms on file" state={states.terms} chip={terms ? (terms.status === "draft" ? `Draft v${terms.version}` : `v${terms.version} on file`) : "None yet"} sub="The loan terms are structured on the Financials tab, with the schedule and the risk beside them; this is the same record.">
        {termsLoading ? <div className="empty">Reading the terms…</div> : terms ? (
          <div className="uw-terms">
            <div className="uw-terms-figures">
              <div><span className="sub">Amount</span><strong>{money(terms.amount)}</strong></div>
              <div><span className="sub">Rate</span><strong>{terms.ratePct != null ? `${terms.ratePct}%` : "—"}</strong></div>
              <div><span className="sub">Term</span><strong>{terms.termMonths ? `${terms.termMonths} months` : "—"}</strong></div>
              <div><span className="sub">Structure</span><strong>{terms.structureLabel ?? "—"}{terms.interestOnlyMonths ? ` · ${terms.interestOnlyMonths} IO months` : ""}</strong></div>
              <div><span className="sub">Payment</span><strong>{terms.paymentMonthly != null ? `${money(terms.paymentMonthly, 2)} / mo` : "—"}</strong></div>
              {terms.coverageAfter != null ? <div><span className="sub">Coverage after</span><strong>{ratio(terms.coverageAfter)}</strong></div> : null}
            </div>
            <div className="uw-terms-actions">
              <span className="sub">{terms.label}{terms.recordedAt ? ` · ${when(terms.recordedAt)}` : ""}</span>
              {termsActions}
              <Btn size="sm" onClick={onEditTerms}><Icon name="pencil" size={14} />Edit in Financials</Btn>
            </div>
          </div>
        ) : (
          <div className="uw-empty">
            <p>No loan terms on this file yet. Structure them on the Financials tab; the PDF report, the offer, the acceptance and the stipulations all follow from that one record.</p>
            <Btn variant="pri" size="sm" onClick={onEditTerms}><Icon name="pencil" size={14} />Structure the terms in Financials</Btn>
          </div>
        )}
      </Step>

      <Step n={2} id="uw-offer" title="Offer sent" state={states.offer} chip={offer.receipt ? `Sent ${when(offer.receipt.sent_at)}` : terms?.sentToClient ? "With the client" : terms ? "Not sent" : "Waiting for terms"} sub="What the client receives: the terms on file as their PDF, and the processing offer when there is one.">
        {terms ? (
          <div className="grid g8">
            <div className="uw-offer-items">
              {offer.termsSelection ? (
                <label className="uw-offer-item"><input type="checkbox" checked={offer.selectedKeys.includes(offer.termsSelection.key)} onChange={(e) => offer.onSelectedKeys(e.target.checked ? [...offer.selectedKeys.filter((k) => k !== offer.termsSelection!.key), offer.termsSelection!.key] : offer.selectedKeys.filter((k) => k !== offer.termsSelection!.key))} /><span><b>{offer.termsSelection.label}</b><small>{offer.termsSelection.description}</small></span></label>
              ) : <p className="sub">{terms.status === "draft" ? "Save the terms (they are a draft) before they can go out." : "The terms are not ready to send yet."}</p>}
              {offer.merchantSelection ? (
                <label className="uw-offer-item"><input type="checkbox" checked={offer.selectedKeys.includes(offer.merchantSelection.key)} onChange={(e) => offer.onSelectedKeys(e.target.checked ? [...offer.selectedKeys, offer.merchantSelection!.key] : offer.selectedKeys.filter((k) => k !== offer.merchantSelection!.key))} /><span><b>{offer.merchantSelection.label}</b><small>{offer.merchantSelection.description}</small></span></label>
              ) : null}
            </div>
            <div className="uw-actions">
              <Btn variant="pri" onClick={offer.onCompose} disabled={!offer.selectedKeys.length || offer.contactSuppressed} title={offer.contactSuppressed ? "Direct client contact is suppressed on this file" : undefined}><Icon name="spark" size={14} />{offer.receipt ? "Send again" : "Draft the client email"}</Btn>
              <button type="button" className="linklike" onClick={() => setMerchantOpen((v) => !v)}>{merchantOpen ? "Hide the processing offer" : offer.merchantStatus ? `Processing offer: ${offer.merchantStatus.replaceAll("_", " ")}` : "Add a processing offer (optional)"}</button>
            </div>
            {merchantOpen ? <div className="uw-sub">{offer.merchantStrip}</div> : null}
            {offer.receipt ? <Callout tone="ok"><b>Offer package sent.</b> The PDFs are in the client inbox until and after the {when(offer.receipt.expires_at)} response deadline.</Callout> : null}
            <OfferDeliveryHistory profileId={profileId} refreshKey={offer.receipt?.id} />
          </div>
        ) : <p className="sub">Once the terms are on file they can go to the client from here.</p>}
      </Step>

      <Step n={3} id="uw-accepted" title="Accepted" state={states.accepted} chip={termsMoved ? "Terms changed since" : accepted ? `Accepted${underwriting?.accepted_at ? ` ${when(underwriting.accepted_at)}` : ""}` : offerSent ? "Awaiting the client" : "Not yet"} sub="Record what the client accepted. The amount comes from the terms on file; the fees come from the Financials tab; the fee collection below reflects both.">
        {termsMoved && acceptedRef ? <Callout tone="warn"><b>The terms moved on.</b> The client accepted {acceptedRef.label} (v{acceptedRef.version}, {money(acceptedRef.amount)}); the file now carries v{terms?.version}. Send the new terms and record the acceptance again, or keep the accepted version.</Callout> : null}
        {acceptedRef && !termsMoved && accepted ? <p className="sub">Accepted: {acceptedRef.label} v{acceptedRef.version} · {money(acceptedRef.amount)}{acceptedRef.rate_pct != null ? ` at ${acceptedRef.rate_pct}%` : ""}{acceptedRef.term_months ? ` over ${acceptedRef.term_months} months` : ""}.</p> : null}
        <div className="uw-accept-grid">
          <label className="grid g2">
            <span className="sub">Accepted amount</span>
            <Input aria-label="Accepted amount" type="number" inputMode="decimal" min={0} step="0.01" placeholder={terms?.amount != null ? String(terms.amount) : "Client-accepted amount"} value={draft.accepted_amount} disabled={!canUnderwrite} onChange={(e) => onDraftChange({ accepted_amount: e.target.value })} />
            {terms?.amount != null && (amountDiffers || draft.accepted_amount.trim() === "") ? <button type="button" className="linklike" onClick={() => onDraftChange({ accepted_amount: String(terms.amount) })}>Use the terms&apos; amount, {money(terms.amount)}</button> : terms?.amount != null && !amountDiffers ? <span className="sub">Matches the terms on file.</span> : terms ? null : <span className="sub">The terms on file fill this in once they exist.</span>}
          </label>
          <label className="grid g2">
            <span className="sub">Estimated closing</span>
            <input className="field" type="date" aria-label="Expected closing date" value={draft.estimated_close_date} disabled={!canUnderwrite || (!accepted && draft.accepted_amount.trim() === "")} onChange={(e) => onDraftChange({ estimated_close_date: e.target.value })} />
            <span className="sub">{!accepted && draft.accepted_amount.trim() === "" ? "Enter the accepted amount first." : "The stipulations to close follow."}</span>
          </label>
          <div className="grid g2">
            <span className="sub">{feeInfo.label || "Origination fee"}{points != null ? ` · ${points}%` : ""}</span>
            <strong>{originationFee != null ? money(originationFee) : points != null ? `${points}% of the accepted amount` : "Not set"}</strong>
            <button type="button" className="linklike" onClick={onEditFees}>Set on Financials</button>
          </div>
          <div className="grid g2">
            <span className="sub">Consulting fee</span>
            <strong>{consulting != null ? money(consulting) : "None"}</strong>
            <span className="sub">Expected QC earnings {forecastEarnings != null ? money(forecastEarnings) : "—"}</span>
          </div>
        </div>
        {feeInfo.reviewRequired ? <Callout tone="bad">{feeInfo.reviewReason || `This fee requires review against the ${(feeInfo.capPercent ?? 100).toFixed(2)}% file cap.`}</Callout> : null}
        <div className="uw-actions">
          <Btn variant="pri" disabled={!canUnderwrite || saving || !amountValid || !acceptanceDirty && !termsMoved} onClick={() => onRecordAcceptance({ accepted_amount: acceptedAmountNumber, estimated_close_date: draft.estimated_close_date || null, accepted_terms_ref: acceptedAmountNumber == null ? null : ref })}>{saving ? "Saving…" : accepted ? (termsMoved ? "Record acceptance of the new terms" : "Update the acceptance") : "Record the acceptance"}</Btn>
          {amountDiffers ? <span className="sub">The accepted amount differs from the terms on file ({money(terms?.amount)}); that is recorded as such.</span> : acceptanceDirty ? <span className="sub">Unsaved.</span> : null}
          <button type="button" className="linklike" onClick={() => setAchOpen((v) => !v)}>{achOpen ? "Hide the fee collection" : "Fee collection (ACH)"}</button>
        </div>
        {achOpen ? <div className="uw-sub"><FeeAllocationEditor profileId={profileId} originationFee={originationFee ?? 0} consultingFee={consulting ?? 0} compact /></div> : null}
      </Step>

      <Step n={4} id="uw-close" title="Close" state={states.close} chip={closed ? "Closed / funded" : !accepted ? "After acceptance" : readyToClose ? "Ready to close" : openStips != null ? `${openStips} open` : "Stipulations"} sub="What must be in hand before funding, then the decision.">
        <ClosingStipulationsPanel profileId={profileId} canEdit={canUnderwrite} />
        {accepted ? (
          <div className="uw-actions">
            {loanId ? <a className="btn" href={`/loans/${loanId}`}>Open funding file</a> : <Btn onClick={onCreateFundingFile} disabled={saving}>Create funding file</Btn>}
            {!closed ? <Btn variant="pri" onClick={() => onStatusChange("closed_won")} disabled={saving || !canUnderwrite}>Closed / funded</Btn> : null}
            {!closed ? <Btn onClick={() => onStatusChange("closed_lost")} disabled={saving || !canUnderwrite}>Closed lost</Btn> : null}
            <span className="sub">Lifecycle: {statusLabel}. Approvals, denials and reviewer notes stay on Reviewer controls.</span>
          </div>
        ) : null}
      </Step>
    </div>
  );
}
