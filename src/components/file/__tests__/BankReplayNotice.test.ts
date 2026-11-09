import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BankReplayNotice } from "../cockpit/BankReplayNotice";
import { ObligationPlanRow } from "../cockpit/ObligationRowEditor";
import { confidenceLabel, type Obligation } from "@/lib/financialCockpit";
import { PAYOFF_REPLAY_REVIEW_REQUIRED } from "@/lib/cockpitSimulation";

describe("bank projections require loan-level evidence", () => {
  it("keeps the reason and direct evidence action visible without inventing a balance", () => {
    const html = renderToStaticMarkup(createElement(BankReplayNotice, { reason: PAYOFF_REPLAY_REVIEW_REQUIRED, onReviewEvidence: () => {} }));
    expect(html).toContain("Bank projection needs review.");
    expect(html).toContain("cannot be allocated uniquely");
    expect(html).toContain("Review bank evidence");
    expect(renderToStaticMarkup(createElement(BankReplayNotice, { reason: null }))).toBe("");
  });
  it("warns on a schedule row without displaying the shared aggregate as its payment", () => {
    const row = { id: "loan", lender: "Example lender", monthly: 5000, balance: 10000, payoff: 10000, kind: "row", in_debt_service: true, category: "term_loan", replay_requires_review: true, replay_review_reason: PAYOFF_REPLAY_REVIEW_REQUIRED, observed_monthly: 9000 } as Obligation;
    const html = renderToStaticMarkup(createElement(ObligationPlanRow, { o: row, on: false, canEdit: true, onToggleRetire: () => {}, onReviewEvidence: () => {} }));
    expect(html).toContain("Bank payments need review");
    expect(html).toContain("Review bank evidence");
    expect(html).toContain("$5,000");
    expect(html).not.toContain("$9,000");
  });
  it("does not claim IRS filing merely because the source is a tax return", () => {
    expect(confidenceLabel("filed")).toBe("Tax return");
    expect(confidenceLabel("filed")).not.toContain("Filed");
  });
});
