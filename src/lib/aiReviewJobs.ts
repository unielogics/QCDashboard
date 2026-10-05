export type ReviewAnnouncementState = {
  status: string;
  completedAt?: string | null;
  announcedAt?: string | null;
};

/**
 * Restore the bounded review dock without replaying completion side effects.
 * A completed persisted job was already visible before it reached storage;
 * reopening another page must not emit a second completion event.
 */
export function restoreReviewAnnouncements<T extends ReviewAnnouncementState>(value: unknown, limit = 8): T[] {
  if (!Array.isArray(value)) return [];
  return (value as T[]).slice(0, limit).map((job) => (
    job.status === "completed" && job.completedAt && !job.announcedAt
      ? { ...job, announcedAt: job.completedAt }
      : job
  ));
}

export function shouldAnnounceReviewCompletion(job: ReviewAnnouncementState): boolean {
  return job.status === "completed" && !job.announcedAt;
}
