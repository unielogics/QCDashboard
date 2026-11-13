import { describe, expect, it } from "vitest";
import { addOperatingGrowthActivity } from "../operatingReinvestment";
import { clearOperatingIncompatibleCommand, linkOperatingMarketingExpense, modelOperatingMarketingReturns, operatingOwnNewMarketingExpense, setOperatingNewMarketingCadence } from "../operatingMarketingActivity";
import { operatingActionIssuePath } from "../operatingActionIssuePath";
import { operatingActionMissingFields, operatingActionFieldLabel } from "../operatingActionFields";
import { operatingPlannerIssues, operatingPlanSubmissionIssues } from "../operatingPlannerIssues";
import { operatingSourceReviewInUse } from "../operatingSourceReview";
import type { OperatingAction, OperatingEvaluation, OperatingPlanBody } from "../operatingPlan";

const group = { key: "marketing:original", category: "marketing", sourceGroupKey: "tax:marketing", label: "Marketing", expenses: [], activities: [] };
const command = { target: "total_cost", mode: "percent", direction: "decrease", value: 10 } as const;
const base = (): OperatingPlanBody => ({ currency: "USD", period_start: "2025-01-01", period_end: "2025-12-31", source_group_confirmation_stamp: "source-identity", source_group_confirmations: { "tax:marketing": "confirmed" }, expenses: [{ id: "e", category: "marketing", label: "Existing campaign", current_amount: 6800, cadence: "annual", cost_basis: "total", source_group_key: "tax:marketing", source_candidate_key: "tax:marketing", source_file_ids: ["source"] }], adjustments: [{ id: "a", kind: "expense_increase", label: "Existing campaign change", driver_key: "campaign", expense_row_id: "e", expense_category: "marketing", current_amount: 6800, proposed_amount: "8000", cadence: "annual", implementation_cost: 0, explanation: "Expand the selected campaign", source_file_ids: ["source"], source_note: "Manual supporting note", effective_date: "2026-01-01", status: "approved" }] });
const missingMessage = "Enter a command value; a cleared amount is unknown, not zero.";

