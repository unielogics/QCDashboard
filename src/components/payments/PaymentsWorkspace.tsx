"use client";

import { useState } from "react";
import { Btn, Callout, CellChip, Empty, Field, Input, Loading, Panel, Select, Textarea, WarnLine } from "@/components/ds";
import { ConfirmDialog } from "@/components/design-system/ConfirmDialog";
import { Icon } from "@/components/design-system/Icon";
import { FeeAllocationEditor } from "@/components/payments/FeeAllocationEditor";
import { PrivateFundingSchedulePanel } from "@/components/payments/PrivateFundingSchedulePanel";
import { usePaymentCommand, usePaymentSummary } from "@/hooks/usePayments";
import { isAchMandateActive, isAchMandateSigned, paymentMoney, paymentPaths, type AuthorizationRequestDelivery, type DebitNotice, type PaymentSummary, type PaymentTimelineItem, type ProtectedPaymentArtifact } from "@/lib/payments";

export function PaymentsWorkspace({ profileId, sourceLabel }: { profileId: string | null | undefined; sourceLabel?: string }) {
  const summaryQuery = usePaymentSummary(profileId, Boolean(profileId));
  const command = usePaymentCommand(profileId);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [includeOrigination, setIncludeOrigination] = useState(true);
  const [consultingEarned, setConsultingEarned] = useState(false);
  const [fundingForm, setFundingForm] = useState({ funded_at: "", funded_amount: "", funding_party: "", transaction_reference: "", note: "" });
  const [receiptForm, setReceiptForm] = useState({ receipt_type: "bank_direct" as "bank_direct" | "external_manual", amount: "", received_at: "", reference: "", note: "" });
  const [refundAmount, setRefundAmount] = useState("");
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [confirmRetry, setConfirmRetry] = useState(false);
  const [confirmResume, setConfirmResume] = useState(false);
  const [confirmMandateRevoke, setConfirmMandateRevoke] = useState(false);
  const [showReplacement, setShowReplacement] = useState(false);
  const [agreementDocumentId, setAgreementDocumentId] = useState("");
  const [scheduledDebitDate, setScheduledDebitDate] = useState("");
  const [scheduledDebitWindow, setScheduledDebitWindow] = useState("business_day_et");

  if (!profileId) return <Empty icon="dollar" title="Payments are not available yet">The application profile must be created before fees can be allocated or collected.</Empty>;
  if (summaryQuery.isLoading) return <Loading>Loading fee collection and payment status…</Loading>;
  if (summaryQuery.isError || !summaryQuery.data) {
    return <Empty icon="alert" title="Payments could not be loaded" action={<Btn onClick={() => summaryQuery.refetch()}>Try again</Btn>}>Deal economics remain unchanged. No ACH action was started.</Empty>;
  }

  const summary = summaryQuery.data;
  const obligation = summary.obligation;
  const transfer = summary.transfer;
  const parkedAmount = (summary.allocation?.deferred_amount ?? 0) + (summary.allocation?.waived_amount ?? 0);
  const excludedFeeAmount = (includeOrigination ? 0 : summary.origination_fee) + (consultingEarned ? 0 : summary.consulting_fee);
  const excludedClientAch = (includeOrigination ? 0 : (summary.allocation?.origination_client_ach_amount ?? 0))
    + (consultingEarned ? 0 : (summary.allocation?.consulting_client_ach_amount ?? 0));
  const selectedComponentsReady = (includeOrigination || consultingEarned)
    && excludedClientAch < 0.001
    && parkedAmount + 0.001 >= excludedFeeAmount;
  const obligationCurrent = Boolean(obligation && summary.readiness.fee_obligation_current);
  const obligationReplaceable = !obligation || !["processing", "partially_collected", "collected"].includes(obligation.status);
  const preparationOpen = (!obligation?.agreement_ready || !obligationCurrent || showReplacement) && obligationReplaceable;
  const canPrepare = summary.permissions.can_prepare_obligation && Boolean(summary.allocation?.is_balanced && summary.allocation.is_current && summary.gross_expected_fee > 0 && selectedComponentsReady);
  const eligibleAgreementDocuments = summary.agreement_documents.filter((document) => document.system_signed && document.signature_kind === "success_fee_agreement");
  const preferredAgreement = eligibleAgreementDocuments[0] ?? null;
  const effectiveAgreementDocumentId = agreementDocumentId || preferredAgreement?.id || "";
  const selectedAgreement = eligibleAgreementDocuments.find((document) => document.id === effectiveAgreementDocumentId) ?? null;
  const signedSuccessFeeAgreement = Boolean(
    summary.fee_agreement?.status === "signed" && summary.fee_agreement.current,
  );
  const signedConsultingAddendum = summary.agreement_documents.some((document) => (
    document.system_signed && document.signature_kind === "contract_consulting_addendum"
  ));
  const selectedAgreementEligible = Boolean(selectedAgreement
    && (!includeOrigination || selectedAgreement.eligible_components.includes("origination")));
  const selectedAgreementsReady = selectedAgreementEligible && (!consultingEarned || signedConsultingAddendum);
  const canRequestReview = Boolean((summary.permissions as PaymentSummary["permissions"] & { can_request_review?: boolean }).can_request_review);
  const activeMandate = isAchMandateActive(summary.mandate);
  const signedMandateProof = isAchMandateSigned(summary.mandate);
  const ccdAccountEligible = !summary.funding_source || (
    summary.funding_source.ownership_type === "business"
    && summary.funding_source.ach_class === "CCD"
    && summary.funding_source.business_account_attested !== false
  );

  async function run(path: string, action: string, entityId: string, body?: Record<string, unknown>, success?: string) {
    setNotice(null);
    try {
      await command.mutateAsync({ path, action, entityId, body });
      setNotice(success ?? "Payment record updated.");
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The payment action could not be completed.");
      return false;
    }
  }

  return (
    <div className="payments-workspace">
      <header className="payments-workspace-header">
        <div>
          <span className="lbl">Internal money operations</span>
          <h2>Payments</h2>
          <p>{sourceLabel ? `${sourceLabel} · ` : ""}Origination-fee ACH is released only after verified funding and a final staff review.</p>
        </div>
        <div className="payment-private-actions">
          {canRequestReview ? <Btn disabled={command.isPending} onClick={() => run(paymentPaths.requestReview(profileId), "request-payment-review", profileId, undefined, "A payment review request was sent to the Loan Executive and Super Admin team.")}>Request payment review</Btn> : null}
          <Btn onClick={() => summaryQuery.refetch()} disabled={summaryQuery.isFetching}><Icon name="refresh" size={14} />{summaryQuery.isFetching ? "Refreshing…" : "Refresh"}</Btn>
        </div>
      </header>

      {notice ? <Callout tone={command.isError ? "bad" : "ok"}>{notice}</Callout> : null}
      {summary.legal_approval_required || !summary.ach_authorization_enabled
        ? <Callout tone="bad"><b>{summary.legal_approval_required ? "Legal/counsel approval is required" : "ACH provider capability is unavailable"} — new ACH initiation is disabled.</b> Staff may still prepare or review agreements when permitted, review retained proof, resend a customer copy, or revoke an existing mandate. Money movement remains blocked. This screen does not grant legal approval or provide legal advice.</Callout>
        : <Callout tone="acc"><b>ACH capability is enabled under the organization&apos;s approved policy.</b> Counsel should approve the authorization language, notice timing, revocation path, and retention policy before production use. This operational screen does not provide legal advice.</Callout>}

      <PaymentMetrics summary={summary} />

      <Panel
        title="Origination fee ACH"
        sub="Primary collection workflow"
        actions={<CellChip tone={obligationTone(obligation?.status)}>{obligation ? humanize(obligation.status) : "Not prepared"}</CellChip>}
      >
        <div className="payment-primary-grid">
          <div className="payment-primary-main">
            <FeeAllocationEditor
              profileId={profileId}
              originationFee={summary.origination_fee}
              consultingFee={summary.consulting_fee}
            />

            <section className="payment-step-section payment-agreement-step">
              <StepHeading number="1" title="Prepare the Success Fee Agreement" detail="Create the deal-specific agreement from the current accepted economics before any ACH authorization is requested." complete={signedSuccessFeeAgreement} />
              <div className="payment-agreement-summary">
                <div><span>Accepted amount</span><strong>{paymentMoney(summary.accepted_amount)}</strong></div>
                <div><span>Origination fee</span><strong>{paymentMoney(summary.origination_fee)}</strong><small>{summary.origination_fee_points == null ? "No points saved" : `${summary.origination_fee_points.toFixed(2)} points`}</small></div>
                <div><span>Consulting fee</span><strong>{paymentMoney(summary.consulting_fee)}</strong><small>{consultingEarned ? "Include after earned milestone and signed addendum" : "Not included unless earned"}</small></div>
              </div>
              {summary.fee_agreement ? <div className="payment-agreement-record">
                <div><span>Agreement status</span><CellChip tone={statusTone(summary.fee_agreement.status)}>{humanize(summary.fee_agreement.status)}</CellChip></div>
                <div><span>Reference</span><strong>{summary.fee_agreement.agreement_reference || "Pending assignment"}</strong></div>
                <div><span>Template</span><strong>{summary.fee_agreement.template_version || "Current approved version"}</strong></div>
                <div><span>Executed</span><strong>{summary.fee_agreement.signed_at ? new Date(summary.fee_agreement.signed_at).toLocaleString() : "Awaiting client signature"}</strong></div>
              </div> : null}
              {summary.fee_agreement?.artifact ? <ProtectedArtifactView artifact={summary.fee_agreement.artifact} /> : null}
              {summary.fee_agreement?.status === "awaiting_signature" ? <Callout tone="warn"><b>Client signature required.</b> The ACH request remains locked until the executed agreement is stored and its hash is verified.</Callout> : null}
              {!signedSuccessFeeAgreement ? <>
                <Callout tone="acc"><b>Separate legal step.</b> This creates the Success Fee Agreement only. It does not connect a bank, authorize an ACH debit, or move money.</Callout>
                {consultingEarned && !signedConsultingAddendum ? <Callout tone="bad"><b>Consulting addendum required.</b> Execute the Consulting and Fee Schedule Addendum before including this consulting fee. The Success Fee Agreement does not replace that addendum.</Callout> : null}
                <Btn
                  variant="pri"
                  disabled={command.isPending || !summary.permissions.can_prepare_fee_agreement || !summary.allocation?.is_balanced || !summary.allocation?.is_current || !selectedComponentsReady || (consultingEarned && !signedConsultingAddendum)}
                  onClick={() => run(paymentPaths.prepareFeeAgreement(profileId), "prepare-fee-agreement", profileId, {
                    expected_allocation_version: summary.allocation?.version,
                    include_origination_fee: summary.origination_fee > 0 && includeOrigination,
                    include_consulting_fee: summary.consulting_fee > 0 && consultingEarned,
                    consulting_milestone_confirmed: summary.consulting_fee > 0 && consultingEarned,
                  }, "Success Fee Agreement prepared and sent for signature. ACH remains locked until it is executed.")}
                >Prepare and send fee agreement</Btn>
              </> : <Callout tone="ok"><b>Executed agreement verified.</b> The signed version and hash now govern the fee obligation. Any economics change requires a replacement agreement.</Callout>}
            </section>

            <section className="payment-step-section">
              <StepHeading number="2" title="Prepare the fee obligation" detail="Freeze each fee line against its governing executed agreement. Signing Step 1 normally creates this automatically; use the replacement controls only to correct an existing request." complete={Boolean(obligation?.agreement_ready && obligationCurrent)} />
              {obligation?.agreement_ready ? <>
                <FeeObligationView summary={summary} />
                {!obligationCurrent ? <Callout tone="bad"><b>This fee request is out of date.</b> Deal economics changed after it was prepared. It cannot be sent or released. Save a current balanced allocation, then prepare a replacement below.</Callout> : null}
                {obligationCurrent && obligationReplaceable && !showReplacement ? <Btn onClick={() => setShowReplacement(true)}>Prepare replacement or correct agreement</Btn> : null}
                {!obligationCurrent && !obligationReplaceable ? <Callout tone="warn">Collection has already started, so this obligation cannot be replaced here. Review the transfer and contact a Super Admin before changing the economics.</Callout> : null}
              </> : null}
              {preparationOpen ? (
                <div className="payment-inline-form">
                  {eligibleAgreementDocuments.length ? <Field label="Executed Success Fee Agreement" hint="Only the system-signed Success Fee Agreement for this file can govern the obligation. The server rechecks its signature metadata and integrity hash.">
                    <Select value={effectiveAgreementDocumentId} onChange={(event) => setAgreementDocumentId(event.target.value)}>
                      <option value="">Choose the executed agreement…</option>
                      {eligibleAgreementDocuments.map((document) => <option key={document.id} value={document.id}>{document.name} · electronically signed</option>)}
                    </Select>
                  </Field> : <Callout tone="warn"><b>Execute the Success Fee Agreement first.</b> No eligible system-signed agreement is available in this file. An unrelated upload, free-text reference, staff attestation, or pasted hash cannot unlock ACH.</Callout>}
                  {selectedAgreement ? <Callout tone="ok"><b>{selectedAgreement.name}</b> Signature verified{selectedAgreement.signed_at ? ` on ${new Date(selectedAgreement.signed_at).toLocaleDateString()}` : ""}.</Callout> : null}
                  {summary.origination_fee > 0 ? <label className="payment-check"><input type="checkbox" checked={includeOrigination} onChange={(event) => setIncludeOrigination(event.target.checked)} /><span><b>Include the origination fee</b><small>It remains blocked from release until actual funding is verified.</small></span></label> : null}
                  {summary.consulting_fee > 0 ? <label className="payment-check"><input type="checkbox" checked={consultingEarned} onChange={(event) => setConsultingEarned(event.target.checked)} /><span><b>Include consulting fee — milestone earned</b><small>Requires its separately executed Consulting and Fee Schedule Addendum. Leave this off when the milestone has not occurred.</small></span></label> : null}
                  {!selectedComponentsReady ? <Callout tone="warn"><b>Adjust the fee allocation first.</b> A fee excluded from this request must have no client ACH portion and must be fully deferred or waived.</Callout> : null}
                  {selectedAgreement && !selectedAgreementEligible ? <Callout tone="bad"><b>This Success Fee Agreement does not cover the selected origination fee.</b> Choose the current system-signed agreement for this file.</Callout> : null}
                  {consultingEarned && !signedConsultingAddendum ? <Callout tone="bad"><b>Consulting addendum required.</b> The selected consulting line must be governed by a signed Consulting and Fee Schedule Addendum. The Success Fee Agreement cannot cover that line.</Callout> : null}
                  {!signedSuccessFeeAgreement ? <Callout tone="bad"><b>Execute the Success Fee Agreement first.</b> An unrelated upload cannot be used to authorize collection.</Callout> : null}
                  {!canPrepare ? <Callout tone="mut">Save a current, fully balanced fee allocation before selecting the signed agreement.</Callout> : null}
                  <Btn
                    variant="pri"
                    disabled={!signedSuccessFeeAgreement || !canPrepare || !selectedAgreementsReady || command.isPending}
                    onClick={() => selectedAgreement && run(paymentPaths.obligations(profileId), "prepare-obligation", profileId, {
                      agreement_document_id: selectedAgreement.id,
                      agreement_attested_signed: false,
                      include_origination_fee: summary.origination_fee > 0 && includeOrigination,
                      include_consulting_fee: summary.consulting_fee > 0 && consultingEarned,
                      consulting_milestone_confirmed: summary.consulting_fee > 0 && consultingEarned,
                      client_ach_cents: Math.round((summary.allocation?.client_ach_amount ?? 0) * 100),
                      bank_direct_cents: Math.round((summary.allocation?.bank_direct_amount ?? 0) * 100),
                      external_cents: Math.round((summary.allocation?.external_amount ?? 0) * 100),
                      deferred_cents: Math.round((summary.allocation?.deferred_amount ?? 0) * 100),
                      waived_cents: Math.round((summary.allocation?.waived_amount ?? 0) * 100),
                    }, "Fee obligation prepared. Review it before requesting client authorization.").then((ok) => { if (ok) setShowReplacement(false); })}
                  >{obligation ? "Prepare replacement request" : "Prepare collection request"}</Btn>
                </div>
              ) : null}
            </section>

            <section className="payment-step-section">
              <StepHeading number="3" title="Request one-time CCD authorization" detail="Set the exact debit date and window, send the signing request, and keep the post-signature exact debit notice as a separate release gate." complete={activeMandate && summary.readiness.debit_notice_delivered} />
              <div className="payment-status-row">
                <StatusBlock label="Payment account" value={summary.funding_source ? `${summary.funding_source.institution_name || "Connected bank"} ••••${summary.funding_source.account_mask || ""} · ${summary.funding_source.ach_class}` : "Not connected"} status={summary.funding_source?.status ?? "pending"} />
                <StatusBlock label="One-time mandate" value={summary.mandate ? `${summary.mandate.sec_code} · ${paymentMoney(summary.mandate.authorized_amount)}` : "Not signed"} status={activeMandate ? "active" : summary.mandate?.status ?? "pending"} />
              </div>
              {!ccdAccountEligible ? <Callout tone="bad"><b>Business CCD account required.</b> Consumer/WEB accounts cannot be used for this launch. Reconnect an eligible business account before requesting or releasing ACH.</Callout> : null}
              <PaymentDeliveryStates
                request={summary.authorization_request_delivery}
                notice={summary.debit_notice}
                busy={command.isPending}
                canResend={Boolean(
                  summary.mandate
                  && summary.permissions.can_manage_mandate_proof
                  && summary.debit_notice
                  && !summary.readiness.debit_notice_delivered
                )}
                onResend={() => {
                  if (!summary.mandate) return;
                  void run(
                    paymentPaths.resendDebitNotice(summary.mandate.id),
                    "resend-debit-notice",
                    summary.mandate.id,
                    undefined,
                    "A fresh audited copy of the exact debit notice was queued for delivery.",
                  );
                }}
              />
              {obligation?.agreement_ready && obligationCurrent && signedSuccessFeeAgreement && summary.permissions.can_send_authorization && obligation.amount > 0 && !activeMandate ? <div className="payment-authorization-request">
                <Field label="Exact scheduled debit date" hint="Must be at least two business days ahead. The server calculates weekends, banking holidays, and the 5:00 PM ET revocation cutoff.">
                  <Input type="date" value={scheduledDebitDate} onChange={(event) => setScheduledDebitDate(event.target.value)} />
                </Field>
                <Field label="Submission window" hint="The signed authorization and exact debit notice preserve this window.">
                  <Select value={scheduledDebitWindow} onChange={(event) => setScheduledDebitWindow(event.target.value)}>
                    <option value="business_day_et">Business-day ET window</option>
                  </Select>
                </Field>
                <div className="payment-disclosure-compact">
                  <b>What the customer will receive before signing</b>
                  <span>One-time ACH debit · {paymentMoney(obligation.amount)} exact maximum · business CCD only</span>
                  <span>{scheduledDebitDate ? `${new Date(`${scheduledDebitDate}T12:00:00`).toLocaleDateString()} · ${humanize(scheduledDebitWindow)}` : "Choose the exact debit date"}</span>
                  <span>Two-business-day advance notice · revoke by secure room or support@qualifiedcommercial.com until 5:00 PM ET one business day before debit</span>
                </div>
                <Btn disabled={command.isPending || !summary.ach_authorization_enabled || !scheduledDebitDate || !scheduledDebitWindow || !ccdAccountEligible || ["processing", "partially_collected", "collected", "cancelled", "superseded"].includes(obligation.status)} onClick={() => run(paymentPaths.sendAuthorization(obligation.id), "send-authorization", obligation.id, { scheduled_debit_date: scheduledDebitDate, submission_window: scheduledDebitWindow }, "Secure one-time ACH authorization request sent. The exact debit notice schedule is prepared now and becomes a separate delivered release gate after signature.")}>{summary.authorization_request_delivery || obligation.authorization_sent_at ? "Resend authorization request" : "Send authorization request"}</Btn>
              </div> : null}
              {signedMandateProof && summary.mandate ? <div className="payment-mandate-proof">
                <div><b>Executed one-time ACH authorization</b><span>{summary.mandate.payer_name} · {paymentMoney(summary.mandate.authorized_amount)} · {summary.mandate.sec_code} · {activeMandate ? "active" : humanize(summary.mandate.status)}</span><small>{summary.mandate.proof_email_status ? `Customer copy: ${humanize(summary.mandate.proof_email_status)}` : "Customer proof copy is retained with the file."} {!activeMandate ? "The signed proof remains retained, but it no longer authorizes a debit." : ""}</small></div>
                <div className="payment-private-actions">
                  {summary.mandate.artifact?.download_url ? <a className="btn" href={summary.mandate.artifact.download_url} target="_blank" rel="noreferrer">Download proof</a> : null}
                  {summary.permissions.can_manage_mandate_proof && summary.mandate.can_resend_proof !== false ? <Btn disabled={command.isPending} onClick={() => run(paymentPaths.resendMandateProof(summary.mandate!.id), "resend-mandate-proof", summary.mandate!.id, undefined, "Executed authorization copy queued for email delivery.")}>Resend proof copy</Btn> : null}
                  {activeMandate && summary.permissions.can_revoke_mandate && summary.mandate.can_revoke !== false ? <Btn className="danger" disabled={command.isPending || Boolean(transfer?.submitted_at)} onClick={() => setConfirmMandateRevoke(true)}>Revoke authorization</Btn> : null}
                </div>
              </div> : null}
              {summary.mandate?.artifact ? <ProtectedArtifactView artifact={summary.mandate.artifact} /> : null}
              <Callout tone="acc"><b>Separate from evidence Plaid.</b> A bank connected for statements or asset verification is never reused for debits.</Callout>
            </section>

            <section className="payment-step-section">
              <StepHeading number="4" title="Confirm actual funding" detail="An estimated closing date or pipeline status can never unlock ACH." complete={Boolean(summary.funding_confirmation)} />
              {summary.funding_confirmation ? <FundingConfirmationView confirmation={summary.funding_confirmation} /> : summary.permissions.can_confirm_funding && obligation ? (
                <div className="payment-funding-form">
                  <Field label="Actual funding date"><Input type="date" value={fundingForm.funded_at} onChange={(event) => setFundingForm({ ...fundingForm, funded_at: event.target.value })} /></Field>
                  <Field label="Actual funded amount"><Input type="number" min="0" step="0.01" inputMode="decimal" value={fundingForm.funded_amount} onChange={(event) => setFundingForm({ ...fundingForm, funded_amount: event.target.value })} placeholder="0.00" /></Field>
                  <Field label="Funding party"><Input value={fundingForm.funding_party} onChange={(event) => setFundingForm({ ...fundingForm, funding_party: event.target.value })} placeholder="Bank, fund, or closing source" /></Field>
                  <Field label="Transaction reference" hint="Required for a manual funding confirmation."><Input value={fundingForm.transaction_reference} onChange={(event) => setFundingForm({ ...fundingForm, transaction_reference: event.target.value })} placeholder="Wire, ACH, closing, or lender reference" /></Field>
                  <Field className="wide" label="Supporting funding note" hint="Identify the evidence used to confirm disbursement."><Textarea rows={2} value={fundingForm.note} onChange={(event) => setFundingForm({ ...fundingForm, note: event.target.value })} placeholder="What evidence confirms that funds were disbursed?" /></Field>
                  <Btn
                    variant="pri"
                    disabled={command.isPending || !fundingForm.funded_at || !(Number(fundingForm.funded_amount) > 0) || !fundingForm.funding_party.trim() || !fundingForm.transaction_reference.trim() || !fundingForm.note.trim()}
                    onClick={() => run(paymentPaths.confirmFunding(profileId), "confirm-funding", profileId, {
                      actual_funding_date: fundingForm.funded_at,
                      actual_funded_amount: Number(fundingForm.funded_amount),
                      funding_party_name: fundingForm.funding_party.trim(),
                      funding_reference: fundingForm.transaction_reference.trim() || null,
                      note: fundingForm.note.trim() || null,
                      source: "manual",
                    }, "Actual funding recorded. ACH remains unreleased until final review.")}
                  >Record actual funding</Btn>
                </div>
              ) : <Callout tone="warn">Prepare the fee obligation before recording its funding confirmation.</Callout>}
            </section>

            <section className="payment-step-section payment-release-section">
              <StepHeading number="5" title="Release ACH collection" detail="This is the only action that can initiate the one-time origination-fee debit." complete={Boolean(transfer)} />
              <ReadinessChecklist summary={summary} />
              {transfer ? <><TransferView transfer={transfer} /><div className="payment-private-actions">{transfer.resume_eligible && summary.permissions.can_retry ? <Btn disabled={command.isPending} onClick={() => setConfirmResume(true)}>Resume existing ACH attempt</Btn> : null}{transfer.retry_eligible && summary.permissions.can_retry ? <Btn disabled={command.isPending} onClick={() => setConfirmRetry(true)}>Review eligible ACH retry</Btn> : null}</div></> : (
                <Btn
                  variant="pri"
                  className="payment-release-button"
                  disabled={!summary.ach_authorization_enabled || !summary.readiness.ready_for_release || !summary.permissions.can_release_ach || command.isPending}
                  onClick={() => setConfirmRelease(true)}
                ><Icon name="lock" size={16} />Review and release {paymentMoney(obligation?.amount ?? 0)} ACH</Btn>
              )}
            </section>
          </div>

          <aside className="payment-primary-rail">
            <Panel title="Collection timeline" noPad><PaymentTimeline items={summary.timeline} /></Panel>
            {obligation ? <FeeReceiptPanel summary={summary} form={receiptForm} setForm={setReceiptForm} busy={command.isPending} onSave={() => run(paymentPaths.bankDirectReceipts(profileId), `${receiptForm.receipt_type}-receipt`, profileId, { obligation_id: obligation.id, receipt_type: receiptForm.receipt_type, amount: Number(receiptForm.amount), received_on: receiptForm.received_at, reference: receiptForm.reference.trim(), note: receiptForm.note.trim() || null }, receiptForm.receipt_type === "bank_direct" ? "Bank-direct receipt reconciled." : "External/manual receipt reconciled.")} /> : null}
            {transfer && summary.permissions.can_refund && transfer.refundable_amount > 0 ? <RefundPanel amount={refundAmount} setAmount={setRefundAmount} max={transfer.refundable_amount} busy={command.isPending} onRefund={() => setConfirmRefund(true)} /> : null}
          </aside>
        </div>
      </Panel>

      <PrivateFundingSchedulePanel profileId={profileId} summary={summary} busy={command.isPending} onCommand={run} />

      <ConfirmDialog
        open={confirmRelease}
        onClose={() => setConfirmRelease(false)}
        title={`Release ${paymentMoney(obligation?.amount ?? 0)} origination-fee ACH`}
        body={<><b>This initiates one business CCD debit.</b> The signed Success Fee Agreement, exact amount and date notice, two-business-day delivery, revocation cutoff, funding, mandate, account eligibility, and duplicate protection will be rechecked immediately before provider submission. It cannot be recalled after provider handoff.</>}
        confirmLabel="Release ACH collection"
        busy={command.isPending}
        onConfirm={() => obligation && run(paymentPaths.release(obligation.id), "release-ach", obligation.id, { amount_cents: Math.round(obligation.amount * 100), expected_version: obligation.version }, "ACH collection released.").then((ok) => { if (ok) setConfirmRelease(false); })}
      />
      <ConfirmDialog
        open={confirmMandateRevoke}
        onClose={() => setConfirmMandateRevoke(false)}
        title="Revoke this one-time ACH authorization"
        body={<><b>This stops an unclaimed debit authorization.</b> It does not recall a transfer already submitted. The customer receives confirmation and a replacement collection requires a new transaction-specific authorization.</>}
        confirmLabel="Revoke authorization"
        busy={command.isPending}
        onConfirm={() => summary.mandate && run(paymentPaths.revokeMandate(summary.mandate.id), "revoke-mandate", summary.mandate.id, { reason: "Authorization revoked by authorized staff" }, "ACH authorization revoked and confirmation queued.").then((ok) => { if (ok) setConfirmMandateRevoke(false); })}
      />
      <ConfirmDialog
        open={confirmRefund}
        onClose={() => setConfirmRefund(false)}
        title={`Refund ${paymentMoney(Number(refundAmount) || 0)}`}
        body={<><b>This creates a separate outgoing money movement.</b> It cannot exceed collected, unrefunded funds and still requires available Plaid Ledger balance. The original ACH remains in the audit trail.</>}
        confirmLabel="Submit refund"
        busy={command.isPending}
        onConfirm={() => transfer && run(paymentPaths.refunds(transfer.id), "refund", transfer.id, { amount: Number(refundAmount), reason: "Operator-approved refund" }, "Refund submitted for processing.").then((ok) => { if (ok) { setConfirmRefund(false); setRefundAmount(""); } })}
      />
      <ConfirmDialog
        open={confirmResume}
        onClose={() => setConfirmResume(false)}
        title={`Resume the existing ${paymentMoney(transfer?.amount ?? 0)} ACH attempt`}
        body={<><b>This does not create another debit attempt.</b> It resumes the same durable transfer intent after a recoverable pre-provider interruption. The server rechecks the mandate, payment account, funding confirmation, obligation, and provider identity before continuing.</>}
        confirmLabel="Resume existing attempt"
        busy={command.isPending}
        onConfirm={() => transfer && run(paymentPaths.resumeTransfer(transfer.id), "resume-transfer", transfer.id, undefined, "Existing ACH attempt resumed.").then((ok) => { if (ok) setConfirmResume(false); })}
      />
      <ConfirmDialog
        open={confirmRetry}
        onClose={() => setConfirmRetry(false)}
        title={`Retry ${paymentMoney(transfer?.amount ?? 0)} ACH debit`}
        body={<><b>This creates another debit attempt.</b> It is available only for eligible ACH returns, uses the same signed obligation and mandate, and never runs automatically. Return: {transfer?.return_code || "eligible return"}{transfer?.return_reason ? ` — ${transfer.return_reason}` : ""}.</>}
        confirmLabel="Submit one manual retry"
        busy={command.isPending}
        onConfirm={() => transfer && run(paymentPaths.retryTransfer(transfer.id), "retry-transfer", transfer.id, undefined, "Manual ACH retry submitted.").then((ok) => { if (ok) setConfirmRetry(false); })}
      />
    </div>
  );
}

