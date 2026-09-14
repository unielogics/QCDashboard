export type ClientRequestedDocumentState = "needed" | "checking" | "accepted";
export type ClientUploadedAnalysisSignal = {
  analysisReviewState?: string | null;
  analysisStatus?: string | null;
  analysisReasonCode?: string | null;
  analysisClassification?: string | null;
  isPasswordProtected?: boolean | null;
};

export type ClientRequestedDocumentLike = {
  id: string;
  name?: string | null;
  category?: string | null;
  status?: string | null;
  requires_signature?: boolean | null;
  request_kind?: string | null;
  source_file_id?: string | null;
  replacement_review_state?: string | null;
};

export type ClientUploadedFileLike = {
  id?: string | null;
  requested_document_id?: string | null;
  analysis_status?: string | null;
  analysis_reason_code?: string | null;
  analysis_classification?: string | null;
  analysis_review_state?: string | null;
  is_password_protected?: boolean | null;
};

export function clientRequestedDocumentContextText(
  document: ClientRequestedDocumentLike,
  documents: ClientRequestedDocumentLike[],
  files: ClientUploadedFileLike[],
): string {
  const ownText = `${document.name ?? ""} ${document.category ?? ""}`;
  if (document.request_kind?.trim().toLocaleLowerCase() !== "unlocked_copy" || !document.source_file_id) {
    return ownText.toLocaleLowerCase();
  }
  const sourceFile = files.find((file) => file.id === document.source_file_id);
  const sourceDocument = sourceFile?.requested_document_id
    ? documents.find((candidate) => candidate.id === sourceFile.requested_document_id)
    : undefined;
  return `${ownText} ${sourceDocument?.name ?? ""} ${sourceDocument?.category ?? ""} ${sourceFile?.analysis_classification ?? ""}`.toLocaleLowerCase();
}

export type ClientApiErrorDetail = {
  code?: string;
  message: string;
};

export type CodedClientApiError = Error & { code?: string };

export function clientApiErrorDetail(payload: unknown, fallback: string): ClientApiErrorDetail {
  if (!payload || typeof payload !== "object" || !("detail" in payload)) return { message: fallback };
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return { message: detail };
  if (!detail || typeof detail !== "object") return { message: fallback };
  const message = "message" in detail && typeof detail.message === "string" && detail.message.trim()
    ? detail.message
    : fallback;
  const code = "code" in detail && typeof detail.code === "string" && detail.code.trim()
    ? detail.code
    : undefined;
  return { message, ...(code ? { code } : {}) };
}

export function clientApiError(payload: unknown, fallback: string): CodedClientApiError {
  const detail = clientApiErrorDetail(payload, fallback);
  const error = new Error(detail.message) as CodedClientApiError;
  if (detail.code) error.code = detail.code;
  return error;
}

export function clientApiErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("body" in error) return clientApiErrorDetail(error.body, "").code;
  return undefined;
}

export function isStaleRequestedDocumentError(error: unknown): boolean {
  return clientApiErrorCode(error) === "stale_requested_document";
}

