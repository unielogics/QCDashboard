import type { ApplicationEvidenceWorkspace } from "@/lib/applicationProfile";
import type { BucketFileReview, BucketReviewFile } from "@/components/buckets/BucketFileReviewPanel";
import { ApiError } from "@/lib/api";

/** Reuse the evidence inventory and signed-URL checks for the current profile. */
export async function loadFinancialSourcePreview(
  request: { profileId: string; fileId: string; expectedContentHash?: string },
  api: <T>(path: string) => Promise<T>,
  currentProfile: () => string | null | undefined,
): Promise<{ review: BucketFileReview; files: BucketReviewFile[] }> {
  const assertCurrentProfile = () => {
    if (!request.profileId || currentProfile() !== request.profileId) throw new Error("Source reference needs review.");
  };
  assertCurrentProfile();
  if (request.expectedContentHash && !/^[a-f0-9]{64}$/i.test(request.expectedContentHash)) throw new Error("Source reference needs review.");
  const workspace = await api<ApplicationEvidenceWorkspace>(`/application-profiles/${encodeURIComponent(request.profileId)}/evidence-workspace`);
  assertCurrentProfile();
  const file = workspace.evidence.files.find((item) => item.id === request.fileId);
  if (!file) throw new Error("Source reference needs review. The cited document is no longer available in this profile.");
  const expectedHash = request.expectedContentHash ? `?expected_content_hash=${encodeURIComponent(request.expectedContentHash)}` : "";
  let signed: { url: string; sheets?: BucketFileReview["sheets"] };
  try {
    signed = await api<{ url: string; sheets?: BucketFileReview["sheets"] }>(`/application-profiles/${encodeURIComponent(request.profileId)}/evidence/files/${encodeURIComponent(request.fileId)}/url${expectedHash}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) throw new Error("Source file changed. Review its current version and refresh the analysis before using this reference.");
    throw error;
  }
  assertCurrentProfile();
  const files = workspace.evidence.files.map((item) => ({ id: item.id, file_name: item.file_name, content_type: item.content_type, size_bytes: item.size_bytes, is_password_protected: item.is_password_protected }));
  return { files, review: { file: files.find((item) => item.id === file.id)!, preview_url: signed.url, annotations: [], sheets: signed.sheets ?? null } };
}

export function restoreFinancialSourceFocus(sourceButton: Pick<HTMLElement, "isConnected" | "focus"> | null): void {
  if (sourceButton?.isConnected) sourceButton.focus({ preventScroll: true });
}
