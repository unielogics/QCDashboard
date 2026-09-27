import { describe, expect, it } from "vitest";
import { EVIDENCE_TEMPLATES, jsonEquivalent, newRequirement, readSimpleFit, validateEditorContent, writeSimpleFit } from "../fundingProgramEditorModel";

describe("funding program guided editor", () => {
  it("round-trips workspace, numeric, and boolean checks while preserving unrelated metadata", () => {
    const rules = { priority: 17, provenance: { source: "reviewed" }, fit: { any: [{ field: "vertical", op: "eq", value: "dealer" }, { field: "annual_revenue", op: "gte", value: 125000 }, { field: "declared_collateral", op: "eq", value: true }] } };
    const fit = readSimpleFit(rules);
    expect(fit).not.toBeNull();
    expect(writeSimpleFit(rules, fit!)).toEqual(rules);
  });
  it("keeps nested rules, unknown fields and list conditions out of lossy simple editing", () => {
    for (const fit of [{ all: [{ any: [{ field: "vertical", op: "eq", value: "dealer" }] }] }, { field: "custom.fact", op: "gte", value: 4 }, { field: "entity_type", op: "in", value: ["llc", "corporation"] }, { field: "vertical", op: "eq", value: "dealer", unsupported: true }]) {
      expect(readSimpleFit({ fit })).toBeNull();
    }
  });
  it("allows an empty editable numeric input but prevents it from being saved", () => {
    const rules = { fit: { all: [{ field: "annual_revenue", op: "gte", value: "" }] } };
    expect(readSimpleFit(rules)?.conditions[0].value).toBe("");
    expect(validateEditorContent(JSON.stringify(rules), "[]")).toContain("numeric threshold");
    expect(validateEditorContent(JSON.stringify({ fit: { field: "annual_revenue", op: "gte", value: 0 } }), "[]")).toBeNull();
  });
  it("never creates an invalid empty all group when the last check is removed", () => {
    expect(writeSimpleFit({ priority: 4, fit: { field: "vertical", op: "eq", value: "dealer" } }, { mode: "all", conditions: [] })).toEqual({ priority: 4 });
    expect(validateEditorContent('{"fit":{"all":[]}}', "[]")).toContain("empty group");
  });
  it("does not mark formatting-only JSON edits as unsaved, but recognizes actual changes", () => {
    expect(jsonEquivalent('{"priority":1,"fit":{"field":"vertical","op":"eq","value":"dealer"}}', '{ "fit": { "value": "dealer", "field": "vertical", "op": "eq" }, "priority": 1 }')).toBe(true);
    expect(jsonEquivalent('{"fit":{"field":"vertical","op":"eq","value":"dealer"}}', '{"fit":{"field":"vertical","op":"eq","value":"mca"}}')).toBe(false);
    expect(jsonEquivalent("{broken", "{}")).toBe(false);
  });
  it("uses canonical coverage keys and unique custom requirement references", () => {
    expect(EVIDENCE_TEMPLATES.find((row) => row.label.includes("6 months"))?.key).toBe("business_bank_statements_6_months");
    expect(EVIDENCE_TEMPLATES.find((row) => row.label.includes("2 years"))?.key).toBe("business_tax_returns_2_years");
    const first = newRequirement("Custom review", []);
    const second = newRequirement("Other review", [first]);
    expect(first.requirement_key).not.toEqual(second.requirement_key);
    expect(validateEditorContent("{}", JSON.stringify([first, second]))).toBeNull();
    expect(validateEditorContent("{}", JSON.stringify([first, first]))).toContain("same reference");
  });
  it("preserves requirements' verification, conditions and AI guidance on a label edit", () => {
    const existing = { ...newRequirement("Bank evidence", []), applies_when: { entity_type: "LLC" }, objective_text: "Confirm bank activity", completion_criteria: "Six complete months", ai_request_message_template: "Please send all pages.", expiration_days: 90, can_underwriter_waive: false };
    const edited = { ...existing, label: "Business bank evidence" };
    expect(edited.applies_when).toEqual(existing.applies_when);
    expect(edited.completion_criteria).toBe(existing.completion_criteria);
    expect(validateEditorContent("{}", JSON.stringify([edited]))).toBeNull();
  });
  it("blocks incomplete names, no visibility and invalid advanced JSON", () => {
    expect(validateEditorContent("{}", JSON.stringify([newRequirement("", [])]))).toContain("name");
    expect(validateEditorContent("{}", JSON.stringify([{ ...newRequirement("Bank statements", []), visibility: [] }]))).toContain("audience");
    expect(validateEditorContent("{", "[]")).toContain("invalid JSON");
    expect(validateEditorContent("{}", "{}")).toContain("list");
  });
});
