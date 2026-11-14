/**
 * How the Earnings Plan screens reach the API. One interface, two ways in:
 * staff through the signed-in console, and the business through its own link
 * (no sign-in, the link's token is the credential).
 *
 * The screens work every figure out themselves, so nothing here is called to
 * compute. The API is asked to load the plan, keep the draft, save a version,
 * record a staff review and bring the plan onto changed source figures.
 */
import { ApiError, apiBase } from "@/lib/api";
import { publicFinancialPdfUrl } from "@/lib/publicFinancialForms";
import type { AuthedApi } from "@/lib/worksheetApi";
import type { BaselineTreatment, EarningsPlanBody, PlanGoal, PlanServerEvaluation, PlanVersion, PlanWorkspace } from "./types";

/** An API refusal in one shape, whichever way in it came from. */
export class PlanError extends Error {
  constructor(public status: number, message: string, public code: string | null = null, public detail: Record<string, unknown> | null = null) {
    super(message);
    this.name = "PlanError";
  }
}

/** Someone else saved this plan since it was opened here. */
export const isPlanConflict = (error: unknown): boolean =>
  error instanceof PlanError && error.status === 409 && ["financial_draft_conflict", "financial_version_conflict", "operating_plan_upgraded"].includes(error.code ?? "");

/** The API found something left to finish that this page had not listed yet. */
export const isPlanIncomplete = (error: unknown): boolean => error instanceof PlanError && error.status === 422 && error.code === "earnings_plan_incomplete";

export type DraftFacts = { familyId: string | null; revision: number | null; baseVersionId: string | null };
export type VersionReply = {
  draft: { revision: number; base_version_id: string | null; dirty: boolean };
  versions: PlanVersion[];
  current_version_id: string | null;
  saved_version: PlanVersion | null;
};
export type ResyncReply = { body: EarningsPlanBody; evaluation: PlanServerEvaluation; context_stamp: string };
export type ReviewInput = {
  itemIds: string[]; decision: "approved" | "rejected" | "proposed"; reason: string;
  treatment: BaselineTreatment; reconciliation: string; contextStamp: string; key: string;
};
export type ReviewReply = { body: EarningsPlanBody; draft: { revision: number; base_version_id: string | null }; context_stamp: string; evaluation?: PlanServerEvaluation };

export interface PlanTransport {
  /** What is being edited and by whom; a different scope is a different plan. */
  readonly scope: string;
  readonly viewer: "staff" | "client";
  load(): Promise<PlanWorkspace>;
  saveDraft(body: EarningsPlanBody, facts: DraftFacts): Promise<PlanWorkspace>;
  saveVersion(body: EarningsPlanBody, facts: DraftFacts, key: string): Promise<VersionReply>;
  resync(body: EarningsPlanBody, facts: DraftFacts): Promise<ResyncReply>;
  openPdf(version: PlanVersion): Promise<void>;
  review?(input: ReviewInput, facts: DraftFacts): Promise<ReviewReply>;
  setGoal?(amount: number, currency: string, goal: PlanGoal | null, key: string): Promise<PlanGoal>;
  openSource?(fileId: string): Promise<void>;
}

function fromDetail(status: number, detail: unknown, fallback: string): PlanError {
  if (typeof detail === "string" && detail.trim()) return new PlanError(status, detail);
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const record = detail as Record<string, unknown>;
    const message = typeof record.message === "string" && record.message.trim() ? record.message : fallback;
    return new PlanError(status, fieldMessage(record) ?? message, typeof record.code === "string" ? record.code : null, record);
  }
  return new PlanError(status, fallback);
}

/** A refused field, in words: "Review the earnings plan fields: changes → value: Input should be greater than or equal to 0". */
function fieldMessage(detail: Record<string, unknown>): string | null {
  const errors = Array.isArray(detail.errors) ? detail.errors as Array<{ loc?: unknown[]; msg?: string }> : [];
  if (!errors.length || typeof detail.message !== "string") return null;
  const first = errors[0];
  const where = (first.loc ?? []).filter(part => typeof part === "string").join(" → ");
  return `${detail.message}: ${where ? `${where}: ` : ""}${String(first.msg ?? "").replace(/^Value error, /, "")}`;
}

