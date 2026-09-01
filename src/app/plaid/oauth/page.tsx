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
      if (!room || (room.mode === "initial" && !publicToken) || (room.mode === "update" && !room.itemId)) {
        finish("The bank returned an incomplete response. Please try connecting again.", false);
        return;
      }
      setPhase("exchanging");
      try {
        const endpoint = room.kind === "application_verification"
          ? room.mode === "update"
            ? `${apiBase}/api/v1/application-profiles/public/bank-verification/${encodeURIComponent(room.token)}/banks/${room.itemId}/update-complete`
            : `${apiBase}/api/v1/application-profiles/public/bank-verification/${encodeURIComponent(room.token)}/exchange`
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
              room.mode === "update"
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
