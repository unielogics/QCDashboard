import { apiBase } from "./api";
import type { FinancialBody, FinancialEvidence, FinancialImport, FinancialVersion } from "./financialWorkspaceApi";
import { financialSourceIsImage } from "./financialSourceFiles";

export type LoanPreviewFile = FinancialEvidence & { content_hash?: string | null };
/** A filename never supplies identity. Use provenance for this exact retained source only. */
export function loanPreviewReference(file: FinancialEvidence, body: FinancialBody, proposal?: FinancialImport | null, versions: FinancialVersion[] = []): LoanPreviewFile {
  const sources = Object.values((body.field_sources ?? {}) as Record<string, FinancialImport["mappings"][number]["source"]>);
  const mapped = proposal?.mappings.map((mapping) => mapping.source) ?? [];
  const exact = [...mapped, ...sources].filter((source) => source?.file_id === file.file_id);
  const hashes = [...new Set(exact.map((source) => source.content_hash).filter((hash): hash is string => Boolean(hash && /^[a-f0-9]{64}$/i.test(hash))))];
  const contentTypes = [...new Set(exact.map((source) => source.content_type).filter(Boolean))];
  const originalType = versions.find((version) => version.source_file_id === file.file_id && !version.pdf_file_id)?.source_content_type;
  const storedHash = (file as LoanPreviewFile).content_hash;
  return { ...file, content_type: originalType ?? (contentTypes.length === 1 ? contentTypes[0] : file.content_type), content_hash: storedHash && /^[a-f0-9]{64}$/i.test(storedHash) ? storedHash : hashes.length === 1 ? hashes[0] : undefined };
}
export { financialSourceIsImage as loanFileHasImagePreview };

export async function fetchLoanImagePreview(request: { profileId: string; file: LoanPreviewFile; signal: AbortSignal; getToken: () => Promise<string | null>; devUser?: string | null }): Promise<Blob> {
  if (!request.profileId || !request.file.file_id) throw new Error("This source is not available in the current client file.");
  if (request.file.content_hash && !/^[a-f0-9]{64}$/i.test(request.file.content_hash)) throw new Error("This source reference needs review.");
  const token = await request.getToken();
  request.signal.throwIfAborted();
  const query = request.file.content_hash ? `?expected_content_hash=${encodeURIComponent(request.file.content_hash)}` : "";
  const response = await fetch(`${apiBase}/api/v1/application-profiles/${encodeURIComponent(request.profileId)}/financial-workspace/evidence/${encodeURIComponent(request.file.file_id)}/image-preview${query}`, {
    signal: request.signal, cache: "no-store", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(request.devUser ? { "X-Dev-User": request.devUser } : {}) },
  });
  if (!response.ok) throw new Error(response.status === 409 ? "This source changed since it was reviewed. Refresh the file reference before using it." : "The image preview could not be loaded. Retry, or use Open source to inspect the retained original.");
  if (!/^image\/jpeg(?:;|$)/i.test(response.headers.get("Content-Type") ?? "")) throw new Error("A readable image preview is not available. The original file is retained.");
  return response.blob();
}

export function loanPreviewPosition(anchor: { left: number; right: number; top: number; bottom: number }, viewport: { width: number; height: number }, desired = { width: 720, height: 840 }) {
  const gap = 10; const edge = 12;
  const width = Math.min(desired.width, Math.max(0, viewport.width - edge * 2));
  const height = Math.min(desired.height, Math.max(0, viewport.height - edge * 2));
  const beside = viewport.width - anchor.right >= width + gap + edge ? anchor.right + gap : anchor.left >= width + gap + edge ? anchor.left - width - gap : anchor.left;
  const vertical = beside === anchor.left ? viewport.height - anchor.bottom >= height + gap + edge ? anchor.bottom + gap : anchor.top - height - gap : anchor.top;
  const top = Math.max(edge, Math.min(vertical, viewport.height - height - edge));
  return { left: Math.max(edge, Math.min(beside, viewport.width - width - edge)), top, width, maxHeight: Math.max(0, viewport.height - top - edge) };
}
