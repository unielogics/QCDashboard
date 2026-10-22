export type BucketArchiveFilter = "active" | "archived" | "all";

export type BucketArchiveRecord = {
  archived_at?: string | null;
};

/** Manual archive is identified only by archived_at, never by a status label. */
export function isBucketArchived(bucket: BucketArchiveRecord): boolean {
  return Boolean(bucket.archived_at);
}

export function bucketListPath(filter: BucketArchiveFilter): string {
  return `/buckets?archived_filter=${filter}`;
}

export function bucketArchiveLabel(bucket: BucketArchiveRecord): string | null {
  if (!bucket.archived_at) return null;
  const date = new Date(bucket.archived_at);
  if (Number.isNaN(date.getTime())) return "Archived";
  return `Archived ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(date)}`;
}
