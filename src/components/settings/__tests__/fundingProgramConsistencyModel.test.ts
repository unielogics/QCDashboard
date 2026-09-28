import { describe, expect, it } from "vitest";
import type { FundingProgramCatalogItem, FundingProgramScope } from "@/lib/fundingPrograms";
import { newRequirement } from "../fundingProgramEditorModel";
import { programLogicWarnings } from "../fundingProgramConsistencyModel";

const scope: FundingProgramScope = { vertical: "dealer", scope_key: "default", intake_variants: [], intent_keys: [], naics_prefixes: [], industry_keys: [], required_fact_keys: [] };
const bank = { ...newRequirement("Last 6 months business bank statements", [], "business_bank_statements_6_months"), blocks_stage: "underwriting" };
const tax = { ...newRequirement("Last 2 years business tax returns", [], "business_tax_returns_2_years"), completion_mode: "requires_human_verify", verification_required: true };
const base = { programKey: "sba_7a", rulesText: JSON.stringify({ fit: { field: "bank_statement_months", op: "gte", value: 4 } }), requirementsText: JSON.stringify([bank, tax]), scopes: [scope], catalog: [] as FundingProgramCatalogItem[] };
const program = (key: string, rules: Record<string, unknown> | null = null): FundingProgramCatalogItem => ({ id: key, program_key: key, name: key === "sba_504" ? "SBA 504" : "SBA Express", public_slug: key, status: "active", short_description: null, display_order: 0, aliases: [], scopes: [scope], published_version: rules ? { playbook_id: key, version: 1, status: "published", rules, requirements: [], published_at: "2026-09-27" } : null, draft_versions: [], created_at: "", updated_at: "" });
const warnings = (patch: Partial<typeof base> = {}) => programLogicWarnings({ ...base, ...patch });

