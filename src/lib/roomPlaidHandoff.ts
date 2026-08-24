// What a client-room bank connection has to carry across an OAuth round trip.
//
// An OAuth bank navigates the browser away from the room entirely and returns
// it to /plaid/oauth. The room's identity lives in ITS url — a token and a
// passcode — and that url is gone by the time the bank sends the user back, so
// everything needed to finish the exchange is stashed before Link opens.
//
// These names live here rather than in the page because a Next.js page module
// may only export a default component and a fixed set of framework fields; an
// extra export is a build error. Two files read these keys, so one owner is
// right regardless.
//
// sessionStorage, not localStorage: this is scoped to the tab doing the
// connecting and should not outlive it. A passcode has no business persisting
// after the tab closes.

export const ROOM_LINK_TOKEN_KEY = "qc.room.plaid.link_token";
export const ROOM_TOKEN_KEY = "qc.room.plaid.token";
export const ROOM_PASSCODE_KEY = "qc.room.plaid.passcode";
export const ROOM_RETURN_KEY = "qc.room.plaid.return";
export const ROOM_KIND_KEY = "qc.room.plaid.kind";
export const ROOM_MODE_KEY = "qc.room.plaid.mode";
export const ROOM_ITEM_KEY = "qc.room.plaid.item";

type HandoffArgs = {
  linkToken: string;
  token: string;
  returnTo: string;
  mode?: "initial" | "update";
  itemId?: string;
};

function stashMode(args: HandoffArgs) {
  sessionStorage.setItem(ROOM_MODE_KEY, args.mode ?? "initial");
  if (args.itemId) sessionStorage.setItem(ROOM_ITEM_KEY, args.itemId);
  else sessionStorage.removeItem(ROOM_ITEM_KEY);
}

export function stashRoomHandoff(args: HandoffArgs & { passcode: string }) {
  sessionStorage.setItem(ROOM_KIND_KEY, "dealer_room");
  sessionStorage.setItem(ROOM_LINK_TOKEN_KEY, args.linkToken);
  sessionStorage.setItem(ROOM_TOKEN_KEY, args.token);
  sessionStorage.setItem(ROOM_PASSCODE_KEY, args.passcode);
  sessionStorage.setItem(ROOM_RETURN_KEY, args.returnTo);
  stashMode(args);
}

export function stashApplicationRoomHandoff(args: HandoffArgs & { passcode: string }) {
  sessionStorage.setItem(ROOM_KIND_KEY, "application_room");
  sessionStorage.setItem(ROOM_LINK_TOKEN_KEY, args.linkToken);
  sessionStorage.setItem(ROOM_TOKEN_KEY, args.token);
  sessionStorage.setItem(ROOM_PASSCODE_KEY, args.passcode);
  sessionStorage.setItem(ROOM_RETURN_KEY, args.returnTo);
  stashMode(args);
}

export function stashApplicationVerificationHandoff(args: HandoffArgs) {
  sessionStorage.setItem(ROOM_KIND_KEY, "application_verification");
  sessionStorage.setItem(ROOM_LINK_TOKEN_KEY, args.linkToken);
  sessionStorage.setItem(ROOM_TOKEN_KEY, args.token);
  sessionStorage.removeItem(ROOM_PASSCODE_KEY);
  sessionStorage.setItem(ROOM_RETURN_KEY, args.returnTo);
  stashMode(args);
}

export function readPlaidHandoff() {
  const linkToken = sessionStorage.getItem(ROOM_LINK_TOKEN_KEY);
  const token = sessionStorage.getItem(ROOM_TOKEN_KEY);
  const passcode = sessionStorage.getItem(ROOM_PASSCODE_KEY);
  const returnTo = sessionStorage.getItem(ROOM_RETURN_KEY);
  const kind = sessionStorage.getItem(ROOM_KIND_KEY);
  const mode: "initial" | "update" = sessionStorage.getItem(ROOM_MODE_KEY) === "update" ? "update" : "initial";
  const itemId = sessionStorage.getItem(ROOM_ITEM_KEY);
  if (!linkToken || !token) return null;
  if (kind === "application_verification") {
    return { kind, linkToken, token, returnTo, mode, itemId } as const;
  }
  if (kind === "application_room" && passcode) {
    return { kind, linkToken, token, passcode, returnTo, mode, itemId } as const;
  }
  if (!passcode) return null;
  return { kind: "dealer_room" as const, linkToken, token, passcode, returnTo, mode, itemId };
}

export function readRoomHandoff() {
  const handoff = readPlaidHandoff();
  if (!handoff || handoff.kind !== "dealer_room") return null;
  return handoff;
}

/** Clear the handoff, including the passcode. Call on every terminal outcome. */
export function clearRoomHandoff() {
  [ROOM_KIND_KEY, ROOM_LINK_TOKEN_KEY, ROOM_TOKEN_KEY, ROOM_PASSCODE_KEY, ROOM_RETURN_KEY, ROOM_MODE_KEY, ROOM_ITEM_KEY].forEach((k) =>
    sessionStorage.removeItem(k),
  );
}
