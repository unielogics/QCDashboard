// The worksheet's two transports, typed once.
//
// The same four sheets are reachable two ways and they are not interchangeable:
//
//   staff   — `/application-profiles/{id}/sheets…`, through the app's authed
//             `api()`, which appends /api/v1 and attaches the Clerk token.
//   public  — `/public/worksheets/{token}…`, hand-written `fetch`, **never** an
//             Authorization header. The link IS the credential; attaching a
//             staff token to it would silently answer as the wrong identity,
//             and on a page a borrower forwards to their accountant there may
//             be no identity to attach at all.
//
// Two rules that are here because both have already cost a shipped bug:
//
// 1. **A hand-written fetch must add `/api/v1` itself.** `apiBase` is the bare
//    origin. See the comment at `src/app/forms/[kind]/[token]/page.tsx:91-93` —
//    every borrower link minted for a fortnight 404'd on load because that one
//    URL was built without it, while the token behind it was perfectly good.
// 2. **The unlock session travels in `X-Worksheet-Session`, never in the URL.**
//    Caddy logs every request line, so a credential in a query string is a
//    credential in the access log, in browser history and in any Referer the
//    page leaks. The backend says the same thing at
//    `app/routers/worksheets.py`'s SESSION_HEADER.
//
// Errors come back as typed classes rather than status codes, because the
// public surface has to distinguish five outcomes that all look like "it did
// not work": the link needs a PIN, the PIN was wrong, the PIN is locked out,
// the link is view-only, and the link is gone. Everything else — an expired
// link, a revoked link, a sheet outside the scope — is deliberately the one
// uniform 404, and callers should show the uniform sentence for it.

import { apiBase, type ApiOptions } from "@/lib/api";
import type { SheetColumn, SheetKind, SheetRow } from "@/components/sheet/types";

// ---------------------------------------------------------------------------
// the read payload, exactly as `sheets.read_sheets` builds it
// ---------------------------------------------------------------------------

/** Which debt rows this reader may actually write. Empty on every other sheet:
 *  the schedule is one list shown to everybody and writable in parts. */
export type SheetRowMeta = { editable: boolean; owner: string | null };

/** One tab. `columns`/`rows`/`freeze` are the shape, `values` the raw strings,
 *  `computed` the server's authoritative figures, `schema` the same field
 *  description the stacked forms already render from. */
export type WorksheetSheet = {
  kind: SheetKind;
  title: string;
  schema_version: string;
  status?: string | null;
  completed?: boolean;
  rev?: number;
  columns: SheetColumn[];
  /** The server sends `{rows, cols}`; `types.ts` models the layout's tuple. */
  freeze: { rows: number; cols: number };
  rows: SheetRow[];
  schema: unknown;
  values: Record<string, string>;
  row_meta: Record<string, SheetRowMeta>;
  computed: Record<string, number | null>;
};

/** What this reader may do, decided server-side from the link or the user and
 *  never from anything the browser sent. */
export type WorksheetScope = {
  can_edit: boolean;
  sheets: SheetKind[];
  /** Which tab opens first — the first sheet in scope, so a link that opens
   *  only the debt schedule does not land on an empty P&L. */
  open_at: SheetKind | null;
};

export type WorksheetPayload = {
  layout_version: string;
  worksheet_id: string;
  revision: number;
  scope: WorksheetScope;
  can_edit?: boolean;
  completed?: boolean;
  business_name: string | null;
  prefill?: Record<string, unknown>;
  sheets: WorksheetSheet[];
};

/** One committed change. The save is addressed by `key`, never by the grid
 *  address: a client on a stale layout must not be able to write a value into
 *  the wrong row, and `planPaste` mints a *nominal* address for an appended
 *  row that can collide with a real row number. */
export type WorksheetCellEdit = { sheet: SheetKind; key: string; value: string };

export type WorksheetCellsResult = {
  /** The workbook clock after the write, per sheet. */
  rev: Record<string, number>;
  computed: Record<string, Record<string, number | null>>;
  /** Sheets whose stored value differs from what was sent — refetch these. */
  resync: string[];
};

export type WorksheetRowOp = {
  sheet: SheetKind;
  op: "insert" | "delete";
  /** The row to remove, or (on an insert) the row the new line follows. */
  row_id?: string | null;
  after?: string | null;
  /** Which supporting schedule on the 413. The debt schedule is one list and
   *  ignores it. */
  block?: string | null;
};

export type WorksheetRowResult = {
  rows: SheetRow[];
  row_meta: Record<string, SheetRowMeta>;
  rev: Record<string, number>;
};

export type WorksheetLinkRequest = {
  permission: "edit" | "view";
  sheets: SheetKind[];
  ttl_days?: number;
  label?: string | null;
  invitee_email?: string | null;
};

export type MintedWorksheetLink = {
  url: string;
  expires_at: string | null;
  worksheet_id: string;
  link_id: string;
  permission: "edit" | "view";
  sheets: SheetKind[];
  /** Shown once and never recoverable — only the hash is stored. Null when the
   *  link needs no second factor (a view link that omits the 413). */
  pin: string | null;
};

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

