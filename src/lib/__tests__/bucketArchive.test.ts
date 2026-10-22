import { describe, expect, it } from "vitest";

import { bucketArchiveLabel, bucketListPath, isBucketArchived } from "@/lib/bucketArchive";

describe("bucket archive workspace", () => {
  it.each(["active", "archived", "all"] as const)("requests the %s server view", (filter) => {
    expect(bucketListPath(filter)).toBe(`/buckets?archived_filter=${filter}`);
  });

  it("uses archived_at as the only restore authority", () => {
    expect(isBucketArchived({ archived_at: "2026-10-22T15:00:00Z" })).toBe(true);
    expect(isBucketArchived({ archived_at: null })).toBe(false);
    expect(isBucketArchived({})).toBe(false);
  });

  it("gives archived rows a visible, stable date label", () => {
    expect(bucketArchiveLabel({ archived_at: "2026-10-22T15:00:00Z" })).toBe("Archived Oct 22, 2026");
    expect(bucketArchiveLabel({ archived_at: null })).toBeNull();
  });
});
