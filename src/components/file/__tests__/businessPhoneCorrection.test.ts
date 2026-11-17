import { describe, expect, it } from "vitest";

import { businessContactChanges, businessContactDraft, type BusinessContactValues } from "@/components/file/BusinessContactDetails";

const draftOf = (source: BusinessContactValues) => ({ ...businessContactDraft(source), business_website: source.business_website || "", business_description: source.business_description || "" });

describe("correcting the business phone from the Contact card", () => {
  const original: BusinessContactValues = { business_phone: "Jordan Sample" };

  it("leaves an untouched value alone, even one that is not a number", () => {
    expect(businessContactChanges(draftOf(original), original)).toEqual({ changes: {}, problem: null });
  });

  it("sends a real number in its place", () => {
    const result = businessContactChanges({ ...draftOf(original), business_phone: "(704) 555-0123" }, original);
    expect(result).toEqual({ changes: { business_phone: "(704) 555-0123" }, problem: null });
  });

  it("can clear a value that was never a number", () => {
    expect(businessContactChanges({ ...draftOf(original), business_phone: "" }, original)).toEqual({ changes: { business_phone: "" }, problem: null });
  });

  it("refuses another name or a short number", () => {
    expect(businessContactChanges({ ...draftOf(original), business_phone: "Ask Jordan" }, original).problem).toMatch(/complete business phone number/);
    expect(businessContactChanges({ ...draftOf(original), business_phone: "555-0123" }, original).problem).toMatch(/complete business phone number/);
  });
});