describe("funding-program cross-setting logic review", () => {
  it("explains four-vs-six months as a staged difference with exact field targets", () => {
    const warning = warnings().find((item) => item.id === "coverage:0")!;
    expect(warning.kind).toBe("review");
    expect(warning.message).toContain("at least 4 bank months");
    expect(warning.message).toContain("requires 6 before underwriting");
    expect(warning.message).toContain("may be intentional");
    expect(warning.actions.map((action) => action.target)).toEqual(["Check 1 threshold", "Requirement 1 document type"]);
  });
  it("does not flatten OR/NOT branches or conditional/optional checklists into mandatory coverage", () => {
    const bankRule = { field: "bank_statement_months", op: "gte", value: 4 };
    for (const fit of [{ any: [bankRule, { field: "credit_score", op: "gte", value: 700 }] }, { not: bankRule }]) expect(warnings({ rulesText: JSON.stringify({ fit }) }).some((item) => item.id.startsWith("coverage:"))).toBe(false);
    for (const patch of [{ applies_when: { vertical: "dealer" } }, { required_level: "optional" }]) expect(warnings({ requirementsText: JSON.stringify([{ ...bank, ...patch }]) }).some((item) => item.id.startsWith("coverage:"))).toBe(false);
    expect(warnings({ rulesText: JSON.stringify({ fit: { ...bankRule, value: 6 } }) }).some((item) => item.id.startsWith("coverage:"))).toBe(false);
  });
  it("uses the strongest mandatory bound and integer coverage without dropping strict operators", () => {
    const fit = { all: [{ field: "bank_statement_months", op: "gte", value: 2 }, { field: "bank_statement_months", op: "gt", value: 4 }] };
    expect(warnings({ rulesText: JSON.stringify({ fit }) }).find((item) => item.id === "coverage:0")?.message).toContain("at least 5 bank months");
  });
  it("flags a renamed period that does not change its canonical coverage", () => {
    const result = warnings({ requirementsText: JSON.stringify([{ ...bank, label: "Last 4 months business bank statements" }]) });
    expect(result.find((item) => item.id === "period-name:0")).toMatchObject({ kind: "conflict", actions: [{ label: "Review document type", target: "Requirement 1 document type" }, { label: "Review display name", target: "Requirement 1 name" }] });
  });
  it("locates an MCA bank check attached to tax returns but does not guess custom document contents", () => {
    const check = { key: "no_mca_debits", label: "No MCA debit patterns", instructions: "Inspect transactions", severity: "review" };
    const result = warnings({ requirementsText: JSON.stringify([bank, { ...tax, review_checks: [check] }]) });
    expect(result.find((item) => item.id === "source:1:0")?.actions.map((action) => action.target)).toEqual(["Requirement 2 check 1 instructions", "Requirement 1 document type"]);
    for (const row of [bank, newRequirement("Combined financial packet", [])]) expect(warnings({ requirementsText: JSON.stringify([{ ...row, review_checks: [check] }]) }).some((item) => item.id.startsWith("source:"))).toBe(false);
  });
  it("distinguishes explicit staff gates from AI mode with document checks", () => {
    const result = warnings();
    expect(result.find((item) => item.id === "staff-verification")?.title).toBe("1 of 2 requirements still need staff verification");
    const ai = { ...tax, completion_mode: "ai_can_complete", verification_required: false, review_checks: [{ key: "net_income_nonnegative" }] };
    expect(warnings({ requirementsText: JSON.stringify([ai]) }).some((item) => item.id === "staff-verification")).toBe(false);
    expect(warnings({ requirementsText: JSON.stringify([{ ...ai, verification_required: true }]) }).some((item) => item.id === "staff-verification")).toBe(true);
  });
  it("detects impossible mandatory intervals without declaring alternative ranges contradictory", () => {
    const lower = { field: "requested_amount", op: "gt", value: 350000 };
    const upper = { field: "requested_amount", op: "lte", value: 350000 };
    expect(warnings({ rulesText: JSON.stringify({ fit: { all: [lower, upper] } }) }).find((item) => item.id === "range:requested_amount")?.kind).toBe("conflict");
    expect(warnings({ rulesText: JSON.stringify({ fit: { any: [lower, upper] } }) }).some((item) => item.id.startsWith("range:"))).toBe(false);
    expect(warnings({ rulesText: JSON.stringify({ fit: { all: [{ ...lower, op: "gte" }, upper] } }) }).some((item) => item.id.startsWith("range:"))).toBe(false);
  });
  it("recognizes equality and caps in every alternative while not treating a minimum as a cap", () => {
    const cap = { field: "requested_amount", op: "lte", value: 350000 };
    for (const fit of [cap, { ...cap, op: "eq" }, { any: [cap, { ...cap, value: 500000 }] }, { not: { ...cap, op: "gt" } }]) expect(warnings({ rulesText: JSON.stringify({ fit }) }).some((item) => item.id === "requested-amount-cap")).toBe(false);
    for (const fit of [{ ...cap, op: "gte" }, { any: [cap, { field: "credit_score", op: "gte", value: 700 }] }]) expect(warnings({ rulesText: JSON.stringify({ fit }) }).some((item) => item.id === "requested-amount-cap")).toBe(true);
    expect(warnings({ programKey: "equipment" }).some((item) => item.id === "requested-amount-cap")).toBe(false);
  });
  it("links only relevant unpublished active SBA targets, never treating drafts as published", () => {
    const express = { ...program("sba_express"), draft_versions: [{ ...program("sba_express", { fit: { field: "credit_score", op: "gte", value: 660 } }).published_version!, status: "draft" as const }] };
    const result = warnings({ catalog: [program("sba_504"), express] }).find((item) => item.id === "routing-targets")!;
    expect(result.actions.map((action) => action.programKey)).toEqual(["sba_504", "sba_express"]);
    expect(warnings({ catalog: [{ ...express, status: "retired" }, { ...program("sba_504"), scopes: [{ ...scope, vertical: "real_estate" }] }] }).some((item) => item.id === "routing-targets")).toBe(false);
  });
  it("explains that a published 504 still needs an explicit percentage preference", () => {
    const fit = { field: "credit_score", op: "gte", value: 660 };
    const catalog = [program("sba_504", { fit })];
    const warning = warnings({ catalog }).find((item) => item.id === "504-share-preference")!;
    expect(warning.message).toContain("QC ranking preference, not an SBA eligibility");
    expect(warning.actions[0]).toMatchObject({ programKey: "sba_504", target: "Recommendation preferences" });
    const preference = { key: "fixed_asset", when: { field: "real_estate_equipment_pct", op: "gte", value: 51 }, score: 10 };
    expect(warnings({ catalog: [program("sba_504", { fit, recommendation_preferences: [preference] })] }).some((item) => item.id === "504-share-preference")).toBe(false);
    expect(warnings({ programKey: "sba_504", rulesText: JSON.stringify({ fit, recommendation_preferences: [preference] }), catalog }).some((item) => item.id === "504-share-preference")).toBe(false);
  });
  it("never changes the input policy and leaves malformed input to structural validation", () => {
    const snapshot = JSON.stringify(base);
    warnings();
    expect(JSON.stringify(base)).toBe(snapshot);
    for (const rulesText of ["{bad", "[]", "null"]) expect(warnings({ rulesText })).toEqual([]);
    expect(warnings({ requirementsText: "{}" })).toEqual([]);
  });
});