export function normalizeRoomPin(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function isValidRoomPin(value: string): boolean {
  return /^\d{6}$/.test(value);
}

export function clientActionNeeded(state: ClientRequestedDocumentState): boolean {
  return state === "needed";
}

export function clientRequestedDocumentNeedsAction(
  document: ClientRequestedDocumentLike,
  files: ClientUploadedFileLike[],
): boolean {
  return clientActionNeeded(clientRequestedDocumentReviewState(document, files));
}

export function clientRequestedDocumentReviewState(
  document: ClientRequestedDocumentLike,
  files: ClientUploadedFileLike[],
): ClientRequestedDocumentState {
  const matchingFiles = files.filter((file) => file.requested_document_id === document.id);
  return clientRequestedDocumentState({
    isUnlockedCopyRequest: document.request_kind?.trim().toLocaleLowerCase() === "unlocked_copy",
    documentStatus: document.status,
    hasUploadedFile: matchingFiles.length > 0,
    uploadedEvidence: matchingFiles.map((file) => ({
      analysisStatus: file.analysis_status,
      analysisReasonCode: file.analysis_reason_code,
      analysisClassification: file.analysis_classification,
      analysisReviewState: file.analysis_review_state,
      isPasswordProtected: file.is_password_protected,
    })),
    replacementReviewState: document.replacement_review_state,
  });
}

export type ClientMcaRequestedDocumentLike = ClientRequestedDocumentLike & {
  description?: string | null;
  signature_kind?: string | null;
};

export type ClientMcaRequestedDocumentLayout<T extends ClientMcaRequestedDocumentLike> = {
  bank: T | null;
  credit: T | null;
  terms: T | null;
  unresolvedUnlockedCopies: T[];
};

/**
 * Keeps the MCA room's three canonical slots stable while exposing every
 * unresolved unlocked-copy request as a separate upload task. An unlocked
 * request cannot safely impersonate the credit/signature or typed-terms card,
 * and source metadata is intentionally not required: direct bucket uploads
 * may have neither a requested-document link nor a useful classification.
 */
export function clientMcaRequestedDocumentLayout<T extends ClientMcaRequestedDocumentLike>(
  documents: T[],
  files: ClientUploadedFileLike[],
): ClientMcaRequestedDocumentLayout<T> {
  const isUnlockedCopy = (document: T): boolean => document.request_kind?.trim().toLocaleLowerCase() === "unlocked_copy";
  const unlockedCopies = documents.filter(isUnlockedCopy);
  const priority = (document: T): number => clientRequestedDocumentNeedsAction(document, files) ? 0 : 1;
  const remaining = documents.filter((document) => !isUnlockedCopy(document)).sort((left, right) => priority(left) - priority(right));
  const take = (predicate: (document: T) => boolean): T | null => {
    const index = remaining.findIndex(predicate);
    if (index < 0) return null;
    const [document] = remaining.splice(index, 1);
    return document ?? null;
  };
  const text = (document: T): string => clientRequestedDocumentContextText(document, documents, files);
  const credit = take(
    (document) => document.signature_kind === "credit_authorization" || Boolean(document.requires_signature) || text(document).includes("credit"),
  );
  const bank = take((document) => text(document).includes("bank") || text(document).includes("statement"));
  const terms = take((document) => /mca|advance|term/.test(text(document)));

  return {
    bank: bank ?? remaining.shift() ?? null,
    credit: credit ?? remaining.shift() ?? null,
    terms: terms ?? remaining.shift() ?? null,
    unresolvedUnlockedCopies: unlockedCopies.filter(
      (document) => clientRequestedDocumentReviewState(document, files) !== "accepted",
    ),
  };
}

/** Preserve the current request id on every non-signature upload action. */
export function clientActionableRequestedDocumentUploadTarget(
  document: ClientRequestedDocumentLike,
  files: ClientUploadedFileLike[],
): string | null {
  if (document.requires_signature || !clientRequestedDocumentNeedsAction(document, files)) return null;
  return document.id;
}

export function clientQueuedUploadCanSubmit(upload: {
  status: string;
  requiresRetarget?: boolean;
}): boolean {
  return !upload.requiresRetarget && (upload.status === "ready" || upload.status === "error");
}

export function clientUploadTarget(
  preferredRequestedDocumentId: string | null | undefined,
  requestedDocumentIds: Iterable<string>,
  fallbackRequestedDocumentId = "",
): string {
  const validIds = new Set(requestedDocumentIds);
  return preferredRequestedDocumentId && validIds.has(preferredRequestedDocumentId)
    ? preferredRequestedDocumentId
    : fallbackRequestedDocumentId;
}

export function hasDuplicateSingleUseUploadTargets(
  uploads: Array<{ requestedDocumentId: string; status: string }>,
  singleUseRequestedDocumentIds: ReadonlySet<string>,
  repeatableRequestedDocumentIds: ReadonlySet<string>,
): boolean {
  const counts = new Map<string, number>();
  for (const upload of uploads) {
    if (!upload.requestedDocumentId || upload.status === "error" || !singleUseRequestedDocumentIds.has(upload.requestedDocumentId) || repeatableRequestedDocumentIds.has(upload.requestedDocumentId)) continue;
    counts.set(upload.requestedDocumentId, (counts.get(upload.requestedDocumentId) ?? 0) + 1);
  }
  return [...counts.values()].some((count) => count > 1);
}

export function isUnlockedCopyRequestedDocument(
  document: { id: string; isUnlockedCopyRequest?: boolean | null; requestKind?: string | null },
  legacyRequestedDocumentIds: ReadonlySet<string>,
): boolean {
  const requestKind = document.requestKind?.trim().toLocaleLowerCase() ?? "";
  return document.isUnlockedCopyRequest === true
    || ["unlocked_copy", "unlocked_copy_replacement", "request_unlocked_copy"].includes(requestKind)
    || legacyRequestedDocumentIds.has(document.id);
}

export function clientRequestedDocumentState({
  isUnlockedCopyRequest,
  documentStatus,
  hasUploadedFile,
  requirementComplete,
  processingEvidenceCount,
  uploadedEvidence = [],
  replacementReviewState,
}: {
  isUnlockedCopyRequest: boolean;
  documentStatus?: string | null;
  hasUploadedFile: boolean;
  requirementComplete?: boolean;
  processingEvidenceCount?: number;
  uploadedEvidence?: ClientUploadedAnalysisSignal[];
  replacementReviewState?: string | null;
}): ClientRequestedDocumentState {
  if (isUnlockedCopyRequest) {
    const explicitState = replacementReviewState?.trim().toLocaleLowerCase() ?? "";
    if (explicitState === "received") return "accepted";
    if (explicitState === "checking") return "checking";
    if (explicitState === "requested" || explicitState === "needs_another_copy") return "needed";
    const normalized = uploadedEvidence.map((file) => ({
      reviewState: file.analysisReviewState?.trim().toLocaleLowerCase() ?? "",
      status: file.analysisStatus?.trim().toLocaleLowerCase() ?? "",
      reason: file.analysisReasonCode?.trim().toLocaleLowerCase() ?? "",
      classification: file.analysisClassification?.trim().toLocaleLowerCase() ?? "",
      locked: file.isPasswordProtected === true,
    }));
    const readableCompletion = normalized.some((file) => file.reviewState === "received" || (file.status === "completed"
      && !file.locked
      && file.classification !== "unreadable"
      && !["password_protected", "password_required", "encrypted_pdf", "zip_entry_encrypted"].includes(file.reason)));
    if (readableCompletion) return "accepted";
    const activelyChecking = normalized.some((file) => file.reviewState === "checking" || (!file.reviewState && (!file.status || ["uploaded", "pending", "queued", "processing", "running", "analyzing", "failed"].includes(file.status))));
    if (activelyChecking || (hasUploadedFile && normalized.length === 0) || (processingEvidenceCount ?? 0) > 0) return "checking";
    return "needed";
  }
  // A canonical requirement summary is authoritative when one exists. Merely
  // receiving a file must not turn an AI-rejected or unreadable requirement
  // green; without this branch the room would recreate the original
  // "everything is accepted on upload" defect.
  if (typeof requirementComplete === "boolean") {
    if (requirementComplete) return "accepted";
    return (processingEvidenceCount ?? 0) > 0 ? "checking" : "needed";
  }
  if (documentStatus === "uploaded" || hasUploadedFile) return "accepted";
  return (processingEvidenceCount ?? 0) > 0 ? "checking" : "needed";
}
