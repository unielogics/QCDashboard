// Transport is injected: the dashboard passes its authed fetcher and a package id,
// the rep app passes its authed fetcher and the share token. The workspace never
// knows which app it is in; the package's capabilities decide what renders.
import { ApiError, apiBase } from "@/lib/api";
import type {
  ApiCall, ApiInit, Arrangement, Comparison, Computed, AttentionItem, HistoryEvent, ProductionPackage, SendRequest, SendResult,
  ShareLink, Signature, SmsConsent, SponsorOption, StoredSignatureRead, TeamMember, TermSheetBody, TermSheetResult, TermSheetState,
} from "./types";

export type SponsorCompanyFields = {
  entity_type: string; state_of_formation: string; principal_address: string;
  notice_email: string; notice_attention: string; notice_address: string;
  platform_name: string; signatory_name: string; signatory_title: string; phone: string;
};

export type PrefillResult = {
  values: Record<string, unknown>;
  provenance: Record<string, { source: string; label: string; confirmed: boolean }>;
  applied: string[];
  skipped: string[];
  missing: string[];
};

export type ComputeResult = { computed: Computed; attention: AttentionItem[]; attention_presentation: AttentionItem[] };

// Fallback only: a party with no signature on file (SUPER_ADMIN).
export type ManualSignatureBody = {
  party: "qc" | "sponsor" | "rm";
  initials?: string;
  signer_name: string;
  signer_title: string;
  signed_on: string;
  attestation: boolean;
  note?: string;
  override_reason?: string;
  scan_file_name?: string;
  scan_content_type?: string;
};

export type ManualSignatureResult = {
  signature: Signature;
  package: ProductionPackage;
  scan_upload: { signature_id: string; key: string; url?: string; headers?: Record<string, string>; method?: string } | null;
};

export interface PackageClient {
  // The transport: the dashboard's operator routes or the rep's share-link routes.
  // Rendering is decided by `pkg.capabilities` / `pkg.mode`, never by this.
  readonly mode: "operator" | "rep";
  load(): Promise<ProductionPackage>;
  patch(version: number, changes: Record<string, unknown>, confirm?: string[]): Promise<ProductionPackage>;
  prefill(opts?: { force?: boolean; fields?: string[]; apply?: boolean }): Promise<PrefillResult>;
  compute(arrangement: Partial<Arrangement>, stage?: number): Promise<ComputeResult>;
  presentation(): Promise<ProductionPackage>;
  // Stage-one agents (a rep via their link, a partner on their own lead) may send and remind — `caps.can_send` / `caps.can_remind` decide.
  send?(body: SendRequest): Promise<SendResult>;
  remind?(body: { channel: "sms" | "email" }): Promise<SendResult>;
  // operator only — absent on the share client
  sponsors?(): Promise<SponsorOption[]>;
  /** Correct the sponsor company itself. The desk owns it; packages copy from it. */
  updateSponsor?(companyId: string, changes: Partial<SponsorCompanyFields>): Promise<SponsorOption>;
  team?(): Promise<TeamMember[]>;
  reopen?(reason: string): Promise<ProductionPackage>;
  voidPackage?(reason: string): Promise<ProductionPackage>;
  recordManual?(body: ManualSignatureBody): Promise<ManualSignatureResult>;
  scanComplete?(signatureId: string, sha256: string): Promise<ProductionPackage>;
  /** Retry the executed bundle after the dealer signed but the assembly failed (`pkg.execution_pending`). */
  execute?(): Promise<ProductionPackage>;
  /** Draft the final (stage two) from this executed stage-one package; returns the child. */
  draftFinal?(): Promise<ProductionPackage>;
  /** Original vs final rows for this package (parent or child id). */
  comparison?(): Promise<Comparison>;
  /** Authorize the sponsor's agreement signature for use on production agreements (SUPER_ADMIN). */
  adoptSponsorSignature?(reason: string): Promise<StoredSignatureRead>;
  // term sheet — keyed on the profile, not the package
  termSheet?(profileId: string): Promise<TermSheetState>;
  saveTermSheet?(profileId: string, body: TermSheetBody): Promise<TermSheetResult>;
  withdrawTermSheet?(profileId: string, reason: string): Promise<TermSheetState>;
  createShareLink?(body: ShareLinkCreateBody): Promise<ShareLinkCreated>;
  revokeShareLink?(linkId: string): Promise<void>;
  history?(): Promise<{ events: HistoryEvent[] }>;
  captureSmsConsent?(body: { phone: string; consenter_name: string; method: string }): Promise<SmsConsent>;
  revisionDocument?(revisionId: string, phase: "unsigned" | "current" | "executed"): Promise<{ url: string | null; sha256: string | null; phase: string }>;
}

