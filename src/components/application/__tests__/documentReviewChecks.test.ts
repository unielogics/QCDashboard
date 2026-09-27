import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentReviewChecks } from "../DocumentReviewChecks";
import { evidenceReasonLabel } from "@/lib/evidenceDecision";

describe("document review criteria", () => {
  const checks = [{ key: "net_income_nonnegative", label: "No negative earnings", instructions: "Compare both filed tax years; <script> is source text.", severity: "block" as const }];

  it("renders nothing for legacy requirements without checks", () => {
    expect(renderToStaticMarkup(createElement(DocumentReviewChecks, { checks: undefined }))).toBe("");
    expect(renderToStaticMarkup(createElement(DocumentReviewChecks, { checks: [] }))).toBe("");
  });

  it("shows exact policy instructions without claiming automatic qualification", () => {
    const html = renderToStaticMarkup(createElement(DocumentReviewChecks, { checks }));
    expect(html).toContain("Staff review required");
    expect(html).toContain("No negative earnings");
    expect(html).toContain("Resolve before acceptance");
    expect(html).toContain("Compare both filed tax years; &lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("Staff verified");
  });

  it("marks verified only from explicit policy verification state", () => {
    expect(renderToStaticMarkup(createElement(DocumentReviewChecks, { checks, verified: true }))).toContain("Staff verified");
    expect(evidenceReasonLabel("document_review_pending")).toBe("Document criteria need staff review");
  });
});
