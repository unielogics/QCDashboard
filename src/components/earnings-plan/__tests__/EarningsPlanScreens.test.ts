/** The four steps and the side panel, rendered for the design's file: the figures printed are the design's, and each viewer sees only its own controls. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { evaluate } from "@/lib/earningsPlan/math";
import type { PlanFacts } from "@/lib/earningsPlan/session";
import { debtBasis } from "@/lib/earningsPlan/view";
import { clientPlanTransport } from "@/lib/earningsPlan/api";
import { QUESTIONS, referenceWorkspace } from "@/lib/__tests__/fixtures/earningsPlanReferencePlan";
import { EarningsPlanWorkspace } from "../EarningsPlanWorkspace";
import { PlanAside } from "../PlanAside";
import { StepChanges } from "../StepChanges";
import { StepModel } from "../StepModel";
import { StepReview } from "../StepReview";
import { StepSource } from "../StepSource";

const workspace = referenceWorkspace();
const body = workspace.body;
const facts: PlanFacts = {
  baseline: workspace.evaluation.plan.baseline, questions: QUESTIONS, sourceChanged: false, staleReviews: [], contextStamp: workspace.context_stamp,
  goal: workspace.goal, versions: workspace.versions, currentVersionId: workspace.current_version_id, familyId: workspace.family_id, draft: workspace.draft,
  origin: "saved", templates: workspace.stream_templates, canEdit: true, completed: false,
};
const result = evaluate(body, facts.baseline, { goal: facts.goal!.amount, questions: QUESTIONS });
const basis = debtBasis(facts.baseline, true);
const nothing = () => undefined;
const later = async () => undefined;
const common = { body, facts, disabled: false, staff: true, edit: nothing };
const html = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element);
const count = (text: string, part: string) => text.split(part).length - 1;

describe("step 1: the source", () => {
  const props = { ...common, basis, applyTerms: true, onApplyTerms: nothing, busy: "" as const, onResync: nothing };

  it("prints the source beside the statement, what is confirmed, and the loan terms", () => {
    const page = html(createElement(StepSource, { ...props, onSetGoal: later, onOpenSource: nothing }));
    for (const text of ["IRS 1120-S · 2025", "Jan 1 – Dec 31, 2025", "USD · Accrual", "$215,000 / yr", "7 of 10 confirmed", "IRS 2025", "P&amp;L annualized",
      "$601,886", "$588,400", "−$13,486", "Not confirmed", "$1,236,000", "−$30,777", "−$22,377", "$777,600", "EBITDA includes $8,400",
      "Client terms v3", "$64,800 / mo", "$14,800 / mo", "$50,000 / mo", "−0.03x → −0.13x", "Apply to plan", "Edit goal"]) expect(page).toContain(text);
    expect(count(page, "<tr data-group=")).toBe(10);
    // A confirmed amount cannot be confirmed twice; an open one can.
    expect(page).toMatch(/data-group="cogs".*?<button[^>]*disabled=""[^>]*>Confirm<\/button>/s);
    expect(page).toMatch(/data-group="utl"[^]*?<button type="button" class="[^"]*">Confirm<\/button>/);
  });

  it("gives the business no way to change the goal or open staff files, and disables everything on a view-only link", () => {
    const client = html(createElement(StepSource, { ...props, staff: false }));
    expect(client).toContain("$215,000 / yr");
    expect(client).not.toContain("Edit goal");
    expect(client).not.toContain("View return");
    const locked = html(createElement(StepSource, { ...props, staff: false, disabled: true }));
    expect(count(locked, ">Confirm</button>")).toBe(count(locked, 'disabled="">Confirm</button>'));
  });

  it("asks for the plan to be updated when the source figures have changed, and says so when there is no source", () => {
    const changed = html(createElement(StepSource, { ...props, facts: { ...facts, sourceChanged: true } }));
    expect(changed).toContain("The source figures changed after this plan was built");
    expect(changed).toContain("Update to current figures");
    expect(changed).toContain("0 of 10 confirmed");
    const empty = { ...facts.baseline, available: false, reason: "No return or statement is in use yet.", revenue: null, noi: null, ebitda: null, groups: [], source: {}, statement: null, debt_service_with_terms: null };
    const none = html(createElement(StepSource, { ...props, facts: { ...facts, baseline: empty } }));
    expect(none).toContain("This file has no earnings source yet");
    expect(none).toContain("No return or statement is in use yet.");
    expect(none).not.toContain("Loan terms on file");
  });
});

describe("step 2: revenue model and costs", () => {
  it("prints each stream's arithmetic, each cost's rate and whether split groups add up", () => {
    const page = html(createElement(StepModel, { ...common, result }));
    for (const text of ["Reconciles to IRS revenue", "$900,000", "$75,000 / month", "Business unit: unit · 3,600 a year · $250.00 revenue per unit", "Recurring contracts",
      "Model total $1,236,000 against IRS revenue $1,236,000", "$105.00 per unit", "55.00% of revenue", "2.00% of revenue", "Fixed amount", "$378,000",
      "Cost of goods sold · 4 items total $601,886 against $601,886 on the source · 3 linked to revenue", "Payroll taxes", "Transportation", "Not answered"]) expect(page).toContain(text);
    expect(count(page, "data-stream=")).toBe(3);
    expect(count(page, "data-line=")).toBe(14);
    expect(page).not.toContain("Put the difference in");
  });
});

describe("step 3: changes", () => {
  it("lists every place a change can land with what each change does, and where released cash goes", () => {
    const page = html(createElement(StepChanges, { ...common, result, basis, open: "f:s2:0", onOpen: nothing }));
    for (const text of ["EBITDA +$95,841 / yr", "EBITDA +$39,868 / yr", "EBITDA +$21,420 / yr", "EBITDA +$71,793 / yr", "EBITDA −$14,400 / yr", "Overall pricing",
      "Current $250.00", "Plan $262.00", "Plan 340 units / mo", "EBITDA +$28,805 / yr", "Moves Rent −$28,805", "Explanation needed", "Reviewed", "follows its driver",
      "Whole group: Cost of goods sold", "Returns $3.49 revenue per $1", "Plan $14,400 / yr", "$35,800 / mo stays as cash", "Client terms v3 release $50,000 a month", "Jan 2027", "Dec 2027"]) expect(page).toContain(text);
    expect(count(page, "data-row=")).toBe(26);
    // The one opened from the to-finish list shows its reason field; the others stay folded.
    expect(count(page, "Why this will work")).toBe(1);
    expect(page).not.toContain("From the earlier plan, to re-enter");
  });

  it("lists what an earlier plan held that has to be re-entered", () => {
    const carried = { ...body, carried_over: [{ id: "c1", kind: "change", label: "Second cut to the same lease", detail: "Combine it with the first one.", annual_amount: 6805, resolved: false }] };
    const page = html(createElement(StepChanges, { ...common, body: carried, result, basis, open: null, onOpen: nothing }));
    expect(page).toContain("From the earlier plan, to re-enter");
    expect(page).toContain("+$6,805 / yr in the earlier plan");
  });
});

describe("step 4: review and save", () => {
  const props = { ...common, result, view: "proposed" as const, basis, busy: "" as const, unsavedInReport: true, businessName: "Harbor Auto Detail LLC", onOpenPdf: later };

  it("prints today against the plan, the bridge, the ramp, the saved report and the staff review", () => {
    const page = html(createElement(StepReview, { ...props, onReview: later }));
    for (const text of ["Annual NOI", "$174,497", "$43,764", "First-year EBITDA", "$145,663", "$41,435", "DSCR · saved refinance", "1.03x", "0.29x",
      "Baseline EBITDA", "+$89,616", "+$36,845", "+$21,420", "+$71,793", "−$14,400", "Plan EBITDA", "First year $145,663 · run-rate $182,897", "Monthly payment $14,800",
      "Open PDF v1", "Draft changes are not in this PDF", "Staff review and reconciliation", "Approve selected", "No explanation yet", "I confirm these disclosures and proposals",
      "Tax preparer handoff", "No historical differences recorded."]) expect(page).toContain(text);
    expect(count(page, "data-review=")).toBe(11);
    expect(page).not.toContain("Underwriting reviews proposed changes");
  });

  it("shows the business its plan without the review controls", () => {
    const page = html(createElement(StepReview, { ...props, staff: false }));
    expect(page).toContain("Underwriting reviews proposed changes before they can enter a reviewed projection.");
    expect(page).not.toContain("Staff review and reconciliation");
    expect(page).not.toContain("Approve selected");
    expect(page).toContain("Before and after");
  });
});

describe("the side panel", () => {
  it("prints the six metrics before and after, coverage against the threshold, the goal and what is left", () => {
    const page = html(createElement(PlanAside, { baseline: facts.baseline, result, view: "proposed", basis, staff: true, onView: nothing, onIssue: nothing }));
    for (const text of ["−$22,377", "$182,897", "+$205,274", "−$30,777", "$174,497", "−0.03x", "1.03x", "+1.06x", "−$799,977", "$5,297", "−2.5%", "11.6%", "+14.1 pts",
      "$777,600", "$177,600", "−$600,000", "Covers debt", "Baseline −0.03x", "Plan 1.03x", "Needs $39,103 more EBITDA", "81%", "of the $215,000 goal · proposed",
      "Still to find", "$40,503", "Confirm Utilities source amount", "Show all 8"]) expect(page).toContain(text);
    expect(count(page, "data-metric=")).toBe(6);
    const reviewed = html(createElement(PlanAside, { baseline: facts.baseline, result, view: "reviewed", basis, staff: true, onView: nothing, onIssue: nothing }));
    expect(reviewed).toContain("$52,164");
    expect(reviewed).toContain("of the $215,000 goal · reviewed");
  });
});

describe("the workspace", () => {
  it("says it is opening the plan until the plan has loaded", () => {
    expect(html(createElement(EarningsPlanWorkspace, { transport: clientPlanTransport("token") }))).toContain("Opening the earnings plan…");
  });
});
