import { describe, expect, it } from "vitest";

import { isBareRoute, isPublicIntakeRoute } from "@/lib/shellRoutes";

describe("public intake shell routes", () => {
  it("keeps the equipment intake public surface outside authenticated app chrome", () => {
    expect(isBareRoute("/equipment-financing-intake")).toBe(true);
    expect(isBareRoute("/equipment-financing-intake/resume")).toBe(true);
  });

  it("does not make similarly named application routes bare", () => {
    expect(isBareRoute("/equipment-financing-review")).toBe(false);
  });

  it("keeps all three resource application destinations outside authenticated chrome", () => {
    for (const path of ["/mca-refinance-intake", "/mca-funding-intake", "/business-funding-intake"]) expect(isBareRoute(path)).toBe(true);
  });

  it("stabilizes only public intake and PIN-room provider state", () => {
    for (const path of ["/mca-refinance-intake", "/mca-funding-intake", "/business-funding-intake", "/buckets/request/token"]) expect(isPublicIntakeRoute(path)).toBe(true);
    for (const path of ["/admin/ai-underwriter-leads", "/files/private", "/business-funding-intake-console", "/buckets/requested", "/sign-in"]) expect(isPublicIntakeRoute(path)).toBe(false);
  });
});