function PaymentMetrics({ summary }: { summary: PaymentSummary }) {
  const externalExpected = summary.allocation?.external_amount ?? 0;
  const deferred = summary.allocation?.deferred_amount ?? 0;
  const waived = summary.allocation?.waived_amount ?? summary.totals.waived;
  const netCollectible = Math.max(0, summary.gross_expected_fee - deferred - waived);
  const metrics = [
    ["Gross expected fees", summary.gross_expected_fee, "Origination + consulting"],
    ["Client ACH target", summary.totals.client_ach_target, "Requires mandate + funding"],
    ["Bank direct", summary.totals.bank_direct_received, `${paymentMoney(summary.totals.bank_direct_expected)} expected`],
    ["External / manual", summary.totals.external_received, `${paymentMoney(externalExpected)} assigned`],
    ["Deferred", deferred, "Not collectible in this obligation"],
    ["Waived", waived, "Excluded by authorized waiver"],
    ["Net collectible", netCollectible, "Gross less deferred and waived"],
    ["Collected", summary.totals.collected, "Funds available"],
    ["Outstanding", summary.totals.outstanding, "After receipts and refunds"],
  ] as const;
  return <div className="payment-metrics">{metrics.map(([label, value, detail]) => <div key={label}><span>{label}</span><strong>{paymentMoney(value)}</strong><small>{detail}</small></div>)}</div>;
}

