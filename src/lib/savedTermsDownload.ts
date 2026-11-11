export type SavedTermsKind = "application_term_sheet" | "production_term_sheet";

export class SavedTermsPdfError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function savedTermsPdfPath(profileId: string, kind: SavedTermsKind, version: number): string {
  if (!Number.isInteger(version) || version < 1) throw new Error("Save a terms version before downloading.");
  const profile = encodeURIComponent(profileId);
  return kind === "production_term_sheet"
    ? `/production-packages/term-sheets/${profile}/client.pdf?expected_version=${version}&disposition=attachment`
    : `/application-profiles/${profile}/client-terms.pdf?expected_version=${version}`;
}

export function savedTermsFilename(disposition: string | null, kind: SavedTermsKind, version: number): string {
  const fallback = `${kind === "production_term_sheet" ? "loan" : "financing"}-terms-v${version}.pdf`;
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition ?? "")?.[1];
  let name = encoded ?? /filename\s*=\s*"([^"]+)"/i.exec(disposition ?? "")?.[1] ?? /filename\s*=\s*([^;]+)/i.exec(disposition ?? "")?.[1];
  if (!name) return fallback;
  if (encoded) { try { name = decodeURIComponent(name); } catch { return fallback; } }
  name = name.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_").trim();
  return name && /\.pdf$/i.test(name) ? name : fallback;
}

/** Reads only the saved snapshot; never issues, saves, or recalculates working terms. */
export async function readSavedTermsPdf({ base, profileId, kind, version, token, devUser, signal, fetcher = fetch }: {
  base: string; profileId: string; kind: SavedTermsKind; version: number;
  token?: string | null; devUser?: string; signal?: AbortSignal; fetcher?: typeof fetch;
}): Promise<{ blob: Blob; filename: string }> {
  const response = await fetcher(`${base}/api/v1${savedTermsPdfPath(profileId, kind, version)}`, {
    method: "GET", signal, cache: "no-store",
    headers: { Accept: "application/pdf", ...(token ? { Authorization: `Bearer ${token}` } : devUser ? { "X-Dev-User": devUser } : {}) },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: unknown } | null;
    const detail = typeof payload?.detail === "string" ? payload.detail : payload?.detail && typeof payload.detail === "object" && "message" in payload.detail ? (payload.detail as { message?: unknown }).message : null;
    throw new SavedTermsPdfError(response.status, typeof detail === "string" && detail.trim() ? detail : `The saved terms PDF could not be downloaded (${response.status}).`);
  }
  if (!response.headers.get("Content-Type")?.toLowerCase().includes("application/pdf")) throw new Error("The server did not return a PDF. Try downloading the saved terms again.");
  const blob = await response.blob();
  if (!blob.size) throw new Error("The saved terms PDF was empty. Try downloading it again.");
  return { blob, filename: savedTermsFilename(response.headers.get("Content-Disposition"), kind, version) };
}
