import { describe, expect, it } from "vitest";

import { recentSoftPull } from "@/components/admin/LeadCreditPanel";
import { ApiError } from "@/lib/api";

describe("a recent soft pull is not repeated without asking", () => {
  it("reads the backend's 409 into the question the desk sees", () => {
    const err = new ApiError(409, "Conflict", { detail: { code: "recent_soft_pull", pulled_at: "2026-11-10T15:00:00+00:00", message: "Last soft pull from Nov 10, 2026. Pull again?" } });
    expect(recentSoftPull(err)).toEqual({ message: "Last soft pull from Nov 10, 2026. Pull again?", pulledAt: "2026-11-10T15:00:00+00:00" });
  });

  it("leaves every other failure to the normal error line", () => {
    expect(recentSoftPull(new ApiError(409, "Conflict", { detail: "The client must sign the credit authorization before a pull can run." }))).toBeNull();
    expect(recentSoftPull(new ApiError(422, "Unprocessable", { detail: { code: "no_hit_provide_ssn" } }))).toBeNull();
    expect(recentSoftPull(new Error("network"))).toBeNull();
  });
});