function StepHeading({ number, title, detail, complete }: { number: string; title: string; detail: string; complete: boolean }) {
  return <header className="payment-step-heading"><span className={complete ? "done" : undefined}>{complete ? <Icon name="check" size={14} /> : number}</span><div><h4>{title}</h4><p>{detail}</p></div></header>;
}

function FeeObligationView({ summary }: { summary: PaymentSummary }) {
  const obligation = summary.obligation!;
  return <div className="payment-obligation"><div className="payment-obligation-lines">{obligation.lines.map((line) => <div key={line.id}><span><b>{line.label}</b><small>{line.agreement_verified ? "Agreement verified" : "Agreement needs verification"}{line.component === "consulting" ? line.earned ? " · earned" : " · not marked earned" : ""}</small></span><strong>{paymentMoney(line.collection_amount)}</strong></div>)}</div><div className="payment-obligation-total"><span>Maximum client ACH authorization</span><strong>{paymentMoney(obligation.amount)}</strong></div></div>;
}

function StatusBlock({ label, value, status }: { label: string; value: string; status: string }) {
  return <div className="payment-status-block"><span>{label}</span><strong>{value}</strong><CellChip tone={statusTone(status)}>{humanize(status)}</CellChip></div>;
}

function FundingConfirmationView({ confirmation }: { confirmation: NonNullable<PaymentSummary["funding_confirmation"]> }) {
  return <div className="payment-confirmation"><div><span>Actual funded amount</span><strong>{paymentMoney(confirmation.funded_amount)}</strong></div><div><span>Funded</span><strong>{new Date(`${confirmation.funded_at}T12:00:00`).toLocaleDateString()}</strong></div><div><span>Funding party</span><strong>{confirmation.funding_party}</strong></div><div><span>Verification</span><strong>{confirmation.source === "production_attestation" ? "Production attestation" : `Recorded by ${confirmation.confirmed_by_name || "authorized staff"}`}</strong></div></div>;
}

