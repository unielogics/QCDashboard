export type ReviewAnnouncementState = {
  status: string;
  completedAt?: string | null;
  announcedAt?: string | null;
};

export function isReviewRoutingStop(status: string): boolean {
  return status === "manual_review" || status === "information_required";
}

export function isReviewTerminal(status: string): boolean {
  return status === "completed" || status === "failed" || isReviewRoutingStop(status);
}

export function reviewCompletionNotice(status?: string): string {
  if (status === "manual_review") return "Application accepted for manual desk review. Automatic underwriting did not run.";
  if (status === "information_required") return "MCA eligibility details are needed. Automatic underwriting did not run.";
  return "AI review complete - showing the latest breakdown.";
}

/**
 * Restore the bounded review dock without replaying completion side effects.
 * A completed persisted job was already visible before it reached storage;
 * reopening another page must not emit a second completion event.
 */
export function restoreReviewAnnouncements<T extends ReviewAnnouncementState>(value: unknown, limit = 8): T[] {
  if (!Array.isArray(value)) return [];
  return (value as T[]).slice(0, limit).map((job) => (
    (job.status === "completed" || isReviewRoutingStop(job.status)) && job.completedAt && !job.announcedAt
      ? { ...job, announcedAt: job.completedAt }
      : job
  ));
}

export function shouldAnnounceReviewCompletion(job: ReviewAnnouncementState): boolean {
  // A routing stop also refreshes the file; it is not a completed AI decision.
  return (job.status === "completed" || isReviewRoutingStop(job.status)) && !job.announcedAt;
}
