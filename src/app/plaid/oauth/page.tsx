"use client";

// Plaid OAuth return page for the PUBLIC client room.
//
// Most large US banks use OAuth, which navigates the browser away to the bank
// and back. This is where they come back to.
//
// It is a separate page from the team app's return page at
// audit.qualifiedcommercial.com/plaid/oauth, and the separation is the whole
// point: that one sits behind a Clerk session, while a client room user has no
// account at all — they are authorised by a token and a passcode in the URL.
// Returning a room user to the authenticated page bounces them into a sign-in
// wall at the exact moment they come back from their bank, and the connection
// is lost with no way to tell what went wrong.
//
// This route must stay in the public matcher in middleware.ts, and its URL must
// be registered under "Allowed redirect URIs" in the Plaid Dashboard and set as
// DEALER_OS_PLAID_ROOM_REDIRECT_URI. All three have to agree exactly.
//
// The room's token and passcode are stashed before Link opens, because they
// live in the room's URL and that URL is gone by the time the bank sends the
// user here.

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { clearRoomHandoff, readPlaidHandoff } from "@/lib/roomPlaidHandoff";

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "";

type Phase = "resuming" | "exchanging" | "done" | "error";

export default function RoomPlaidOAuthReturn() {
  const [phase, setPhase] = useState<Phase>("resuming");
  const [message, setMessage] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [room, setRoom] = useState<
    | { kind: "dealer_room" | "application_room"; token: string; passcode: string; mode: "initial" | "update"; itemId: string | null; isPrimaryOperating: boolean }
    | { kind: "payment_room"; token: string; passcode: string; mode: "initial"; itemId: null; isPrimaryOperating: boolean; paymentPurpose: "fee" | "private_schedule"; paymentOwnerType: "business" | "consumer"; paymentExchangeRequired: boolean; paymentTransferId: string | null }
    | { kind: "application_verification"; token: string; mode: "initial" | "update"; itemId: string | null; isPrimaryOperating: boolean }
    | null
  >(null);

  const [returnTo, setReturnTo] = useState<string | null>(null);

  useEffect(() => {
    const h = readPlaidHandoff();
    if (!h) {
      // No stash means the tab was closed, the session expired, or someone
      // opened this URL directly. There is nothing to resume, and saying so is
      // better than a spinner that never resolves.
      setPhase("error");
      setMessage("This bank connection has expired. Please reopen your secure link and try again.");
      return;
    }
    setLinkToken(h.linkToken);
    setRoom(
      h.kind === "application_verification"
        ? { kind: h.kind, token: h.token, mode: h.mode, itemId: h.itemId, isPrimaryOperating: h.isPrimaryOperating }
        : h.kind === "payment_room"
          ? { kind: h.kind, token: h.token, passcode: h.passcode, mode: "initial", itemId: null, isPrimaryOperating: true, paymentPurpose: h.paymentPurpose, paymentOwnerType: h.paymentOwnerType, paymentExchangeRequired: h.paymentExchangeRequired, paymentTransferId: h.paymentTransferId }
        : { kind: h.kind, token: h.token, passcode: h.passcode, mode: h.mode, itemId: h.itemId, isPrimaryOperating: h.isPrimaryOperating },
    );
    setReturnTo(h.returnTo);
  }, []);

  const finish = useCallback(
    (text: string, ok: boolean) => {
      // Always clear — the stash holds a passcode and must not survive a
      // failed attempt any more than a successful one.
      clearRoomHandoff();
      setPhase(ok ? "done" : "error");
      setMessage(text);
      if (ok && returnTo) setTimeout(() => window.location.replace(returnTo), 1200);
    },
    [returnTo],
  );

  const { open, ready, error: sdkError } = usePlaidLink({
    token: linkToken,
    // Carries oauth_state_id, which is how Plaid reattaches to the session the
    // bank interrupted.
    receivedRedirectUri: typeof window === "undefined" ? undefined : window.location.href,
    onSuccess: async (publicToken, metadata) => {
      if (!room) {
        finish("The bank returned an incomplete response. Please try connecting again.", false);
        return;
      }
      const publicTokenRequired = room.kind === "payment_room"
        ? room.paymentExchangeRequired
        : room.mode === "initial";
      if ((publicTokenRequired && !publicToken) || (room.mode === "update" && !room.itemId)) {
        finish("The bank returned an incomplete response. Please try connecting again.", false);
        return;
      }
      setPhase("exchanging");
      try {
        if (room.kind === "payment_room" && !room.paymentExchangeRequired) {
          if (!room.paymentTransferId) {
            throw new Error("The transfer repair session is incomplete. Please start again from your payment request.");
          }
          const repairResponse = await fetch(
            `${apiBase}/api/v1/application-profiles/public/room/${encodeURIComponent(room.token)}/payments/repair-complete`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ passcode: room.passcode, transfer_id: room.paymentTransferId }),
            },
          );
          if (!repairResponse.ok) {
            throw new Error("Bank verification was updated, but the payment could not be resumed safely.");
          }
          finish("Bank verification updated. Returning you to your payment request…", true);
          return;
        }
        if (room.kind === "payment_room" && room.paymentExchangeRequired && metadata.accounts.length !== 1) {
          throw new Error("Choose exactly one dedicated payment account in Plaid Link.");
        }
        const paymentAccountId = room.kind === "payment_room" ? metadata.accounts[0]?.id : null;
        if (room.kind === "payment_room" && room.paymentExchangeRequired && !paymentAccountId) {
          throw new Error("Plaid did not return the selected payment account.");
        }
        const endpoint = room.kind === "application_verification"
          ? room.mode === "update"
            ? `${apiBase}/api/v1/application-profiles/public/bank-verification/${encodeURIComponent(room.token)}/banks/${room.itemId}/update-complete`
            : `${apiBase}/api/v1/application-profiles/public/bank-verification/${encodeURIComponent(room.token)}/exchange`
          : room.kind === "payment_room"
            ? `${apiBase}/api/v1/application-profiles/public/room/${room.token}/payments/exchange`
          : room.kind === "application_room"
            ? room.mode === "update"
              ? `${apiBase}/api/v1/application-profiles/public/room/${room.token}/plaid/${room.itemId}/update-complete`
              : `${apiBase}/api/v1/application-profiles/public/room/${room.token}/plaid/exchange`
            : room.mode === "update"
              ? `${apiBase}/api/v1/dealer-os/public/room/${room.token}/plaid/${room.itemId}/update-complete`
              : `${apiBase}/api/v1/dealer-os/public/room/${room.token}/plaid/exchange`;
        const res = await fetch(
          endpoint,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              room.kind === "payment_room"
                ? {
                    passcode: room.passcode,
                    public_token: publicToken,
                    plaid_account_id: paymentAccountId,
                    owner_type: room.paymentOwnerType,
                    purpose: room.paymentPurpose,
                  }
                : room.mode === "update"
                ? room.kind === "application_verification" ? {} : { passcode: room.passcode }
                : {
                    ...(room.kind === "application_verification" ? {} : { passcode: room.passcode }),
                    public_token: publicToken,
                    institution_name: metadata.institution?.name ?? null,
                    is_primary_operating: room.isPrimaryOperating,
                  },
            ),
          },
        );
        if (!res.ok) throw new Error("That connection could not be saved.");
        finish("Connected. Returning you to your document room…", true);
      } catch {
        finish("That connection could not be saved. Please try again from your secure link.", false);
      }
    },
    onExit: () => finish("Bank connection cancelled. You can try again from your secure link.", false),
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  useEffect(() => {
    if (sdkError) {
      finish("The bank connection window could not load. Please check your connection and try again.", false);
    }
  }, [sdkError, finish]);

  return (
    <main
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "70vh",
        padding: 24,
        fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      }}
    >
      <div style={{ maxWidth: 460, textAlign: "center", color: "#1f2933" }}>
        <p style={{ fontSize: 15, lineHeight: 1.6 }}>
          {message ??
            (phase === "exchanging"
              ? "Saving your bank connection…"
              : "Finishing your bank connection…")}
        </p>
      </div>
    </main>
  );
}