function ReadinessChecklist({ summary }: { summary: PaymentSummary }) {
  const checks = [
    ["Current fee obligation", summary.readiness.fee_obligation_current],
    ["Executed Success Fee Agreement", summary.readiness.fee_agreement_signed],
    ["One-time client ACH authorization", summary.readiness.client_authorized],
    ["Authorization proof copy sent", summary.readiness.authorization_proof_delivered],
    ["Exact debit notice delivered", summary.readiness.debit_notice_delivered],
    ["Actual funding verified", summary.readiness.funding_confirmed],
    ["Authorization covers amount", summary.readiness.amount_covered],
    ["Eligible business CCD account", summary.readiness.account_eligible],
    ["No transfer already claimed", summary.readiness.no_existing_claim],
  ] as const;
  return <><div className="payment-readiness">{checks.map(([label, ready]) => <div key={label} className={ready ? "ready" : "blocked"}><span>{ready ? <Icon name="check" size={13} /> : <Icon name="x" size={13} />}</span>{label}</div>)}</div>{summary.readiness.blockers.length ? <WarnLine>{summary.readiness.blockers.join(" · ")}</WarnLine> : null}</>;
}

function PaymentDeliveryStates({ request, notice, busy, canResend, onResend }: {
  request: AuthorizationRequestDelivery | null;
  notice: DebitNotice | null;
  busy: boolean;
  canResend: boolean;
  onResend: () => void;
}) {
  return <div className="payment-delivery-states">
    <section>
      <header><div><span>Signing invitation</span><b>Authorization request</b></div><CellChip tone={statusTone(request?.status ?? "pending")}>{request ? humanize(request.status) : "Not sent"}</CellChip></header>
      <p>Delivers the secure room link so the customer can connect a business account and sign. It is not notice that a debit has been scheduled for release.</p>
      <small>{request?.failed_reason || (request?.delivered_at ? `Delivered ${new Date(request.delivered_at).toLocaleString()}` : request?.sent_at ? `Sent ${new Date(request.sent_at).toLocaleString()}` : "Send after the fee agreement and obligation are current.")}</small>
    </section>
    <section>
      <header><div><span>Post-signature release gate</span><b>Exact debit notice</b></div><CellChip tone={statusTone(notice?.status ?? "pending")}>{notice ? humanize(notice.status) : "Not created"}</CellChip></header>
      {notice ? <div className="payment-delivery-facts">
        <span><small>Exact amount</small><b>{paymentMoney(notice.amount)}</b></span>
        <span><small>Debit date / window</small><b>{new Date(notice.scheduled_debit_at).toLocaleString()} · {notice.debit_window_start_at && notice.debit_window_end_at ? `${new Date(notice.debit_window_start_at).toLocaleString()} – ${new Date(notice.debit_window_end_at).toLocaleString()}` : humanize(notice.submission_window)}</b></span>
        <span><small>Revocation cutoff</small><b>{new Date(notice.revocation_cutoff_at).toLocaleString()}</b></span>
      </div> : <p>Created after account linkage and signature. Delivery of the exact amount, date/window, and revocation cutoff is required before ACH release.</p>}
      {notice ? <small>{notice.failed_reason || `${notice.advance_notice_business_days} business days' advance notice · ${notice.delivered_at ? `delivered ${new Date(notice.delivered_at).toLocaleString()}` : "delivery confirmation pending"}`}</small> : null}
      {canResend ? <Btn disabled={busy} onClick={onResend}>Resend exact notice</Btn> : null}
    </section>
  </div>;
}

