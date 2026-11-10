import { apiBase } from "@/lib/api";

export type PublicFinancialVersion = {
  id: string;
  version_number: number;
  created_at: string;
  pdf_url?: string | null;
};

export type PublicFinancialWorkspace = {
  family_id: string;
  revision: number;
  base_version_id: string | null;
  dirty: boolean;
  current_version: PublicFinancialVersion | null;
  versions: PublicFinancialVersion[];
};

export type PublicFinancialReply = {
  body?: Record<string, unknown>;
  workspace?: PublicFinancialWorkspace | null;
  saved_version?: PublicFinancialVersion | null;
  can_edit?: boolean;
  permission?: "edit" | "view";
  completed?: boolean;
  completion?: { complete: boolean; active_rows: number; no_debt: boolean; missing_fields: string[]; reason: string } | null;
};

export class PublicFinancialFormError extends Error {
  constructor(public status: number, message: string, public workspace?: PublicFinancialWorkspace | null) {
    super(message);
    this.name = "PublicFinancialFormError";
  }
}

export async function publicFinancialResponse<T>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data && typeof data === "object" ? (data as { detail?: unknown }).detail : null;
    const message = typeof detail === "string" ? detail : detail && typeof detail === "object" ? (detail as { message?: unknown }).message : null;
    const fallback = response.status === 409
      ? "This form changed in another session. Your entries are still here. Reload the latest version before saving."
      : response.status === 403 ? "This link is for viewing. Ask your contact for an editable form link."
        : response.status === 404 || response.status === 410 ? "This link is no longer available. Ask your contact to refresh it."
          : response.status === 422 ? "Please check the required fields and try again."
            : "Your changes could not be saved. Please try again; your entries are still here.";
    const workspace = detail && typeof detail === "object" ? (detail as { workspace?: PublicFinancialWorkspace }).workspace : null;
    throw new PublicFinancialFormError(response.status, typeof message === "string" && message.trim() ? message : fallback, workspace);
  }
  return (data ?? {}) as T;
}

const newId = () => globalThis.crypto.randomUUID();

/** Stable identities belong to this working form, even before its first save. */
export function publicFinancialBody<T extends Record<string, unknown>>(body: T): T {
  const rows = (value: unknown) => Array.isArray(value) ? value.map((row) => row && typeof row === "object" && !Array.isArray(row)
    ? { ...row, id: typeof row.id === "string" && row.id ? row.id : newId() } : row) : value;
  const next = { ...body } as Record<string, unknown>;
  for (const key of ["debts", "properties", "mortgages", "expenses", "adjustments"]) if (Array.isArray(next[key])) next[key] = rows(next[key]);
  if (next.schedules && typeof next.schedules === "object" && !Array.isArray(next.schedules)) {
    next.schedules = Object.fromEntries(Object.entries(next.schedules).map(([key, value]) => [key, rows(value)]));
  }
  return next as T;
}

/** One tab's ordered writes. A late autosave never runs after a newer submit. */
export class PublicFinancialFormWriter {
  workspace: PublicFinancialWorkspace | null;
  private tail: Promise<unknown> = Promise.resolve();
  private conflict: PublicFinancialFormError | null = null;
  private attempt: { body: string; key: string } | null = null;
  private submitting: { body: string; promise: Promise<PublicFinancialReply> } | null = null;

  constructor(private base: string, workspace?: PublicFinancialWorkspace | null) {
    this.workspace = workspace ?? null;
  }

  flush(): Promise<unknown> { return this.tail; }

  write(mode: "draft" | "submit", body: Record<string, unknown>): Promise<PublicFinancialReply> {
    const serialized = JSON.stringify(body);
    if (mode === "submit" && this.submitting?.body === serialized) return this.submitting.promise;
    const run = this.tail.catch(() => undefined).then(async () => {
      if (this.conflict) throw this.conflict;
      const context = this.workspace;
      const payload: Record<string, unknown> = { body: JSON.parse(serialized), owners: [] };
      if (context) payload.expected_revision = context.revision;
      if (mode === "submit") {
        if (!this.attempt || this.attempt.body !== serialized) this.attempt = { body: serialized, key: newId() };
        payload.base_version_id = context?.base_version_id ?? null;
        payload.idempotency_key = this.attempt.key;
      }
      try {
        const response = await fetch(`${this.base}/${mode}`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const reply = await publicFinancialResponse<PublicFinancialReply>(response);
        if (reply.workspace) this.workspace = reply.workspace;
        if (mode === "submit") this.attempt = null;
        return reply;
      } catch (error) {
        // PDF failure can retain a newly changed draft. Its acknowledged
        // revision enables retry without replaying stale form answers.
        if (error instanceof PublicFinancialFormError && error.workspace?.family_id === this.workspace?.family_id) {
          this.workspace = error.workspace ?? this.workspace;
        }
        if (error instanceof PublicFinancialFormError && error.status === 409) this.conflict = error;
        throw error;
      }
    });
    this.tail = run;
    if (mode === "submit") {
      this.submitting = { body: serialized, promise: run };
      const clear = () => { if (this.submitting?.promise === run) this.submitting = null; };
      void run.then(clear, clear);
    }
    return run;
  }
}

/** PDF links are server-issued for this form scope; never execute a supplied URL. */
export function publicFinancialPdfUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const base = new URL(apiBase);
    const url = new URL(value, base);
    if (url.origin !== base.origin || !["https:", "http:"].includes(url.protocol)) return null;
    return url.toString();
  } catch { return null; }
}
