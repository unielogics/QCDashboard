export type BucketFileSort = "newest" | "oldest";

type UploadedRow = {
  id: string;
  created_at: string;
};

export function uploadTimestamp(file: UploadedRow): number {
  const parsed = new Date(file.created_at).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortBucketFiles<T extends UploadedRow>(
  files: readonly T[],
  direction: BucketFileSort,
): T[] {
  return [...files].sort((left, right) => {
    const byTime = direction === "newest"
      ? uploadTimestamp(right) - uploadTimestamp(left)
      : uploadTimestamp(left) - uploadTimestamp(right);
    return byTime || left.id.localeCompare(right.id);
  });
}