function ProtectedArtifactView({ artifact }: { artifact: ProtectedPaymentArtifact }) {
  return <div className="payment-protected-artifact">
    <Icon name="lock" size={16} />
    <div><b>{artifact.name}</b><span>Protected bucket record · {artifact.retention_class === "ach_poa" || artifact.retention_class === "ach_authorization_proof" ? "ACH proof of authorization" : artifact.retention_class === "ach_debit_notice" ? "ACH debit notice" : "payment agreement"}</span><small>{artifact.legal_hold ? "Legal hold — retained until released" : artifact.protected_until ? `Protected through ${new Date(artifact.protected_until).toLocaleDateString()}` : "Retention protection active"}{artifact.sha256 ? ` · integrity ${artifact.sha256.slice(0, 12)}…` : ""}</small></div>
    {artifact.download_url ? <a className="btn" href={artifact.download_url} target="_blank" rel="noreferrer">View copy</a> : null}
  </div>;
}

function TransferView({ transfer }: { transfer: NonNullable<PaymentSummary["transfer"]> }) {
  return <div className="payment-transfer"><div><span>Released amount</span><strong>{paymentMoney(transfer.amount)}</strong></div><div><span>Transfer status</span><CellChip tone={statusTone(transfer.status)}>{humanize(transfer.status)}</CellChip></div>{transfer.return_code ? <Callout tone="bad"><b>{transfer.return_code}</b> {transfer.return_reason || "ACH was returned."}</Callout> : null}<small>{transfer.status === "funds_available" ? "Counted as collected." : "Not counted as collected until funds are available."}</small></div>;
}

