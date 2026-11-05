import { assertPdfUploadUnlocked, documentUploadErrorMessage } from "@/lib/documentUpload";

/**
 * The one way a file reaches secure storage.
 *
 * Fourteen screens each carried their own copy of the same three steps —
 * ask the API for a presigned upload, PUT the bytes, confirm — with small
 * drifts between them (`size` vs `size_bytes`, `headers` vs
 * `required_headers`). This is that protocol once, with the drifts absorbed.
 * Screens keep their own queue UI and call `uploadFile` per item; the
 * `onStage` callback is how they narrate progress in their own words.
 */

export type UploadCaller = <T>(path: string, init?: RequestInit) => Promise<T>;

export type UploadTarget = {
  /** Where `POST …/upload-init` lives for this surface. */
  initPath: string;
  /** Where `POST …/complete` lives for this surface. */
  completePath: string;
  /** The authenticated (or token-scoped) fetch the surface already uses. */
  call: UploadCaller;
  /** A few older endpoints expect `size` rather than `size_bytes`. */
  sizeField?: "size_bytes" | "size";
};

export type UploadStage = "preparing" | "uploading" | "confirming";

export type UploadInitResponse = {
  file_id: string;
  upload_url: string;
  required_headers?: Record<string, string> | null;
  headers?: Record<string, string> | null;
};

export type UploadFileOptions<TComplete> = {
  requestedDocumentId?: string | null;
  /** Extra fields the surface's init endpoint accepts (uploader name, etc.). */
  extraInit?: Record<string, unknown>;
  /** Extra fields the surface's complete endpoint accepts (a note, etc.). */
  extraComplete?: Record<string, unknown>;
  onStage?: (stage: UploadStage) => void;
  /** Message when storage refuses the bytes; the default names the file. */
  storageRejectedMessage?: (file: File, status: number) => string;
  /** Lets a caller read the complete response (e.g. a parsed offer). */
  mapComplete?: (value: unknown) => TComplete;
  /** The server still validates the PDF; skip a redundant browser decode. */
  clientPdfCheck?: boolean;
  storageAttempts?: number;
  storageTimeoutMs?: number;
  /** Resume a stored file at confirmation rather than uploading it again. */
  storedFileId?: string;
  onStored?: (fileId: string) => void;
};

export type UploadFileResult<TComplete = unknown> = {
  fileId: string;
  complete: TComplete;
};

export async function uploadFile<TComplete = unknown>(
  target: UploadTarget,
  file: File,
  options: UploadFileOptions<TComplete> = {},
): Promise<UploadFileResult<TComplete>> {
  const { requestedDocumentId, extraInit, extraComplete, onStage, storageRejectedMessage, mapComplete } = options;
  let fileId = options.storedFileId;
  if (!fileId) {
    onStage?.("preparing");
    // Readability is authoritative on the server; callers may omit a redundant decode.
    if (options.clientPdfCheck !== false) await assertPdfUploadUnlocked(file);
    const contentType = file.type || "application/octet-stream";
    const init = await target.call<UploadInitResponse>(target.initPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(requestedDocumentId !== undefined ? { requested_document_id: requestedDocumentId } : {}),
        file_name: file.name,
        content_type: contentType,
        [target.sizeField ?? "size_bytes"]: file.size,
        ...(extraInit ?? {}),
      }),
    });
    onStage?.("uploading");
    const headers = init.headers ?? init.required_headers ?? { "Content-Type": contentType };
    const attempts = Math.max(1, Math.min(3, Math.floor(options.storageAttempts ?? 1)));
    for (let attempt = 0; attempt < attempts; attempt++) {
      const controller = new AbortController();
      const timer = options.storageTimeoutMs ? setTimeout(() => controller.abort(), options.storageTimeoutMs) : undefined;
      try {
        const put = await fetch(init.upload_url, { method: "PUT", body: file, headers, signal: controller.signal });
        if (!put.ok) {
          if (attempt + 1 < attempts && [408, 429, 500, 502, 503, 504].includes(put.status)) continue;
          throw new Error(storageRejectedMessage ? storageRejectedMessage(file, put.status) : `Secure storage rejected ${file.name} (${put.status}).`);
        }
        fileId = init.file_id;
        options.onStored?.(fileId);
        break;
      } catch (error) {
        if (error instanceof TypeError && attempt + 1 < attempts) continue;
        if (error instanceof Error && error.name === "AbortError") throw new Error(`Upload timed out for ${file.name}. Please retry on a stable connection.`);
        throw error;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }
  }
  if (!fileId) throw new Error("The upload could not be prepared. Please try again.");
  onStage?.("confirming");
  const complete = await target.call<unknown>(target.completePath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId, ...(extraComplete ?? {}) }),
  });
  return { fileId, complete: (mapComplete ? mapComplete(complete) : complete) as TComplete };
}

/** A readable reason for a failed upload, in the words the surface already uses. */
export function uploadErrorMessage(error: unknown, fallback = "Upload failed."): string {
  return documentUploadErrorMessage(error, fallback);
}
