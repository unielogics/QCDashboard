"use client";

import { useCallback, useEffect, useState } from "react";
import { Btn, Callout, CellChip, Field, IconBtn, Input, Select, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import { apiBase } from "@/lib/api";
import { useConsoleAuth, visualQaUser } from "@/lib/consoleAuth";
import { useActiveProfile } from "@/store/role";

type DeliveryItem = {
  id: string;
  kind: "merchant_offer" | "production_term_sheet" | "application_term_sheet" | "evidence_file";
  label: string;
  title: string;
  file_name: string;
  content_type: string;
  status: string;
  decision_status: string;
  expires_at?: string | null;
  responded_at?: string | null;
  responded_name?: string | null;
};

type Delivery = {
  id: string;
  subject: string;
  status: string;
  sent_at?: string | null;
  expires_at?: string | null;
  recipient_emails: string[];
  items: DeliveryItem[];
};

type ManualTarget = { delivery: Delivery; item: DeliveryItem };

type ReconciliationRecord = {
  delivery_id: string;
  status: string;
  provider_correlation_id: string;
  provider?: string | null;
  provider_message_id?: string | null;
  sent_at?: string | null;
  reconciled_at?: string | null;
  reconciliation_outcome?: string | null;
};

function when(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function localDateTimeValue(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function statusTone(value: string): "ok" | "bad" | "warn" | "mut" {
  if (["accepted", "completed", "sent"].includes(value)) return "ok";
  if (["declined", "failed"].includes(value)) return "bad";
  if (["expired", "superseded", "partially_decided"].includes(value)) return "warn";
  return "mut";
}

export function OfferDeliveryHistory({ profileId, refreshKey = "" }: { profileId: string; refreshKey?: string }) {
  const api = useAuthedApi();
  const { getToken, isSignedIn } = useConsoleAuth();
  const devUser = visualQaUser(useActiveProfile().email);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [manual, setManual] = useState<ManualTarget | null>(null);
  const [response, setResponse] = useState<"accepted" | "declined">("accepted");
  const [channel, setChannel] = useState<"email" | "phone">("email");
  const [responderName, setResponderName] = useState("");
  const [receivedAt, setReceivedAt] = useState(() => localDateTimeValue());
  const [reason, setReason] = useState("");
  const [attested, setAttested] = useState(false);
  const [reconcileDelivery, setReconcileDelivery] = useState<Delivery | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationRecord | null>(null);
  const [reconciliationOutcome, setReconciliationOutcome] = useState<"provider_accepted" | "confirmed_not_sent">("provider_accepted");
  const [reconciliationProvider, setReconciliationProvider] = useState<"gmail" | "ses">("gmail");
  const [providerMessageId, setProviderMessageId] = useState("");
  const [providerAcceptedAt, setProviderAcceptedAt] = useState(() => localDateTimeValue());
  const [reconciliationAttestation, setReconciliationAttestation] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ deliveries: Delivery[] }>(`/application-profiles/${profileId}/offer-deliveries`, { cache: "no-store" });
      setDeliveries(result.deliveries ?? []);
    } catch (reason_) {
      setError(reason_ instanceof Error ? reason_.message : "Offer delivery history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [api, profileId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  function openManual(delivery: Delivery, item: DeliveryItem) {
    setManual({ delivery, item });
    setResponse("accepted");
    setChannel("email");
    setResponderName("");
    setReceivedAt(localDateTimeValue());
    setReason("");
    setAttested(false);
    setError("");
  }

  async function download(delivery: Delivery, item: DeliveryItem) {
    setBusy(`download:${item.id}`);
    setError("");
    try {
      const token = isSignedIn ? await getToken() : null;
      const result = await fetch(`${apiBase}/api/v1/application-profiles/${profileId}/offer-deliveries/${delivery.id}/items/${item.id}/document?disposition=attachment`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(!token && devUser ? { "X-Dev-User": devUser } : {}),
        },
      });
      if (!result.ok) throw new Error("The immutable sent document could not be downloaded.");
      const url = URL.createObjectURL(await result.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = item.file_name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (reason_) {
      setError(reason_ instanceof Error ? reason_.message : "The immutable sent document could not be downloaded.");
    } finally {
      setBusy("");
    }
  }

  async function recordManualResponse() {
    if (!manual || !responderName.trim() || !receivedAt || !attested) return;
    setBusy(`manual:${manual.item.id}`);
    setError("");
    try {
      await api(`/application-profiles/${profileId}/offer-deliveries/${manual.delivery.id}/items/${manual.item.id}/manual-response`, {
        method: "POST",
        body: JSON.stringify({
          response,
          responder_name: responderName.trim(),
          channel,
          received_at: new Date(receivedAt).toISOString(),
          attestation: `I attest that ${responderName.trim()} communicated this ${response} response by ${channel}.`,
          reason: response === "declined" ? reason.trim() || null : null,
        }),
      });
      setManual(null);
      await load();
    } catch (reason_) {
      setError(reason_ instanceof Error ? reason_.message : "The client response could not be recorded.");
    } finally {
      setBusy("");
    }
  }

  async function openReconciliation(delivery: Delivery) {
    setReconcileDelivery(delivery);
    setReconciliation(null);
    setReconciliationOutcome("provider_accepted");
    setReconciliationProvider("gmail");
    setProviderMessageId("");
    setProviderAcceptedAt(localDateTimeValue());
    setReconciliationAttestation("");
    setError("");
    setBusy(`reconciliation-read:${delivery.id}`);
    try {
      const result = await api<ReconciliationRecord>(`/application-profiles/${profileId}/offer-deliveries/${delivery.id}/reconciliation`, { cache: "no-store" });
      setReconciliation(result);
      if (result.provider === "gmail" || result.provider === "ses") setReconciliationProvider(result.provider);
      setProviderMessageId(result.provider_message_id || "");
      if (result.sent_at) setProviderAcceptedAt(localDateTimeValue(new Date(result.sent_at)));
    } catch (reason_) {
      setError(reason_ instanceof Error ? reason_.message : "Delivery reconciliation details could not be loaded.");
    } finally {
      setBusy("");
    }
  }

  async function submitReconciliation() {
    if (!reconcileDelivery || !reconciliation || reconciliationAttestation.trim().length < 20) return;
    if (reconciliationOutcome === "provider_accepted" && (!providerMessageId.trim() || !providerAcceptedAt)) return;
    setBusy(`reconcile:${reconcileDelivery.id}`);
    setError("");
    try {
      await api(`/application-profiles/${profileId}/offer-deliveries/${reconcileDelivery.id}/reconciliation`, {
        method: "POST",
        body: JSON.stringify({
          outcome: reconciliationOutcome,
          provider: reconciliationOutcome === "provider_accepted" ? reconciliationProvider : null,
          provider_message_id: reconciliationOutcome === "provider_accepted" ? providerMessageId.trim() : null,
          accepted_at: reconciliationOutcome === "provider_accepted" ? new Date(providerAcceptedAt).toISOString() : null,
          attestation: reconciliationAttestation.trim(),
        }),
      });
      setReconcileDelivery(null);
      setReconciliation(null);
      await load();
    } catch (reason_) {
      setError(reason_ instanceof Error ? reason_.message : "The delivery outcome could not be reconciled.");
    } finally {
      setBusy("");
    }
  }

  return <>
    <details className="offer-delivery-history">
      <summary><span><Icon name="audit" size={14} /><b>Client offer delivery history</b><small>{loading ? "Loading…" : `${deliveries.length} package${deliveries.length === 1 ? "" : "s"}`}</small></span><Icon name="chevD" size={14} /></summary>
      <div className="offer-delivery-history-body">
        {error ? <Callout tone="bad"><span role="alert">{error}</span></Callout> : null}
        {!loading && !deliveries.length ? <div className="empty">No client offer packages have been sent from this file.</div> : null}
        {deliveries.map((delivery) => <article key={delivery.id} className="offer-delivery-history-card">
          <header><div><b>{delivery.subject}</b><small>{delivery.sent_at ? `Sent ${when(delivery.sent_at)} to ${delivery.recipient_emails.join(", ")}` : "Not published to the client"}</small></div><CellChip tone={statusTone(delivery.status)}>{delivery.status.replace(/_/g, " ")}</CellChip>{delivery.status === "sending" ? <IconBtn onClick={() => void openReconciliation(delivery)} disabled={busy !== ""} aria-label="Resolve uncertain provider handoff" title="Verify delivery with Gmail or SES"><Icon name="audit" size={14} /></IconBtn> : null}</header>
          <div>{delivery.items.map((item) => {
            const decision = item.decision_status || item.status;
            const canRecord = item.kind !== "evidence_file" && ["pending", "expired"].includes(decision) && !["sending", "failed"].includes(delivery.status);
            return <div key={item.id} className="offer-delivery-history-item"><span className="offer-delivery-document-icon"><Icon name={item.kind === "merchant_offer" ? "dollar" : "file"} size={15} /></span><span><b>{item.label}</b><small>{item.file_name}{item.expires_at ? ` · deadline ${when(item.expires_at)}` : ""}{item.responded_at ? ` · ${when(item.responded_at)} by ${item.responded_name || "client"}` : ""}</small></span><CellChip tone={statusTone(decision)}>{decision.replace(/_/g, " ")}</CellChip><IconBtn onClick={() => void download(delivery, item)} disabled={busy !== ""} aria-label={`Download sent copy of ${item.label}`} title="Download exact sent copy"><Icon name="download" size={14} /></IconBtn>{canRecord ? <IconBtn onClick={() => openManual(delivery, item)} disabled={busy !== ""} aria-label={`Record client response for ${item.label}`} title="Record email or phone response"><Icon name="pencil" size={14} /></IconBtn> : null}</div>;
          })}</div>
        </article>)}
      </div>
    </details>

    <Drawer open={Boolean(manual)} onClose={() => { if (!busy.startsWith("manual:")) setManual(null); }} closeOnBackdrop={!busy.startsWith("manual:")} width="md" title="Record client response" sub={manual ? `${manual.item.label} · exact sent version` : undefined} footer={<><Btn onClick={() => setManual(null)} disabled={busy.startsWith("manual:")}>Cancel</Btn><span className="sp" /><Btn variant="pri" onClick={() => void recordManualResponse()} disabled={busy.startsWith("manual:") || !responderName.trim() || !receivedAt || !attested}>{busy.startsWith("manual:") ? "Recording…" : "Record response"}</Btn></>}>
      {manual ? <div className="grid g12">
        {manual.item.decision_status === "expired" ? <Callout tone="warn">Only record this after expiry when the client&apos;s actual email or phone response was received before {when(manual.item.expires_at)}.</Callout> : null}
        {error ? <Callout tone="bad"><span role="alert">{error}</span></Callout> : null}
        <div className="fldgrid two"><Field label="Response"><Select value={response} onChange={(event) => setResponse(event.target.value as "accepted" | "declined")}><option value="accepted">Accepted</option><option value="declined">Declined</option></Select></Field><Field label="Channel"><Select value={channel} onChange={(event) => setChannel(event.target.value as "email" | "phone")}><option value="email">Email</option><option value="phone">Phone</option></Select></Field></div>
        <Field label="Responder"><Input value={responderName} onChange={(event) => setResponderName(event.target.value)} placeholder="Client's full name" /></Field>
        <Field label="Received at" hint="Use the time the client actually responded, not the time you entered it."><Input type="datetime-local" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} /></Field>
        {response === "declined" ? <Field label="Reason (optional)"><Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></Field> : null}
        <label className="offer-delivery-attestation"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} /><span>I attest that this accurately records the named client&apos;s response and the time it was received.</span></label>
      </div> : null}
    </Drawer>

    <Drawer open={Boolean(reconcileDelivery)} onClose={() => { if (!busy.startsWith("reconcile:")) setReconcileDelivery(null); }} closeOnBackdrop={!busy.startsWith("reconcile:")} width="md" title="Resolve delivery handoff" sub="Exceptional recovery for a provider result that was not recorded" footer={<><Btn onClick={() => setReconcileDelivery(null)} disabled={busy.startsWith("reconcile:")}>Cancel</Btn><span className="sp" /><Btn variant="pri" onClick={() => void submitReconciliation()} disabled={busy !== "" || !reconciliation || reconciliationAttestation.trim().length < 20 || (reconciliationOutcome === "provider_accepted" && (!providerMessageId.trim() || !providerAcceptedAt))}>{busy.startsWith("reconcile:") ? "Recording…" : "Record verified outcome"}</Btn></>}>
      {reconcileDelivery ? <div className="grid g12">
        <Callout tone="warn"><b>Verify the provider before continuing.</b> Use this only after the delivery has remained pending for at least 30 minutes. Search the sending mailbox or SES event record using the correlation value below. An incorrect “not sent” confirmation can email the client twice.</Callout>
        {error ? <Callout tone="bad"><span role="alert">{error}</span></Callout> : null}
        {busy.startsWith("reconciliation-read:") ? <div className="empty"><span className="spinner solo" />Loading correlation…</div> : null}
        {reconciliation ? <>
          <Field label="QC correlation" hint="Match this exact value in the provider record."><Input value={reconciliation.provider_correlation_id} readOnly /></Field>
          <Field label="Verified outcome"><Select value={reconciliationOutcome} onChange={(event) => setReconciliationOutcome(event.target.value as "provider_accepted" | "confirmed_not_sent")}><option value="provider_accepted">Provider accepted the email</option><option value="confirmed_not_sent">Provider did not send the email</option></Select></Field>
          {reconciliationOutcome === "provider_accepted" ? <div className="fldgrid two"><Field label="Provider"><Select value={reconciliationProvider} onChange={(event) => setReconciliationProvider(event.target.value as "gmail" | "ses")}><option value="gmail">Gmail</option><option value="ses">Amazon SES</option></Select></Field><Field label="Provider message ID"><Input value={providerMessageId} onChange={(event) => setProviderMessageId(event.target.value)} placeholder="Verified provider result ID" /></Field><Field label="Provider accepted at"><Input type="datetime-local" value={providerAcceptedAt} onChange={(event) => setProviderAcceptedAt(event.target.value)} /></Field></div> : null}
          <Field label="Audit attestation" hint="State what record you checked and why this outcome is accurate."><Textarea rows={4} value={reconciliationAttestation} onChange={(event) => setReconciliationAttestation(event.target.value)} placeholder="I verified the sending mailbox/provider event using the QC correlation…" /></Field>
        </> : null}
      </div> : null}
    </Drawer>
  </>;
}
