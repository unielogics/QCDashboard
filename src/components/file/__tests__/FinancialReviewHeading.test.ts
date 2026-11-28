import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FinancialReviewHeading, financialReviewCompanyName } from "../cockpit/FinancialReviewHeading";

const render = (businessName?: string | null) => renderToStaticMarkup(createElement(FinancialReviewHeading, { businessName }));

describe("advanced financial review company heading", () => {
  it("shows the current company and updates without retaining another file's name", () => {
    expect(render("Sample Fabrication")).toContain("Sample Fabrication");
    const next = render("Sample Therapy Services Inc");
    expect(next).toContain("Sample Therapy Services Inc");
    expect(next).toContain("Advanced financial review");
    expect(next).not.toContain("Sample Fabrication");
  });

  it("clears a previous company when the current identity is unavailable", () => {
    render("Sample Fabrication");
    for (const name of [undefined, null, "", "  "]) {
      expect(financialReviewCompanyName(name)).toBe("Company name unavailable");
      expect(render(name)).not.toContain("Sample Fabrication");
      expect(render(name)).toContain("Company name unavailable");
    }
  });

  it("uses the file identity verbatim as escaped text, including long legal names", () => {
    expect(financialReviewCompanyName("  Sample Fabrication & Supply LLC  ")).toBe("Sample Fabrication & Supply LLC");
    expect(render("Sample Fabrication & Supply <Holdings> LLC")).toContain("Sample Fabrication &amp; Supply &lt;Holdings&gt; LLC");
  });
});