/** The uniform answer: expired, revoked, never existed, or asking for a sheet
 *  this link does not open. All one sentence on purpose — a 403 here would
 *  confirm the sheet exists on this file. */
export class WorksheetGone extends Error {
  constructor(message = "This link is no longer available") {
    super(message);
    this.name = "WorksheetGone";
  }
}

export class WorksheetPinRequired extends Error {
  constructor(public label: string | null = null) {
    super("This worksheet needs a PIN");
    this.name = "WorksheetPinRequired";
  }
}

export class WorksheetPinInvalid extends Error {
  constructor(message = "That PIN is not right.") {
    super(message);
    this.name = "WorksheetPinInvalid";
  }
}

export class WorksheetPinLocked extends Error {
  constructor(message = "Too many wrong PINs. Try again in a few minutes.") {
    super(message);
    this.name = "WorksheetPinLocked";
  }
}

/** A view-only holder tried to write. Not the uniform 404 deliberately: they
 *  hold a link we issued and it opened a moment ago, and telling them it does
 *  not exist would send them back to whoever shared it convinced it is broken. */
export class WorksheetViewOnly extends Error {
  constructor(message = "This link opens the worksheet for reading only") {
    super(message);
    this.name = "WorksheetViewOnly";
  }
}

/** The per-link write cap. Transient, and explicitly *not* "the link is gone" —
 *  it is the server asking for a pause, and the edits are still in hand. */
export class WorksheetTooFast extends Error {
  constructor(message = "Slow down — too many changes at once.") {
    super(message);
    this.name = "WorksheetTooFast";
  }
}

// ---------------------------------------------------------------------------
// the staff transport
// ---------------------------------------------------------------------------

/** `useAuthedApi()`'s return. Taken as an argument rather than imported so this
 *  module stays free of React and can be unit-tested with a stub. */
export type AuthedApi = <T>(path: string, opts?: ApiOptions) => Promise<T>;

export function readStaffWorksheet(api: AuthedApi, profileId: string): Promise<WorksheetPayload> {
  return api<WorksheetPayload>(`/application-profiles/${encodeURIComponent(profileId)}/sheets`);
}

export function writeStaffCells(
  api: AuthedApi,
  profileId: string,
  edits: WorksheetCellEdit[],
  baseRev: Record<string, number> = {},
): Promise<WorksheetCellsResult> {
  return api<WorksheetCellsResult>(
    `/application-profiles/${encodeURIComponent(profileId)}/sheets/cells`,
    { method: "POST", body: JSON.stringify({ edits, base_rev: baseRev }) },
  );
}

export function writeStaffRow(
  api: AuthedApi,
  profileId: string,
  op: WorksheetRowOp,
): Promise<WorksheetRowResult> {
  return api<WorksheetRowResult>(
    `/application-profiles/${encodeURIComponent(profileId)}/sheets/rows`,
    { method: "POST", body: JSON.stringify(op) },
  );
}

/** Mint a link that opens part of the worksheet to somebody with no login.
 *  The PIN comes back here and nowhere else, ever. */
