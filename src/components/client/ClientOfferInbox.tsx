"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import { apiBase } from "@/lib/api";
import { useConsoleAuth, visualQaUser } from "@/lib/consoleAuth";
import { useActiveProfile } from "@/store/role";

export type ClientOfferItem = {
  id: string;
  kind: "merchant_offer" | "production_term_sheet" | "application_term_sheet" | "evidence_file" | string;
  title?: string | null;
  label?: string | null;
  file_name: string;
  content_type?: string | null;
  size_bytes?: number | null;
  decision_status?: string | null;
  status?: string | null;
  responded_at?: string | null;
  responded_name?: string | null;
  response_label?: string | null;
  expires_at?: string | null;
  is_expired?: boolean;
};

export type ClientOfferDelivery = {
  id: string;
  subject: string;
  body: string;
  status: string;
  sent_at: string | null;
  expires_at: string | null;
  is_expired?: boolean;
  items: ClientOfferItem[];
};

type Props =
  | { mode: "room"; token: string; passcode: string; defaultResponderName?: string; embedded?: boolean; focusDeliveryId?: string | null; focusItemId?: string | null }
  | { mode: "account"; token?: never; passcode?: never; defaultResponderName?: string; embedded?: boolean; focusDeliveryId?: string | null; focusItemId?: string | null };

type PendingResponse = { item: ClientOfferItem; response: "accepted" | "declined" };

function unpack(payload: unknown): ClientOfferDelivery[] {
  if (Array.isArray(payload)) return payload as ClientOfferDelivery[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { deliveries?: unknown }).deliveries)) {
    return (payload as { deliveries: ClientOfferDelivery[] }).deliveries;
  }
  return [];
}