function PaymentTimeline({ items }: { items: PaymentTimelineItem[] }) {
  if (!items.length) return <Empty title="No payment activity">Preparing or sending an obligation will start this immutable timeline.</Empty>;
  return <div className="payment-timeline">{items.map((item) => <div key={item.id}><span className={`tone-${item.tone}`} /><div><b>{item.title}</b>{item.detail ? <p>{item.detail}</p> : null}<small>{new Date(item.occurred_at).toLocaleString()}{item.actor_name ? ` · ${item.actor_name}` : ""}</small></div>{item.amount != null ? <strong>{paymentMoney(item.amount)}</strong> : null}</div>)}</div>;
}

type FeeReceiptForm = { receipt_type: "bank_direct" | "external_manual"; amount: string; received_at: string; reference: string; note: string };

function FeeReceiptPanel({ summary, form, setForm, busy, onSave }: { summary: PaymentSummary; form: FeeReceiptForm; setForm: (value: FeeReceiptForm) => void; busy: boolean; onSave: () => void }) {
  const bankExpected = summary.totals.bank_direct_expected;
  const externalExpected = summary.allocation?.external_amount ?? 0;
  if (!summary.permissions.can_reconcile_bank_direct || (bankExpected <= 0 && externalExpected <= 0)) return null;
  const expected = form.receipt_type === "bank_direct" ? bankExpected : externalExpected;
  const received = form.receipt_type === "bank_direct" ? summary.totals.bank_direct_received : summary.totals.external_received;
  return <Panel title="Fee receipts" sub={`${paymentMoney(received)} of ${paymentMoney(expected)} reconciled for this source`}><div className="grid">
    <div className="payment-receipt-type" role="radiogroup" aria-label="Receipt source">
      <button type="button" role="radio" aria-checked={form.receipt_type === "bank_direct"} className={form.receipt_type === "bank_direct" ? "on" : ""} disabled={bankExpected <= 0} onClick={() => setForm({ ...form, receipt_type: "bank_direct", amount: "" })}><b>Funding source / closing</b><small>{paymentMoney(summary.totals.bank_direct_received)} of {paymentMoney(bankExpected)}</small></button>
      <button type="button" role="radio" aria-checked={form.receipt_type === "external_manual"} className={form.receipt_type === "external_manual" ? "on" : ""} disabled={externalExpected <= 0} onClick={() => setForm({ ...form, receipt_type: "external_manual", amount: "" })}><b>External / manual</b><small>{paymentMoney(summary.totals.external_received)} of {paymentMoney(externalExpected)}</small></button>
    </div>
    <Field label="Amount received"><Input type="number" min="0.01" max={Math.max(0, expected - received)} step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></Field>
    <Field label="Received date"><Input type="date" value={form.received_at} onChange={(event) => setForm({ ...form, received_at: event.target.value })} /></Field>
    <Field label="Reference"><Input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} placeholder="Wire, check, closing, or ledger reference" /></Field>
    <Field label="Internal note"><Textarea rows={2} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></Field>
    <Btn variant="pri" disabled={busy || !(Number(form.amount) > 0) || Number(form.amount) > Math.max(0, expected - received) || !form.received_at || !form.reference.trim()} onClick={onSave}>Reconcile receipt</Btn>
  </div></Panel>;
}

