import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReApplicationForm, ReApplicationReview } from "@/components/application/ReApplicationForm";
import type { ApplicationView } from "@/lib/reApplication";

const view: ApplicationView = {
  kind: "re_application",
  schema: {
    kind: "re_application", schema_version: "qc_rea.v1", title: "Qualified Commercial Real Estate Loan Application",
    roles: [{ key: "borrower", label: "Borrower" }, { key: "coborrower", label: "Co-borrower" }],
    sections: [
      { key: "request", label: "Loan request", fields: [
        { key: "loan_purpose", label: "What is the loan for?", type: "select", required: true, options: [{ value: "heloc", label: "Home equity line (HELOC) for business" }] },
        { key: "amount_requested", label: "Amount requested", type: "money", required: true },
      ] },
      { key: "property", label: "Subject property", fields: [
        { key: "first_lien_balance", label: "First mortgage balance", type: "money", required: true },
        { key: "property_type", label: "Property type", type: "select", required: true, options: [{ value: "single_family", label: "Single family" }] },
      ] },
    ],
  },
  body: { request: { loan_purpose: "heloc", amount_requested: 300000 }, property: { first_lien_balance: 184321.5 }, borrowers: { borrower: {}, coborrower: {} } },
  provenance: {
    "request.loan_purpose": { tier: "A", source: "Your application" },
    "request.amount_requested": { tier: "A", source: "Your application" },
    "property.first_lien_balance": { tier: "C", source: "From our conversation" },
  },
  completion: { sections: [], filled: 2, total: 4, missing: ["property.first_lien_balance", "property.property_type"], complete: false },
  please_check: ["property.first_lien_balance"],
  revision: 3,
  status: "draft",
  version: null,
  warnings: [{ path: "property.property_type", label: "Property type", source: "From our conversation", message: "The property type on file ('Primaary') is not a property type, so it was left blank for the client to answer." }],
};

const render = (audience: "client" | "desk") => renderToStaticMarkup(createElement(ReApplicationForm, {
  view, body: view.body, problems: {}, busy: false, audience, onValue: () => {}, onConfirm: () => {}, onCoborrower: () => {},
}));

describe("the application form", () => {
  it("opens on what is still needed, with the AI's suggestion marked to check", () => {
    const html = render("client");
    expect(html).toContain("2 of 4 answered");
    expect(html).toContain("Please check · From our conversation");
    expect(html).toContain("Looks right");
    expect(html).toContain("Property type");
    expect(html).toContain("Already on your application (2)");
    expect(html).not.toContain("Primaary");
  });

  it("shows the desk what was dropped, and never the client", () => {
    expect(render("desk")).toContain("Values on the file that were left blank");
    expect(render("client")).not.toContain("Values on the file that were left blank");
  });

  it("reviews the whole application with formatted values", () => {
    const html = renderToStaticMarkup(createElement(ReApplicationReview, { view, body: view.body, onEdit: () => {} }));
    expect(html).toContain("$184,321.50");
    expect(html).toContain("Home equity line (HELOC) for business");
    expect(html).toContain("Not provided");
  });
});
