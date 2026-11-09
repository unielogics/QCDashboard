import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FinancialReviewHeading, financialReviewCompanyName } from "../cockpit/FinancialReviewHeading";

const render = (businessName?: string | null) => renderToStaticMarkup(createElement(FinancialReviewHeading, { businessName }));

describe("advanced financial review company heading", () => {
  it("shows the current company and updates without retaining another file's name", () => {
    expect(render("Body Good")).toContain("Body Good");
    const next = render("Little Star Therapy Services Inc");
    expect(next).toContain("Little Star Therapy Services Inc");
    expect(next).toContain("Advanced financial review");
    expect(next).not.toContain("Body Good");
  });

  it("clears a previous company when the current identity is unavailable", () => {
    render("Body Good");
    for (const name of [undefined, null, "", "  "]) {
      expect(financialReviewCompanyName(name)).toBe("Company name unavailable");
      expect(render(name)).not.toContain("Body Good");
      expect(render(name)).toContain("Company name unavailable");
    }
  });

  it("uses the file identity verbatim as escaped text, including long legal names", () => {
    expect(financialReviewCompanyName("  Body Good & Wellness LLC  ")).toBe("Body Good & Wellness LLC");
    expect(render("Body Good & Wellness <Holdings> LLC")).toContain("Body Good &amp; Wellness &lt;Holdings&gt; LLC");
  });
});
