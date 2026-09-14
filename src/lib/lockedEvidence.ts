export type EvidenceLockSignals = {
  fileName?: string | null;
  isPasswordProtected?: boolean | null;
  analysisStatus?: string | null;
  analysisReasonCode?: string | null;
  analysisDetail?: string | null;
  decisionReasonCode?: string | null;
  decisionExplanation?: string | null;
};

export type LockedEvidencePresentation = {
  title: "Locked PDF" | "Locked file";
  badge: "Password required";
  explanation: string;
};

export type UnlockedCopyRequestLike = {
  request_status?: string | null;
  delivery_status?: string | null;
  replacement_review_state?: "requested" | "checking" | "received" | "needs_another_copy" | null;
} | null | undefined;

export type UnlockedCopyActionState = {
  kind: "request" | "retry" | "requested" | "replacement_checking" | "replacement_received" | "needs_another_copy";
  label: "Request unlocked copy" | "Retry request" | "Unlocked copy requested" | "Replacement under review" | "Replacement received" | "Another unlocked copy needed";
  retryFailed: boolean;
  disabled: boolean;
  offerRoomLink: boolean;
  offerRetry: boolean;
};

const LOCK_REASON_CODES = new Set([
  "password_protected",
  "password_required",
  "encrypted_pdf",
  "zip_entry_encrypted",
]);

const LOCKED_TEXT = /\b(?:password[- ]protected|password (?:is )?required|requires? (?:a )?password|encrypted (?:pdf|document|file|zip)|locked pdf)\b/i;

/**
 * Turn both raw extraction metadata and requirement-decision metadata into one
 * stable presentation. Requirement decisions currently collapse skipped PDFs
 * to `unreadable`, so the explanation is intentionally inspected as a safe
 * fallback until raw analysis metadata is included on every decision row.
 */
export function lockedEvidencePresentation(
  signals: EvidenceLockSignals,
): LockedEvidencePresentation | null {
  // The current-hash backend signal is authoritative. Legacy text is only a
  // compatibility fallback for older DTOs that do not expose the boolean.
  if (signals.isPasswordProtected === false) return null;
  const codes = [signals.analysisReasonCode, signals.decisionReasonCode]
    .map((value) => value?.trim().toLocaleLowerCase())
    .filter((value): value is string => Boolean(value));
  const detail = [signals.analysisDetail, signals.decisionExplanation]
    .filter(Boolean)
    .join(" ");
  const locked = signals.isPasswordProtected === true
    || codes.some((code) => LOCK_REASON_CODES.has(code))
    || LOCKED_TEXT.test(detail);
  if (!locked) return null;

  const isPdf = signals.fileName?.trim().toLocaleLowerCase().endsWith(".pdf") ?? false;
  return {
    title: isPdf ? "Locked PDF" : "Locked file",
    badge: "Password required",
    explanation: isPdf
      ? "This password-protected PDF cannot be previewed here."
      : "This encrypted file cannot be previewed here.",
  };
}

export function unlockedCopyRequest(
  profileId: string,
  fileId: string,
  retryFailed = false,
  deliveryMode: "email_if_available" | "room_link_only" = "email_if_available",
): {
  path: string;
  payload: { retry_failed: boolean; delivery_mode: "email_if_available" | "room_link_only" };
} {
  return {
    path: `/application-profiles/${encodeURIComponent(profileId)}/evidence/${encodeURIComponent(fileId)}/request-unlocked-copy`,
    payload: { retry_failed: retryFailed, delivery_mode: deliveryMode },
  };
}

export function unlockedCopyActionState(request: UnlockedCopyRequestLike): UnlockedCopyActionState {
  const requestStatus = request?.request_status?.trim().toLocaleLowerCase() ?? "";
  const deliveryStatus = request?.delivery_status?.trim().toLocaleLowerCase() ?? "";
  const replacementReviewState = request?.replacement_review_state?.trim().toLocaleLowerCase() ?? "";
  if (replacementReviewState === "received") {
    return { kind: "replacement_received", label: "Replacement received", retryFailed: false, disabled: true, offerRoomLink: false, offerRetry: false };
  }
  if (replacementReviewState === "checking") {
    return { kind: "replacement_checking", label: "Replacement under review", retryFailed: false, disabled: true, offerRoomLink: false, offerRetry: false };
  }
  if (replacementReviewState === "needs_another_copy") {
    return { kind: "needs_another_copy", label: "Another unlocked copy needed", retryFailed: true, disabled: false, offerRoomLink: true, offerRetry: true };
  }
  if (replacementReviewState === "requested") {
    if (deliveryStatus === "failed") {
      return { kind: "retry", label: "Retry request", retryFailed: true, disabled: false, offerRoomLink: true, offerRetry: true };
    }
    return {
      kind: "requested",
      label: "Unlocked copy requested",
      retryFailed: false,
      disabled: true,
      offerRoomLink: ["created", "pending", "queued", "sending"].includes(deliveryStatus),
      offerRetry: deliveryStatus === "created",
    };
  }
  if (["uploaded", "replacement_received", "complete", "completed"].includes(requestStatus)) {
    return { kind: "replacement_received", label: "Replacement received", retryFailed: false, disabled: true, offerRoomLink: false, offerRetry: false };
  }
  if (deliveryStatus === "failed") {
    return { kind: "retry", label: "Retry request", retryFailed: true, disabled: false, offerRoomLink: true, offerRetry: true };
  }
  if (requestStatus || deliveryStatus) {
    return {
      kind: "requested",
      label: "Unlocked copy requested",
      retryFailed: false,
      disabled: true,
      offerRoomLink: ["created", "pending", "queued", "sending"].includes(deliveryStatus),
      offerRetry: deliveryStatus === "created",
    };
  }
  return { kind: "request", label: "Request unlocked copy", retryFailed: false, disabled: false, offerRoomLink: false, offerRetry: false };
}

/** pdf.js reports encrypted PDFs at render time when extraction metadata is absent. */
export function isPdfPasswordError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: unknown; message?: unknown };
  const name = typeof value.name === "string" ? value.name : "";
  const message = typeof value.message === "string" ? value.message : "";
  return name === "PasswordException" || /\b(?:password|encrypted)\b/i.test(`${name} ${message}`);
}
