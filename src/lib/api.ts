// Typed fetcher for the qcbackend API.
//
// In dev mode, the backend doesn't enforce Clerk auth; we send X-Dev-User to
// switch which seeded user we appear as (drives role-aware UI gating).

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

export interface ApiOptions extends RequestInit {
  devUser?: string;
  authToken?: string;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { devUser, authToken, headers, ...rest } = opts;
  // Sanitize X-Dev-User: HTTP header values can't contain `[]`/`()` or other
  // separators. If a stored user.email or display string ever leaks through
  // with markdown-link formatting like `[a@b.com](mailto:a@b.com)`, extract
  // the actual email so we don't blow up Chrome's header validator.
  const safeDevUser = sanitizeDevUser(devUser);
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(safeDevUser ? { "X-Dev-User": safeDevUser } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...headers,
    },
  });
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* ignore */ }
    throw new ApiError(res.status, `${res.status} ${res.statusText}`, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiBase = API_URL;

// Pull a usable email address out of a possibly-decorated string. Handles:
//   - "user@example.com"                                  → "user@example.com"
//   - "[user@example.com](mailto:user@example.com)"       → "user@example.com"
//   - "<user@example.com>"                                → "user@example.com"
//   - "Marcus Holloway <mh@example.com>"                  → "mh@example.com"
// Returns undefined for empty/missing input or when no email is detectable.
function sanitizeDevUser(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = raw.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (!match) return undefined;
  return match[0];
}
