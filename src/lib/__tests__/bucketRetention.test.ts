import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { bucketFileRemovalError, bucketFileRetentionPresentation } from "@/lib/bucketRetention";

const NOW = new Date("2026-10-22T16:00:00Z");

describe("bucket retention presentation", () => {
  it("treats a legal hold as protected even after a retention date", () => {
    const result = bucketFileRetentionPresentation({
      retention_class: "payment_agreement",
      protected_until: "2025-10-22T16:00:00Z",
      legal_hold: true,
    }, NOW);

    expect(result).toMatchObject({ isRetained: true, isRemovalBlocked: true, badge: "Legal hold" });
    expect(result?.detail).toContain("cannot be removed");
  });

  it("shows the exact protected-until date returned by the API", () => {
    const result = bucketFileRetentionPresentation({
      retention_class: "ach_authorization_proof",
      protected_until: "2028-10-22T21:00:00Z",
    }, NOW);

    expect(result).toMatchObject({ isRetained: true, isRemovalBlocked: true });
    expect(result?.badge).toContain("Oct 22, 2028");
    expect(result?.detail).toContain("retained through");
  });

  it("fails closed for a protected class with no release date", () => {
    const result = bucketFileRetentionPresentation({
      retention_class: "ach_debit_notice",
      protected_until: null,
    }, NOW);

    expect(result).toMatchObject({ isRetained: true, isRemovalBlocked: true, badge: "Retention protected" });
    expect(result?.detail).toContain("no release date");
  });

  it("distinguishes an expired retention period", () => {
    const result = bucketFileRetentionPresentation({
      retention_class: "payment_agreement",
      protected_until: "2025-10-22T16:00:00Z",
    }, NOW);

    expect(result).toMatchObject({ isRetained: false, isRemovalBlocked: false });
    expect(result?.badge).toContain("Retention ended");
  });

  it("shows ordinary two-year evidence retention without blocking recoverable removal", () => {
    const result = bucketFileRetentionPresentation({
      retention_class: "bucket_evidence",
      protected_until: "2028-10-22T21:00:00Z",
    }, NOW);

    expect(result).toMatchObject({ isRetained: true, isRemovalBlocked: false });
    expect(result?.badge).toContain("Retained until");
    expect(result?.detail).toContain("removed from active evidence");
    expect(result?.detail).toContain("not erased");
  });

  it("returns no label for an ordinary file without retention metadata", () => {
    expect(bucketFileRetentionPresentation({}, NOW)).toBeNull();
  });
});

describe("bucket file removal errors", () => {
  it("turns a protected deletion conflict into a recoverable next step", () => {
    const presentation = bucketFileRetentionPresentation({
      retention_class: "payment_agreement",
      protected_until: "2028-10-22T21:00:00Z",
    }, NOW);
    const message = bucketFileRemovalError(
      new ApiError(409, "This ACH or agreement artifact is protected by retention or legal hold"),
      presentation,
    );

    expect(message).toContain("Removal blocked");
    expect(message).toContain("Oct 22, 2028");
    expect(message).toContain("archive the bucket");
  });

  it("preserves an ordinary backend error", () => {
    expect(bucketFileRemovalError(new ApiError(403, "Only a Super Admin can remove this file")))
      .toBe("Only a Super Admin can remove this file");
  });
});
