import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EvidenceOverview } from "@/components/application/EvidenceOverview";

(globalThis as unknown as { React: typeof React }).React = React;

const earthly = { you: 2, client: 0, ai: 0, done: 2, total: 4 };
const bank = { accepted: 6, required: 6, complete: true, institutions: 0, counted: 1 };

function render(props: Partial<Parameters<typeof EvidenceOverview>[0]> = {}) {
  return renderToStaticMarkup(createElement(EvidenceOverview, { counts: earthly, bank, onJump: () => undefined, ...props }));
}

describe("the overview at the top of Evidence & banking", () => {
  it("names the four groups and the bank in plain words, with the Earthly numbers", () => {
    const html = render();
    for (const text of ["Needs you", "Waiting on the client", "AI is working", "Complete", "Bank statements"]) expect(html).toContain(text);
    expect(html).toContain("2 of 4");
    expect(html).toContain("6 of 6");
    expect(html).toContain("Review or sign off");
    expect(html).toContain("Plaid optional");
    expect(html).toContain("2 items need you. 2 of 4 complete.");
  });

  it("makes every tile a button that jumps somewhere", () => {
    const html = render();
    expect((html.match(/<button/g) ?? []).length).toBe(6); // five tiles and the legend toggle
    expect(html).toContain('data-group="you"');
    expect(html).toContain('data-group="bank"');
  });

  it("counts files the AI is reading even when none sits on a requirement yet", () => {
    expect(render({ aiFiles: 3 })).toContain("<b>3</b>");
  });

  it("says when the bank is short and how many are connected", () => {
    const html = render({ bank: { accepted: 4, required: 6, complete: false, institutions: 1, counted: 1 } });
    expect(html).toContain("4 of 6");
    expect(html).toContain("months accepted so far");
    expect(html).toContain("1 connected");
    expect(html).toContain('data-tone="warn"');
  });

  it("mentions requests that have no row on the list", () => {
    expect(render({ otherOpen: 2 })).toContain("Also collecting 2 other items");
  });

  it("offers the legend that explains the statuses, and never the retired wording", () => {
    const html = render();
    expect(html).toContain("What do these statuses mean?");
    expect(html).not.toMatch(/AI checking|Received/);
  });
});
