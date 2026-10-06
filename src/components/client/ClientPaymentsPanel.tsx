"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { Icon } from "@/components/design-system/Icon";
import { apiBase } from "@/lib/api";
import { isAchMandateActive, isAchMandateSigned } from "@/lib/payments";
import { clearRoomHandoff, stashPaymentRoomHandoff } from "@/lib/roomPlaidHandoff";

type FeeLine = {
  id: string;
  label: string;
  amount_cents: number;
  collection_amount_cents: number;
  agreement_reference?: string | null;
};

type ClientCustomerIdentity = {
  customer_name?: string | null;
  client_name?: string | null;
  business_name?: string | null;
  legal_name?: string | null;
  email?: string | null;
};

type ClientAuthorizationTermsWire = {
  authorization_type?: "one_time_business_ccd" | "one_time" | string | null;
  originator?: string | null;
  originator_name?: string | null;
  customer_name?: string | null;
  business_name?: string | null;
  amount_cents?: number | null;
  scheduled_debit_at?: string | null;
  submission_window?: string | null;
  notice_business_days?: number | null;
  advance_notice_business_days?: number | null;
  revocation_cutoff_at?: string | null;
  revocation_email?: string | null;
  authorization_text_version?: string | null;
  terms_version?: string | null;
  authorization_text_sha256?: string | null;
  terms_sha256?: string | null;
  authorization_text?: string | null;
};

export type ClientAuthorizationTerms = {
  authorization_type: "one_time_business_ccd" | "unsupported";
  originator_name: string;
  customer_name: string;
  business_name: string;
  amount_cents: number;
  scheduled_debit_at: string;
  submission_window: string;
  advance_notice_business_days: number;
  revocation_cutoff_at: string;
  revocation_email: string;
  terms_version: string;
  terms_sha256: string;
  authorization_text: string | null;
};

export function normalizeClientAuthorizationTerms(
  terms: ClientAuthorizationTermsWire | null | undefined,
  identity?: ClientCustomerIdentity | null,
  fallbackBusinessName?: string | null,
): ClientAuthorizationTerms | null {
  if (!terms) return null;
  const noticeDays = Number(terms.notice_business_days ?? terms.advance_notice_business_days ?? 0);
  return {
    authorization_type: terms.authorization_type === "one_time_business_ccd" || terms.authorization_type === "one_time"
      ? "one_time_business_ccd"
      : "unsupported",
    originator_name: (terms.originator || terms.originator_name || "").trim(),
    customer_name: (terms.customer_name || identity?.customer_name || identity?.client_name || identity?.legal_name || "").trim(),
    business_name: (terms.business_name || identity?.business_name || fallbackBusinessName || "").trim(),
    amount_cents: Number(terms.amount_cents ?? 0),
    scheduled_debit_at: terms.scheduled_debit_at || "",
    submission_window: terms.submission_window || "",
    advance_notice_business_days: Number.isFinite(noticeDays) ? noticeDays : 0,
    revocation_cutoff_at: terms.revocation_cutoff_at || "",
    revocation_email: terms.revocation_email || "",
    terms_version: terms.authorization_text_version || terms.terms_version || "",
    terms_sha256: terms.authorization_text_sha256 || terms.terms_sha256 || "",
    authorization_text: terms.authorization_text || null,
  };
}

type ClientPaymentState = {
  available: boolean;
  payments_enabled: boolean;
  ach_authorization_enabled?: boolean;
  legal_approval_required?: boolean;
  private_funding_payments_enabled?: boolean;
  business_name?: string | null;
  customer_identity?: ClientCustomerIdentity | null;
  fee_agreement?: {
    id: string;
    requested_document_id?: string | null;
    status: "draft" | "awaiting_signature" | "signed" | "superseded" | "voided";
    agreement_reference?: string | null;
    template_version?: string | null;
    signed_at?: string | null;
    sign_url?: string | null;
    proof_email_status?: string | null;
    current?: boolean;
    artifact?: { name?: string | null; download_url?: string | null; download_route?: string | null; protected_until?: string | null; legal_hold?: boolean } | null;
  } | null;
  authorization_terms?: ClientAuthorizationTermsWire | null;
  authorization_request_delivery?: { status: string; sent_at?: string | null; delivered_at?: string | null; failed_reason?: string | null } | null;
  debit_notice?: { status: string; sent_at?: string | null; delivered_at?: string | null; failed_reason?: string | null } | null;
  obligation?: {
    id: string;
    status: string;
    currency: string;
    lines: FeeLine[];
    client_ach_cents: number;
    collected_cents: number;
    outstanding_cents: number;
    agreement_ready: boolean;
  } | null;
  funding_confirmation?: {
    actual_funding_date: string;
    actual_funded_amount: string | number;
    funding_party_name: string;
  } | null;
  funding_source?: {
    id: string;
    status: string;
    owner_type: "business" | "consumer";
    ach_class?: "ccd" | "web" | "CCD" | "WEB" | null;
    institution_name?: string | null;
    account_name?: string | null;
    account_mask?: string | null;
    business_account_attested?: boolean;
  } | null;
  mandate?: {
    id: string;
    status: string;
    current?: boolean;
    is_current?: boolean;
    ach_class: "ccd" | "web";
    authorized_amount_cents: number;
    payer_name: string;
    signed_at?: string | null;
    certificate_available?: boolean;
    authorization_type?: "one_time_business_ccd" | "one_time";
    scheduled_debit_at?: string | null;
    submission_window?: string | null;
    notice_business_days?: number;
    advance_notice_business_days?: number;
    revocation_cutoff_at?: string | null;
    revocation_email?: string | null;
    proof_email_status?: string | null;
    proof_delivered_at?: string | null;
    can_revoke?: boolean;
    can_resend_proof?: boolean;
    artifact?: { name?: string | null; download_url?: string | null; protected_until?: string | null; legal_hold?: boolean } | null;
  } | null;
  transfer?: {
    id: string;
    status: string;
    amount_cents: number;
    submitted_at?: string | null;
    funds_available_at?: string | null;
    returned_at?: string | null;
    repair_needed?: boolean;
  } | null;
  private_plan?: {
    id: string;
    status: string;
    cadence: string;
    total_amount_cents: number;
    creditor_name?: string | null;
    payee_name?: string | null;
    settlement_destination_ref?: string | null;
    agreement_reference?: string | null;
    production_term_sheet_id?: string | null;
    production_term_sheet_version?: number | null;
    schedule_sha256?: string | null;
    next_due_date?: string | null;
    mandate?: {
      id: string;
      status: string;
      current?: boolean;
      authorized_amount_cents: number;
      payer_name: string;
      signed_at?: string | null;
      certificate_available?: boolean;
    } | null;
    transfer?: {
      id: string;
      status: string;
      repair_needed?: boolean;
    } | null;
    installments: Array<{ id: string; sequence: number; due_date: string; amount_cents: number; status: string }>;
    can_revoke_future_authorization: boolean;
  } | null;
};

