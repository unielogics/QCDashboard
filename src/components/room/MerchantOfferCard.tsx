"use client";

// The client's side of a merchant-processing offer.
//
// Rendered inside the PIN-gated application room. Everything shown here
// comes from the client view the backend builds by allowlist — there is
// nothing in this payload the desk keeps to itself. Accept is one click;
// Decline asks for a reason first. Either way the answer is final: the room
// shows a thank-you state afterwards and the desk can withdraw and re-send
// if the client changes their mind.
//
// Like the rest of the room this never sends an Authorization header: the
// token in the URL plus the PIN is the whole credential.

import { useState } from "react";
import { apiBase } from "@/lib/api";
import { Icon } from "@/components/design-system/Icon";

type OfferOption = { label: string | null; effective_rate_pct: number | null; monthly_fees: number | null; monthly_savings: number | null };

export type RoomMerchantOffer = {
  id: string;
  status: string;
  terms_version: number;
  partner_name: string | null;
  terms: Record<string, string | number | null | OfferOption[] | undefined> & { options?: OfferOption[] | null };
  estimated_monthly_savings: number | null;
  estimated_annual_savings: number | null;
  savings_basis: string | null;
  sent_at: string | null;
  client_response: string | null;
  client_response_at: string | null;
  client_response_name: string | null;
  disclaimer_text: string;
  disclaimer_version: string;
};

function money(value: unknown, digits = 0): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits });
}

function pct(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}%`;
}

function longDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string };
    if (body?.detail === "stale") return "This offer was updated after you opened it. Reload the page to see the current figures.";
    if (body?.detail === "already_responded") return "This offer has already been answered.";
    return body?.detail || fallback;
  } catch {
    return fallback;
  }
}

export function MerchantOfferCard({
  token,
  passcode,
  offer,
  responderName,
  onChanged,
}: {
  token: string;
  passcode: string;
  offer: RoomMerchantOffer;
  responderName: string;
  onChanged: (next: RoomMerchantOffer) => void;
}) {
  const [name, setName] = useState(responderName);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"accepted" | "declined" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const terms = offer.terms || {};
  const partner = offer.partner_name || "your processing partner";
  const answered = Boolean(offer.client_response);

  async function respond(response: "accepted" | "declined") {
    if (!name.trim()) {
      setError("Enter your name so we know who answered.");
      return;
    }
    setBusy(response);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/application-profiles/public/room/${token}/merchant-offer/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, response, responder_name: name.trim(), reason: response === "declined" ? reason.trim() || null : null, terms_version: offer.terms_version }),
      });
      if (!res.ok) throw new Error(await responseMessage(res, "Your answer could not be recorded. Please try again."));
      onChanged((await res.json()) as RoomMerchantOffer);
      setDeclining(false);
    } catch (reason_) {
      setError(reason_ instanceof Error ? reason_.message : "Your answer could not be recorded. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const rows: Array<{ label: string; today: string; proposed: string }> = [
    { label: "Monthly card volume", today: money(terms.current_monthly_volume), proposed: money(terms.current_monthly_volume) },
    { label: "Monthly processing cost", today: money(terms.current_monthly_fees, 2), proposed: money(terms.proposed_monthly_fees, 2) },
    { label: "Effective rate", today: pct(terms.current_effective_rate_pct), proposed: pct(terms.proposed_effective_rate_pct) },
  ].filter((row) => row.today !== "—" || row.proposed !== "—");

  const options = Array.isArray(terms.options) ? terms.options.filter((option) => option && (option.label || option.effective_rate_pct !== null || option.monthly_savings !== null)) : [];

  return (
    <section className="application-room-section application-room-offer">
      <div className="application-room-section-head">
        <div>
          <span className="application-room-eyebrow">Your offer</span>
          <h2>Merchant processing offer{offer.partner_name ? ` from ${offer.partner_name}` : ""}</h2>
          <p>We compared what you pay to process cards today with the pricing {partner} prepared for you.</p>
        </div>
      </div>

      <div className="application-room-offer-headline">
        <span className="application-room-eyebrow">Estimated annual savings</span>
        <strong>{money(offer.estimated_annual_savings)}</strong>
        <em>More money in your pocket.</em>
        {typeof offer.estimated_monthly_savings === "number" ? <small>That is about {money(offer.estimated_monthly_savings)} a month.</small> : null}
      </div>

      {rows.length ? (
        <table className="application-room-offer-table">
          <thead>
            <tr><th /><th>Today</th><th>With {partner}</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.today}</td><td>{row.proposed}</td></tr>)}
          </tbody>
        </table>
      ) : null}

      {options.length ? (
        <div className="application-room-offer-options">
          <span className="application-room-eyebrow">Options on the sheet</span>
          {options.map((option, index) => (
            <div key={`${option.label || "option"}-${index}`}>
              <b>{option.label || `Option ${index + 1}`}</b>
              <span>{[option.effective_rate_pct !== null ? `${pct(option.effective_rate_pct)} effective` : null, option.monthly_fees !== null ? `${money(option.monthly_fees, 2)} a month` : null, option.monthly_savings !== null ? `saves ${money(option.monthly_savings)} a month` : null].filter(Boolean).join(" · ")}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="application-room-offer-lines">
        {typeof terms.contract_term_months === "number" ? <span>Contract term: {terms.contract_term_months} months</span> : null}
        {typeof terms.early_termination_fee === "number" ? <span>Early termination fee: {money(terms.early_termination_fee)}</span> : null}
        {typeof terms.proposed_pricing_model === "string" ? <span>Pricing model: {terms.proposed_pricing_model.replace(/_/g, " ")}</span> : null}
        {typeof terms.notes === "string" && terms.notes ? <span>{terms.notes}</span> : null}
      </div>

      <p className="application-room-offer-disclaimer">{offer.disclaimer_text}</p>

      {answered ? (
        <div className={`application-room-alert ${offer.client_response === "accepted" ? "good" : ""}`}>
          {offer.client_response === "accepted"
            ? `You accepted this offer on ${longDate(offer.client_response_at)}. ${partner} will reach out to set things up.`
            : `You declined this offer on ${longDate(offer.client_response_at)}. Nothing changes with your processing.`}
        </div>
      ) : (
        <div className="application-room-offer-actions">
          <label className="application-room-field"><span>Your name</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>
          {!declining ? (
            <div className="application-room-offer-buttons">
              <button className="application-room-primary" disabled={busy !== null} onClick={() => void respond("accepted")}>
                <Icon name="check" size={15} />{busy === "accepted" ? "Recording…" : "Accept this offer"}
              </button>
              <button className="application-room-secondary" disabled={busy !== null} onClick={() => setDeclining(true)}>Decline</button>
            </div>
          ) : (
            <div className="application-room-offer-decline">
              <label className="application-room-field"><span>Tell us why (optional)</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Anything that would make this a better fit" /></label>
              <div className="application-room-offer-buttons">
                <button className="application-room-primary" disabled={busy !== null} onClick={() => void respond("declined")}>{busy === "declined" ? "Recording…" : "Confirm decline"}</button>
                <button className="application-room-secondary" disabled={busy !== null} onClick={() => setDeclining(false)}>Back</button>
              </div>
            </div>
          )}
          {error ? <div className="application-room-alert bad">{error}</div> : null}
        </div>
      )}
    </section>
  );
}
