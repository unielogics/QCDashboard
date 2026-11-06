import type { AuthedApi } from "./worksheetApi";
import { assertPdfUploadUnlocked } from "./documentUpload";
import { financialUploadContentType } from "./financialSourceFiles";

/** Upload originals once; linking and accepting extracted fields are separate actions. */
export async function uploadFinancialEvidence(api: AuthedApi, profileId: string, file: File): Promise<string> {
  await assertPdfUploadUnlocked(file);
  const path = `/application-profiles/${encodeURIComponent(profileId)}/evidence/files`;
  const started = await api<{ file_id: string; upload_url: string | null; required_headers?: Record<string, string>; already_uploaded?: boolean }>(`${path}/upload-init`, {
    method: "POST", body: JSON.stringify({ file_name: file.name, content_type: financialUploadContentType(file), size_bytes: file.size }),
  });
  if (!started.already_uploaded) {
    if (!started.upload_url) throw new Error(`${file.name}: the upload could not be started. Try again.`);
    const response = await fetch(started.upload_url, { method: "PUT", headers: started.required_headers ?? {}, body: file });
    if (!response.ok) throw new Error(`${file.name} could not be uploaded (HTTP ${response.status}). Other received files are retained.`);
    await api(`${path}/complete`, { method: "POST", body: JSON.stringify({ file_id: started.file_id }) });
  }
  return started.file_id;
}
