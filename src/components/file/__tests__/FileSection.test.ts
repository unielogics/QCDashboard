import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FileSection } from "../FileSection";

const noop = () => undefined;

describe("a file section", () => {
  it("shows its title, summary and status while closed, and keeps the body out of the page", () => {
    const html = renderToStaticMarkup(createElement(FileSection, {
      id: "economics", title: "Deal economics", summary: "Record what the client accepted",
      status: { label: "Not recorded", tone: "warn" }, open: false, onToggle: noop,
    }, createElement("p", null, "the body")));
    expect(html).toContain("Deal economics");
    expect(html).toContain("Record what the client accepted");
    expect(html).toContain("Not recorded");
    expect(html).not.toContain("the body");
    expect(html).toMatch(/aria-expanded="false"/);
  });

  it("renders the body when open and keeps section controls visible either way", () => {
    const html = renderToStaticMarkup(createElement(FileSection, {
      id: "terms", title: "Loan terms", open: true, onToggle: noop,
      actions: createElement("button", { type: "button" }, "Record terms"),
    }, createElement("p", null, "the body")));
    expect(html).toContain("the body");
    expect(html).toContain("Record terms");
    expect(html).toMatch(/aria-expanded="true"/);
    expect(html).toMatch(/aria-controls="file-section-terms"/);
  });
});
