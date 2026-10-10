import { afterEach, describe, expect, it, vi } from "vitest";
import { getStoredLanguage, resolveCommunicationLanguage, setStoredLanguage } from "@/lib/intakeCopy";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("intake language ownership", () => {
  it("does not copy a previous file's language into a new intake", () => {
    const values = new Map<string, string>([["qc_intake_language:dealer", "es"]]);
    vi.stubGlobal("window", {
      location: { search: "", pathname: "/dealer-ai-underwriter" },
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });

    expect(getStoredLanguage("dealer")).toBeNull();
    setStoredLanguage("en", "dealer");
    expect(values.has("qc_intake_language:dealer")).toBe(false);
    expect(getStoredLanguage("real_estate")).toBeNull();
    expect(getStoredLanguage("mca_refinance")).toBeNull();
  });

  it("uses the incoming link language before any stale browser preference", () => {
    vi.stubGlobal("window", {
      location: { search: "?locale=en", pathname: "/dealer-ai-underwriter" },
      sessionStorage: { getItem: () => "es" },
    });
    expect(getStoredLanguage("dealer")).toBe("en");
  });

  it("gives canonical communication locale precedence over legacy language", () => {
    expect(resolveCommunicationLanguage("es", "en")).toBe("es");
    expect(resolveCommunicationLanguage(null, "en")).toBe("en");
    expect(resolveCommunicationLanguage("fr", undefined)).toBeNull();
  });
});