function when(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

function bytes(value: number | null | undefined): string {
  if (!value) return "PDF";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function itemName(item: ClientOfferItem): string {
  if (item.title || item.label) return String(item.title || item.label);
  if (item.kind === "merchant_offer") return "Merchant processing offer";
  if (item.kind === "evidence_file") return "Supporting document";
  return "Loan terms";
}

function effectiveStatus(item: ClientOfferItem, delivery: ClientOfferDelivery): string {
  const status = item.decision_status || item.status || "pending";
  const deadline = item.expires_at || delivery.expires_at;
  if (status === "pending" && (item.is_expired || Boolean(deadline && new Date(deadline).getTime() <= Date.now()))) return "expired";
  return status;
}

function tone(status: string): string {
  if (status === "accepted" || status === "completed") return "good";
  if (status === "declined" || status === "failed") return "bad";
  if (status === "expired" || status === "superseded") return "expired";
  return "pending";
}

async function errorText(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { detail?: string | { message?: string } };
    if (typeof body.detail === "string") return body.detail;
    if (body.detail && typeof body.detail === "object" && body.detail.message) return body.detail.message;
  } catch { /* use the safe fallback */ }
  return fallback;
}

export function ClientOfferInbox(props: Props) {
  const api = useAuthedApi();
  const { getToken, isSignedIn } = useConsoleAuth();
  const devUser = visualQaUser(useActiveProfile().email);
  const mode = props.mode;
  const roomToken = props.mode === "room" ? props.token : "";
  const roomPasscode = props.mode === "room" ? props.passcode : "";
  const defaultResponderName = props.defaultResponderName || "";
  const focusDeliveryId = props.focusDeliveryId || "";
  const focusItemId = props.focusItemId || "";
  const [deliveries, setDeliveries] = useState<ClientOfferDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingResponse | null>(null);
  const [responderName, setResponderName] = useState(defaultResponderName);
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState("");

  useEffect(() => setResponderName((current) => current || defaultResponderName), [defaultResponderName]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = mode === "room"
        ? await fetch(`${apiBase}/api/v1/application-profiles/public/room/${encodeURIComponent(roomToken)}/offer-deliveries`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passcode: roomPasscode }),
        }).then(async (response) => {
          if (!response.ok) throw new Error(await errorText(response, "The offer inbox could not be opened."));
          return response.json();
        })
        : await api<unknown>("/application-profiles/client/offer-deliveries", { cache: "no-store" });
      setDeliveries(unpack(payload));
    } catch (reason_) {
      setError(reason_ instanceof Error ? reason_.message : "The offer inbox could not be opened.");
    } finally {
      setLoading(false);
    }
  }, [api, mode, roomPasscode, roomToken]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (loading || (!focusItemId && !focusDeliveryId)) return;
    const target = document.getElementById(focusItemId ? `client-offer-item-${focusItemId}` : `client-offer-delivery-${focusDeliveryId}`);
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.focus({ preventScroll: true });
  }, [deliveries, focusDeliveryId, focusItemId, loading]);

  const pendingDelivery = useMemo(
    () => pending ? deliveries.find((delivery) => delivery.items.some((item) => item.id === pending.item.id)) ?? null : null,
    [deliveries, pending],
  );

  async function download(delivery: ClientOfferDelivery, item: ClientOfferItem) {
    setBusy(`download:${item.id}`);
    setError("");
    try {
      const url = mode === "room"
        ? `${apiBase}/api/v1/application-profiles/public/room/${encodeURIComponent(roomToken)}/offer-deliveries/${delivery.id}/items/${item.id}/document`
        : `${apiBase}/api/v1/application-profiles/client/offer-deliveries/${delivery.id}/items/${item.id}/document`;
      const authToken = mode === "account" && isSignedIn ? await getToken() : null;
      const response = await fetch(url, {
        method: mode === "room" ? "POST" : "GET",
        headers: {
          ...(mode === "room" ? { "Content-Type": "application/json" } : {}),
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          ...(mode === "account" && !authToken && devUser ? { "X-Dev-User": devUser } : {}),
        },
        body: mode === "room" ? JSON.stringify({ passcode: roomPasscode }) : undefined,
      });
      if (!response.ok) throw new Error(await errorText(response, "This document could not be downloaded."));
      const blobUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = item.file_name || "offer.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
    } catch (reason_) {
      setError(reason_ instanceof Error ? reason_.message : "This document could not be downloaded.");
    } finally {
      setBusy("");
    }
  }

  function openResponse(item: ClientOfferItem, response: "accepted" | "declined") {
    setPending({ item, response });
    setReason("");
    setAcknowledged(false);
    setError("");
  }

  async function submitResponse() {
    if (!pending || !pendingDelivery || !responderName.trim()) return;
    if (pending.response === "accepted" && pending.item.kind !== "merchant_offer" && !acknowledged) return;
    setBusy(`respond:${pending.item.id}`);
    setError("");
    const body = {
      ...(mode === "room" ? { passcode: roomPasscode } : {}),
      response: pending.response,
      responder_name: responderName.trim(),
      reason: pending.response === "declined" ? reason.trim() || null : null,
      acknowledged_non_binding: pending.item.kind === "merchant_offer" ? undefined : acknowledged,
    };
    try {
      const path = mode === "room"
        ? `/application-profiles/public/room/${encodeURIComponent(roomToken)}/offer-deliveries/${pendingDelivery.id}/items/${pending.item.id}/respond`
        : `/application-profiles/client/offer-deliveries/${pendingDelivery.id}/items/${pending.item.id}/respond`;
      if (mode === "room") {
        const response = await fetch(`${apiBase}/api/v1${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!response.ok) throw new Error(await errorText(response, "Your response could not be recorded."));
      } else {
        await api(path, { method: "POST", body: JSON.stringify(body) });
      }
      setPending(null);
      await load();
    } catch (reason_) {
      setError(reason_ instanceof Error ? reason_.message : "Your response could not be recorded.");
    } finally {
      setBusy("");
    }
  }

  return <section className={`client-offer-inbox ${props.embedded ? "is-embedded" : ""}`} aria-label="Offers and documents">
    <header className="client-offer-inbox-head">
      <div><span className="client-offer-eyebrow">Offers &amp; documents</span><h2>Review your current offers</h2><p>These are the same documents delivered by email. Each offer has its own response.</p></div>
      <button type="button" className="client-offer-icon-button" onClick={() => void load()} disabled={loading} aria-label="Refresh offers" title="Refresh offers"><Icon name="refresh" size={15} /></button>
    </header>

    {loading ? <div className="client-offer-empty"><span className="spinner solo" />Loading offers…</div> : null}
    {error ? <div className="client-offer-alert bad" role="alert">{error}</div> : null}
    {!loading && !deliveries.length ? <div className="client-offer-empty"><Icon name="mail" size={22} /><b>No offers have been delivered yet.</b><span>When your advisor sends terms, the email and exact PDFs will also appear here.</span></div> : null}

    <div className="client-offer-deliveries">
      {deliveries.map((delivery) => {
        const deliveryUncertain = delivery.status === "sending";
        const actionableItems = delivery.items.filter((item) => item.kind !== "evidence_file");
        const itemStatuses = actionableItems.map((item) => effectiveStatus(item, delivery));
        const responseClosed = itemStatuses.length > 0 && itemStatuses.every((status) => ["accepted", "declined", "expired", "superseded"].includes(status));
        const allUnavailable = itemStatuses.length > 0 && itemStatuses.every((status) => ["expired", "superseded"].includes(status));
        const nextDeadline = actionableItems
          .filter((item) => effectiveStatus(item, delivery) === "pending")
          .map((item) => item.expires_at || delivery.expires_at)
          .filter((value): value is string => Boolean(value))
          .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0] || delivery.expires_at;
        return <article key={delivery.id} id={`client-offer-delivery-${delivery.id}`} tabIndex={-1} className={`client-offer-delivery ${focusDeliveryId === delivery.id && !focusItemId ? "is-focused" : ""}`}>
          <div className="client-offer-delivery-head">
            <div><span className="client-offer-eyebrow">Sent {when(delivery.sent_at)}</span><h3>{delivery.subject || "Your offer package"}</h3></div>
            <span className={`client-offer-status ${allUnavailable ? "expired" : responseClosed ? "good" : "pending"}`}>{deliveryUncertain ? "Delivery confirmation pending" : allUnavailable ? "Response window closed" : responseClosed ? "Responses recorded" : `Next deadline ${when(nextDeadline)}`}</span>
          </div>
          <div className="client-offer-body">{delivery.body}</div>
          <div className="client-offer-items">
            {delivery.items.map((item) => {
              const status = effectiveStatus(item, delivery);
              const actionable = !deliveryUncertain
                && !["accepted", "declined", "expired", "superseded"].includes(status)
                && item.kind !== "evidence_file";
              return <div key={item.id} id={`client-offer-item-${item.id}`} tabIndex={-1} className={`client-offer-item ${focusItemId === item.id ? "is-focused" : ""}`}>
                <span className="client-offer-file-icon"><Icon name="file" size={17} /></span>
                <div className="client-offer-item-copy"><b>{itemName(item)}</b><span>{item.file_name} · {bytes(item.size_bytes)}</span>{item.responded_at ? <small>{item.response_label || status} {when(item.responded_at)}{item.responded_name ? ` by ${item.responded_name}` : ""}</small> : item.kind !== "evidence_file" && item.expires_at ? <small>Response deadline {when(item.expires_at)}</small> : null}</div>
                <span className={`client-offer-status ${tone(status)}`}>{status.replace(/_/g, " ")}</span>
                <div className="client-offer-item-actions">
                  <button type="button" className="client-offer-icon-button" onClick={() => void download(delivery, item)} disabled={busy !== ""} aria-label={`Download ${itemName(item)}`} title="Download PDF"><Icon name={busy === `download:${item.id}` ? "refresh" : "download"} size={15} /></button>
                  {actionable ? <><button type="button" className="client-offer-action accept" onClick={() => openResponse(item, "accepted")}>{item.kind === "merchant_offer" ? "Accept offer" : "Accept terms & proceed"}</button><button type="button" className="client-offer-action" onClick={() => openResponse(item, "declined")}>Decline</button></> : null}
                </div>
              </div>;
            })}
          </div>
        </article>;
      })}
    </div>

    {pending ? <div className="client-offer-response" role="dialog" aria-modal="true" aria-label={`${pending.response === "accepted" ? "Accept" : "Decline"} ${itemName(pending.item)}`}>
      <div className="client-offer-response-card">
        <div className="client-offer-response-head"><div><span className="client-offer-eyebrow">Your response</span><h3>{pending.response === "accepted" ? (pending.item.kind === "merchant_offer" ? "Accept this offer" : "Accept terms and request to proceed") : "Decline this offer"}</h3></div><button className="client-offer-icon-button" onClick={() => setPending(null)} aria-label="Close response"><Icon name="x" size={15} /></button></div>
        <label className="client-offer-field"><span>Your full name</span><input value={responderName} onChange={(event) => setResponderName(event.target.value)} autoComplete="name" /></label>
        {pending.response === "declined" ? <label className="client-offer-field"><span>Reason (optional)</span><textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Tell us what would make the offer a better fit" /></label> : null}
        {pending.response === "accepted" && pending.item.kind !== "merchant_offer" ? <label className="client-offer-ack"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I understand this indicative term summary is not a commitment to lend or final credit approval. I accept these terms and request that Qualified Commercial proceed.</span></label> : null}
        <div className="client-offer-response-actions"><button className="client-offer-action" onClick={() => setPending(null)} disabled={busy !== ""}>Cancel</button><button className="client-offer-action accept" onClick={() => void submitResponse()} disabled={busy !== "" || !responderName.trim() || (pending.response === "accepted" && pending.item.kind !== "merchant_offer" && !acknowledged)}>{busy.startsWith("respond:") ? "Recording…" : "Confirm response"}</button></div>
      </div>
    </div> : null}
  </section>;
}
