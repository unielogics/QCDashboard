import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlaidRequestBarView, connectionHeadline, statementsNote } from "../PlaidRequestBar";

const noop = () => undefined;

describe("the Plaid request bar", () => {
  it("names Plaid, puts the request first and offers the link", () => {
    const html = renderToStaticMarkup(createElement(PlaidRequestBarView, {
      headline: "No bank connected yet", note: null, sending: false, roomUrl: null, result: null, error: null,
      onSend: noop, onCreateLink: noop, onCopy: noop,
    }));
    expect(html).toContain("Plaid bank connection");
    expect(html).toContain("First option");
    expect(html).toContain("Request Plaid connection");
    expect(html).toContain("Create banking link");
    expect(html).toContain("six-month statement upload as the fallback");
  });

  it("switches the link button to copy once a link exists", () => {
    const html = renderToStaticMarkup(createElement(PlaidRequestBarView, {
      headline: "x", note: null, sending: false, roomUrl: "https://app/room?tab=banking", result: "sent", error: null,
      onSend: noop, onCreateLink: noop, onCopy: noop,
    }));
    expect(html).toContain("Copy banking link");
    expect(html).toContain("sent");
  });

  it("says plainly when statement PDFs wait on the Plaid account", () => {
    expect(statementsNote({ statements_enabled: true, statements_preferred: true, available_products: ["assets", "statements"] })).toContain("Statement PDFs are on");
    expect(statementsNote({ statements_enabled: false, statements_preferred: true, available_products: ["assets"] })).toContain("not enabled for the Statements product yet");
    expect(statementsNote({ statements_enabled: false, statements_preferred: false, available_products: ["assets"] })).toBeNull();
    expect(statementsNote(null)).toBeNull();
  });

  it("describes what the file already has", () => {
    expect(connectionHeadline({ bank_connection_count: 2, business_banking_complete: true, bank_statement_months: 8 })).toBe("2 bank connections on this file");
    expect(connectionHeadline({ bank_connection_count: 0, business_banking_complete: true, bank_statement_months: 6 })).toBe("Banking complete from 6 accepted statement months");
    expect(connectionHeadline({ bank_connection_count: 0, business_banking_complete: true, bank_statement_months: 0 })).toBe("Banking complete");
    expect(connectionHeadline({ bank_connection_count: 0, business_banking_complete: false, bank_statement_months: 2 })).toBe("No bank connected yet");
    expect(connectionHeadline(null)).toBe("No bank connected yet");
  });
});
