"use client";

import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthedApi } from "@/hooks/useApi";
import type { Document, DocumentUploadInitResponse } from "@/lib/types";
import { uploadFile, type UploadCaller } from "@/lib/fileUpload";
import { documentVersionNumber, type DocumentVersionHistory, type DocumentVersionService } from "@/lib/documentVersions";
import { DocumentVersionControl } from "./DocumentVersionControl";

export function legacyDocumentVersions(call: UploadCaller, document: Pick<Document, "id" | "loan_id" | "name" | "category">): DocumentVersionService {
  return {
    load: () => call<DocumentVersionHistory>(`/documents/${document.id}/versions`),
    url: async (versionId) => (await call<{ url: string }>(`/documents/${document.id}/versions/${versionId}/download`)).url,
    upload: (input) => uploadFile({ initPath: "/documents/upload-init", completePath: "/documents/upload-complete", call: async <T,>(path: string, options?: RequestInit): Promise<T> => {
      if (path.endsWith("/upload-init")) {
        const init = await call<DocumentUploadInitResponse>(path, { method: "POST", body: JSON.stringify({ loan_id: document.loan_id, name: document.name, category: document.category, content_type: input.file.type || "application/octet-stream", replace_document_id: document.id, expected_document_version: documentVersionNumber(input.previous), idempotency_key: input.idempotencyKey }) });
        return { file_id: init.document_id, version_id: init.version_id, upload_url: init.upload_url, already_uploaded: init.already_uploaded, required_headers: { "Content-Type": input.file.type || "application/octet-stream", "x-amz-server-side-encryption": "AES256" } } as T;
      }
      const payload = JSON.parse(String(options?.body)) as { file_id: string; version_id?: string };
      return call<T>(path, { method: "POST", body: JSON.stringify({ document_id: payload.file_id, version_id: payload.version_id }) });
    } }, input.file, { storedFileId: input.storedFileId, storedVersionId: input.storedVersionId, onStored: input.onStored, onStage: input.onStage }),
  };
}

export function LegacyDocumentVersionControl({ document }: { document: Document }) {
  const call = useAuthedApi();
  const queryClient = useQueryClient();
  const service = useMemo(() => legacyDocumentVersions(call, document), [call, document]);
  if (!document.s3_key && !document.document_version_number && !document.document_latest_version_number) return null;
  return <span onClick={(event) => event.stopPropagation()}><DocumentVersionControl file={{ ...document, id: document.id, file_name: document.name, document_version_number: document.document_latest_version_number || document.document_version_number, document_version_status: document.document_has_pending_version ? "pending" : document.document_version_status }} service={service} onChanged={async () => { await queryClient.invalidateQueries({ predicate: (query) => /documents|vault|loan/.test(String(query.queryKey[0])) }); }} /></span>;
}
