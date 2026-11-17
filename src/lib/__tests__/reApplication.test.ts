import { describe, expect, it } from "vitest";

import { applicableFields, applies, displayValue, parseInput, setAt, type ApplicationSchema, type FieldSpec } from "@/lib/reApplication";

const schema: ApplicationSchema = {
  kind: "re_application", schema_version: "qc_rea.v1", title: "Qualified Commercial Real Estate Loan Application",
  roles: [{ key: "borrower", label: "Borrower" }, { key: "coborrower", label: "Co-borrower" }],
  sections: [
    { key: "request", label: "Loan request", fields: [
      { key: "loan_purpose", label: "What is the loan for?", type: "select", required: true, options: [{ value: "purchase", label: "Purchase" }, { value: "heloc", label: "Home equity line (HELOC) for business" }] },
      { key: "occupancy", label: "Who uses the property?", type: "select", required: true, options: [{ value: "investment", label: "Investment property" }, { value: "primary_residence", label: "Primary residence" }] },
      { key: "down_payment", label: "Down payment", type: "money", required: true, applies_when: { field: "request.loan_purpose", in: ["purchase"] } },
    ] },
    { key: "borrowers", label: "Borrowers", per_role: true, fields: [
      { key: "first_name", label: "Legal first name", type: "text", required: true },
      { key: "employer_name", label: "Current employer", type: "text", required: true, applies_when: { field: "request.occupancy", in: ["primary_residence", "second_home"] } },
      { key: "prev_street", label: "Previous street", type: "text", required: true, applies_when: { field: "$.years_at_address", lt: 2 } },
    ] },
  ],
};

describe("the application's rules mirror the backend", () => {
  it("hides a purchase question on a home-equity line and shows employment for a home", () => {
    const body = { request: { loan_purpose: "heloc", occupancy: "primary_residence" }, borrowers: { borrower: {} } };
    const paths = applicableFields(schema, body).map((ref) => ref.path);
    expect(paths).not.toContain("request.down_payment");
    expect(paths).toContain("borrowers.borrower.employer_name");
    expect(paths).not.toContain("borrowers.coborrower.first_name");
  });

  it("asks a co-borrower only when there is one, and the previous address under two years", () => {
    const body = { has_coborrower: true, request: { loan_purpose: "purchase", occupancy: "investment" }, borrowers: { borrower: { years_at_address: 1 }, coborrower: { years_at_address: 5 } } };
    const paths = applicableFields(schema, body).map((ref) => ref.path);
    expect(paths).toContain("request.down_payment");
    expect(paths).toContain("borrowers.coborrower.first_name");
    expect(paths).toContain("borrowers.borrower.prev_street");
    expect(paths).not.toContain("borrowers.coborrower.prev_street");
  });

  it("a rule over an unanswered question does not apply", () => {
    expect(applies({ field: "request.loan_purpose", in: ["purchase"] }, {})).toBe(false);
    expect(applies({ not: { field: "request.loan_purpose", in: ["purchase"] } }, {})).toBe(true);
  });
});

describe("values as people read and type them", () => {
  const money: FieldSpec = { key: "x", label: "x", type: "money", required: true };
  it("prints money, last four and choices the way the PDF does", () => {
    expect(displayValue(money, 184321.5)).toBe("$184,321.50");
    expect(displayValue(money, 300000)).toBe("$300,000");
    expect(displayValue({ key: "s", label: "s", type: "ssn_last4", required: true }, "1234")).toBe("XXX-XX-1234");
    expect(displayValue({ key: "y", label: "y", type: "yesno", required: true }, false)).toBe("No");
    expect(displayValue({ key: "p", label: "p", type: "phone", required: true }, "+17045550123")).toBe("(704) 555-0123");
  });

  it("reads typed money and scores, and leaves the rest for the server to check", () => {
    expect(parseInput(money, "$184,321.50")).toBe(184321.5);
    expect(parseInput({ key: "c", label: "c", type: "score", required: true }, "not sure")).toBe("unknown");
    expect(parseInput({ key: "c", label: "c", type: "score", required: true }, "XXX")).toBe("XXX");
    expect(parseInput(money, "   ")).toBeNull();
  });

  it("setAt never mutates and clears on blank", () => {
    const body = { request: { loan_purpose: "heloc" } };
    const next = setAt(body, "request.loan_purpose", "");
    expect(body.request.loan_purpose).toBe("heloc");
    expect(next.request).toEqual({});
  });
});
