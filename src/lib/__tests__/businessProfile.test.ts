import { describe, expect, it } from "vitest";

import { businessProfileBody, businessProfileProblem, emptyBusinessProfile, newBusinessProfileBody, newBusinessProfileProblem, readWebsite, type NewBusinessProfile } from "@/lib/businessProfile";

describe("readWebsite", () => {
  it("turns an address into a link, the way the server does", () => {
    expect(readWebsite("example.com")).toEqual({ kind: "site", website: "https://example.com" });
    expect(readWebsite("  Example.COM  ")).toEqual({ kind: "site", website: "https://example.com" });
    expect(readWebsite("https://Example.com/")).toEqual({ kind: "site", website: "https://example.com" });
    expect(readWebsite("http://shop.example.co.uk/menu/")).toEqual({ kind: "site", website: "http://shop.example.co.uk/menu/" });
    expect(readWebsite("www.joe.com/About")).toEqual({ kind: "site", website: "https://www.joe.com/About" });
    expect(readWebsite("facebook.com/mybiz")).toEqual({ kind: "site", website: "https://facebook.com/mybiz" });
  });

  it("reads N/A and its relatives as no website", () => {
    for (const typed of ["N/A", "n/a", "n/a.", "NA", "None", "no website", "No", "Not applicable", "-", "no aplica", "Ninguno"]) {
      expect(readWebsite(typed)).toEqual({ kind: "none" });
    }
  });

  it("refuses anything that is not a web address, and leaves blank blank", () => {
    for (const typed of ["javascript:alert(1)", "not a site", "localhost", "a.b", "example", "ftp://example.com", "data:text/html,x"]) {
      expect(readWebsite(typed)).toEqual({ kind: "invalid" });
    }
    expect(readWebsite("   ")).toEqual({ kind: "blank" });
  });
});

describe("businessProfileProblem", () => {
  it("asks for both answers, in the client's language", () => {
    expect(businessProfileProblem({ website: "", description: "We repair HVAC systems." })).toBe("Enter the business website, or N/A if it does not have one.");
    expect(businessProfileProblem({ website: "example.com", description: "" })).toBe("Tell us briefly what the business does.");
    expect(businessProfileProblem({ website: "example.com", description: "hvac" })).toBe("Describe the business in a sentence or two (at least 10 characters).");
    expect(businessProfileProblem({ website: "not a site", description: "We repair HVAC systems." })).toContain("Enter your website address");
    expect(businessProfileProblem({ website: "", description: "x" }, "es")).toBe("Escriba el sitio web del negocio, o N/A si no tiene uno.");
  });

  it("accepts N/A as the website and a real sentence as the description", () => {
    expect(businessProfileProblem({ website: "N/A", description: "We repair commercial HVAC systems." })).toBeNull();
    expect(businessProfileProblem({ website: "joes-hvac.com", description: "We repair commercial HVAC systems." }, "es")).toBeNull();
  });
});

describe("businessProfileBody", () => {
  it("sends the trimmed words; the server decides what N/A means", () => {
    expect(businessProfileBody({ website: "  N/A ", description: "  We  repair HVAC   systems. " })).toEqual({
      business_website: "N/A",
      business_description: "We repair HVAC systems.",
    });
  });
});

const complete: NewBusinessProfile = {
  business_street: "123 Main Street, Suite 2", business_city: "Miami", business_state: "FL", business_zip: "33101",
  industry: "professional_practice", business_website: "N/A", business_description: "We provide pediatric physical therapy services.",
};

describe("new application business profile", () => {
  it("requires each address part, an explicit industry, website answer and description", () => {
    for (const field of Object.keys(complete) as (keyof NewBusinessProfile)[]) {
      expect(newBusinessProfileProblem({ ...complete, [field]: "" }), field).toBeTruthy();
    }
    expect(newBusinessProfileProblem(emptyBusinessProfile())).toContain("street address");
    expect(newBusinessProfileProblem(complete)).toBeNull();
    expect(newBusinessProfileProblem({ ...complete, industry: "other" })).toBeNull();
  });

  it("does not silently treat an unknown industry or malformed location as valid", () => {
    for (const industry of ["healthcare", "professional_practice ", "OTHER"]) {
      if (industry.endsWith(" ")) continue; // Answers are trimmed on purpose.
      expect(newBusinessProfileProblem({ ...complete, industry })).toContain("industry");
    }
    for (const business_state of ["Florida", "ZZ", "F"]) expect(newBusinessProfileProblem({ ...complete, business_state })).toContain("state");
    for (const business_zip of ["1234", "123456", "12345 6789", "abcde"]) expect(newBusinessProfileProblem({ ...complete, business_zip })).toContain("ZIP");
    expect(newBusinessProfileProblem({ ...complete, business_city: "x".repeat(120) })).toBeNull();
    expect(newBusinessProfileProblem({ ...complete, business_city: "x".repeat(121) })).toContain("120");
    expect(newBusinessProfileProblem({ ...complete, business_state: "fl", business_zip: "33101-1234" })).toBeNull();
    for (const business_state of ["DC", "AS", "GU", "MP", "PR", "VI", "AA", "AE", "AP"]) expect(newBusinessProfileProblem({ ...complete, business_state })).toBeNull();
  });

  it("bounds new descriptions while retaining historical two-field validation", () => {
    expect(newBusinessProfileProblem({ ...complete, business_description: "short" })).toContain("at least 10");
    expect(newBusinessProfileProblem({ ...complete, business_description: "x".repeat(1000) })).toBeNull();
    expect(newBusinessProfileProblem({ ...complete, business_description: "x".repeat(1001) })).toContain("1000");
    expect(newBusinessProfileProblem({ ...complete, business_street: "" }, "es")).toContain("dirección");
    expect(businessProfileProblem({ website: "N/A", description: complete.business_description })).toBeNull();
  });

  it("sends normalized explicit answers, retaining ZIP zeros and N/A without inventing NAICS", () => {
    expect(newBusinessProfileBody({ ...complete, business_street: " 123  Main Street ", business_city: " Miami ", business_state: " fl ", business_zip: " 00123-4567 " })).toEqual({
      ...complete, business_street: "123 Main Street", business_state: "FL", business_zip: "00123-4567",
    });
    expect(newBusinessProfileBody(complete)).not.toHaveProperty("naics_code");
  });
});