function RefundPanel({ amount, setAmount, max, busy, onRefund }: { amount: string; setAmount: (value: string) => void; max: number; busy: boolean; onRefund: () => void }) {
  return <Panel title="Refund collected funds" sub={`${paymentMoney(max)} currently refundable`}><Callout tone="warn">Refunds are separate money movements and require available Plaid Ledger funds.</Callout><Field label="Refund amount"><Input type="number" min="0.01" max={max} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field><Btn className="danger" disabled={busy || !(Number(amount) > 0) || Number(amount) > max} onClick={onRefund}>Review refund</Btn></Panel>;
}

function humanize(value: string): string { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function obligationTone(status: FeeObligationStatus | undefined) { return status === "collected" ? "ok" : status === "returned" ? "bad" : status === "ready_for_release" || status === "authorized" ? "acc" : status ? "warn" : "mut"; }
type FeeObligationStatus = PaymentSummary["obligation"] extends infer T ? T extends { status: infer S } ? S : never : never;
function statusTone(status: string) { return ["connected", "verified", "signed", "authorized", "active", "completed", "delivered", "funds_available", "collected"].includes(status) ? "ok" : ["failed", "delivery_failed", "bounced", "complained", "returned", "blocked", "action_required", "revoked", "expired", "cancelled"].includes(status) ? "bad" : ["draft", "queued", "pending", "sent", "awaiting_authorization", "authorizing", "submitting", "submitted", "posted", "settled", "paused"].includes(status) ? "warn" : "mut"; }
