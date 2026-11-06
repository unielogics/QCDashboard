import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FundingAmounts, UnifiedFundingAmounts } from "../FundingAmounts";
import type { UnifiedFileRow } from "@/lib/unifiedOperator";

describe("loan table funding amounts", () => {
  it("shows the current request and recorded loan amount separately", () => {
    const html = renderToStaticMarkup(createElement(FundingAmounts, { requestedAmount: 200000, amount: 70000 }));
    expect(html).toContain("Current request $200K");
    expect(html).toContain('title="$200,000.00"');
    expect(html).toContain("Loan amount $70K");
    expect(html).not.toContain("Approved");
    expect(html).not.toContain("Funded");
  });
  it("keeps a legacy loan amount without inventing a separate request", () => {
    for (const requestedAmount of [null, undefined]) {
      const html = renderToStaticMarkup(createElement(FundingAmounts, { requestedAmount, amount: 70000 }));
      expect(html).toContain("Loan amount $70K");
      expect(html).not.toContain("Current request");
    }
  });
  it("shows the canonical request in the pipeline at each stage while retaining stage and loan amounts", () => {
    for (const source_kind of ["loan", "intake"] as const) for (const forecast_amount_basis of ["requested", "approved", "funded"]) {
      const row = { source_kind, requested_amount: 200000, amount: 70000, forecast_amount_basis } as UnifiedFileRow;
      const html = renderToStaticMarkup(createElement(UnifiedFundingAmounts, { row }));
      expect(html).toContain("Current request $200K");
      expect(html).toContain("$70K");
      if (source_kind === "loan") expect(html).toContain("Loan amount $70K");
      else if (forecast_amount_basis === "approved") expect(html).toContain("Approved $70K");
      else if (forecast_amount_basis === "funded") expect(html).toContain("Funded $70K");
    }
  });
  it("does not repeat identical request amounts on intake rows", () => {
    const row = { source_kind: "intake", requested_amount: 200000, amount: 200000, forecast_amount_basis: "requested" } as UnifiedFileRow;
    const html = renderToStaticMarkup(createElement(UnifiedFundingAmounts, { row }));
    expect(html.match(/\$200K/g)).toHaveLength(1);
    expect(html).not.toContain("File amount");
  });
});
