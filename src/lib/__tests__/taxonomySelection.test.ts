import { describe, expect, it } from "vitest";
import { classificationFromActivity } from "../taxonomySelection";
import type { ClassificationPatch, TaxonomyEntry } from "../applicationProfile";

const current: ClassificationPatch = { vertical: "dealer", funding_category: "Working capital", entity_type: "LLC", industry: "Old industry", subindustry: "Old subindustry", naics_code: "111111", naics_label: "Old activity", custom_industry: "Old custom value", industry_entry_id: "old-sector", subindustry_entry_id: "old-group", activity_entry_id: "old-activity" };
const entry: TaxonomyEntry = { id: "activity", level: 6, code: "441120", label: "Used Car Dealers", parent_id: "group", source: "census_2022", taxonomy_version: "2022", status: "official", aliases: [], originating_profile_id: null, canonical_entry_id: null, path: [{ id: "sector", level: 2, code: "44-45", label: "Retail Trade", parent_id: null }, { id: "group", level: 3, code: "441", label: "Motor Vehicle and Parts Dealers", parent_id: "sector" }] };

describe("global business activity selection", () => {
  it("replaces the full industry path while preserving funding details", () => {
    expect(classificationFromActivity(current, entry)).toEqual({ ...current, industry: "Retail Trade", industry_entry_id: "sector", subindustry: "Motor Vehicle and Parts Dealers", subindustry_entry_id: "group", naics_code: "441120", naics_label: "Used Car Dealers", activity_entry_id: "activity", custom_industry: null });
    expect(current.industry).toBe("Old industry");
  });
  it("rejects missing or incompatible paths rather than mixing industries", () => {
    expect(() => classificationFromActivity(current, { ...entry, path: [] })).toThrow("incomplete industry path");
    expect(() => classificationFromActivity(current, { ...entry, parent_id: "other" })).toThrow("incomplete industry path");
  });
});