describe("explicit marketing creation and conversion", () => {
  it("creates proper linked zero-cost marketing intent without adopting the source group or inventing returns", () => {
    const b = base(), original = JSON.stringify(b), next = addOperatingGrowthActivity(b, group, "New campaign", "new", "new-cost"), a = next.adjustments!.at(-1)!;
    expect(next.expenses![0]).toBe(b.expenses![0]); expect(next.source_group_confirmations).toBe(b.source_group_confirmations); expect(next.source_group_confirmation_stamp).toBe("source-identity");
    expect(next.expenses!.at(-1)).toMatchObject({ id: "new-cost", current_amount: 0, source_group_key: "", source_file_ids: [] });
    expect(a).toMatchObject({ id: "new", kind: "marketing_investment", expense_row_id: "new-cost", cadence: "monthly", current_amount: 0, proposed_amount: null, product_name: "", revenue_return_multiple: null, contribution_margin_pct: null, implementation_cost: null });
    expect(operatingActionMissingFields(a, next)).toEqual(expect.arrayContaining(["product_name", "proposed_amount", "revenue_return_multiple", "contribution_margin_pct"])); expect(JSON.stringify(b)).toBe(original);
  });
  it("preserves current and proposed spend, exact cadence, identity, manual details and source context on explicit conversion", () => {
    const b = base(), original = JSON.stringify(b), next = modelOperatingMarketingReturns(b, "a"), a = next.adjustments![0];
    expect(a).toMatchObject({ id: "a", kind: "marketing_investment", expense_row_id: "e", current_amount: 6800, proposed_amount: "8000", cadence: "annual", driver_key: "campaign", implementation_cost: 0, explanation: "Expand the selected campaign", source_note: "Manual supporting note", effective_date: "2026-01-01", status: "proposed" });
    expect(a.command).toBeUndefined(); expect(a.revenue_return_multiple).toBeNull(); expect(a.contribution_margin_pct).toBeNull(); expect(next.expenses).toBe(b.expenses); expect(JSON.stringify(b)).toBe(original);
  });
  it("does not reinterpret a valid old annual proposal as monthly", () => { const b = base(); b.expenses![0].cadence = "monthly"; expect(modelOperatingMarketingReturns(b, "a")).toBe(b); });
  it("requires a matching canonical period total before converting a command", () => {
    const b = base(); b.adjustments![0].command = command;
    expect(modelOperatingMarketingReturns(b, "a")).toBe(b);
    expect(modelOperatingMarketingReturns(b, "a", { action_id: "other", cadence: "annual", proposed_amount: 6120 })).toBe(b);
    expect(modelOperatingMarketingReturns(b, "a", { action_id: "a", cadence: "monthly", proposed_amount: 6120 })).toBe(b);
    const a = modelOperatingMarketingReturns(b, "a", { action_id: "a", cadence: "annual", proposed_amount: 6120 }).adjustments![0]; expect(a.proposed_amount).toBe(6120); expect(a.command).toBeUndefined(); expect(a.kind).toBe("marketing_investment");
  });
  it("only unscopes its own old generated new-zero disclosure, retaining real source and itemization claims", () => {
    const b = base(); Object.assign(b.expenses![0], { current_amount: 0, source_candidate_key: "", source_file_ids: [], notes: "User confirmed this new activity has no current cost; not an extracted tax or P&L expense." }); b.adjustments![0].source_file_ids = [];
    expect(modelOperatingMarketingReturns(b, "a").expenses![0].source_group_key).toBe("");
    b.expenses![0].itemization_parent_id = "parent"; expect(modelOperatingMarketingReturns(b, "a").expenses![0].source_group_key).toBe("tax:marketing");
    b.expenses![0].itemization_parent_id = null; b.expenses![0].current_amount = 5; expect(modelOperatingMarketingReturns(b, "a").expenses![0].source_group_key).toBe("tax:marketing");
  });
  it("allows explicit frequency choice only for its own linked zero disclosure without calculating a new amount", () => {
    const b = addOperatingGrowthActivity(base(), group, "New campaign", "new", "cost"); b.adjustments!.at(-1)!.proposed_amount = "900";
    const next = setOperatingNewMarketingCadence(b, "new", "annual"); expect(next.adjustments!.at(-1)).toMatchObject({ cadence: "annual", proposed_amount: "900" }); expect(next.expenses!.at(-1)!.cadence).toBe("annual"); expect(operatingOwnNewMarketingExpense(next, next.adjustments!.at(-1)!)).toBe(next.expenses!.at(-1));
    expect(setOperatingNewMarketingCadence(modelOperatingMarketingReturns(base(), "a"), "a", "monthly").adjustments![0].cadence).toBe("annual");
  });
  it("retains an unused own-zero disclosure as history on intentional relink and clears mismatched proposal frequency", () => {
    const b = addOperatingGrowthActivity(base(), group, "New campaign", "new", "cost"); b.adjustments!.at(-1)!.proposed_amount = "900";
    const next = linkOperatingMarketingExpense(b, "new", "e");
    expect(next.expenses!.find(row => row.id === "cost")?.excluded).toBe(true); expect(next.expenses![0]).toBe(b.expenses![0]);
    expect(next.adjustments!.at(-1)).toMatchObject({ expense_row_id: "e", cadence: "annual", current_amount: 6800, proposed_amount: null });
    expect(b.expenses!.at(-1)?.excluded).toBeUndefined();
  });
  it("never excludes a real source cost when relinking marketing", () => {
    const b = modelOperatingMarketingReturns(base(), "a"); b.expenses!.push({ id: "other", category: "marketing", current_amount: 10, cadence: "annual" });
    expect(linkOperatingMarketingExpense(b, "a", "other").expenses![0]).toBe(b.expenses![0]); expect(b.expenses![0].excluded).toBeUndefined();
  });
  it("collapses blank unsupported-command aliases to the single explicit clear repair while retaining its own inputs", () => {
    const b = modelOperatingMarketingReturns(base(), "a"), a = b.adjustments![0]; Object.assign(a, { product_name: "Service", revenue_return_multiple: 2.5, contribution_margin_pct: 60, command: { ...command, value: null } });
    const aliases = ["adjustments.a.command", missingMessage, "The command's current baseline is unknown."];
    expect(new Set(aliases.map(path => operatingActionIssuePath(path, a, b)))).toEqual(new Set(["adjustments.a.command"]));
    expect(operatingActionMissingFields(a, b)).toEqual(["command"]);
  });
  it.each(["marketing_investment", "revenue_change", "product_cost_change"] as const)("validates own numeric inputs and exposes explicit clear repair for incompatible command on %s", kind => {
    const b = base(); Object.assign(b.adjustments![0], { kind, command, proposed_amount: null }); const a = b.adjustments![0], fields = operatingActionMissingFields(a, b);
    expect(fields).toContain("command"); expect(fields).not.toContain("command.value"); expect(fields).toContain(kind === "product_cost_change" ? "proposed_unit_cost" : "proposed_amount");
    expect(operatingActionIssuePath("adjustments.a.command", a, b)).toBe("adjustments.a.command"); expect(operatingActionFieldLabel("adjustments.a.command", a)).toBe("Remove the incompatible cost command");
    expect(operatingActionIssuePath("This command target does not match its action or current expense item.", a, b)).toBe("adjustments.a.command");
    expect(operatingActionIssuePath("The command's current baseline is unknown.", a, b)).toBe("adjustments.a.command");
    const next = clearOperatingIncompatibleCommand(b, "a"); expect(next.adjustments![0].command).toBeUndefined(); expect(next.adjustments![0].proposed_amount).toBeNull(); expect(next.expenses).toBe(b.expenses);
  });
});

