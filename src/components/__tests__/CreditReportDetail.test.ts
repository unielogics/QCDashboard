import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CreditReportDetail } from "../CreditReportDetail";
import type { ParsedReport, ParsedTradeAccount } from "@/lib/types";

const fixture = (trade_accounts: ParsedTradeAccount[]): ParsedReport => ({
  trade_accounts, scores: [{ model: "Example model", score: 680, reason_codes: ["Reported score factor"] }],
  inquiries: [], personal_info: {}, addresses: [], employment: [],
  identity_risk: { ofac: {}, mla: {}, fraud_shield: {} }, public_records: [], collections: [],
  fico_8: null, fico_2: null, vantage_4: null, best_score: null, best_score_model: null, raw_html_length: 0,
});
const render = (report: ParsedReport | undefined, loading = false) => renderToStaticMarkup(createElement(CreditReportDetail, { report, loading }));

describe("credit report cockpit", () => {
  it("keeps duplicate creditor names as distinct clickable source accounts", () => {
    const html = render(fixture([{ fields: { company: "Example Bank", balance: "100" } }, { fields: { company: "Example Bank", balance: "200" } }]));
    expect(html).toContain('aria-label="View account 1: Example Bank"');
    expect(html).toContain('aria-label="View account 2: Example Bank"');
    expect(html).toContain("$300");
    expect(html).toContain("2 of 2 accounts reported");
  });
  it("shows normalized provider amounts and never assumes an unknown account is closed", () => {
    const html = render(fixture([{ fields: { Creditor: "Example Credit", currentBalance: "000027863", monthlyPayment: "00000000" } }]));
    expect(html).toContain("$27,863");
    expect(html).toContain("$0");
    expect(html).not.toContain("$000");
    expect(html).not.toContain("Closed");
    expect(html).toContain("Not provided");
  });
  it("labels partial aggregates and leaves absent amounts unknown", () => {
    const html = render(fixture([{ fields: { company: "Known", balance: "0" } }, { fields: { company: "Unknown" } }]));
    expect(html).toContain("1 of 2 accounts reported");
    expect(html).toContain("0 of 2 accounts reported");
    expect(html).toContain("Not provided");
  });
  it("keeps an adverse historical rating distinct from evidence of current past due", () => {
    const html = render(fixture([{ fields: { company: "Example", account_status: "Closed", account_rating: "30 days past due", past_due: "00000000" } }]));
    expect(html).toContain("Adverse");
    expect(html).toContain("0 with reported past-due evidence");
  });
  it("masks account identifiers in the summary table and escapes provider text", () => {
    const html = render(fixture([{ fields: { company: "Example <script>", account_number: "123456789012", balance: "0" } }]));
    expect(html).toContain("••••9012");
    expect(html).not.toContain("123456789012");
    expect(html).toContain("Example &lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("offers score and report section drilldowns without a provider request", () => {
    const html = render(fixture([]));
    expect(html).toContain('aria-label="View Example model score details"');
    expect(html).toContain("Full report details");
    expect(html).toContain("Identity &amp; history");
    expect(html).toContain("No trade accounts were provided");
    expect(html).not.toContain("Pull credit");
  });
  it("does not show zero scores or balances when report data is still unavailable", () => {
    expect(render(undefined)).toContain("No parsed credit report on file");
    expect(render(undefined, true)).toContain("Loading credit report");
    expect(render(undefined)).not.toContain("$0");
  });
});
