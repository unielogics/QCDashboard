import { describe, expect, it } from "vitest";

import { businessProfileBody, businessProfileProblem, readWebsite } from "@/lib/businessProfile";

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