describe("canonical command repair identity", () => {
  const action = (value: number | string | null): OperatingAction => ({ id: "group", kind: "expense_group_change", label: "Marketing group", driver_key: "group", implementation_cost: 0, explanation: "Known intent", command: { ...command, value } });
  it.each([0, "2.5", 10])("removes obsolete value aliases for a valid live value %s", value => { const a = action(value), b = { adjustments: [a] }; expect(operatingActionIssuePath("adjustments.group.command.value", a, b)).toBeNull(); expect(operatingActionIssuePath(missingMessage, a, b)).toBeNull(); });
  it("deduplicates absent-command parent, leaf and known human message to one actionable issue", () => {
    const a = action(null); a.command = undefined; const b = { adjustments: [a] };
    expect(new Set(["adjustments.group.command", "adjustments.group.command.value", missingMessage].map(path => operatingActionIssuePath(path, a, b)))).toEqual(new Set(["adjustments.group.command.value"]));
  });
  it("keeps a populated parent-command incompatibility and genuine resolver conflicts readable", () => { const a = action(10), b = { adjustments: [a] }; expect(operatingActionIssuePath("adjustments.group.command", a, b)).toBe("adjustments.group.command"); expect(operatingActionFieldLabel("adjustments.group.command", a)).toBe("Review the command target and scope"); const message = "This command target does not match the selected cost"; expect(operatingActionIssuePath(message, a, b)).toBe(`adjustments.group.${message}`); expect(operatingActionFieldLabel(`adjustments.group.${message}`, a)).toBe(message); });
  it("never routes another action's machine path to this action", () => { const a = action(null); expect(operatingActionIssuePath("adjustments.other.command.value", a, { adjustments: [a] })).toBeNull(); });
  it("deduplicates evaluator aliases per ID while preserving another row's actual missing value", () => {
    const a = action(null), other = { ...action("2.5"), id: "other" }, b = { ...base(), adjustments: [a, other] };
    const e = { baseline: { noi: 0, noi_currency: "USD" }, draft_feedback: { summary: { baseline_ready: true }, actions: [{ action_id: a.id, math_missing: ["adjustments.group.command", "adjustments.group.command.value", missingMessage], qualification_missing: [], source_issues: [] }, { action_id: other.id, math_missing: [missingMessage], qualification_missing: [], source_issues: [] }] } } as unknown as OperatingEvaluation;
    const rows = operatingPlannerIssues(b, e).filter(row => row.actionId); expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ actionId: "group", field: "adjustments.group.command.value" });
  });
});