type ClientPaymentsPanelProps = {
  token: string;
  passcode: string;
  defaultPayerName: string;
  onOpenFeeAgreement?: (requestedDocumentId: string) => void;
};

export function clientPaymentStageVisibility(state: {
  available?: boolean;
  fee_agreement?: unknown | null;
  obligation?: unknown | null;
} | null | undefined) {
  const feeAgreement = Boolean(state?.fee_agreement);
  const ach = Boolean(state?.obligation);
  return {
    feeAgreement,
    ach,
    waitingForObligation: feeAgreement && !ach,
    empty: Boolean(state && !state.available && !feeAgreement && !ach),
  };
}

export function clientFeeAgreementCertificatePath(requestedDocumentId: string): string {
  return `/fee-agreements/${encodeURIComponent(requestedDocumentId)}/certificate`;
}

export function ClientPaymentsPanel({ token, passcode, defaultPayerName, onOpenFeeAgreement }: ClientPaymentsPanelProps) {
  const basePath = `${apiBase}/api/v1/application-profiles/public/room/${token}/payments`;
  const [state, setState] = useState<ClientPaymentState | null>(null);
  const [payerName, setPayerName] = useState(defaultPayerName);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linkPurpose, setLinkPurpose] = useState<"fee" | "private_schedule">("fee");
  const [linkOwnerType, setLinkOwnerType] = useState<"business" | "consumer">("business");
  const [linkExchangeRequired, setLinkExchangeRequired] = useState(true);
  const [linkTransferId, setLinkTransferId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [scheduleConfirmed, setScheduleConfirmed] = useState(false);
  const [businessAccountAttested, setBusinessAccountAttested] = useState(false);

  const post = useCallback(async <T,>(path: string, body: Record<string, unknown>): Promise<T> => {
    const response = await fetch(`${basePath}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode, ...body }),
    });
    if (!response.ok) {
      let message = "The payment request could not be completed.";
      try {
        const payload = await response.json() as { detail?: string | { message?: string } };
        if (typeof payload.detail === "string") message = payload.detail;
        else if (payload.detail?.message) message = payload.detail.message;
      } catch { /* use the safe fallback */ }
      throw new Error(message);
    }
    return response.json() as Promise<T>;
  }, [basePath, passcode]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const next = await post<ClientPaymentState>("/state", {});
      setState(next);
      if (next.mandate?.payer_name) setPayerName(next.mandate.payer_name);
      if (next.funding_source?.business_account_attested) setBusinessAccountAttested(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Payment status is unavailable.");
    }
  }, [post]);

  useEffect(() => { void refresh(); }, [refresh]);

  const exchange = useCallback(async (publicToken: string | null, metadata: PlaidLinkOnSuccessMetadata) => {
    setBusy("connecting"); setError(null);
    try {
      if (linkExchangeRequired) {
        if (metadata.accounts.length !== 1) {
          throw new Error("Choose exactly one dedicated payment account in Plaid Link.");
        }
        const accountId = metadata.accounts[0]?.id;
        if (!publicToken || !accountId) throw new Error("Choose one eligible bank account in Plaid Link.");
        await post("/exchange", { public_token: publicToken, plaid_account_id: accountId, owner_type: linkOwnerType, purpose: linkPurpose, business_account_attested: true });
      } else {
        if (!linkTransferId) throw new Error("The transfer repair session is incomplete. Please start again from this payment request.");
        const repaired = await post<ClientPaymentState>("/repair-complete", { transfer_id: linkTransferId });
        setState(repaired);
      }
      setLinkToken(null);
      await refresh();
      clearRoomHandoff();
    } catch (reason) {
      clearRoomHandoff();
      setError(reason instanceof Error ? reason.message : "The payment account could not be connected.");
    } finally { setBusy(null); }
  }, [linkExchangeRequired, linkOwnerType, linkPurpose, linkTransferId, post, refresh]);

  const { open: openPlaid, ready: plaidReady } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken, metadata) => {
      if (linkExchangeRequired && !publicToken) {
        setError("Plaid did not return a payment connection token. Please try again.");
        setLinkToken(null);
        setBusy(null);
        return;
      }
      void exchange(publicToken, metadata);
    },
    onExit: (plaidError) => {
      clearRoomHandoff();
      setLinkToken(null);
      setBusy(null);
      if (plaidError?.display_message || plaidError?.error_message) {
        setError(plaidError.display_message || plaidError.error_message || "Plaid Link closed before completion.");
      }
    },
  });

  useEffect(() => {
    if (linkToken && plaidReady) openPlaid();
  }, [linkToken, openPlaid, plaidReady]);

  const exactAmount = state?.obligation?.client_ach_cents ?? 0;
  const feeAgreementRequestId = state?.fee_agreement?.requested_document_id || state?.fee_agreement?.id || "";
  const feeAgreementFallbackUrl = state?.fee_agreement?.sign_url || (feeAgreementRequestId ? `?tab=agreements&request=${encodeURIComponent(feeAgreementRequestId)}` : "");
  const mandateActive = isAchMandateActive(state?.mandate);
  const mandateSigned = isAchMandateSigned(state?.mandate);
  const feeAgreementSigned = state?.fee_agreement?.status === "signed" && state.fee_agreement.current !== false;
  const achAuthorizationEnabled = Boolean(state?.payments_enabled && state.ach_authorization_enabled !== false && !state.legal_approval_required);
  const businessCcdAccount = state?.funding_source?.owner_type === "business" && state.funding_source.ach_class?.toUpperCase() === "CCD";
  const maskedBusinessAccountReady = Boolean(businessCcdAccount && state?.funding_source?.account_mask?.trim());
  const terms = normalizeClientAuthorizationTerms(state?.authorization_terms, state?.customer_identity, state?.business_name);
  const authorizationBusinessName = terms?.business_name || "";
  const termsComplete = Boolean(maskedBusinessAccountReady && terms?.authorization_type === "one_time_business_ccd" && terms.originator_name && terms.customer_name && authorizationBusinessName && terms.amount_cents === exactAmount && terms.scheduled_debit_at && terms.submission_window && terms.advance_notice_business_days >= 2 && terms.revocation_cutoff_at && terms.revocation_email && terms.terms_version && terms.terms_sha256 && terms.authorization_text?.trim());
  const canAuthorize = Boolean(achAuthorizationEnabled && feeAgreementSigned && businessCcdAccount && state?.funding_source && state.obligation && payerName.trim() && confirmed && termsComplete && !mandateActive);
  const transferTone = transferStatusTone(state?.transfer?.status);
  const transferNeedsBankRepair = state?.transfer?.status === "action_required";
  const paymentStages = clientPaymentStageVisibility(state);
  const feeAgreementReferences = useMemo(
    () => Array.from(new Set(
      state?.obligation?.lines
        .map((line) => line.agreement_reference?.trim())
        .filter((reference): reference is string => Boolean(reference)) ?? [],
    )),
    [state?.obligation?.lines],
  );
  const schedule = state?.private_plan;
  const privatePaymentsEnabled = Boolean(
    state?.payments_enabled
    && state?.private_funding_payments_enabled
    && state.ach_authorization_enabled !== false
    && !state.legal_approval_required
  );
  const scheduleMandateActive = isAchMandateActive(schedule?.mandate);
  const scheduleNeedsBankRepair = Boolean(schedule?.transfer?.repair_needed);
  const scheduleHasActionRequired = !scheduleNeedsBankRepair && (schedule?.installments.some((row) => row.status === "action_required") ?? false);
  const upcoming = useMemo(
    () => schedule?.installments.filter((row) => !["completed", "cancelled"].includes(row.status)) ?? [],
    [schedule],
  );

  async function startConnection(purpose: "fee" | "private_schedule") {
    if (!businessAccountAttested) {
      setError("Confirm that this is an authorized business account before opening the secure bank connection.");
      return;
    }
    setBusy("link"); setError(null);
    try {
      const effectiveOwnerType = "business" as const;
      const result = await post<{ link_token: string; repair_mode?: boolean; exchange_required?: boolean; transfer_id?: string | null }>("/link-token", { owner_type: effectiveOwnerType, purpose, business_account_attested: true });
      setLinkPurpose(purpose);
      setLinkOwnerType(effectiveOwnerType);
      setLinkExchangeRequired(result.exchange_required !== false);
      setLinkTransferId(result.transfer_id ?? null);
      stashPaymentRoomHandoff({
        linkToken: result.link_token,
        token,
        passcode,
        returnTo: window.location.href,
        purpose,
        ownerType: effectiveOwnerType,
        businessAccountAttested: true,
        exchangeRequired: result.exchange_required !== false,
        transferId: result.transfer_id ?? undefined,
      });
      setLinkToken(result.link_token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "A secure bank connection could not be started.");
      setBusy(null);
    }
  }

  async function authorizeSchedule() {
    if (!privatePaymentsEnabled || !schedule || !state?.funding_source || !businessCcdAccount || !payerName.trim() || !scheduleConfirmed) return;
    setBusy("schedule-authorize"); setError(null);
    try {
      await post(`/private-plans/${schedule.id}/authorize`, {
        funding_source_id: state.funding_source.id,
        typed_name: payerName.trim(),
        consent: true,
      });
      setScheduleConfirmed(false);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The fixed-payment authorization could not be recorded.");
    } finally { setBusy(null); }
  }

  async function authorize() {
    if (!state?.obligation || !state.funding_source || !canAuthorize) return;
    setBusy("authorize"); setError(null);
    try {
      await post("/authorize", {
        obligation_id: state.obligation.id,
        funding_source_id: state.funding_source.id,
        typed_name: payerName.trim(),
        authorized_amount_cents: exactAmount,
        authorization_type: "one_time_business_ccd",
        authorization_text_sha256: terms?.terms_sha256,
        authorization_terms_sha256: terms?.terms_sha256,
        scheduled_debit_at: terms?.scheduled_debit_at,
        consent: true,
      });
      setConfirmed(false);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Authorization could not be recorded.");
    } finally { setBusy(null); }
  }

  async function resendProof() {
    if (!state?.mandate?.id) return;
    setBusy("resend-proof"); setError(null);
    try {
      await post(`/mandates/${state.mandate.id}/resend-proof`, {});
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The authorization copy could not be resent.");
    } finally { setBusy(null); }
  }

  async function revokeFeeAuthorization() {
    if (!state?.mandate?.id) return;
    setBusy("revoke-fee"); setError(null);
    try {
      await post(`/mandates/${state.mandate.id}/revoke`, { reason: "Customer revoked authorization in the secure room" });
      setConfirmed(false);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The authorization could not be revoked. Contact support immediately.");
    } finally { setBusy(null); }
  }

  async function downloadCertificate(mandateId?: string) {
    const id = mandateId || state?.mandate?.id;
    if (!id) return;
    setBusy("certificate"); setError(null);
    try {
      const response = await fetch(`${basePath}/mandates/${id}/certificate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!response.ok) throw new Error("The authorization certificate is not available yet.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "QC-ACH-authorization.pdf";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The certificate could not be downloaded.");
    } finally { setBusy(null); }
  }

  async function downloadFeeAgreement() {
    if (!feeAgreementRequestId) return;
    setBusy("fee-agreement-certificate"); setError(null);
    try {
      const response = await fetch(`${basePath}${clientFeeAgreementCertificatePath(feeAgreementRequestId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!response.ok) throw new Error("The executed fee agreement is not available yet.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "QC-Deal-Specific-Success-Fee-Agreement.pdf";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The executed fee agreement could not be downloaded.");
    } finally { setBusy(null); }
  }

  async function revokeFutureSchedule() {
    // Revocation is a safety action, not a money-movement action. It must stay
    // available when the private-payments kill switch is off so an existing
    // standing mandate can still be stopped while new links, signatures, and
    // provider handoffs remain disabled.
    if (!schedule) return;
    setBusy("revoke"); setError(null);
    try {
      await post(`/private-plans/${schedule.id}/revoke`, {});
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Future authorization could not be revoked.");
    } finally { setBusy(null); }
  }

  if (!state && !error) return <section className="application-room-section"><p>Loading payment status…</p></section>;

  return <section className="application-room-section client-payments">
    <div className="application-room-section-head">
      <div><span className="application-room-eyebrow">Secure payments</span><h2>Fee agreement and one-time ACH</h2><p>{state?.business_name ? <>This request is for <b>{state.business_name}</b>. </> : null}The Success Fee Agreement and bank authorization are separate steps. Signing the agreement alone never authorizes a debit.</p></div>
      <button className="application-room-secondary" onClick={() => void refresh()} disabled={Boolean(busy)}><Icon name="refresh" size={14} />Refresh</button>
    </div>

    {error ? <div className="application-room-alert bad" role="alert" aria-live="assertive">{error}</div> : null}
    {state && (state.legal_approval_required || state.ach_authorization_enabled === false) ? <div className="application-room-alert bad" role="status"><div><b>New ACH authorization is not enabled.</b><p>Qualified Commercial must complete its legal/counsel approval and capability configuration before this room can accept a new authorization. You may still review or revoke previously executed proof. This message is operational information, not legal advice.</p></div></div> : null}
    {state && (state.obligation || state.private_plan) && !state.funding_source?.business_account_attested ? <label className="client-payment-confirm client-business-account-attestation"><input type="checkbox" checked={businessAccountAttested} onChange={(event) => setBusinessAccountAttested(event.target.checked)} /><span><b>Business account confirmation</b><br />I confirm the account I connect is owned by this business and is a business checking or savings account. I am authorized to connect it for business CCD ACH payments.</span></label> : null}
    {paymentStages.empty ? <div className="application-room-empty"><b>No fee-payment request is waiting.</b><p>Your application and document room remain available.</p></div> : null}
    {state?.fee_agreement ?
      <section className="client-fee-agreement" aria-labelledby="client-fee-agreement-title">
        <div className="client-payment-stage-heading"><span>1</span><div><h3 id="client-fee-agreement-title">Success Fee Agreement</h3><p>Review and sign the deal-specific fee agreement before connecting a payment account.</p></div></div>
        <>
          <div className="client-fee-agreement-record">
            <div><span>Status</span><strong>{humanStatus(state.fee_agreement.status)}</strong></div>
            <div><span>Reference</span><strong>{state.fee_agreement.agreement_reference || "Pending"}</strong></div>
            <div><span>Signed</span><strong>{dateLabel(state.fee_agreement.signed_at)}</strong></div>
            <div><span>Customer copy</span><strong>{humanStatus(state.fee_agreement.proof_email_status || "pending")}</strong></div>
          </div>
          {state.fee_agreement.status === "awaiting_signature" && feeAgreementRequestId ? onOpenFeeAgreement
            ? <button className="application-room-primary" type="button" onClick={() => onOpenFeeAgreement(feeAgreementRequestId)}>Review and sign fee agreement</button>
            : <a className="application-room-primary" href={feeAgreementFallbackUrl}>Review and sign fee agreement</a>
          : null}
          {state.fee_agreement.status === "signed" ? <div className="application-room-alert good"><div><b>Executed fee agreement verified.</b><p>This signed version is bound to the fee obligation. A change to deal economics requires a replacement agreement and ACH authorization.</p></div><button className="application-room-secondary" type="button" onClick={() => void downloadFeeAgreement()} disabled={Boolean(busy)}>{busy === "fee-agreement-certificate" ? "Preparing download…" : "Download agreement"}</button></div> : null}
          {state.fee_agreement.artifact ? <ClientProtectedRecord label={state.fee_agreement.artifact.name || "Executed Success Fee Agreement"} protectedUntil={state.fee_agreement.artifact.protected_until} legalHold={state.fee_agreement.artifact.legal_hold} /> : null}
        </>
      </section>

    : state?.available ? <section className="client-fee-agreement" aria-labelledby="client-fee-agreement-title"><div className="client-payment-stage-heading"><span>1</span><div><h3 id="client-fee-agreement-title">Success Fee Agreement</h3><p>Review and sign the deal-specific fee agreement before connecting a payment account.</p></div></div><div className="application-room-alert bad"><div><b>The Success Fee Agreement is not ready.</b><p>No bank connection or ACH authorization can be completed until QC prepares the agreement and both parties execute it.</p></div></div></section> : null}

    {paymentStages.waitingForObligation && state?.fee_agreement ? <div className="application-room-alert" role="status"><div><b>{state.fee_agreement.status === "signed" ? "Agreement complete — exact ACH terms are being prepared." : "The ACH step opens after the fee agreement is complete."}</b><p>{state.fee_agreement.status === "signed" ? "QC is preparing the exact fee obligation, date, and submission window. There is no bank connection or debit authorization to complete yet." : "Review and sign the agreement above first. No bank account is connected and no debit can occur at this stage."} Actual funding must still be verified and authorized QC staff must release any debit.</p></div></div> : null}

    {state?.obligation ? <>

      <div className="client-payments-summary">
        <div><span>One-time ACH maximum</span><strong>{money(exactAmount)}</strong><small>Exact fee lines only</small></div>
        <div><span>Funding confirmation</span><strong>{state.funding_confirmation ? "Confirmed" : "Not yet confirmed"}</strong><small>{state.funding_confirmation ? `${state.funding_confirmation.funding_party_name} · ${dateLabel(state.funding_confirmation.actual_funding_date)} · ${dollars(state.funding_confirmation.actual_funded_amount)} funded` : "The desk must verify actual funding"}</small></div>
        <div><span>Collection status</span><strong className={transferTone}>{humanStatus(state.transfer?.status || state.obligation.status)}</strong><small>{state.transfer?.funds_available_at ? `Funds available ${dateLabel(state.transfer.funds_available_at)}` : "Authorization is not the same as collection"}</small></div>
        <div><span>Collected</span><strong>{money(state.obligation.collected_cents)}</strong><small>{money(state.obligation.outstanding_cents)} remains on this ACH request</small></div>
      </div>

      {transferNeedsBankRepair ? <div className="application-room-alert bad" role="alert">
        <div><b>Bank verification is required before this payment can continue.</b><p>No new debit or automatic retry has been started. Complete the secure Plaid repair, then this page will refresh the authoritative transfer status.</p></div>
        {state.transfer?.repair_needed ? <button className="application-room-primary" type="button" onClick={() => void startConnection("fee")} disabled={!state.payments_enabled || !businessAccountAttested || Boolean(busy)}>{busy === "link" ? "Opening secure repair…" : "Repair bank verification"}</button> : <button className="application-room-secondary" type="button" onClick={() => void refresh()} disabled={Boolean(busy)}>{busy ? "Refreshing…" : "Refresh status"}</button>}
      </div> : null}

      <div className="client-payment-lines">
        <h3>Your fee authorization</h3>
        {state.obligation.lines.map((line) => <div key={line.id}><div><b>{line.label}</b><small>{money(line.amount_cents)} fee{line.collection_amount_cents !== line.amount_cents ? ` · ${money(line.collection_amount_cents)} allocated to client ACH` : " · fully allocated to client ACH"}</small>{line.agreement_reference ? <small>Signed agreement reference: {line.agreement_reference}</small> : null}</div><span>{money(line.collection_amount_cents)}</span></div>)}
        <div className="total"><b>Maximum ACH authorization</b><strong>{money(exactAmount)}</strong></div>
      </div>

      {!state.funding_source ? <div className="client-payment-action-card">
        <div className="client-payment-stage-heading"><span>2</span><div><h3>Connect a business payment account</h3><p>This dedicated Plaid payment connection is separate from bank statements and underwriting evidence.</p></div></div>
        <div className="client-payment-owner client-payment-owner-single"><div className="on"><b>Business account only</b><span>One-time ACH debit · CCD classification</span></div></div>
        <button className="application-room-primary" onClick={() => void startConnection("fee")} disabled={!achAuthorizationEnabled || !feeAgreementSigned || !businessAccountAttested || Boolean(busy)}>{busy === "link" ? "Starting secure connection…" : "Connect business bank securely"}</button>
        {!feeAgreementSigned ? <small>Complete the Success Fee Agreement before connecting the payment account.</small> : null}
        {!achAuthorizationEnabled ? <small>Online ACH authorization is not open. Your account will not be debited.</small> : null}
      </div> : <div className={`client-payment-account ${businessCcdAccount ? "" : "ineligible"}`}><Icon name="building" size={19} /><div><b>{state.funding_source.institution_name || "Connected bank"}</b><span>{state.funding_source.account_name || "Account"} {state.funding_source.account_mask ? `··${state.funding_source.account_mask}` : ""} · {state.funding_source.owner_type === "business" ? `Business / ${state.funding_source.ach_class?.toUpperCase() || "classification unavailable"}` : "Consumer / WEB — ineligible"}</span></div><strong>{humanStatus(state.funding_source.status)}</strong></div>}

      {state.funding_source && !businessCcdAccount ? <div className="application-room-alert bad" role="alert"><div><b>This account cannot be authorized.</b><p>This release supports business CCD debits only. An account without an explicit CCD classification and customer business-account attestation is ineligible; consumer/WEB authorization is disabled.</p></div><button className="application-room-primary" type="button" onClick={() => void startConnection("fee")} disabled={!achAuthorizationEnabled || !businessAccountAttested || Boolean(busy)}>Connect business bank</button></div> : null}

      <ClientAchDeliveryStates request={state.authorization_request_delivery} notice={state.debit_notice} terms={terms} />

      {state.funding_source && businessCcdAccount && !mandateActive ? <div className="client-payment-action-card client-ach-authorization">
        <div className="client-payment-stage-heading"><span>3</span><div><h3>Authorize one specific ACH debit</h3><p>This is separate from the Success Fee Agreement. Review every term below before signing.</p></div></div>
        {termsComplete && terms ? <AchDisclosure terms={terms} businessName={authorizationBusinessName} accountMask={state.funding_source.account_mask} feeReferences={feeAgreementReferences} /> : <div className="application-room-alert bad" role="alert"><div><b>The transaction-specific authorization is not ready.</b><p>QC must provide the payer and business identity, masked business CCD account, exact amount, debit date, ET submission window, and revocation cutoff before you can authorize ACH.</p></div></div>}
        <label className="application-room-field"><span>Type the authorized payer&apos;s full legal name</span><input value={payerName} onChange={(event) => setPayerName(event.target.value)} autoComplete="name" /></label>
        <label className="client-payment-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I authorize this single business CCD ACH debit. I reviewed my identity, the exact {money(exactAmount)} amount, connected account, scheduled date and ET window, two-business-day notice, and the revocation method and deadline. I understand no debit occurs until actual funding is verified and authorized QC staff releases it.</span></label>
        <button className="application-room-primary" onClick={() => void authorize()} disabled={!canAuthorize || Boolean(busy)}>{busy === "authorize" ? "Recording authorization…" : `Authorize one-time ${money(exactAmount)} ACH`}</button>
      </div> : null}

      {mandateSigned && state.mandate ? <div className="client-mandate-complete">
        <div className={`application-room-alert ${mandateActive ? "good" : "bad"}`}><div><b>{mandateActive ? "One-time ACH authorization is active." : `Signed authorization retained — ${humanStatus(state.mandate.status)}.`}</b><p>{state.mandate.payer_name} signed for exactly {money(state.mandate.authorized_amount_cents)} on {dateLabel(state.mandate.signed_at)}. {mandateActive ? "Authorization does not mean a debit has started." : "The proof remains available, but this mandate cannot authorize a new debit."}</p><small>Customer copy: {humanStatus(state.mandate.proof_email_status || "pending")}</small></div><div className="client-payment-proof-actions">{state.mandate.certificate_available || state.mandate.artifact ? <button className="application-room-secondary" type="button" onClick={() => void downloadCertificate(state.mandate?.id)} disabled={Boolean(busy)}>{busy === "certificate" ? "Preparing download…" : "Download authorization"}</button> : null}{state.mandate.can_resend_proof !== false ? <button className="application-room-secondary" onClick={() => void resendProof()} disabled={Boolean(busy)}>{busy === "resend-proof" ? "Sending…" : "Email me another copy"}</button> : null}</div></div>
        {state.mandate.artifact ? <ClientProtectedRecord label={state.mandate.artifact.name || "Executed ACH Authorization"} protectedUntil={state.mandate.artifact.protected_until} legalHold={state.mandate.artifact.legal_hold} /> : null}
        {mandateActive && state.mandate.can_revoke !== false && !state.transfer?.submitted_at ? <button className="application-room-secondary danger" onClick={() => void revokeFeeAuthorization()} disabled={Boolean(busy)}>{busy === "revoke-fee" ? "Revoking…" : "Revoke this ACH authorization"}</button> : null}
        <small>Revoke in this secure room or email support@qualifiedcommercial.com before the displayed cutoff. A submitted transfer cannot be recalled.</small>
      </div> : null}
    </> : null}

    {schedule ? <section className="client-private-plan">
      <div><span className="application-room-eyebrow">Private funding</span><h3>Scheduled payments</h3><p>Fixed payments under the private-funding agreement. Variable revenue debits and automatic failed-payment retries are not included.</p></div>
      {!privatePaymentsEnabled ? <div className="application-room-alert"><b>Scheduled-payment processing is currently paused.</b><p>You can review the schedule and revoke an existing future-payment authorization. Connecting a bank, signing a new authorization, repairing a bank connection, and new provider handoffs remain unavailable until QC enables this payment workflow.</p></div> : null}
      <div className="client-private-plan-meta"><span><b>{money(schedule.total_amount_cents)}</b> total</span><span><b>{humanStatus(schedule.cadence)}</b> cadence</span><span><b>{humanStatus(schedule.status)}</b> status</span></div>
      <div className="client-payment-lines">
        <h3>Agreement and payment parties</h3>
        {schedule.creditor_name ? <div><div><b>Creditor</b></div><span>{schedule.creditor_name}</span></div> : null}
        {schedule.payee_name ? <div><div><b>Payment recipient</b></div><span>{schedule.payee_name}</span></div> : null}
        {schedule.settlement_destination_ref ? <div><div><b>Settlement destination</b></div><span>{schedule.settlement_destination_ref}</span></div> : null}
        {schedule.agreement_reference ? <div><div><b>Executed agreement</b></div><span>{schedule.agreement_reference}</span></div> : null}
        {schedule.production_term_sheet_version ? <div><div><b>Production term sheet</b></div><span>Version {schedule.production_term_sheet_version}</span></div> : null}
      </div>
      <div className="client-payment-lines client-private-schedule-lines">
        <div className="client-private-schedule-heading"><b>Complete authorized schedule</b><small>{upcoming.length} future payment{upcoming.length === 1 ? "" : "s"}</small></div>
        {upcoming.map((row) => <div key={row.id}><div><b>Payment {row.sequence}</b><small>{dateLabel(row.due_date)}</small></div><span>{money(row.amount_cents)}</span></div>)}
      </div>
      {scheduleNeedsBankRepair ? <div className="application-room-alert bad" role="alert"><div><b>A scheduled payment needs bank verification.</b><p>No automatic retry has started. Complete the secure Plaid repair to update the affected transfer.</p></div><button className="application-room-primary" type="button" onClick={() => void startConnection("private_schedule")} disabled={!privatePaymentsEnabled || !businessAccountAttested || Boolean(busy)}>{busy === "link" ? "Opening secure repair…" : "Repair bank verification"}</button></div> : null}
      {scheduleHasActionRequired ? <div className="application-room-alert bad" role="alert"><div><b>A scheduled payment needs staff review.</b><p>This is not a bank-repair request, so no new Plaid connection or automatic retry will start. Refresh after QC resolves the funding, authority, term, or servicing issue.</p></div><button className="application-room-secondary" type="button" onClick={() => void refresh()} disabled={Boolean(busy)}>{busy ? "Refreshing…" : "Refresh status"}</button></div> : null}
      {!businessCcdAccount && !scheduleMandateActive ? <div className="client-payment-action-card">
        <div><h3>1. Connect a business payment account</h3><p>Fixed private-funding schedules require a dedicated business checking account and CCD authorization.</p></div>
        <button className="application-room-primary" onClick={() => void startConnection("private_schedule")} disabled={!privatePaymentsEnabled || !businessAccountAttested || Boolean(busy)}>{busy === "link" ? "Starting secure connection…" : "Connect business bank"}</button>
      </div> : null}
      {businessCcdAccount && !scheduleMandateActive ? <div className="client-payment-action-card">
        <div><h3>2. Authorize this fixed schedule</h3><p>I authorize only the dated installments shown above, totaling <b>{money(schedule.total_amount_cents)}</b>{schedule.creditor_name ? <> for <b>{schedule.creditor_name}</b></> : null}. There are no percentage-of-revenue debits, automatic late fees, or automatic retries.</p>{schedule.agreement_reference ? <p>Executed agreement reference: <b>{schedule.agreement_reference}</b></p> : null}</div>
        <label className="application-room-field"><span>Type the authorized payer&apos;s full legal name</span><input value={payerName} onChange={(event) => setPayerName(event.target.value)} autoComplete="name" /></label>
        <label className="client-payment-confirm"><input type="checkbox" checked={scheduleConfirmed} onChange={(event) => setScheduleConfirmed(event.target.checked)} /><span>I reviewed the fixed schedule, connected business account, and future-payment revocation terms.</span></label>
        <button className="application-room-primary" onClick={() => void authorizeSchedule()} disabled={!privatePaymentsEnabled || !payerName.trim() || !scheduleConfirmed || Boolean(busy)}>{busy === "schedule-authorize" ? "Recording authorization…" : `Authorize fixed schedule up to ${money(schedule.total_amount_cents)}`}</button>
      </div> : null}
      {scheduleMandateActive && schedule.mandate ? <div className="application-room-alert good"><div><b>Standing CCD authorization recorded.</b><p>{schedule.mandate.payer_name} authorized the exact fixed schedule on {dateLabel(schedule.mandate.signed_at)}. QC staff must still activate it after verifying funding and authority.</p></div>{schedule.mandate.certificate_available ? <button className="application-room-secondary" onClick={() => void downloadCertificate(schedule.mandate?.id)} disabled={Boolean(busy)}>Download schedule certificate</button> : null}</div> : null}
      {schedule.can_revoke_future_authorization ? <button className="application-room-secondary danger" onClick={() => void revokeFutureSchedule()} disabled={Boolean(busy)}>Revoke future scheduled-payment authorization</button> : null}
      <small>Revocation stops future unclaimed installments. It cannot recall a transfer already submitted.</small>
    </section> : null}
  </section>;
}

function ClientAchDeliveryStates({
  request,
  notice,
  terms,
}: {
  request: ClientPaymentState["authorization_request_delivery"];
  notice: ClientPaymentState["debit_notice"];
  terms: ClientAuthorizationTerms | null;
}) {
  return <div className="client-ach-delivery-states" aria-label="ACH message delivery status">
    <section>
      <span>Step 1 · signing invitation</span>
      <div><b>Authorization request</b><strong>{humanStatus(request?.status || "not sent")}</strong></div>
      <p>This opens the secure signing flow. It is not the notice that QC is ready to release a debit.</p>
      <small>{request?.delivered_at ? `Delivered ${dateTimeLabel(request.delivered_at)}` : request?.sent_at ? `Sent ${dateTimeLabel(request.sent_at)}` : "No signing invitation has been sent."}</small>
    </section>
    <section>
      <span>Step 2 · after signature</span>
      <div><b>Exact debit notice</b><strong>{humanStatus(notice?.status || "not created")}</strong></div>
      <p>This separate message confirms the exact amount, date/window, account, and revocation cutoff. Delivery is required before release.</p>
      {notice && terms ? <div className="client-ach-delivery-facts"><span><b>{money(terms.amount_cents)}</b> exact debit</span><span><b>{dateTimeLabel(terms.scheduled_debit_at)}</b> · {humanStatus(terms.submission_window)}</span><span>Revoke by <b>{dateTimeLabel(terms.revocation_cutoff_at)}</b></span></div> : null}
      <small>{notice?.failed_reason || (notice?.delivered_at ? `Delivered ${dateTimeLabel(notice.delivered_at)}` : notice?.sent_at ? `Sent ${dateTimeLabel(notice.sent_at)} · delivery confirmation pending` : "Created only after account linkage and signature.")}</small>
    </section>
  </div>;
}

function AchDisclosure({ terms, businessName, accountMask, feeReferences }: { terms: ClientAuthorizationTerms; businessName: string; accountMask?: string | null; feeReferences: string[] }) {
  return <section className="client-ach-disclosure" aria-labelledby="ach-disclosure-title">
    <header><span>Required authorization disclosure</span><h4 id="ach-disclosure-title">One-time business ACH debit</h4><p>Read every item. These exact terms are included in your signed authorization and retained proof.</p></header>
    <div className="client-ach-disclosure-grid">
      <div><span>Transaction type</span><strong>Single, one-time ACH debit</strong><small>CCD business-account classification</small></div>
      <div><span>Originator</span><strong>{terms.originator_name || "Qualified Commercial LLC"}</strong><small>Company initiating the ACH</small></div>
      <div><span>Payer / business</span><strong>{terms.customer_name}</strong><small>{businessName}</small></div>
      <div><span>Exact amount</span><strong>{money(terms.amount_cents)}</strong><small>No variable or recurring amount</small></div>
      <div><span>Business bank account</span><strong>{accountMask ? `Account ending ${accountMask}` : "Connected account"}</strong><small>Only the connected business account</small></div>
      <div><span>Debit timing</span><strong>{dateTimeLabel(terms.scheduled_debit_at)}</strong><small>{humanStatus(terms.submission_window)} · America/New_York</small></div>
      <div><span>Advance notice</span><strong>{terms.advance_notice_business_days} business days</strong><small>Exact debit notice is sent before release</small></div>
      <div><span>Revocation deadline</span><strong>{dateTimeLabel(terms.revocation_cutoff_at)}</strong><small>5:00 PM ET one business day before debit</small></div>
    </div>
    {terms.authorization_text ? <div className="client-ach-authorization-text"><span>Exact authorization language · version {terms.terms_version}</span><p>{terms.authorization_text}</p></div> : null}
    <div className="client-ach-revocation"><Icon name="alert" size={18} /><div><b>How to revoke</b><p>Use <b>Revoke this ACH authorization</b> in this secure room or email <a href={`mailto:${terms.revocation_email}`}>{terms.revocation_email}</a> before the deadline above. A transfer already submitted to the banking network cannot be recalled.</p></div></div>
    <div className="client-ach-funding-gate"><Icon name="lock" size={18} /><div><b>No automatic debit at estimated closing</b><p>Qualified Commercial cannot submit this debit until actual funding is verified and authorized staff explicitly releases this exact transaction.</p>{feeReferences.length ? <small>Governing agreement: {feeReferences.join(", ")}</small> : null}</div></div>
  </section>;
}

function ClientProtectedRecord({ label, protectedUntil, legalHold }: { label: string; protectedUntil?: string | null; legalHold?: boolean }) {
  return <div className="client-protected-record"><Icon name="lock" size={16} /><div><b>{label}</b><span>{legalHold ? "Protected under legal hold" : protectedUntil ? `Protected through ${dateLabel(protectedUntil)}` : "Protected retention record"}</span><small>This executed record is stored with the application and remains available upon request.</small></div></div>;
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
}

function dateTimeLabel(value?: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" });
}

function dollars(value: string | number) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount)
    : String(value);
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function humanStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function transferStatusTone(status?: string) {
  if (status === "funds_available") return "good";
  if (["returned", "failed", "action_required"].includes(status || "")) return "bad";
  return "";
}
