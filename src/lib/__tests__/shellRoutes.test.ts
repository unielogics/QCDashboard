import { describe, expect, it } from "vitest";

import { isBareRoute } from "@/lib/shellRoutes";

describe("public intake shell routes", () => {
  it("keeps the equipment intake public surface outside authenticated app chrome", () => {
    expect(isBareRoute("/equipment-financing-intake")).toBe(true);
    expect(isBareRoute("/equipment-financing-intake/resume")).toBe(true);
  });

  it("does not make similarly named application routes bare", () => {
    expect(isBareRoute("/equipment-financing-review")).toBe(false);
  });
});