const FALLBACKS: Record<number, string> = {
  403: "This plan is open for viewing only.",
  404: "This plan is no longer available. Ask your contact to refresh the link.",
  409: "This plan was changed somewhere else. Reload it to continue.",
  422: "The plan could not be saved as written. Check the highlighted figures and try again.",
};
const fallback = (status: number) => FALLBACKS[status] ?? "The plan could not be saved just now. What you typed is still here; it will be tried again.";

// ---------------------------------------------------------------------------
// Staff: the signed-in console
// ---------------------------------------------------------------------------

export type StaffAccess = {
  api: AuthedApi;
  profileId: string;
  /** Who is signed in, so a draft is never written under another account. */
  authScope: string;
  /** An authenticated download: the PDF route returns bytes, not JSON. */
  fetchBlob: (path: string) => Promise<{ blob: Blob; filename: string | null }>;
};

async function staffCall<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof PlanError) throw error;
    // The console's API client throws an ApiError; read any error that carries a status and a body the same way,
    // so a refusal is never mistaken for an outage because of which wrapper raised it.
    const status = error instanceof ApiError ? error.status : (error as { status?: unknown } | null)?.status;
    const message = error instanceof Error && error.message ? error.message : "";
    if (typeof status === "number" && status > 0) {
      const body = (error as { body?: unknown }).body;
      const detail = body && typeof body === "object" ? (body as { detail?: unknown }).detail : null;
      throw fromDetail(status, detail ?? message, message || fallback(status));
    }
    throw new PlanError(0, message || fallback(0));
  }
}

/**
 * A new tab opened at the click itself, which is the only moment a browser is sure to allow one, to be pointed at the
 * document once it has been fetched. Null when the browser refused it.
 */
function pendingTab(): Window | null {
  if (typeof window === "undefined") return null;
  const tab = window.open("about:blank", "_blank");
  if (!tab) return null;
  tab.opener = null;
  try {
    tab.document.title = "Opening document";
    tab.document.body.textContent = "Preparing the document…";
  } catch { /* a tab we may not write to still navigates */ }
  return tab;
}

/** Show a fetched PDF in the waiting tab, or save it when no tab could be opened. */
function showBlob(tab: Window | null, blob: Blob, filename: string | null) {
  const url = URL.createObjectURL(blob);
  if (tab && !tab.closed) tab.location.replace(url);
  else {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename ?? "earnings-plan.pdf";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 300_000);
}

