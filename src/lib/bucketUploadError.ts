import { ApiError } from "@/lib/api";

export type BucketUploadIssue = {
  kind: "authentication" | "network" | "upload";
  title: string;
  message: string;
  itemMessage: string;
};

type ClerkLikeError = {
  clerkError?: unknown;
  name?: unknown;
  message?: unknown;
  errors?: unknown;
};

/**
 * Convert low-level Clerk, fetch, and upload errors into actionable copy.
 *
 * Clerk can reject its own session refresh with HTTP 400 before qcbackend is
 * contacted. That response must not be treated like an ordinary file error:
 * the selected File objects are still usable for as long as this tab remains
 * open, and the employee should restore sign-in before retrying them.
 */
export function bucketUploadIssue(error: unknown): BucketUploadIssue {
  if (isAuthenticationFailure(error)) {
    return {
      kind: "authentication",
      title: "Upload paused — secure session expired",
      message:
        "Any file that did not finish remains queued in this tab. Keep this tab open, sign in again in a new tab, then return here and retry the upload.",
      itemMessage: "Secure session expired. Sign in again in a new tab, then retry here.",
    };
  }

  if (isNetworkFailure(error)) {
    return {
      kind: "network",
      title: "Upload paused — connection interrupted",
      message:
        "Any file that did not finish remains queued in this tab. Check your connection, then retry the upload.",
      itemMessage: "Connection interrupted. Check your connection and retry.",
    };
  }

  const detail = readableUploadError(error);
  return {
    kind: "upload",
    title: "Upload needs attention",
    message: detail,
    itemMessage: detail,
  };
}

function isAuthenticationFailure(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 401;
  if (!error || typeof error !== "object") return false;

  const candidate = error as ClerkLikeError;
  if (candidate.clerkError === true) return true;

  const name = typeof candidate.name === "string" ? candidate.name : "";
  if (/clerk/i.test(name)) return true;

  const message = typeof candidate.message === "string" ? candidate.message : "";
  if (/\bclerk\b/i.test(message)) return true;

  if (!Array.isArray(candidate.errors)) return false;
  return candidate.errors.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const clerkEntry = entry as { code?: unknown; message?: unknown; longMessage?: unknown };
    return [clerkEntry.code, clerkEntry.message, clerkEntry.longMessage].some(
      (value) => typeof value === "string" && /(?:session|sign[_ -]?in|authentication|clerk)/i.test(value),
    );
  });
}

function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  return /(?:failed to fetch|fetch failed|network|load failed|connection)/i.test(error.message);
}

function readableUploadError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "The file could not be uploaded. Review it and try again.";
}

