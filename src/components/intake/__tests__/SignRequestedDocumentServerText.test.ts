import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SignRequestedDocument } from "@/components/intake/SignRequestedDocument";

const SERVER_TEXT = "Qualified Commercial LLC Credit Report Authorization and Electronic Signature Consent\n\nBy signing this authorization, I authorize QC - Qualified Commercial LLC and its underwriting partners to obtain a soft credit inquiry.";

function render(language: "en" | "es", text: string | null) {
  return renderToStaticMarkup(createElement(SignRequestedDocument, {
    doc: { id: "doc-1", name: "Credit authorization", signature_kind: "credit_authorization", signature_document_text: text, signature_document_sha256: text ? "a".repeat(64) : null },
    busy: false,
    error: null,
    onSign: () => {},
    language,
  }));
}

describe("the sign step shows what the server certifies", () => {
  it("shows the server's own authorization text, not the page's short copy", () => {
    const html = render("en", SERVER_TEXT);
    expect(html).toContain("and its underwriting partners");
    expect(html).not.toContain("for the purpose of evaluating financing. A soft pull does not affect my credit score. I certify the identifying");
  });

  it("in Spanish, keeps the English that is signed and adds a courtesy translation", () => {
    const html = render("es", SERVER_TEXT);
    expect(html).toContain("and its underwriting partners");
    expect(html).toContain("Traducción de cortesía");
  });

  it("falls back to the short copy only when an older server sends no text", () => {
    const html = render("en", null);
    expect(html).toContain("A soft pull does not affect my credit score");
    expect(html).not.toContain("Traducción de cortesía");
  });
});
