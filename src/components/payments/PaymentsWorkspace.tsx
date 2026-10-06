"use client";

import { useState } from "react";
import { Btn, Callout, CellChip, Empty, Field, Input, Loading, Panel, Select, Textarea, WarnLine } from "@/components/ds";
import { ConfirmDialog } from "@/components/design-system/ConfirmDialog";
import { Icon } from "@/components/design-system/Icon";
import { FeeAllocationEditor } from "@/components/payments/FeeAllocationEditor";
import { PrivateFundingSchedulePanel } from "@/components/payments/PrivateFundingSchedulePanel";
import { usePaymentCommand, usePaymentSummary } from "@/hooks/usePayments";
import { paymentMoney, paymentPaths, type PaymentSummary, type PaymentTimelineItem } from "@/lib/payments";

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
  const [showReplacement, setShowReplacement] = useState(false);
  const [agreementDocumentId, setAgreementDocumentId] = useState("");
  const [agreementAttested, setAgreementAttested] = useState(false);

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
  const selectedAgreement = summary.agreement_documents.find((document) => document.id === agreementDocumentId) ?? null;
  const selectedAgreementEligible = Boolean(selectedAgreement
    && (!includeOrigination || selectedAgreement.eligible_components.includes("origination"))
    && (!consultingEarned || selectedAgreement.eligible_components.includes("consulting")));
  const agreementAttestationReady = Boolean(selectedAgreement && (selectedAgreement.system_signed || !selectedAgreement.requires_staff_attestation || agreementAttested));
  const canRequestReview = Boolean((summary.permissions as PaymentSummary["permissions"] & { can_request_review?: boolean }).can_request_review);

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

            <section className="payment-step-section">
              <StepHeading number="1" title="Prepare the fee obligation" detail="Freeze the exact fee lines and signed agreement reference that the client will see." complete={Boolean(obligation?.agreement_ready && obligationCurrent)} />
              {obligation?.agreement_ready ? <>
                <FeeObligationView summary={summary} />
                {!obligationCurrent ? <Callout tone="bad"><b>This fee request is out of date.</b> Deal economics changed after it was prepared. It cannot be sent or released. Save a current balanced allocation, then prepare a replacement below.</Callout> : null}
                {obligationCurrent && obligationReplaceable && !showReplacement ? <Btn onClick={() => setShowReplacement(true)}>Prepare replacement or correct agreement</Btn> : null}
                {!obligationCurrent && !obligationReplaceable ? <Callout tone="warn">Collection has already started, so this obligation cannot be replaced here. Review the transfer and contact a Super Admin before changing the economics.</Callout> : null}
              </> : null}
              {preparationOpen ? (
                <div className="payment-inline-form">
                  {summary.agreement_documents.length ? <Field label="Signed fee agreement" hint="Only documents owned by this file can be selected. The server verifies its signature metadata and integrity hash.">
                    <Select value={agreementDocumentId} onChange={(event) => { setAgreementDocumentId(event.target.value); setAgreementAttested(false); }}>
                      <option value="">Choose an uploaded agreement…</option>
                      {summary.agreement_documents.map((document) => <option key={document.id} value={document.id}>{document.name}{document.system_signed ? " · electronically signed" : " · staff attestation required"}</option>)}
                    </Select>
                  </Field> : <Callout tone="warn"><b>Upload the signed fee agreement first.</b> No eligible agreement is available in this file. Free-text references and pasted hashes are never accepted.</Callout>}
                  {selectedAgreement ? <Callout tone={selectedAgreement.system_signed ? "ok" : "warn"}><b>{selectedAgreement.name}</b> {selectedAgreement.system_signed ? `Signature verified${selectedAgreement.signed_at ? ` on ${new Date(selectedAgreement.signed_at).toLocaleDateString()}` : ""}.` : "This upload has no system signature record."}</Callout> : null}
                  {selectedAgreement?.requires_staff_attestation && !selectedAgreement.system_signed ? <label className="payment-check"><input type="checkbox" checked={agreementAttested} onChange={(event) => setAgreementAttested(event.target.checked)} /><span><b>I verified this is the executed fee agreement</b><small>This manager attestation is audited. The server derives the document identity and hash.</small></span></label> : null}
                  {summary.origination_fee > 0 ? <label className="payment-check"><input type="checkbox" checked={includeOrigination} onChange={(event) => setIncludeOrigination(event.target.checked)} /><span><b>Include the origination fee</b><small>It remains blocked from release until actual funding is verified.</small></span></label> : null}
                  {summary.consulting_fee > 0 ? <label className="payment-check"><input type="checkbox" checked={consultingEarned} onChange={(event) => setConsultingEarned(event.target.checked)} /><span><b>Include consulting fee — milestone earned</b><small>Leave this off when the consulting milestone has not occurred.</small></span></label> : null}
                  {!selectedComponentsReady ? <Callout tone="warn"><b>Adjust the fee allocation first.</b> A fee excluded from this request must have no client ACH portion and must be fully deferred or waived.</Callout> : null}
                  {selectedAgreement && !selectedAgreementEligible ? <Callout tone="bad"><b>This agreement does not cover every selected fee.</b> Choose an agreement whose eligible components include the origination and/or consulting lines selected below.</Callout> : null}
                  {!canPrepare ? <Callout tone="mut">Save a current, fully balanced fee allocation before selecting the signed agreement.</Callout> : null}
                  <Btn
                    variant="pri"
                    disabled={!canPrepare || !selectedAgreementEligible || !agreementAttestationReady || command.isPending}
                    onClick={() => selectedAgreement && run(paymentPaths.obligations(profileId), "prepare-obligation", profileId, {
                      agreement_document_id: selectedAgreement.id,
                      agreement_attested_signed: agreementAttested,
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
              <StepHeading number="2" title="Client bank authorization" detail="The client connects a dedicated Plaid Transfer account and signs the exact maximum amount." complete={summary.mandate?.status === "signed"} />
              <div className="payment-status-row">
                <StatusBlock label="Payment account" value={summary.funding_source ? `${summary.funding_source.institution_name || "Connected bank"} ••••${summary.funding_source.account_mask || ""}` : "Not connected"} status={summary.funding_source?.status ?? "pending"} />
                <StatusBlock label="ACH mandate" value={summary.mandate ? `${summary.mandate.sec_code} · ${paymentMoney(summary.mandate.authorized_amount)}` : "Not signed"} status={summary.mandate?.status ?? "pending"} />
                {obligation?.agreement_ready && obligationCurrent && summary.permissions.can_send_authorization && obligation.amount > 0 ? <Btn disabled={command.isPending || ["processing", "partially_collected", "collected", "cancelled", "superseded"].includes(obligation.status)} onClick={() => run(paymentPaths.sendAuthorization(obligation.id), "send-authorization", obligation.id, undefined, "Secure authorization request sent to the client.")}>{obligation.authorization_sent_at ? "Resend secure request" : "Send secure request"}</Btn> : null}
              </div>
              <Callout tone="acc"><b>Separate from evidence Plaid.</b> A bank connected for statements or asset verification is never reused for debits.</Callout>
            </section>

            <section className="payment-step-section">
              <StepHeading number="3" title="Confirm actual funding" detail="An estimated closing date or pipeline status can never unlock ACH." complete={Boolean(summary.funding_confirmation)} />
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
              <StepHeading number="4" title="Release ACH collection" detail="This is the only action that can initiate the origination-fee debit." complete={Boolean(transfer)} />
              <ReadinessChecklist summary={summary} />
              {transfer ? <><TransferView transfer={transfer} /><div className="payment-private-actions">{transfer.resume_eligible && summary.permissions.can_retry ? <Btn disabled={command.isPending} onClick={() => setConfirmResume(true)}>Resume existing ACH attempt</Btn> : null}{transfer.retry_eligible && summary.permissions.can_retry ? <Btn disabled={command.isPending} onClick={() => setConfirmRetry(true)}>Review eligible ACH retry</Btn> : null}</div></> : (
                <Btn
                  variant="pri"
                  className="payment-release-button"
                  disabled={!summary.readiness.ready_for_release || !summary.permissions.can_release_ach || command.isPending}
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
        body={<><b>This initiates money movement.</b> Funding, mandate, account eligibility, authorization amount, and duplicate protection will be rechecked immediately before provider submission. It cannot be recalled after provider handoff.</>}
        confirmLabel="Release ACH collection"
        busy={command.isPending}
        onConfirm={() => obligation && run(paymentPaths.release(obligation.id), "release-ach", obligation.id, { amount_cents: Math.round(obligation.amount * 100), expected_version: obligation.version }, "ACH collection released.").then((ok) => { if (ok) setConfirmRelease(false); })}
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
    ["Signed fee agreement", summary.readiness.agreement_signed],
    ["Client ACH authorization", summary.readiness.client_authorized],
    ["Actual funding verified", summary.readiness.funding_confirmed],
    ["Authorization covers amount", summary.readiness.amount_covered],
    ["Eligible payment account", summary.readiness.account_eligible],
    ["No transfer already claimed", summary.readiness.no_existing_claim],
  ] as const;
  return <><div className="payment-readiness">{checks.map(([label, ready]) => <div key={label} className={ready ? "ready" : "blocked"}><span>{ready ? <Icon name="check" size={13} /> : <Icon name="x" size={13} />}</span>{label}</div>)}</div>{summary.readiness.blockers.length ? <WarnLine>{summary.readiness.blockers.join(" · ")}</WarnLine> : null}</>;
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
function statusTone(status: string) { return ["connected", "signed", "authorized", "active", "completed", "funds_available", "collected"].includes(status) ? "ok" : ["failed", "returned", "blocked", "action_required", "revoked", "expired"].includes(status) ? "bad" : ["pending", "awaiting_authorization", "authorizing", "submitting", "submitted", "posted", "settled", "paused"].includes(status) ? "warn" : "mut"; }
