import { describe, expect, it } from "vitest";
import { formCountWords, packetKinds } from "@/lib/formPacket";

describe("the forms one packet link opens", () => {
  it("holds the personal statement only when its child link answered", () => {
    expect(packetKinds({ p_and_l: true, balance_sheet: true, debt_schedule: true, pfs: true })).toEqual(["p_and_l", "balance_sheet", "debt_schedule", "pfs"]);
    expect(packetKinds({ p_and_l: true, balance_sheet: true, debt_schedule: true, pfs: false })).toEqual(["p_and_l", "balance_sheet", "debt_schedule"]);
  });

  it("is closed when any business form is missing", () => {
    expect(packetKinds({ p_and_l: true, balance_sheet: false, debt_schedule: true, pfs: true })).toBeNull();
    expect(packetKinds({})).toBeNull();
  });

  it("counts its forms in words", () => {
    expect(formCountWords(3)).toBe("Three");
    expect(formCountWords(4)).toBe("Four");
  });
});
