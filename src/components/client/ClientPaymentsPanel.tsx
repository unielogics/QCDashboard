"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { Icon } from "@/components/design-system/Icon";
import { apiBase } from "@/lib/api";
import { clearRoomHandoff, stashPaymentRoomHandoff } from "@/lib/roomPlaidHandoff";

type FeeLine = {
  id: string;
  label: string;
  amount_cents: number;
  collection_amount_cents: number;
  agreement_reference?: string | null;
};

type ClientPaymentState = {
  available: boolean;
  payments_enabled: boolean;
  private_funding_payments_enabled?: boolean;
  business_name?: string | null;
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
    institution_name?: string | null;
    account_name?: string | null;
    account_mask?: string | null;
  } | null;
  mandate?: {
    id: string;
    status: string;
    current?: boolean;
    ach_class: "ccd" | "web";
    authorized_amount_cents: number;
    payer_name: string;
    signed_at?: string | null;
    certificate_available?: boolean;
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
};

export function ClientPaymentsPanel({ token, passcode, defaultPayerName }: ClientPaymentsPanelProps) {
  const basePath = `${apiBase}/api/v1/application-profiles/public/room/${token}/payments`;
  const [state, setState] = useState<ClientPaymentState | null>(null);
  const [ownerType, setOwnerType] = useState<"business" | "consumer">("business");
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
      if (next.funding_source?.owner_type) setOwnerType(next.funding_source.owner_type);
      if (next.mandate?.payer_name) setPayerName(next.mandate.payer_name);
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
        await post("/exchange", { public_token: publicToken, plaid_account_id: accountId, owner_type: linkOwnerType, purpose: linkPurpose });
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
  const mandateActive = state?.mandate?.status === "signed" && state.mandate.current !== false;
  const canAuthorize = Boolean(state?.payments_enabled && state.funding_source && state.obligation && payerName.trim() && confirmed && !mandateActive);
  const transferTone = transferStatusTone(state?.transfer?.status);
  const transferNeedsBankRepair = state?.transfer?.status === "action_required";
  const feeAgreementReferences = useMemo(
    () => Array.from(new Set(
      state?.obligation?.lines
        .map((line) => line.agreement_reference?.trim())
        .filter((reference): reference is string => Boolean(reference)) ?? [],
    )),
    [state?.obligation?.lines],
  );
  const schedule = state?.private_plan;
  const privatePaymentsEnabled = Boolean(state?.payments_enabled && state?.private_funding_payments_enabled);
  const scheduleMandateActive = schedule?.mandate?.status === "signed" && schedule.mandate.current !== false;
  const scheduleNeedsBankRepair = Boolean(schedule?.transfer?.repair_needed);
  const scheduleHasActionRequired = !scheduleNeedsBankRepair && (schedule?.installments.some((row) => row.status === "action_required") ?? false);
  const upcoming = useMemo(
    () => schedule?.installments.filter((row) => !["completed", "cancelled"].includes(row.status)) ?? [],
    [schedule],
  );

  async function startConnection(purpose: "fee" | "private_schedule") {
    setBusy("link"); setError(null);
    try {
      const effectiveOwnerType = purpose === "private_schedule" ? "business" : ownerType;
      const result = await post<{ link_token: string; repair_mode?: boolean; exchange_required?: boolean; transfer_id?: string | null }>("/link-token", { owner_type: effectiveOwnerType, purpose });
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
    if (!privatePaymentsEnabled || !schedule || !state?.funding_source || !payerName.trim() || !scheduleConfirmed) return;
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
        consent: true,
      });
      setConfirmed(false);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Authorization could not be recorded.");
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
      <div><span className="application-room-eyebrow">Secure payments</span><h2>Fees and ACH authorization</h2><p>{state?.business_name ? <>This request is for <b>{state.business_name}</b>. </> : null}Review exactly what is authorized. Qualified Commercial cannot debit the account until funding is confirmed and authorized staff releases the collection.</p></div>
      <button className="application-room-secondary" onClick={() => void refresh()} disabled={Boolean(busy)}><Icon name="refresh" size={14} />Refresh</button>
    </div>

    {error ? <div className="application-room-alert bad" role="alert" aria-live="assertive">{error}</div> : null}
    {!state?.available || !state.obligation ? <div className="application-room-empty"><b>No fee-payment request is waiting.</b><p>Your application and document room remain available.</p></div> : <>
      <div className="client-payments-summary">
        <div><span>Authorized ACH maximum</span><strong>{money(exactAmount)}</strong><small>No automatic debit at estimated closing</small></div>
        <div><span>Funding confirmation</span><strong>{state.funding_confirmation ? "Confirmed" : "Not yet confirmed"}</strong><small>{state.funding_confirmation ? `${state.funding_confirmation.funding_party_name} · ${dateLabel(state.funding_confirmation.actual_funding_date)} · ${dollars(state.funding_confirmation.actual_funded_amount)} funded` : "The desk must verify actual funding"}</small></div>
        <div><span>Collection status</span><strong className={transferTone}>{humanStatus(state.transfer?.status || state.obligation.status)}</strong><small>{state.transfer?.funds_available_at ? `Funds available ${dateLabel(state.transfer.funds_available_at)}` : "Authorization is not the same as collection"}</small></div>
        <div><span>Collected</span><strong>{money(state.obligation.collected_cents)}</strong><small>{money(state.obligation.outstanding_cents)} remains on this ACH request</small></div>
      </div>

      {transferNeedsBankRepair ? <div className="application-room-alert bad" role="alert">
        <div><b>Bank verification is required before this payment can continue.</b><p>No new debit or automatic retry has been started. Complete the secure Plaid repair, then this page will refresh the authoritative transfer status.</p></div>
        {state.transfer?.repair_needed ? <button className="application-room-primary" type="button" onClick={() => void startConnection("fee")} disabled={!state.payments_enabled || Boolean(busy)}>{busy === "link" ? "Opening secure repair…" : "Repair bank verification"}</button> : <button className="application-room-secondary" type="button" onClick={() => void refresh()} disabled={Boolean(busy)}>{busy ? "Refreshing…" : "Refresh status"}</button>}
      </div> : null}

      <div className="client-payment-lines">
        <h3>Your fee authorization</h3>
        {state.obligation.lines.map((line) => <div key={line.id}><div><b>{line.label}</b><small>{money(line.amount_cents)} fee{line.collection_amount_cents !== line.amount_cents ? ` · ${money(line.collection_amount_cents)} allocated to client ACH` : " · fully allocated to client ACH"}</small>{line.agreement_reference ? <small>Signed agreement reference: {line.agreement_reference}</small> : null}</div><span>{money(line.collection_amount_cents)}</span></div>)}
        <div className="total"><b>Maximum ACH authorization</b><strong>{money(exactAmount)}</strong></div>
      </div>

      {!state.funding_source ? <div className="client-payment-action-card">
        <div><h3>1. Connect the payment account</h3><p>This is a dedicated payment connection. It is separate from bank statements or other underwriting evidence.</p></div>
        <div className="client-payment-owner" role="radiogroup" aria-label="Account ownership">
          <button type="button" role="radio" aria-checked={ownerType === "business"} className={ownerType === "business" ? "on" : ""} onClick={() => setOwnerType("business")}><b>Business account</b><span>ACH is classified as CCD</span></button>
          <button type="button" role="radio" aria-checked={ownerType === "consumer"} className={ownerType === "consumer" ? "on" : ""} onClick={() => setOwnerType("consumer")}><b>Consumer account</b><span>ACH is classified as WEB</span></button>
        </div>
        <button className="application-room-primary" onClick={() => void startConnection("fee")} disabled={!state.payments_enabled || Boolean(busy)}>{busy === "link" ? "Starting secure connection…" : "Connect bank securely"}</button>
        {!state.payments_enabled ? <small>Online authorization is not open yet. Your account will not be debited.</small> : null}
      </div> : <div className="client-payment-account"><Icon name="building" size={19} /><div><b>{state.funding_source.institution_name || "Connected bank"}</b><span>{state.funding_source.account_name || "Account"} {state.funding_source.account_mask ? `··${state.funding_source.account_mask}` : ""} · {state.funding_source.owner_type === "business" ? "Business / CCD" : "Consumer / WEB"}</span></div><strong>{humanStatus(state.funding_source.status)}</strong></div>}

      {state.funding_source && !mandateActive ? <div className="client-payment-action-card">
        <div><h3>2. Sign the ACH authorization</h3><p>I authorize Qualified Commercial to debit the connected {state.funding_source.owner_type} account up to <b>{money(exactAmount)}</b>{state.business_name ? <> for <b>{state.business_name}</b></> : null} for only the fee lines shown above. I understand no debit occurs until the related transaction is actually funded and QC staff releases it.</p>{feeAgreementReferences.length ? <p>Signed agreement reference{feeAgreementReferences.length === 1 ? "" : "s"}: <b>{feeAgreementReferences.join(", ")}</b></p> : null}</div>
        <label className="application-room-field"><span>Type the authorized payer&apos;s full legal name</span><input value={payerName} onChange={(event) => setPayerName(event.target.value)} autoComplete="name" /></label>
        <label className="client-payment-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed the business identity, exact fee lines, agreement reference, maximum amount, connected account, and funding-before-debit condition.</span></label>
        <button className="application-room-primary" onClick={() => void authorize()} disabled={!canAuthorize || Boolean(busy)}>{busy === "authorize" ? "Recording authorization…" : `Authorize up to ${money(exactAmount)}`}</button>
      </div> : null}

      {mandateActive && state.mandate ? <div className="application-room-alert good"><div><b>ACH authorization recorded.</b><p>{state.mandate.payer_name} authorized up to {money(state.mandate.authorized_amount_cents)} on {dateLabel(state.mandate.signed_at)}. This does not mean a debit has started.</p></div>{state.mandate.certificate_available ? <button className="application-room-secondary" onClick={() => void downloadCertificate(state.mandate?.id)} disabled={Boolean(busy)}>Download certificate</button> : null}</div> : null}
    </>}

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
      {scheduleNeedsBankRepair ? <div className="application-room-alert bad" role="alert"><div><b>A scheduled payment needs bank verification.</b><p>No automatic retry has started. Complete the secure Plaid repair to update the affected transfer.</p></div><button className="application-room-primary" type="button" onClick={() => void startConnection("private_schedule")} disabled={!privatePaymentsEnabled || Boolean(busy)}>{busy === "link" ? "Opening secure repair…" : "Repair bank verification"}</button></div> : null}
      {scheduleHasActionRequired ? <div className="application-room-alert bad" role="alert"><div><b>A scheduled payment needs staff review.</b><p>This is not a bank-repair request, so no new Plaid connection or automatic retry will start. Refresh after QC resolves the funding, authority, term, or servicing issue.</p></div><button className="application-room-secondary" type="button" onClick={() => void refresh()} disabled={Boolean(busy)}>{busy ? "Refreshing…" : "Refresh status"}</button></div> : null}
      {(!state?.funding_source || state.funding_source.owner_type !== "business") && !scheduleMandateActive ? <div className="client-payment-action-card">
        <div><h3>1. Connect a business payment account</h3><p>Fixed private-funding schedules require a dedicated business checking account and CCD authorization.</p></div>
        <button className="application-room-primary" onClick={() => void startConnection("private_schedule")} disabled={!privatePaymentsEnabled || Boolean(busy)}>{busy === "link" ? "Starting secure connection…" : "Connect business bank"}</button>
      </div> : null}
      {state?.funding_source?.owner_type === "business" && !scheduleMandateActive ? <div className="client-payment-action-card">
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

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
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
