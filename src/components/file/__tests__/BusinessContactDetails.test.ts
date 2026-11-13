import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BusinessContactDetails, BusinessContactFields, businessContactChanges, businessContactDraft, type BusinessContactValues } from "@/components/file/BusinessContactDetails";

const values: BusinessContactValues = {
  business_phone: "2025550123", employee_count: 12,
  business_street: "123 Main Street, Suite 4", business_city: "Miami", business_state: "FL", business_zip: "33101-1234",
  industry: "professional_practice", business_website: "https://example.com", business_description: "We provide physical therapy services to children.",
};
const draft = (source: BusinessContactValues = values) => ({ ...businessContactDraft(source), business_website: source.business_website || (source.business_website_none ? "N/A" : ""), business_description: source.business_description || "" });

describe("business details in the Contact card", () => {
  it("shows a compact full business address, declared industry and a safe website link", () => {
    const html = renderToStaticMarkup(createElement(BusinessContactDetails, { values }));
    expect(html).toContain("123 Main Street, Suite 4, Miami, FL 33101-1234");
    expect(html).toContain("Declared industry");
    expect(html).toContain("Professional and medical practices");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("<details>");
    expect(html).not.toContain("<details open");
    expect(html).toContain("We provide physical therapy services to children.");
    expect(html).toContain("2025550123");
    expect(html).toMatch(/Number of employees<\/span><b[^>]*>12<\/b>/);
    expect(html).not.toContain("confirmed NAICS");
  });

  it("keeps missing legacy answers distinct from an explicit no-website answer", () => {
    const empty = renderToStaticMarkup(createElement(BusinessContactDetails, { values: {} }));
    expect(empty.match(/Not provided/g)).toHaveLength(5);
    expect(empty).toMatch(/Business phone<\/span><b[^>]*>Not provided<\/b>/);
    expect(empty).toMatch(/Number of employees<\/span><b[^>]*>Not provided<\/b>/);
    const none = renderToStaticMarkup(createElement(BusinessContactDetails, { values: { business_website_none: true } }));
    expect(none).toContain("None (N/A)");
    expect(none).not.toContain("href=");
  });

  it("keeps an explicit zero employee count distinct from an unanswered count", () => {
    const html = renderToStaticMarkup(createElement(BusinessContactDetails, { values: { employee_count: 0 } }));
    expect(html).toMatch(/Number of employees<\/span><b[^>]*>0<\/b>/);
    expect(html).not.toMatch(/Number of employees<\/span><b[^>]*>Not provided<\/b>/);
    expect(html).toMatch(/Business phone<\/span><b[^>]*>Not provided<\/b>/);
  });

  it("does not turn an unsafe historical website into an executable link", () => {
    const html = renderToStaticMarkup(createElement(BusinessContactDetails, { values: { business_website: "javascript:alert(1)", industry: "<script>legacy</script>" } }));
    expect(html).not.toContain("href=");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;legacy&lt;/script&gt;");
  });

  it("uses the existing editable form fields and preserves an unfamiliar legacy industry until changed", () => {
    const html = renderToStaticMarkup(createElement(BusinessContactFields, { value: { ...businessContactDraft(values), industry: "legacy_sector" }, onChange: () => {} }));
    for (const label of ["Business street address", "Business city", "Business state", "Business ZIP code", "Declared industry"]) expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain('value="legacy_sector" selected');
    expect(html).toContain("legacy_sector (existing value)");
    expect(html).toContain("Review its NAICS separately in Classification");
  });
});

describe("contact business-field changes", () => {
  it("does not assert missing or invalid historical business answers during an unrelated contact edit", () => {
    const original = { business_website: "old unverified address", business_description: "old", business_state: "fl", industry: "legacy_sector" };
    expect(businessContactChanges(draft(original), original)).toEqual({ changes: {}, problem: null });
    const empty = draft({});
    expect(businessContactChanges({ ...empty, business_city: "Miami" }, {})).toEqual({ changes: { business_city: "Miami" }, problem: null });
  });

  it("patches only changed values and leaves the reviewed classification untouched", () => {
    const original = { ...values, naics_code: "621340", classification_revision: 3 };
    const result = businessContactChanges({ ...draft(original), business_state: " ca ", industry: "manufacturing" }, original);
    expect(result).toEqual({ changes: { business_state: "CA", industry: "manufacturing" }, problem: null });
    expect(result.changes).not.toHaveProperty("naics_code");
    expect(original.naics_code).toBe("621340");
    expect(original.classification_revision).toBe(3);
  });

  it("rejects a newly invalid ZIP or industry without substituting another industry", () => {
    expect(businessContactChanges({ ...draft(), business_zip: "abc" }, values).problem).toBeTruthy();
    const industry = businessContactChanges({ ...draft(), industry: "unrecognized_new_sector" }, values);
    expect(industry.problem).toBeTruthy();
    expect(industry.changes).toEqual({});
  });

  it("supports deliberate clearing and explicit N/A without requiring other legacy fields", () => {
    expect(businessContactChanges({ ...draft(), business_street: "", industry: "" }, values)).toEqual({ changes: { business_street: "", industry: "" }, problem: null });
    const original = { business_description: "old" };
    expect(businessContactChanges({ ...draft(original), business_website: "N/A" }, original)).toEqual({ changes: { business_website: "N/A" }, problem: null });
    const none = { business_website_none: true };
    expect(businessContactChanges(draft(none), none)).toEqual({ changes: {}, problem: null });
  });
});
