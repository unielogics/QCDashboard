import { afterEach, expect, it, vi } from "vitest";
import { publicEntryUrl, readPublicIntakeAttribution } from "../publicIntakeAttribution";
import { readIntakeToken, rememberIntakeToken } from "../intakeSession";

afterEach(() => vi.unstubAllGlobals());
it("captures attribution before URL cleanup without retaining tokens or contact details", () => {
  const url = "https://app.qualifiedcommercial.com/mca-refinance-intake?token=private&source=public_site&page=%2Fmca-refinance&locale=es&email=private%40example.com#secret";
  vi.stubGlobal("window", { location: new URL(url) });
  expect(readPublicIntakeAttribution().page).toBe("/mca-refinance");
  expect(publicEntryUrl(url)).not.toMatch(/private|token|email|secret/);
  expect(publicEntryUrl(url)).toContain("locale=es");
});
it("storage restrictions do not break an active intake", () => {
  vi.stubGlobal("window", { get sessionStorage() { throw new Error("Storage blocked"); } });
  expect(readIntakeToken("key")).toBeNull();
  expect(() => rememberIntakeToken("key", "token")).not.toThrow();
  expect(() => rememberIntakeToken("key", null)).not.toThrow();
});
