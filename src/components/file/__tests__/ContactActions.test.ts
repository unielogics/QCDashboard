import { describe, expect, it } from "vitest";

import { formatPhone, telHref } from "@/components/file/ContactActions";

describe("formatPhone", () => {
  it("shows a US number the way it is read aloud", () => {
    expect(formatPhone("+17028632888")).toBe("+1 (702) 863-2888");
    expect(formatPhone("7028632888")).toBe("+1 (702) 863-2888");
    expect(formatPhone("1-702-863-2888")).toBe("+1 (702) 863-2888");
  });

  it("leaves anything else as typed, and blank as blank", () => {
    expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(formatPhone("ext 22")).toBe("ext 22");
    expect(formatPhone("")).toBe("");
    expect(formatPhone(null)).toBe("");
  });
});

describe("telHref", () => {
  it("dials a US number with its country code", () => {
    expect(telHref("+17028632888")).toBe("tel:+17028632888");
    expect(telHref("(702) 863-2888")).toBe("tel:+17028632888");
    expect(telHref("1 702 863 2888")).toBe("tel:+17028632888");
  });

  it("keeps an international number's own code and refuses what is too short to dial", () => {
    expect(telHref("+44 20 7946 0958")).toBe("tel:+442079460958");
    expect(telHref("22")).toBeNull();
    expect(telHref(undefined)).toBeNull();
  });
});