export type ShareLinkCreateBody = {
  // `rep`: one signed-in field rep. `public`: anyone with the link, opened with a PIN.
  kind?: "rep" | "public"; rep_user_id?: string; recipient_name?: string; recipient_email?: string;
  label?: string; expires_in_days: number; outside_book?: boolean;
};
export type ShareLinkCreated = { link: ShareLink; url: string; expires_at: string; pin?: string | null };
export type ShareResolved = { package_id: string; direct: boolean; mode: string };

const json = (body: unknown, method = "POST"): ApiInit => ({ method, body: JSON.stringify(body) });

// ---- the forwarded link ----------------------------------------------------
// A visitor with no account. Everything here hand-writes fetch against apiBase:
// `api()` injects Clerk's token and a dev-user header, and using it would not
// fail loudly — it would quietly attach the wrong identity. Same rule as
// forms/[kind]/[token] and buckets/request/[token].

export const LINK_SESSION_HEADER = "X-Link-Session";

export async function publicLinkCall<T>(token: string, path: string, init: ApiInit & { session?: string | null } = {}): Promise<T> {
  const { session, ...rest } = init;
  const body = typeof rest.body === "string" ? rest.body : rest.body === undefined ? undefined : JSON.stringify(rest.body);
  const res = await fetch(`${apiBase}/api/v1/production-packages/link/${encodeURIComponent(token)}${path}`, {
    method: rest.method ?? "GET", body,
    headers: { "Content-Type": "application/json", ...(session ? { [LINK_SESSION_HEADER]: session } : {}), ...(rest.headers ?? {}) },
  });
  if (!res.ok) {
    let payload: unknown = null;
    try { payload = await res.json(); } catch { /* no body */ }
    const detail = payload && typeof payload === "object" && "detail" in payload ? (payload as { detail?: unknown }).detail : null;
    const nested = detail && typeof detail === "object" && "message" in detail ? (detail as { message?: unknown }).message : null;
    const message = typeof detail === "string" && detail.trim() ? detail : typeof nested === "string" && nested.trim() ? nested : `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, message, payload);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function unlockPublicLink(token: string, pin: string): Promise<{ session: string; expires_at: string; package: ProductionPackage }> {
  return publicLinkCall(token, "/unlock", { method: "POST", body: { pin } });
}

/** A signed-in person opened a forwarded link: where do they belong? */
export function resolveShareForUser(call: ApiCall, token: string): Promise<ShareResolved> {
  return call<ShareResolved>(`/production-packages/shares/${encodeURIComponent(token)}/resolve`);
}

export function createPublicShareClient(token: string, session: string): PackageClient {
  const s = { session };
  return {
    mode: "rep",
    load: () => publicLinkCall<ProductionPackage>(token, "", s),
    patch: (version, changes, confirm = []) => publicLinkCall<ProductionPackage>(token, "", { ...s, method: "PATCH", body: { version, changes, confirm } }),
    // The file's own prefill is the desk's; a forwarded link never reaches it.
    prefill: async () => { throw new ApiError(403, "Not available on a forwarded link"); },
    compute: (arrangement) => publicLinkCall<ComputeResult>(token, "/compute", { ...s, method: "POST", body: { arrangement } }),
    presentation: () => publicLinkCall<ProductionPackage>(token, "/presentation", { ...s, method: "POST", body: {} }),
  };
}

/** Resolve (or create) the stage-one package on a profile. */
export async function resolvePackage(call: ApiCall, profileId: string): Promise<ProductionPackage> {
  return call<ProductionPackage>("/production-packages/resolve", json({ profile_id: profileId }));
}

/** Load any package by id — the final (`final_package_id`) or the parent (`parent_package_id`). */
export async function loadPackage(call: ApiCall, packageId: string): Promise<ProductionPackage> {
  return call<ProductionPackage>(`/production-packages/${packageId}`);
}

export function createOperatorClient(call: ApiCall, packageId: string): PackageClient {
  const base = `/production-packages/${packageId}`;
  return {
    mode: "operator",
    load: () => call<ProductionPackage>(base),
    patch: (version, changes, confirm = []) => call<ProductionPackage>(base, json({ version, changes, confirm }, "PATCH")),
    prefill: (opts = {}) => call<PrefillResult>(`${base}/prefill`, json({ force: false, apply: true, ...opts })),
    compute: (arrangement, stage) => call<ComputeResult>(`${base}/compute`, json(stage ? { arrangement, stage } : { arrangement })),
    presentation: () => call<ProductionPackage>(`${base}/presentation`, json({})),
    sponsors: () => call<SponsorOption[]>("/production-packages/sponsors"),
    updateSponsor: (companyId, changes) => call<SponsorOption>(`/production-packages/sponsors/${companyId}`, json(changes, "PATCH")),
    // /users is super-admin only; this is the list every operator may read.
    team: () => call<TeamMember[]>("/users/team"),
    send: (body) => call<SendResult>(`${base}/send`, json(body)),
    remind: (body) => call<SendResult>(`${base}/remind`, json(body)),
    reopen: (reason) => call<ProductionPackage>(`${base}/reopen`, json({ reason })),
    voidPackage: (reason) => call<ProductionPackage>(`${base}/void`, json({ reason })),
    recordManual: (body) => call<ManualSignatureResult>(`${base}/signatures/manual`, json(body)),
    scanComplete: (signatureId, sha256) => call<ProductionPackage>(`${base}/signatures/${signatureId}/scan-complete`, json({ sha256 })),
    execute: () => call<ProductionPackage>(`${base}/execute`, json({})),
    draftFinal: () => call<ProductionPackage>(`${base}/final`, json({})),
    comparison: () => call<Comparison>(`${base}/comparison`),
    adoptSponsorSignature: (reason) => call<StoredSignatureRead>(`${base}/sponsor-signature/adopt`, json({ reason })),
    termSheet: (profileId) => call<TermSheetState>(`/production-packages/term-sheets/${profileId}`),
    saveTermSheet: (profileId, body) => call<TermSheetResult>(`/production-packages/term-sheets/${profileId}`, json(body)),
    withdrawTermSheet: (profileId, reason) => call<TermSheetState>(`/production-packages/term-sheets/${profileId}/withdraw`, json({ reason })),
    createShareLink: (body) => call(`${base}/share-links`, json(body)),
    revokeShareLink: (linkId) => call<void>(`${base}/share-links/${linkId}`, { method: "DELETE" }),
    history: () => call<{ events: HistoryEvent[] }>(`${base}/history`),
    captureSmsConsent: (body) => call<SmsConsent>(`${base}/sms-consent`, json(body)),
    revisionDocument: (revisionId, phase) => call(`${base}/revisions/${revisionId}/document?phase=${phase}`),
  };
}

export function createShareClient(call: ApiCall, token: string): PackageClient {
  const base = `/production-packages/shares/${encodeURIComponent(token)}`;
  return {
    mode: "rep",
    load: () => call<ProductionPackage>(base),
    patch: (version, changes, confirm = []) => call<ProductionPackage>(base, json({ version, changes, confirm }, "PATCH")),
    prefill: (opts = {}) => call<PrefillResult>(`${base}/prefill`, json({ force: false, apply: true, ...opts })),
    // The share routes are stage one by construction; the server ignores any stage.
    compute: (arrangement) => call<ComputeResult>(`${base}/compute`, json({ arrangement })),
    presentation: () => call<ProductionPackage>(`${base}/presentation`, json({})),
    send: (body) => call<SendResult>(`${base}/send`, json({ channel: body.channel })),
    remind: (body) => call<SendResult>(`${base}/remind`, json(body)),
  };
}
