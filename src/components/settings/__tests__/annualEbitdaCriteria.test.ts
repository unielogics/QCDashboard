import { describe, expect, it } from "vitest";
import { ANNUAL_EBITDA_POLICY, FIT_FIELDS, readSimpleFit, validateEditorContent, writeSimpleFit } from "../fundingProgramEditorModel";
import { summarizeProgramEffects } from "../fundingProgramSummaryModel";

const limits = { minimum_annual_ebitda: 50000, currency: "USD", source_reference: "Reviewed lender criteria v4" };
const rules = { priority: 7, financial_limits: limits, fit: { all: [{ field: "annual_ebitda", op: "gte", value: 50000 }] } };
describe("annual EBITDA program criteria", () => {
  it("offers a factual USD metric without inventing a default threshold", () => {
    expect(FIT_FIELDS.find((row) => row.key === "annual_ebitda")).toMatchObject({ type: "number", label: "Annual EBITDA (USD)", hint: ANNUAL_EBITDA_POLICY });
    expect(validateEditorContent('{"fit":{"field":"annual_ebitda","op":"gte","value":0}}', "[]")).toBeNull();
    expect(validateEditorContent('{"fit":{"field":"annual_ebitda","op":"gte","value":""}}', "[]")).toContain("numeric threshold");
    expect(validateEditorContent('{"fit":{"field":"annual_ebitda","op":"in","value":[1,2]}}', "[]")).toContain("numeric comparisons");
  });
  it("round-trips source metadata and synchronizes an explicit minimum edit", () => {
    const fit = readSimpleFit(rules)!;
    expect(writeSimpleFit(rules, fit)).toEqual(rules);
    const changed = writeSimpleFit(rules, { ...fit, conditions: [{ ...fit.conditions[0], value: 75000 }] });
    expect(changed.financial_limits).toEqual({ ...limits, minimum_annual_ebitda: 75000 });
    expect(validateEditorContent(JSON.stringify(changed), "[]")).toBeNull();
    expect(writeSimpleFit(rules, { mode: "all", conditions: [] })).toEqual({ priority: 7 });
  });
  it("preserves conflicting conditions for explicit review rather than changing the lender threshold", () => {
    for (const fit of [{ any: [{ field: "annual_ebitda", op: "gte", value: 50000 }] }, { not: { field: "annual_ebitda", op: "gte", value: 50000 } }, { field: "annual_ebitda", op: "gte", value: 10000 }]) expect(validateEditorContent(JSON.stringify({ ...rules, fit }), "[]")).toContain("matching mandatory");
    expect(validateEditorContent(JSON.stringify({ ...rules, financial_limits: { ...limits, currency: "EUR" } }), "[]")).toContain("USD");
    expect(validateEditorContent(JSON.stringify({ ...rules, financial_limits: { ...limits, source_reference: "" } }), "[]")).toContain("source reference");
  });
  it("shows the published minimum and factual evidence policy separately from refinance assumptions", () => {
    const summary = summarizeProgramEffects([], JSON.stringify(rules), "[]");
    expect(JSON.stringify(summary.fit)).toContain("$50,000");
    expect(summary.annualEbitdaPolicy).toBe(ANNUAL_EBITDA_POLICY);
    expect(summary.annualEbitdaSourceReference).toBe(limits.source_reference);
    expect(rules.financial_limits).toEqual(limits);
  });
});
