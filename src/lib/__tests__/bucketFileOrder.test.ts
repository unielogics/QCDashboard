import { describe, expect, it } from "vitest";

import { sortBucketFiles, uploadTimestamp } from "@/lib/bucketFileOrder";

const rows = [
  { id: "b", created_at: "2026-08-20T12:00:00Z", label: "middle-b" },
  { id: "a", created_at: "2026-08-20T12:00:00Z", label: "middle-a" },
  { id: "new", created_at: "2026-08-21T12:00:00Z", label: "new" },
  { id: "old", created_at: "2026-08-19T12:00:00Z", label: "old" },
];

describe("bucket upload ordering", () => {
  it("defaults cleanly to newest upload time with a stable id tie-breaker", () => {
    expect(sortBucketFiles(rows, "newest").map((row) => row.id)).toEqual([
      "new",
      "a",
      "b",
      "old",
    ]);
  });

  it("orders oldest upload time first without mutating the filtered input", () => {
    const filtered = rows.filter((row) => row.id !== "b");

    expect(sortBucketFiles(filtered, "oldest").map((row) => row.id)).toEqual([
      "old",
      "a",
      "new",
    ]);
    expect(filtered.map((row) => row.id)).toEqual(["a", "new", "old"]);
  });

  it("uses zero for malformed legacy timestamps", () => {
    expect(uploadTimestamp({ id: "legacy", created_at: "not-a-date" })).toBe(0);
  });
});
