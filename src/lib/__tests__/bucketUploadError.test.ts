import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { bucketUploadIssue } from "@/lib/bucketUploadError";

describe("bucket upload error guidance", () => {
  it("turns a backend 401 into an actionable session warning", () => {
    const issue = bucketUploadIssue(new ApiError(401, "Unauthorized"));

    expect(issue.kind).toBe("authentication");
    expect(issue.title).toContain("secure session expired");
    expect(issue.message).toContain("did not finish remains queued");
    expect(issue.message).toContain("Keep this tab open");
    expect(issue.message).toContain("sign in again in a new tab");
  });

  it.each([
    { clerkError: true, status: 400, message: "Bad Request" },
    { name: "ClerkAPIResponseError", status: 400, message: "Bad Request" },
    {
      status: 400,
      errors: [{ code: "session_not_found", longMessage: "The Clerk session could not be refreshed." }],
    },
  ])("recognizes Clerk-shaped token failures without relying on status alone", (error) => {
    expect(bucketUploadIssue(error).kind).toBe("authentication");
  });

  it("does not mislabel ordinary 400 or permission 403 responses as login failures", () => {
    expect(bucketUploadIssue(new ApiError(400, "Unsupported file type")).kind).toBe("upload");
    expect(bucketUploadIssue(new ApiError(403, "Only a Super Admin can upload")).kind).toBe("upload");
  });

  it("keeps a connection failure retryable and says the queue is preserved", () => {
    const issue = bucketUploadIssue(new TypeError("Failed to fetch"));

    expect(issue.kind).toBe("network");
    expect(issue.message).toContain("did not finish remains queued");
    expect(issue.itemMessage).toContain("retry");
  });

  it("preserves a useful ordinary upload message", () => {
    const issue = bucketUploadIssue(new Error("Storage rejected statement.pdf (413)."));

    expect(issue).toEqual({
      kind: "upload",
      title: "Upload needs attention",
      message: "Storage rejected statement.pdf (413).",
      itemMessage: "Storage rejected statement.pdf (413).",
    });
  });
});
