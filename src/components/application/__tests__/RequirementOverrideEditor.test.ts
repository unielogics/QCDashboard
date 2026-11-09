import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RequirementOverrideEditor } from "../RequirementOverrideEditor";
import type { RequirementOverrideDraft } from "@/lib/requirementOverride";

const draft: RequirementOverrideDraft = { requirementKey: "ytd_p_and_l_balance_sheet", action: "waive", reason: "Retain this reviewed waiver reason", allPrograms: false, programKeys: ["program-a"] };
const render = (busy: boolean, proposed = draft) => renderToStaticMarkup(createElement(RequirementOverrideEditor, { draft: proposed, programs: [{ key: "program-a", label: "Selected Program" }], busy, onDraft: () => {}, onCancel: () => {}, onReview: () => {} }));
describe("requirement override editor", () => {
  it("keeps the entered reason and scope visible while locking confirmation/save controls", () => {
    const html = render(true);
    expect(html).toContain(draft.reason); expect(html).toContain("Selected Program"); expect(html).toContain('checked=""'); expect(html).toMatch(/<fieldset[^>]*disabled=""/); expect(html).toContain("Saving override…"); expect(html).toContain('maxLength="2000"');
  });
  it("leaves a valid retained draft ready for explicit retry and blocks a missing scope", () => {
    expect(render(false)).toMatch(/<button(?![^>]*disabled)[^>]*>Review override<\/button>/);
    expect(render(false, { ...draft, programKeys: [] })).toMatch(/<button[^>]*disabled=""[^>]*>Review override<\/button>/);
  });
  it("describes program scope separately from an independent evidence policy", () => {
    const html = renderToStaticMarkup(createElement(RequirementOverrideEditor, { draft, programs: [{ key: "program-a", label: "Selected Program" }], hasPolicy: true, busy: false, onDraft: () => {}, onCancel: () => {}, onReview: () => {} }));
    expect(html).toContain("Apply to all selected programs"); expect(html).not.toContain("and policies"); expect(html).toContain("Independent policy requirements remain in effect");
    const policyOnly = renderToStaticMarkup(createElement(RequirementOverrideEditor, { draft: { ...draft, allPrograms: true }, programs: [], hasPolicy: true, busy: false, onDraft: () => {}, onCancel: () => {}, onReview: () => {} }));
    expect(policyOnly).toContain("Apply to this evidence requirement");
  });
});