export function staffPlanTransport({ api, profileId, authScope, fetchBlob }: StaffAccess): PlanTransport {
  const root = `/application-profiles/${encodeURIComponent(profileId)}`;
  const json = (value: unknown) => JSON.stringify(value);
  return {
    scope: `staff:${authScope}:${profileId}`,
    viewer: "staff",
    load: () => staffCall(() => api<PlanWorkspace>(`${root}/operating-plan/v2`)),
    saveDraft: (body, facts) => staffCall(() => api<PlanWorkspace>(`${root}/operating-plan/v2/draft`, {
      method: "PUT", body: json({ body, family_id: facts.familyId, expected_revision: facts.revision }),
    })),
    saveVersion: (_body, facts, key) => staffCall(async () => {
      const reply = await api<VersionReply & { saved_version?: PlanVersion }>(`${root}/financial-workspace/versions`, {
        method: "POST", body: json({ kind: "operating_plan", family_id: facts.familyId, expected_revision: facts.revision, base_version_id: facts.baseVersionId, idempotency_key: key, submit: false }),
      });
      return { draft: reply.draft, versions: reply.versions ?? [], current_version_id: reply.current_version_id ?? null, saved_version: reply.saved_version ?? null };
    }),
    resync: (body, facts) => staffCall(() => api<ResyncReply>(`${root}/operating-plan/v2/resync`, { method: "POST", body: json({ body, family_id: facts.familyId }) })),
    review: (input, facts) => staffCall(() => api<ReviewReply>(`${root}/operating-plan/review`, {
      method: "POST", body: json({
        family_id: facts.familyId, expected_revision: facts.revision, action_ids: input.itemIds, decision: input.decision, reason: input.reason,
        context_stamp: input.contextStamp, idempotency_key: input.key, baseline_treatment: input.treatment, baseline_reconciliation_note: input.reconciliation,
      }),
    })),
    setGoal: (amount, currency, goal, key) => staffCall(() => api<PlanGoal>(`${root}/operating-plan/goal`, {
      method: "PUT", body: json({ amount, currency, expected_revision: goal?.revision ?? 0, idempotency_key: key }),
    })),
    openPdf: version => {
      const tab = pendingTab();
      return staffCall(async () => {
        try {
          const file = await fetchBlob(`${root}/financial-workspace/versions/${encodeURIComponent(version.id)}/pdf`);
          showBlob(tab, file.blob, file.filename);
        } catch (error) { tab?.close(); throw error; }
      });
    },
    openSource: fileId => {
      const tab = pendingTab();
      return staffCall(async () => {
        try {
          const reply = await api<{ url: string }>(`${root}/evidence/files/${encodeURIComponent(fileId)}/url`);
          // A link from the document service is a signed https address; anything else is not opened.
          const url = new URL(reply.url);
          if (url.protocol !== "https:") throw new PlanError(0, "The document service returned a link that cannot be opened. Try again.");
          if (tab && !tab.closed) tab.location.replace(url.href);
          else window.open(url.href, "_blank", "noopener,noreferrer");
        } catch (error) { tab?.close(); throw error; }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// The business: its own link, no sign-in
// ---------------------------------------------------------------------------

type ClientSubmitReply = {
  workspace?: { revision: number; base_version_id: string | null; dirty: boolean; current_version: PlanVersion | null; versions: PlanVersion[] } | null;
  saved_version?: PlanVersion | null;
};

/**
 * Never sends an Authorization header: the visitor has none and the routes take
 * no user. Hand-written fetch against the API origin, as the other link pages do.
 */
export function clientPlanTransport(token: string): PlanTransport {
  const base = `${apiBase}/api/v1/application-profiles/public/financial-forms/${encodeURIComponent(token)}`;
  const call = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, { cache: "no-store", ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
    } catch {
      throw new PlanError(0, fallback(0));
    }
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) throw fromDetail(response.status, data && typeof data === "object" ? (data as { detail?: unknown }).detail : null, fallback(response.status));
    return (data ?? {}) as T;
  };
  return {
    scope: `client:${token}`,
    viewer: "client",
    load: () => call<PlanWorkspace>("/plan"),
    saveDraft: (body, facts) => call<PlanWorkspace>("/plan/draft", { method: "PUT", body: JSON.stringify({ body, expected_revision: facts.revision }) }),
    saveVersion: async (body, facts, key) => {
      const reply = await call<ClientSubmitReply>("/submit", {
        method: "POST", body: JSON.stringify({ body, owners: [], expected_revision: facts.revision, base_version_id: facts.baseVersionId, idempotency_key: key }),
      });
      const workspace = reply.workspace;
      if (!workspace) throw new PlanError(0, "The plan was submitted, but this page could not confirm it. Reload to see the saved version.");
      return {
        draft: { revision: workspace.revision, base_version_id: workspace.base_version_id, dirty: workspace.dirty },
        versions: workspace.versions ?? [], current_version_id: workspace.current_version?.id ?? null, saved_version: reply.saved_version ?? null,
      };
    },
    resync: body => call<ResyncReply>("/plan/resync", { method: "POST", body: JSON.stringify({ body }) }),
    openPdf: async version => {
      // Links are issued by the API for this form; never open one that points anywhere else.
      const url = publicFinancialPdfUrl(version.pdf_url);
      if (!url) throw new PlanError(0, "This version has no PDF to open.");
      window.open(url, "_blank", "noopener");
    },
  };
}
