import { describe, expect, it } from "vitest";

import { aiReviewInvalidationKeys } from "@/lib/aiReviewInvalidation";

describe("AI review cache invalidation", () => {
  it("refreshes every AI-derived application cache family", () => {
    const keys = aiReviewInvalidationKeys("intake-123");

    expect(keys).toEqual(expect.arrayContaining([
      ["operator-files"],
      ["operator-file"],
      ["application-profile"],
      ["application-profile-audit"],
      ["application-evidence-workspace"],
      ["application-extracted-facts"],
      ["application-draft-status"],
      ["application-intelligence"],
      ["application-profile-owners"],
      ["application-profile-verification"],
      ["application-profile-banks"],
    ]));
  });

  it("scopes lead-derived refreshes to the completed intake", () => {
    const keys = aiReviewInvalidationKeys("intake-123");

    expect(keys).toEqual(expect.arrayContaining([
      ["lead-credit-status", "intake-123"],
      ["lead-program-fit", "intake-123"],
      ["lead-dscr-potential", "intake-123"],
    ]));
  });

  it("uses the real operator query key and has no duplicate invalidations", () => {
    const keys = aiReviewInvalidationKeys("intake-123");
    const serialized = keys.map((key) => JSON.stringify(key));

    expect(keys).not.toContainEqual(["unified-operator-files"]);
    expect(new Set(serialized).size).toBe(keys.length);
  });
});