describe("source-aware public review and version prerequisites", () => {
  const ready = () => {
    const b = modelOperatingMarketingReturns(base(), "a"); Object.assign(b.adjustments![0], { product_name: "Service", revenue_return_multiple: 2.5, contribution_margin_pct: 60 });
    const e = { baseline: { noi: 18000, noi_currency: "USD" }, source_review: { active: true, complete: true, stale: false, source_fingerprint: "source-identity", reporting: {}, missing: [], fix_fields: [], groups: [{ key: "tax:marketing", category: "marketing", label: "Marketing", source_amount: 6800, baseline_annual_amount: 6800, decision: "confirmed", status: "confirmed" }] }, draft_feedback: { summary: { baseline_ready: true }, actions: [] } } as unknown as OperatingEvaluation;
    return { b, e };
  };
  it("allows a fresh confirmed source and complete marketing after relink cleared the obsolete category answer", () => { const { b, e } = ready(); expect(b.category_confirmations).toBeUndefined(); expect(operatingSourceReviewInUse(b, e.source_review)).toBe(true); expect(operatingPlanSubmissionIssues(b, e)).toEqual([]); });
  it("retains source confirmation and exact missing current-cost blockers", () => {
    const { b, e } = ready(); delete b.source_group_confirmations!["tax:marketing"];
    expect(operatingPlanSubmissionIssues(b, e).some(row => row.field === "source_group_confirmations.tax:marketing")).toBe(true);
    b.source_group_confirmations!["tax:marketing"] = "confirmed"; b.expenses![0].current_amount = null;
    expect(operatingPlanSubmissionIssues(b, e).some(row => row.field === "expenses.e.current_amount")).toBe(true);
  });
  it("keeps a lost or stale selected source actionable rather than silently treating it as legacy", () => {
    const { b, e } = ready(); Object.assign(e.source_review!, { groups: [], complete: false, stale: true, source_fingerprint: null, missing: ["source_group_confirmations.selected_source", "source_group_confirmation_stamp"] });
    expect(operatingPlanSubmissionIssues(b, e).map(row => row.field)).toEqual(expect.arrayContaining(["source_group_confirmations.selected_source", "source_group_confirmation_stamp"]));
  });
  it("preserves manual legacy category confirmation when the optional sidecar is inactive and empty", () => {
    const { b, e } = ready(); b.source_group_confirmation_stamp = null; b.source_group_confirmations = {}; Object.assign(e.source_review!, { active: false, complete: false, groups: [], source_fingerprint: null });
    expect(operatingSourceReviewInUse(b, e.source_review)).toBe(false);
    expect(operatingPlanSubmissionIssues(b, e).some(row => row.field === "category_confirmations.marketing")).toBe(true);
  });
  it("retains missing action WHY and setup even with all source groups confirmed", () => { const { b, e } = ready(); b.adjustments![0].explanation = ""; b.adjustments![0].implementation_cost = null; expect(operatingPlanSubmissionIssues(b, e).map(row => row.field)).toEqual(expect.arrayContaining(["adjustments.a.explanation", "adjustments.a.implementation_cost"])); });
  it("preserves the named lineage unknown-cost preparer handoff without requiring evidence", () => {
    const { b, e } = ready(); b.adjustments = []; b.historical_corrections = [{ source_group_key: "tax:marketing", reason: "Review the source allocation", evidence_note: "", source_file_ids: [] }]; b.source_group_confirmations!["tax:marketing"] = "needs_correction";
    b.expenses = [{ id: "parent", excluded: true, source_group_key: "tax:marketing", current_amount: 6800 }, { id: "child", label: "Named current cost", itemization_parent_id: "parent", source_group_key: "tax:marketing", category: "marketing", current_amount: null, cadence: "annual" }]; e.source_review!.groups[0].decision = "needs_correction";
    expect(operatingPlanSubmissionIssues(b, e)).toEqual([]);
    b.expenses[1].current_amount = -1; expect(operatingPlanSubmissionIssues(b, e).some(row => row.field === "expenses.child.current_amount")).toBe(true);
    b.expenses[1].current_amount = null; b.expenses[1].itemization_parent_id = null; expect(operatingPlanSubmissionIssues(b, e).some(row => row.field === "expenses.child.current_amount")).toBe(true);
  });
});
