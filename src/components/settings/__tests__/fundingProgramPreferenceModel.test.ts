import { describe, expect, it } from "vitest";
import { newRecommendationPreference, preferenceCondition, readRecommendationPreferences, recommendationPreferenceIssues } from "../fundingProgramPreferenceModel";
import { readSimpleFit, validateEditorContent } from "../fundingProgramEditorModel";
import { criteriaValidationIssues, publishValidationIssues } from "../fundingProgramValidationModel";

describe("funding program recommendation preferences", () => {
  it("keeps preferences optional and never creates an amount limit or an eligibility rule", () => {
    expect(readRecommendationPreferences({})).toEqual([]);
    expect(recommendationPreferenceIssues({})).toEqual([]);
    const row = newRecommendationPreference([], true);
    expect(row).toMatchObject({ score: 10, when: { field: "real_estate_equipment_pct", op: "gte", value: 51 } });
    expect(recommendationPreferenceIssues({ recommendation_preferences: [row] })).toEqual([]);
    expect(publishValidationIssues({ rules: JSON.stringify({ recommendation_preferences: [row] }) })[0].target).toBe("Eligibility checks");
  });

  it("leaves new custom thresholds blank and points at exactly the incomplete fields", () => {
    const row = newRecommendationPreference([]);
    expect(row.when.value).toBe("");
    expect(recommendationPreferenceIssues({ recommendation_preferences: [row] }).map((issue) => issue.target)).toEqual(["Preference 1 name", "Preference 1 threshold"]);
  });

  it("validates scores, unique keys, names and maximum row count", () => {
    const row = newRecommendationPreference([], true);
    expect(recommendationPreferenceIssues({ recommendation_preferences: [{ ...row, score: "", label: " " }] }).map((issue) => issue.target)).toEqual(["Preference 1 name", "Preference 1 ranking points"]);
    expect(recommendationPreferenceIssues({ recommendation_preferences: [{ ...row, score: 1.5 }] })[0].target).toBe("Preference 1 ranking points");
    expect(recommendationPreferenceIssues({ recommendation_preferences: [{ ...row, score: 101 }] })[0].target).toBe("Preference 1 ranking points");
    expect(recommendationPreferenceIssues({ recommendation_preferences: [row, row] })[0].target).toBe("Eligibility rules JSON");
    expect(recommendationPreferenceIssues({ recommendation_preferences: Array.from({ length: 11 }, (_, index) => ({ ...row, key: `preference_${index}` })) })[0].target).toBe("Recommendation preferences");
  });

  it("preserves nested conditions rather than silently simplifying them", () => {
    const row = { ...newRecommendationPreference([], true), when: { all: [{ field: "use_of_funds_complete", op: "eq", value: true }, { field: "real_estate_equipment_pct", op: "gte", value: 51 }] } };
    const before = JSON.stringify(row);
    expect(preferenceCondition(row)).toBeNull();
    expect(readRecommendationPreferences({ recommendation_preferences: [row] })).toEqual([row]);
    expect(recommendationPreferenceIssues({ recommendation_preferences: [row] })).toEqual([]);
    expect(JSON.stringify(row)).toBe(before);
  });

  it("retains unknown advanced preference metadata and blocks until reviewed", () => {
    const rules = { recommendation_preferences: [{ ...newRecommendationPreference([], true), unknown_policy: true }] };
    const before = JSON.stringify(rules);
    expect(readRecommendationPreferences(rules)).toBeNull();
    expect(recommendationPreferenceIssues(rules)[0].target).toBe("Eligibility rules JSON");
    expect(JSON.stringify(rules)).toBe(before);
  });

  it("uses the same supported fit fields and bounded total rule count as the API", () => {
    const row = newRecommendationPreference([], true);
    expect(recommendationPreferenceIssues({ recommendation_preferences: [{ ...row, when: { field: "imaginary", op: "gte", value: 1 } }] })[0].message).toContain("Unsupported eligibility field");
    const many = Array.from({ length: 10 }, (_, index) => ({ ...row, key: `preference_${index}`, when: { all: Array.from({ length: 10 }, () => row.when) } }));
    expect(recommendationPreferenceIssues({ recommendation_preferences: many }).at(-1)?.message).toContain("100 conditions");
  });

  it("supports all four funding-use fields and reports preference errors in the main save validator", () => {
    const rules = { fit: { all: [
      { field: "use_of_funds_total", op: "gte", value: 100000 },
      { field: "real_estate_equipment_amount", op: "gte", value: 51000 },
      { field: "real_estate_equipment_pct", op: "gte", value: 51 },
      { field: "use_of_funds_complete", op: "eq", value: true },
    ] } };
    expect(readSimpleFit(rules)?.conditions).toHaveLength(4);
    expect(validateEditorContent(JSON.stringify(rules), "[]")).toBeNull();
    expect(criteriaValidationIssues(JSON.stringify({ ...rules, recommendation_preferences: [newRecommendationPreference([])] }), "[]").map((issue) => issue.target)).toEqual(["Preference 1 name", "Preference 1 threshold"]);
  });
});
