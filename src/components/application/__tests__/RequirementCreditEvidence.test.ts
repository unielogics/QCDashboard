import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { RequirementCreditEvidence } from "../RequirementCreditEvidence";
import { requirementAllowsClientRequest, requirementCreditCollection, type RequirementCreditCollection } from "@/lib/requirementCredit";
import type { FileOwner } from "@/lib/applicationProfile";

const actor = vi.hoisted(() => ({ role: "super_admin" }));
vi.mock("@/hooks/useApi", () => ({ useAuthedApi: () => vi.fn(), useCurrentUser: () => ({ data: { role: actor.role } }) }));
const credit: RequirementCreditCollection = { source: "linked_owner_credit_pulls", complete: true, required_owner_count: 1, collected_owner_count: 1, ownership_complete: true, owner_review_required: true, client_action_required: false, staff_review_reasons: ["The existing TransUnion FICO 4 score does not establish the required Equifax FICO 9 program minimum."], owners: [{ owner_id: "owner-a", credit_pull_id: "pull-a", status: "collected", reason: "A current owner report is linked", report_available: true, report_import_status: "completed", pulled_at: "2026-11-01T10:00:00Z", expires_at: null, score: 661, score_models: [{ model: "TransUnion FICO 4", score: 661 }], required_score_model: "Equifax FICO 9", required_score_model_present: false, backfill_needs_review: false }] };
const render = (pullId = "pull-a", proposed = credit) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["application-profile-owners", "profile"], [{ id: "owner-a", full_name: "Example Owner", credit_pull_id: pullId }] as FileOwner[]);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(RequirementCreditEvidence, { profileId: "profile", credit: proposed, requirementKey: "soft_credit_pull", programNames: ["Quidity 10-year term"], onOpenPrograms: () => {} })));
};
describe("linked owner credit receipt", () => {
  it("shows source collection separately from the model gap and reuses the linked report action", () => {
    const html = render();
    expect(html).toContain("1 of 1 owner report linked"); expect(html).toContain("Example Owner"); expect(html).toContain("TransUnion FICO 4: 661"); expect(html).toContain("Equifax FICO 9: not established"); expect(html).toContain(credit.staff_review_reasons[0]); expect(html).toContain("View linked credit report");
    expect(html).not.toContain("No file attached"); expect(html).not.toContain("Drop files"); expect(html).not.toContain("Qualified"); expect(html).not.toContain("680 - 661");
    expect(html).not.toContain("A current owner report is linked");
    const generic = "Staff must verify each required owner's bureau, score model and published minimum; collection is not program qualification";
    expect(render("pull-a", { ...credit, staff_review_reasons: [generic, ...credit.staff_review_reasons] })).not.toContain("Staff must verify each required owner");
    expect(render("pull-a", { ...credit, staff_review_reasons: [generic] })).toContain("Staff must verify each required owner");
    const needsReview = render("pull-a", { ...credit, owners: [{ ...credit.owners[0], status: "needs_review", reason: "Source identity needs review", backfill_needs_review: true }] });
    expect(needsReview).toContain("Source identity needs review"); expect(needsReview).toContain("Owner confirmation needed"); expect(needsReview).toContain("Review owner details"); expect(needsReview).not.toContain("staff review of its imported source information");
  });
  it("does not open a different pull if the profile's owner association changed", () => {
    expect(render("new-pull")).toMatch(/<button[^>]*disabled=""[^>]*>View linked credit report<\/button>/);
    expect(render("new-pull")).toContain("owner/report link changed");
  });
  it("requires explicit linked-owner provenance and valid coverage rather than inferring it from a generic status", () => {
    expect(requirementCreditCollection({ provenance: { credit_collection: credit } })).toBe(credit);
    expect(requirementCreditCollection({ provenance: {} })).toBeNull();
    expect(requirementCreditCollection({ provenance: { credit_collection: { ...credit, required_owner_count: -1 } } })).toBeNull();
  });
  it("excludes collected credit under staff review from client email selection without hiding genuine missing-owner requests", () => {
    expect(requirementAllowsClientRequest({ provenance: { credit_collection: credit } })).toBe(false);
    expect(requirementAllowsClientRequest({ provenance: { credit_collection: { ...credit, client_action_required: true } } })).toBe(true);
    expect(requirementAllowsClientRequest({ provenance: {} })).toBe(true);
    expect(requirementAllowsClientRequest({ provenance: { credit_collection: { source: "linked_owner_credit_pulls", client_action_required: false } } })).toBe(false);
  });
  it("preserves an explicit bureau and omits a model requirement the selected program did not publish", () => {
    const proposed = { ...credit, owners: [{ ...credit.owners[0], score_models: [{ model: "FICO 9", bureau: "Equifax", score: 720 }], required_score_model: null }] };
    const html = render("pull-a", proposed);
    expect(html).toContain("Equifax · FICO 9: 720"); expect(html).not.toContain("Required Equifax FICO 9:");
  });
  it("never presents an identity-provider proxy value as a bureau score, while preserving a real source score", () => {
    const proxy = { ...credit, staff_review_reasons: ["A verified bureau report is needed"], owners: [{ ...credit.owners[0], score: 720, score_verified: false, fico_source: "intelligence-proxy", score_models: [{ model: "Identity check score", score: 720 }] }] };
    const html = render("pull-a", proxy);
    expect(html).toContain("Bureau score unavailable · provider identity check only"); expect(html).not.toContain("720"); expect(html).not.toContain("Identity check score");
    const actual = { ...credit, owners: [{ ...credit.owners[0], score: 650, score_verified: true, fico_source: "bureau-report", score_models: [{ model: "FICO 4", bureau: "TransUnion", score: 650 }] }] };
    expect(render("pull-a", actual)).toContain("TransUnion · FICO 4: 650");
  });
  it("offers separate owner, report and program actions without treating collection as qualification", () => {
    const proposed = { ...credit, review_fingerprint: "a".repeat(64), can_mark_met: false, required_minimum_score: 680, owners: [{ ...credit.owners[0], backfill_needs_review: true }] };
    const html = render("pull-a", proposed);
    for (const label of ["Reports received", "Program review pending", "Review owner details", "Choose another existing report", "Review program credit conditions", "Review selected program", "Quidity 10-year term", "minimum 680"]) expect(html).toContain(label);
    expect(html).not.toContain("Requirement met");
    expect(render()).toMatch(/<button[^>]*disabled=""[^>]*>Review program credit conditions<\/button>/);
  });
  it("keeps report viewing available to readers while hiding mutation actions", () => {
    actor.role = "borrower";
    try {
      const html = render("pull-a", { ...credit, review_fingerprint: "a".repeat(64), owners: [{ ...credit.owners[0], backfill_needs_review: true }] });
      expect(html).toContain("View linked credit report");
      for (const label of ["Review owner details", "Review program credit conditions", "Choose another existing report"]) expect(html).not.toContain(label);
    } finally { actor.role = "super_admin"; }
  });
  it("does not invent a bureau or compute a score difference across models", () => {
    const html = render("pull-a", { ...credit, staff_review_reasons: [], owners: [{ ...credit.owners[0], score_models: [{ model: "FICO 4", score: 661 }] }] });
    expect(html).toContain("FICO 4: 661"); expect(html).not.toContain("TransUnion"); expect(html).not.toContain("19 points");
  });
  it("does not repeat open-review warnings after a current met decision", () => {
    const html = render("pull-a", { ...credit, review_blockers: [], can_mark_met: true, last_review: { decision: "met", reason: "Reviewed exact published score evidence", reviewed_at: "2026-11-09T12:00:00Z", current: true } });
    expect(html).toContain("Requirement met"); expect(html).not.toContain("Program and owner review details"); expect(html).not.toContain(credit.staff_review_reasons[0]);
  });
});
