import { describe, expect, it, vi } from "vitest";
import { marketplaceEntryHref, marketplacePublicationLabel, marketplacePublicationState, marketplaceReviewHref } from "@/lib/marketplacePublication";

vi.mock("@/lib/appUrl", () => ({ CAPITAL_APP_ORIGIN: "https://capital.example.test" }));

describe("marketplace offer publication", () => {
  it("routes existing offers directly to the canonical review publisher before any creation workspace", () => {
    expect(marketplaceEntryHref("saved-offer", "file-a")).toBe("/admin/marketplace/saved-offer");
    expect(marketplaceEntryHref("saved-offer")).toBe("/admin/marketplace/saved-offer");
  });
  it("keeps the guarded file-based first-draft path without auto-create query parameters", () => {
    expect(marketplaceEntryHref(null, "file-a")).toBe("/files/file-a/workspace?tool=marketplace");
    expect(marketplaceEntryHref(null)).toBeUndefined();
  });
  it("encodes IDs inside the local route rather than treating them as URLs", () => {
    expect(marketplaceReviewHref("offer/a?x=1")).toBe("/admin/marketplace/offer%2Fa%3Fx%3D1");
    expect(marketplaceEntryHref(undefined, "file/a")).toBe("/files/file%2Fa/workspace?tool=marketplace");
  });
  it("keeps draft and withdrawn investor links unavailable regardless of old timestamps", () => {
    for (const status of ["draft", "withdrawn"] as const) {
      expect(marketplacePublicationState({ id: "internal-id", ref: "QC-0042", status, published_at: "2026-11-01" })).toMatchObject({ isPublished: false, memberUrl: null, isOpenForInvestment: false });
    }
  });
  it("uses the actual member route and reference, never the internal editor ID", () => {
    expect(marketplacePublicationState({ id: "private-id", ref: "QC-0042", status: "open" })).toMatchObject({ isPublished: true, isOpenForInvestment: true, memberUrl: "https://capital.example.test/marketplace/QC-0042" });
    expect(marketplacePublicationState({ id: "private-id", ref: "QC/a?x=1", status: "open" }).memberUrl).toContain("/marketplace/QC%2Fa%3Fx%3D1");
  });
  it("separates historical member visibility from availability for investment", () => {
    for (const status of ["fully_subscribed", "funded", "repaid", "workout"] as const) {
      expect(marketplacePublicationState({ id: "id", ref: "QC-1", status })).toMatchObject({ isPublished: true, isOpenForInvestment: false });
      expect(marketplacePublicationLabel(status)).toContain(status.replace(/_/g, " "));
    }
  });
  it("does not mark a failed or empty lookup complete", () => {
    expect(marketplacePublicationState(null, { profileId: "profile", loading: true })).toMatchObject({ profileId: "profile", isPublished: false, loading: true, memberUrl: null });
    expect(marketplacePublicationState({ id: "id", ref: "QC-1", status: "open" }, { error: true })).toMatchObject({ isPublished: false, error: true, memberUrl: null });
    expect(marketplacePublicationState({ id: "id", ref: "", status: "open" }).isPublished).toBe(false);
  });
});
