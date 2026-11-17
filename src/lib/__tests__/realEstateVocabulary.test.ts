import { describe, expect, it } from "vitest";

import { OCCUPANCY_LABELS, OWNER_OCCUPIED, RE_TRANSACTION_TYPES, isKnownTransactionType } from "@/lib/realEstateVocabulary";

describe("the real-estate vocabulary shared with the backend", () => {
  it("lists the purposes the backend folds to, home equity included", () => {
    expect(RE_TRANSACTION_TYPES).toContain("Home equity (HELOC)");
    expect(isKnownTransactionType("Cash-out refinance")).toBe(true);
    expect(isKnownTransactionType("refinance")).toBe(false);
    expect(isKnownTransactionType(null)).toBe(false);
  });

  it("treats a primary residence and a second home as owner-occupied", () => {
    expect(OWNER_OCCUPIED.has("primary_residence")).toBe(true);
    expect(OWNER_OCCUPIED.has("second_home")).toBe(true);
    expect(OWNER_OCCUPIED.has("investment")).toBe(false);
    expect(Object.keys(OCCUPANCY_LABELS)).toEqual(["investment", "primary_residence", "second_home"]);
  });
});
