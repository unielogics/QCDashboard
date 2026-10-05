import { describe, expect, it } from "vitest";
import { restoreReviewAnnouncements, shouldAnnounceReviewCompletion } from "@/lib/aiReviewJobs";

describe("AI review completion lifecycle", () => {
  it("does not replay a persisted completion when another page mounts", () => {
    const [job] = restoreReviewAnnouncements([{
      status: "completed",
      completedAt: "2026-10-04T18:00:00.000Z",
      announcedAt: null,
    }]);

    expect(job.announcedAt).toBe(job.completedAt);
    expect(shouldAnnounceReviewCompletion(job)).toBe(false);
  });

  it("announces a newly completed in-memory job exactly until it is marked", () => {
    expect(shouldAnnounceReviewCompletion({ status: "completed", completedAt: "2026-10-04T18:00:00.000Z" })).toBe(true);
    expect(shouldAnnounceReviewCompletion({ status: "completed", announcedAt: "2026-10-04T18:00:01.000Z" })).toBe(false);
    expect(shouldAnnounceReviewCompletion({ status: "running" })).toBe(false);
  });

  it("bounds restored dock entries", () => {
    const restored = restoreReviewAnnouncements(Array.from({ length: 12 }, (_, index) => ({ status: "running", index })));
    expect(restored).toHaveLength(8);
  });
});
