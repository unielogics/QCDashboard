import { describe, expect, it } from "vitest";
import { isReviewRoutingStop, isReviewTerminal, restoreReviewAnnouncements, reviewCompletionNotice, shouldAnnounceReviewCompletion } from "@/lib/aiReviewJobs";

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

  it.each(["manual_review", "information_required"])("treats %s as a terminal routing stop and refreshes the file once", (status) => {
    expect(isReviewRoutingStop(status)).toBe(true);
    expect(isReviewTerminal(status)).toBe(true);
    expect(shouldAnnounceReviewCompletion({ status })).toBe(true);
    const [restored] = restoreReviewAnnouncements([{ status, completedAt: "2026-10-26T18:00:00Z" }]);
    expect(shouldAnnounceReviewCompletion(restored)).toBe(false);
  });

  it("keeps active jobs distinct from terminal routing and failed jobs", () => {
    expect(isReviewTerminal("running")).toBe(false);
    expect(isReviewRoutingStop("completed")).toBe(false);
    expect(isReviewTerminal("failed")).toBe(true);
    expect(shouldAnnounceReviewCompletion({ status: "failed" })).toBe(false);
  });

  it("never announces an AI decision when a job stopped for desk routing", () => {
    expect(reviewCompletionNotice("manual_review")).toContain("Automatic underwriting did not run");
    expect(reviewCompletionNotice("information_required")).toContain("Automatic underwriting did not run");
    expect(reviewCompletionNotice("completed")).toContain("AI review complete");
  });
});
