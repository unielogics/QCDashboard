import { describe, expect, it } from "vitest";
import { dedupeMarketplaceIssues, marketplaceApiIssues, marketplaceFieldId, marketplaceIssueHref, marketplaceOwnerHref, marketplacePublishIssues, parseMarketplaceFinancialAction, unknownIssue, type MarketplacePublishIssue } from "../marketplaceIssues";

const context = { linked: true };
const apiError = (detail: unknown) => ({ body: { detail } });
const issue = (message: string, section: MarketplacePublishIssue["section"], extra = {}): MarketplacePublishIssue => ({ code: "synthetic", message, section, ...extra });

describe("actionable marketplace guidance", () => {
  it("deduplicates legacy and structured PPM reasons into one document action", () => {
    const legacy = marketplacePublishIssues(["private placement memorandum not uploaded"], undefined, context);
    const structured = marketplacePublishIssues([], [issue("private placement memorandum not uploaded", "documents", { document_kind: "ppm" })], context);
    const result = dedupeMarketplaceIssues([...legacy, ...structured]);
    expect(result).toHaveLength(1);
    expect(result[0].target).toEqual({ kind: "ppm" });
    expect(result[0].instruction).toContain("explicitly review the current version");
  });
  it("humanizes technical required-field messages in both response formats", () => {
    for (const result of [marketplacePublishIssues(["name"], undefined, { linked: false }), marketplacePublishIssues([], [issue("name", "terms", { field: "name" })], { linked: false })]) {
      expect(result[0].message).toBe("Deal title is required.");
      expect(result[0].target).toEqual({ kind: "field", field: "name" });
    }
  });
  it("keeps every distinct budget reason grouped under the same owner action", () => {
    const result = marketplacePublishIssues([], [issue("Budget needs review", "budget"), issue("Principal needs review", "budget"), issue("Budget needs review", "budget"), issue("Budget", "budget")], context);
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("Budget needs review Principal needs review Budget");
  });
  it("humanizes canonical capital messages even when the destination is the budget", () => {
    const result = marketplacePublishIssues([], [issue("offered_amount", "budget"), issue("minimum_investment exceeds offered_amount", "budget")], context);
    expect(result[0].message).toBe("Capital to raise from investors, $ is required. The smallest investor contribution exceeds the capital to raise.");
  });
  it("routes locked canonical fields to their real owner rather than a disabled input", () => {
    expect(marketplaceApiIssues(apiError([{ loc: ["body", "note_rate_pct"], msg: "Enter the rate" }]), { ...context, action: "terms" })[0].target).toEqual({ kind: "file", action: "coverage" });
    expect(marketplaceApiIssues(apiError([{ loc: ["body", "offered_amount"], msg: "Review capital" }]), { ...context, action: "terms" })[0].target).toEqual({ kind: "budget" });
  });
  it("targets only an allowlisted direct terms field and preserves the server explanation", () => {
    const result = marketplaceApiIssues(apiError([{ loc: ["body", "valuation_source"], msg: "String should have at most 120 characters" }]), { ...context, action: "terms" });
    expect(result[0].target).toEqual({ kind: "field", field: "valuation_source" });
    expect(result[0].message).toContain("120");
    expect(marketplaceFieldId("valuation_source")).toBe("marketplace-field-valuation_source");
  });
  it.each([["body"], ["body", "unknown_input"], ["query", "name"], ["body", "nested", "name"]])("does not guess a field from unsupported validation location %j", (...loc) => {
    const result = marketplaceApiIssues(apiError([{ loc, msg: "Check this value" }]), { linked: false, action: "terms" });
    expect(result[0].target).toBeUndefined();
  });
  it("routes nested products to the linked coverage owner, not the first local term", () => {
    const error = apiError([{ loc: ["body", "products", 1, "term_months"], msg: "Review this product" }]);
    expect(marketplaceApiIssues(error, { ...context, action: "terms" })[0].target).toEqual({ kind: "file", action: "coverage" });
    expect(marketplaceApiIssues(error, { linked: false, action: "terms" })[0].target).toBeUndefined();
  });
  it("keeps non-PPM upload errors on the selected document control", () => {
    const result = marketplaceApiIssues(apiError([{ loc: ["body", "content_type"], msg: "PDF required" }]), { ...context, action: "documents" });
    expect(result[0].target).toEqual({ kind: "upload" });
    expect(marketplaceApiIssues(apiError([{ loc: ["body", "kind"], msg: "Choose a kind" }]), { ...context, action: "documents" })[0].target).toEqual({ kind: "document-type" });
  });
  it("does not map unknown upload paths or auth metadata to PPM", () => {
    for (const loc of [["headers", "authorization"], ["body", "mystery"], ["body", "products", 0, "name"]]) expect(marketplaceApiIssues(apiError([{ loc, msg: "Request rejected" }]), { ...context, action: "documents" })[0].target).toBeUndefined();
  });
  it("guides a file not yet in storage back to its selected upload", () => {
    expect(marketplaceApiIssues(apiError({ code: "not_uploaded", message: "The file has not arrived in storage yet." }), { ...context, action: "documents" })[0].target).toEqual({ kind: "upload" });
  });
  it("shows storage outages and closed-listing locks without invalid input targets", () => {
    const storage = marketplaceApiIssues(apiError("Document storage is not configured."), { ...context, action: "documents" })[0];
    expect(storage.target).toBeUndefined(); expect(storage.instruction).toContain("administrator");
    const closed = marketplaceApiIssues(apiError({ code: "closed", message: "A repaid or withdrawn listing is read-only." }), { ...context, action: "terms" })[0];
    expect(closed.target).toBeUndefined(); expect(closed.instruction).toContain("locked");
  });
  it("offers explicit snapshot review for the exact pre-publish stale-file error", () => {
    const result = marketplaceApiIssues(apiError("The file changed since this listing was prepared. Refresh its financial snapshot and review the current financing and collateral before publishing."), { ...context, action: "publish" });
    expect(result[0].target).toEqual({ kind: "snapshot" });
  });
  it("does not suggest refreshing away committed-capital financing locks", () => {
    const result = marketplaceApiIssues(apiError("This listing has committed or funded capital. Financing and recorded collateral cannot be changed through a file refresh; review the existing commitments before issuing a revised offering."), { ...context, action: "snapshot" });
    expect(result[0].target).toBeUndefined(); expect(result[0].instruction).toContain("commitments");
  });
  it("uses structured publish errors and supports exact legacy messages containing semicolons", () => {
    const target = marketplaceApiIssues(apiError({ code: "incomplete", message: "Fill in: private placement memorandum not uploaded", publish_issues: [issue("private placement memorandum not uploaded", "documents", { document_kind: "ppm" })] }), { ...context, action: "publish" });
    expect(target[0].key).toBe("document:ppm");
    const legacy = marketplaceApiIssues(apiError({ code: "incomplete", message: "Fill in: Restore or synchronize the working financing proposal before publishing; issued terms are a historical reference; private placement memorandum not uploaded" }), { ...context, action: "publish" });
    expect(legacy).toHaveLength(2); expect(legacy.map(item => item.target?.kind).sort()).toEqual(["file", "ppm"]);
  });
  it("keeps arbitrary failures and empty validation arrays honest", () => {
    expect(marketplaceApiIssues(new Error("Network unavailable"), context)[0]).toMatchObject({ message: "Network unavailable" });
    expect(marketplaceApiIssues(apiError([]), context)[0].target).toBeUndefined();
    expect(unknownIssue("Unknown server failure").target).toBeUndefined();
  });
  it("builds safe explicit links and accepts only known financial navigation actions", () => {
    const ppm = marketplacePublishIssues(["private placement memorandum not uploaded"], undefined, context)[0];
    expect(marketplaceIssueHref("listing/id", ppm)).toBe("/admin/marketplace/listing%2Fid?fix=document%3Appm");
    expect(marketplaceOwnerHref("intake-id", "coverage")).toBe("/files/intake-id?section=overview&financial_action=coverage");
    expect(parseMarketplaceFinancialAction("terms")).toBe("terms");
    expect(parseMarketplaceFinancialAction("use-of-funds")).toBe("use-of-funds");
    expect(parseMarketplaceFinancialAction("javascript:alert(1)")).toBeNull();
  });
});
