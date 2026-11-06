import { uploadFile, type UploadCaller, type UploadStage, type UploadTarget } from "./fileUpload";

export type DocumentVersionMetadata = {
  document_family_id?: string | null;
  document_version_number?: number;
  document_version_status?: "current" | "pending" | "superseded" | "duplicate" | "failed" | "rejected" | string;
  is_current_document_version?: boolean;
  supersedes_file_id?: string | null;
  latest_file_id?: string | null;
  latest_version_number?: number | null;
  latest_document_version_status?: string | null;
  is_latest_document_version?: boolean;
  source_kind?: string | null;
  source_detail?: string | null;
  managed_financial_form_history?: boolean;
};
export type DocumentVersionFile = DocumentVersionMetadata & {
  id: string;
  file_name: string;
  content_type?: string;
  created_at?: string;
  uploaded_by_name?: string | null;
  analysis_status?: string | null;
  analysis_review_state?: string | null;
  analysis_reason_code?: string | null;
  requested_document_id?: string | null;
  source_document_date?: string | null;
  document_date?: string | null;
  source?: string | null;
  uploaded_at?: string | null;
  can_preview?: boolean;
  can_download?: boolean;
};
export type DocumentVersionHistory = {
  document_family_id: string;
  current_file_id: string | null;
  latest_file_id: string | null;
  can_upload_new_version: boolean;
  versions: DocumentVersionFile[];
};
export type DocumentVersionUpload = {
  file: File;
  previous: DocumentVersionFile;
  idempotencyKey: string;
  storedFileId?: string;
  storedVersionId?: string;
  onStored: (fileId: string, versionId?: string) => void;
  onStage: (stage: UploadStage) => void;
};
export type DocumentVersionService = {
  load: (fileId: string) => Promise<DocumentVersionHistory>;
  upload: (input: DocumentVersionUpload) => Promise<unknown>;
  url?: (fileId: string, download: boolean) => Promise<string>;
};

export function documentVersionNumber(file: DocumentVersionMetadata): number {
  return Number.isInteger(file.document_version_number) && (file.document_version_number ?? 0) > 0 ? file.document_version_number! : 1;
}
export function managedFinancialDocument(file: DocumentVersionMetadata): boolean {
  return file.managed_financial_form_history === true || Boolean(file.source_detail?.startsWith("financial_version:"));
}
export function historicalDocumentReference(file: DocumentVersionMetadata, referenceId: string): boolean {
  return ["superseded", "pending", "failed", "rejected", "duplicate"].includes(file.document_version_status || "") || Boolean(file.latest_file_id && file.latest_file_id !== referenceId);
}
export function duplicateDocumentUpload(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const envelope = result as Record<string, unknown>;
  const complete = envelope.complete && typeof envelope.complete === "object" ? envelope.complete as Record<string, unknown> : envelope;
  return complete.document_version_status === "duplicate" || typeof complete.duplicate_of_file_id === "string" && Boolean(complete.duplicate_of_file_id);
}
export function documentVersionLabel(file: DocumentVersionMetadata): string {
  const status = file.document_version_status || (file.is_current_document_version ? "current" : "");
  const labels: Record<string, string> = { current: "Current", pending: "Being checked", superseded: "Historical", duplicate: "Duplicate upload", failed: "Analysis failed", rejected: "Needs another version" };
  return `v${documentVersionNumber(file)}${status ? ` · ${labels[status] || status.replaceAll("_", " ")}` : ""}`;
}
export function documentVersionUploadLabel(file: DocumentVersionFile): string {
  if (file.source === "legacy_baseline") return "Existing file baseline · Upload date not recorded";
  const value = Object.prototype.hasOwnProperty.call(file, "uploaded_at") ? file.uploaded_at : file.created_at;
  return value && !Number.isNaN(new Date(value).getTime()) ? `Uploaded ${new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : "Upload date not recorded";
}
export function latestDocumentVersion<T extends DocumentVersionFile>(files: T[]): T | null {
  return files.reduce<T | null>((latest, file) => !latest || documentVersionNumber(file) > documentVersionNumber(latest) ? file : latest, null);
}
/** Only explicit server families group files; equal names or categories never do. */
export function latestDocumentFiles<T extends DocumentVersionFile>(files: T[]): T[] {
  const families = new Map<string, T>();
  for (const file of files) {
    const family = file.document_family_id || file.id;
    const previous = families.get(family);
    if (!previous || documentVersionNumber(file) > documentVersionNumber(previous)) families.set(family, file);
  }
  return [...families.values()];
}

export function documentVersionService(call: UploadCaller, root: string, options: {
  historyMethod?: "GET" | "POST";
  credential?: Record<string, unknown>;
  uploadTarget?: UploadTarget;
  extraInit?: Record<string, unknown>;
  fileUrl?: (fileId: string, download: boolean) => Promise<string>;
} = {}): DocumentVersionService {
  return {
    load: (fileId) => call<DocumentVersionHistory>(`${root}/files/${encodeURIComponent(fileId)}/versions`, options.historyMethod === "POST" ? { method: "POST", body: JSON.stringify(options.credential || {}) } : undefined),
    upload: ({ file, previous, idempotencyKey, storedFileId, storedVersionId, onStored, onStage }) => uploadFile(options.uploadTarget || { initPath: `${root}/files/upload-init`, completePath: `${root}/files/complete`, call }, file, {
      requestedDocumentId: previous.requested_document_id,
      extraInit: { ...options.credential, ...options.extraInit, replaces_file_id: previous.id, expected_document_version: documentVersionNumber(previous), idempotency_key: idempotencyKey },
      extraComplete: options.credential,
      storedFileId, storedVersionId, onStored, onStage,
    }),
    url: options.fileUrl,
  };
}
