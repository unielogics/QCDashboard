"use client";

// The first thing on the Banking sub-tab: ask the client to connect their bank
// through Plaid. The owner: "plaid needs to be the first option available to
// upload bank statements ... Even in evidence and banking I can't see where I
// can request PLAID connection to pull statements." Until now the only request
// control sat inside the banking panel under a neutral label, never named
// Plaid in the email, and vanished once banking was marked complete.
//
// The bar posts a `bank_connect` room reminder: the email and SMS ask for the
// connection by name, with the six-month upload as the fallback, and the link
// opens the room on its banking tab. It stays visible until a bank is actually
// connected, and says plainly when statement PDFs are on for the file but the
// Plaid account is not yet enabled for the product.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Btn, Callout, CellChip, Sub } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import type { ApplicationBankState, FileOwnerRequirementState } from "@/lib/applicationProfile";

type RoomRequestResult = { room_url: string; overall_status: string; deliveries: { channel: string; status: string; detail?: string | null }[] };

/** What the bar says about statement PDFs for this file. */
export function statementsNote(banks: Pick<ApplicationBankState, "statements_enabled" | "statements_preferred" | "available_products"> | null | undefined): string | null {
  if (!banks) return null;
  if (banks.statements_enabled) return "Statement PDFs are on: Plaid delivers the bank's own monthly statements, read like an upload.";
  if (banks.statements_preferred && !banks.available_products.includes("statements")) {
    return "Statement PDFs are on for this file, but the Plaid account is not enabled for the Statements product yet. Until it is, a connection delivers the asset report (monthly balances, deposits and withdrawals) and statements come in by upload.";
  }
  return null;
}

/** The headline for the bar, from what the file already has. */
export function connectionHeadline(state: Pick<FileOwnerRequirementState, "bank_connection_count" | "business_banking_complete" | "bank_statement_months"> | null | undefined): string {
  const connections = state?.bank_connection_count ?? 0;
  if (connections > 0) return `${connections} bank connection${connections === 1 ? "" : "s"} on this file`;
  if (state?.business_banking_complete) {
    return state.bank_statement_months > 0 ? `Banking complete from ${state.bank_statement_months} accepted statement months` : "Banking complete";
  }
  return "No bank connected yet";
}

export function PlaidRequestBarView({
  headline,
  note,
  sending,
  roomUrl,
  result,
  error,
  onSend,
  onCreateLink,
  onCopy,
}: {
  headline: string;
  note: string | null;
  sending: boolean;
  roomUrl: string | null;
  result: string | null;
  error: string | null;
  onSend: () => void;
  onCreateLink: () => void;
  onCopy: () => void;
}) {
  return (
    <section className="plaid-request-bar" aria-label="Plaid bank connection">
      <div className="plaid-request-bar-main">
        <span className="plaid-request-bar-icon"><Icon name="building" size={18} /></span>
        <div className="grow">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <b>Plaid bank connection</b>
            <CellChip tone="acc">First option</CellChip>
          </div>
          <Sub>{headline}. Ask the client to connect their business bank, read-only, in about two minutes; the email names Plaid and offers the six-month statement upload as the fallback.</Sub>
          {note ? <Sub>{note}</Sub> : null}
        </div>
        <div className="plaid-request-bar-actions">
          <Btn variant="pri" disabled={sending} onClick={onSend}><Icon name="send" size={14} />{sending ? "Sending…" : "Request Plaid connection"}</Btn>
          <Btn disabled={sending} onClick={roomUrl ? onCopy : onCreateLink}><Icon name={roomUrl ? "copy" : "link"} size={14} />{roomUrl ? "Copy banking link" : "Create banking link"}</Btn>
        </div>
      </div>
      {result ? <Callout tone="ok" icon={<Icon name="check" size={16} />}>{result}</Callout> : null}
      {error ? <Callout tone="bad" icon={<Icon name="alert" size={16} />}>{error}</Callout> : null}
    </section>
  );
}

export function PlaidRequestBar({
  profileId,
  state,
  banks,
  onSent,
}: {
  profileId: string;
  state: FileOwnerRequirementState | null | undefined;
  banks: ApplicationBankState | null | undefined;
  onSent?: () => Promise<unknown> | void;
}) {
  const apiCall = useAuthedApi();
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useMutation({
    mutationFn: (channel: "email" | "none") =>
      apiCall<RoomRequestResult>(`/application-profiles/${profileId}/room/reminders`, {
        method: "POST",
        body: JSON.stringify({ purpose: "bank_connect", email_room_link: channel === "email", sms_reminder: false }),
      }),
    onSuccess: async (data, channel) => {
      setRoomUrl(data.room_url);
      setError(null);
      if (channel === "none") setResult("Banking link created. Nothing was sent; copy it into your own message.");
      else if (data.overall_status === "success") setResult("Plaid connection requested by email. The link opens the room on its banking tab.");
      else setResult(null);
      if (channel === "email" && data.overall_status !== "success") setError("The room link is ready, but the email did not go out. Copy the banking link and send it yourself.");
      await onSent?.();
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "The Plaid request could not be sent."),
  });
  // Once banking is complete — a connected bank, or six accepted months of
  // statements — the ask is answered; the bar steps aside and the panel below
  // carries the state.
  if (state?.business_banking_complete) return null;
  return (
    <PlaidRequestBarView
      headline={connectionHeadline(state)}
      note={statementsNote(banks)}
      sending={request.isPending}
      roomUrl={roomUrl}
      result={result}
      error={error}
      onSend={() => request.mutate("email")}
      onCreateLink={() => request.mutate("none")}
      onCopy={() => { if (roomUrl) void navigator.clipboard.writeText(roomUrl); }}
    />
  );
}
