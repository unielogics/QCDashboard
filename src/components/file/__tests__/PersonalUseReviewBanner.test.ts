import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PersonalUseReviewBanner, personalUseReviewIsOpen } from "@/components/file/PersonalUseReviewBanner";

const decide = async () => {};

describe("the personal-use review on a real-estate file", () => {
  it("shows nothing once the review is cleared or when there is none", () => {
    expect(renderToStaticMarkup(createElement(PersonalUseReviewBanner, { review: null, onDecide: decide }))).toBe("");
    expect(renderToStaticMarkup(createElement(PersonalUseReviewBanner, { review: { status: "cleared" }, onDecide: decide }))).toBe("");
    expect(personalUseReviewIsOpen({ status: "cleared" })).toBe(false);
  });

  it("a held file can only be cleared, and says nothing was sent", () => {
    const html = renderToStaticMarkup(createElement(PersonalUseReviewBanner, {
      review: { status: "held", note: "The borrower chose personal use on their own home." },
      onDecide: decide,
    }));
    expect(html).toContain("Held: personal-use request");
    expect(html).toContain("The borrower chose personal use on their own home.");
    expect(html).toContain("Nothing has been sent to the client.");
    expect(html).toContain("Clear: it is for business use");
    expect(html).not.toContain("keep on hold");
  });

  it("an AI reading asks a person to confirm or clear it", () => {
    const html = renderToStaticMarkup(createElement(PersonalUseReviewBanner, { review: { status: "needs_review" }, onDecide: decide }));
    expect(html).toContain("Check: possible personal-use request");
    expect(html).toContain("Confirm personal use (keep on hold)");
    expect(html).toContain("Clear: it is for business use");
  });

  it("reads without buttons for someone who cannot decide", () => {
    const html = renderToStaticMarkup(createElement(PersonalUseReviewBanner, { review: { status: "needs_review" } }));
    expect(html).toContain("possible personal-use request");
    expect(html).not.toContain("<button");
  });
});