export function mintWorksheetLink(
  api: AuthedApi,
  profileId: string,
  worksheetId: string,
  body: WorksheetLinkRequest,
): Promise<MintedWorksheetLink> {
  return api<MintedWorksheetLink>(
    `/application-profiles/${encodeURIComponent(profileId)}/worksheets/${encodeURIComponent(worksheetId)}/links`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function revokeWorksheetLink(
  api: AuthedApi,
  profileId: string,
  linkId: string,
): Promise<{ revoked: boolean }> {
  return api<{ revoked: boolean }>(
    `/application-profiles/${encodeURIComponent(profileId)}/worksheets/links/${encodeURIComponent(linkId)}/revoke`,
    { method: "POST" },
  );
}

// ---------------------------------------------------------------------------
// the public transport
// ---------------------------------------------------------------------------

/** The header the unlock session rides in. Mirrors
 *  `app/routers/worksheets.py:SESSION_HEADER`. */
export const WORKSHEET_SESSION_HEADER = "X-Worksheet-Session";

/** `/api/v1` is added here, by hand, because `apiBase` is the bare origin and
 *  this path never goes through `api()`. */
function publicUrl(token: string, suffix = ""): string {
  return `${apiBase}/api/v1/public/worksheets/${encodeURIComponent(token)}${suffix}`;
}

type Detail = { code?: string; message?: string; label?: string } | null;

function detailOf(body: unknown): Detail {
  if (!body || typeof body !== "object") return null;
  const detail = (body as { detail?: unknown }).detail;
  if (detail && typeof detail === "object") return detail as Detail;
  if (typeof detail === "string") return { message: detail };
  return null;
}

/** Turn a non-ok public answer into the one class that says what happened.
 *  Everything unrecognised becomes `WorksheetGone`: the server's own rule is
 *  that an unknown, expired, revoked or out-of-scope link is indistinguishable,
 *  and a page that guessed otherwise would be leaking the difference. */
function publicError(status: number, body: unknown): Error {
  const detail = detailOf(body);
  const code = detail?.code;
  if (status === 401 && code === "pin_required") return new WorksheetPinRequired(detail?.label ?? null);
  if (status === 401) return new WorksheetPinInvalid(detail?.message);
  if (status === 429 && code === "pin_locked") return new WorksheetPinLocked(detail?.message);
  if (status === 429) return new WorksheetTooFast(detail?.message);
  if (status === 403) return new WorksheetViewOnly(detail?.message);
  return new WorksheetGone();
}

async function publicCall<T>(
  token: string,
  suffix: string,
  init: { method?: string; session?: string | null; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  // Only when held. Sending an empty header on a link with no PIN would be a
  // header the server has to interpret for no reason.
  if (init.session) headers[WORKSHEET_SESSION_HEADER] = init.session;

  let response: Response;
  try {
    response = await fetch(publicUrl(token, suffix), {
      method: init.method ?? "GET",
      cache: "no-store",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    // The network, not the link. A caller that treated this as "gone" would
    // tell somebody on a train that their accountant's link had been revoked.
    throw new Error("network");
  }
  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      /* an empty or non-JSON error body is still an error */
    }
    throw publicError(response.status, body);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Trade the six-digit PIN for a twelve-hour session. A link with no PIN never
 *  reaches here, and one that does answers `session: null` if it has none. */
export function unlockPublicWorksheet(
  token: string,
  pin: string,
): Promise<{ session: string | null; expires_at: string | null }> {
  return publicCall<{ session: string | null; expires_at: string | null }>(token, "/unlock", {
    method: "POST",
    body: { pin },
  });
}

/** The workbook, filtered to what this link opens. Throws
 *  `WorksheetPinRequired` when the link is locked and no session is held. */
export function readPublicWorksheet(
  token: string,
  session: string | null,
): Promise<WorksheetPayload> {
  return publicCall<WorksheetPayload>(token, "", { session });
}

export function writePublicCells(
  token: string,
  session: string | null,
  edits: WorksheetCellEdit[],
  baseRev: Record<string, number> = {},
  name?: string | null,
): Promise<WorksheetCellsResult> {
  return publicCall<WorksheetCellsResult>(token, "/cells", {
    method: "POST",
    session,
    // `name` is the self-declared one. It reaches a field called `claimed_name`
    // in the audit row and nothing else — it is not an identity.
    body: { edits, base_rev: baseRev, name: name ?? null },
  });
}

export function writePublicRow(
  token: string,
  session: string | null,
  op: WorksheetRowOp,
  name?: string | null,
): Promise<WorksheetRowResult> {
  return publicCall<WorksheetRowResult>(token, "/rows", {
    method: "POST",
    session,
    body: { ...op, name: name ?? null },
  });
}

// ---------------------------------------------------------------------------
// the session, per tab
// ---------------------------------------------------------------------------

const sessionKey = (token: string) => `qc.worksheet.session.${token}`;

/** sessionStorage, not localStorage: an unlock is meant to last a sitting, not
 *  to survive on a shared machine after the tab is closed. Every access is
 *  wrapped because a private window throws rather than returning null. */
export function readWorksheetSession(token: string): string | null {
  try {
    return window.sessionStorage.getItem(sessionKey(token));
  } catch {
    return null;
  }
}

export function writeWorksheetSession(token: string, session: string): void {
  try {
    window.sessionStorage.setItem(sessionKey(token), session);
  } catch {
    /* private window: the PIN is simply asked for again */
  }
}

export function clearWorksheetSession(token: string): void {
  try {
    window.sessionStorage.removeItem(sessionKey(token));
  } catch {
    /* nothing to clear */
  }
}

// ---------------------------------------------------------------------------
// the name a guest gives itself
// ---------------------------------------------------------------------------

const nameKey = (token: string) => `qc.worksheet.name.${token}`;

/** What this person asked to be called, remembered so a reload does not ask
 *  twice. localStorage rather than sessionStorage here on purpose: this is a
 *  display name, not a credential, and being asked your name every time you
 *  come back to the same link is the annoyance the prompt exists to avoid. */
export function readWorksheetName(token: string): string | null {
  try {
    const stored = window.localStorage.getItem(nameKey(token));
    return stored && stored.trim() ? stored : null;
  } catch {
    return null;
  }
}

export function writeWorksheetName(token: string, name: string): void {
  try {
    window.localStorage.setItem(nameKey(token), name);
  } catch {
    /* private window: they are asked again next time */
  }
}

/** Clamped to what the server clamps to, and stripped of the control
 *  characters that make a name render as something it is not. */
export function cleanWorksheetName(raw: string): string {
  // eslint-disable-next-line no-control-regex -- exactly the characters being removed
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40);
}
