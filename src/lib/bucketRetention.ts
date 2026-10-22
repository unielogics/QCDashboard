export type BucketRetentionRecord = {
  retention_class?: string | null;
  protected_until?: string | null;
  legal_hold?: boolean | null;
};

export type BucketRetentionPresentation = {
  isRetained: boolean;
  isRemovalBlocked: boolean;
  badge: string;
  detail: string;
};

const PROTECTED_RETENTION_CLASSES = new Set([
  "ach_authorization_proof",
  "ach_debit_notice",
  "payment_agreement",
]);

const RETENTION_LABELS: Record<string, string> = {
  ach_authorization_proof: "ACH authorization proof",
  ach_debit_notice: "ACH debit notice",
  payment_agreement: "Payment agreement",
};

/**
 * Explain the server-owned retention state without trying to recreate it.
 *
 * The API remains authoritative at removal time. This presentation mirrors
 * its fail-closed rules so an operator normally sees the protection before
 * reaching a 409 response.
 */
export function bucketFileRetentionPresentation(
  record: BucketRetentionRecord,
  now: Date = new Date(),
): BucketRetentionPresentation | null {
  const retentionClass = (record.retention_class || "").trim().toLowerCase();
  const recordLabel = RETENTION_LABELS[retentionClass] || humanizeRetentionClass(retentionClass) || "This record";
  const protectedUntil = parseTimestamp(record.protected_until);

  if (record.legal_hold) {
    return {
      isRetained: true,
      isRemovalBlocked: true,
      badge: "Legal hold",
      detail: `${recordLabel} is protected by a legal hold and cannot be removed until that hold is released.`,
    };
  }

  if (protectedUntil && protectedUntil.getTime() > now.getTime()) {
    const date = formatRetentionTimestamp(protectedUntil);
    const complianceArtifact = PROTECTED_RETENTION_CLASSES.has(retentionClass);
    return {
      isRetained: true,
      isRemovalBlocked: complianceArtifact,
      badge: `${complianceArtifact ? "Protected" : "Retained"} until ${date}`,
      detail: complianceArtifact
        ? `${recordLabel} is retained through ${date} and cannot be removed before then.`
        : `${recordLabel} is physically retained through ${date}. It may be removed from active evidence and restored later, but its stored record is not erased.`,
    };
  }

  // Compliance records without a release date are deliberately fail-closed
  // on the server. Do not imply that a missing date means protection ended.
  if (PROTECTED_RETENTION_CLASSES.has(retentionClass) && !protectedUntil) {
    return {
      isRetained: true,
      isRemovalBlocked: true,
      badge: "Retention protected",
      detail: `${recordLabel} is retained with no release date. Review its retention record before attempting removal.`,
    };
  }

  if (protectedUntil) {
    const date = formatRetentionTimestamp(protectedUntil);
    return {
      isRetained: false,
      isRemovalBlocked: false,
      badge: `Retention ended ${date}`,
      detail: `${recordLabel}'s protected retention period ended ${date}. The server will recheck before removal.`,
    };
  }

  if (retentionClass) {
    return {
      isRetained: false,
      isRemovalBlocked: false,
      badge: "Retention recorded",
      detail: `${recordLabel} has retention metadata. The server will verify it before removal.`,
    };
  }

  return null;
}

/** Turn a retention/legal-hold rejection into an operator next step. */
export function bucketFileRemovalError(
  error: unknown,
  retention?: BucketRetentionPresentation | null,
): string {
  const status = errorStatus(error);
  const message = errorMessage(error);
  if (status === 409 && /retention|legal\s+hold|protected/i.test(message)) {
    const protection = retention?.detail
      ?? "This ACH or agreement record is protected by retention or legal hold.";
    return `Removal blocked: ${protection} Keep the record in place or archive the bucket without deleting its retained evidence. Review the protected-until date or legal hold before trying again.`;
  }
  return message || "The file could not be removed from active evidence. Please refresh and try again.";
}

function parseTimestamp(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatRetentionTimestamp(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(value);
}

function humanizeRetentionClass(value: string): string {
  if (!value) return "";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const value = (error as { status?: unknown }).status;
  return typeof value === "number" ? value : null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (!error || typeof error !== "object") return "";
  const body = (error as { body?: unknown }).body;
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail.trim();
    if (detail && typeof detail === "object" && "message" in detail) {
      const nested = (detail as { message?: unknown }).message;
      if (typeof nested === "string") return nested.trim();
    }
  }
  return "";
}
