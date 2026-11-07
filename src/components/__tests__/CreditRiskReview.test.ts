import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CreditRiskReview } from "../CreditRiskReview";
import type { CreditRiskReview as Review } from "@/lib/types";

function render(evidence: Record<string, unknown>) {
  const review: Review = { version: 1, as_of: "2026-10-31", flag_count: 1, high_count: 0, level: "review",
    flags: [{ id: "evidence", code: "review", title: "Reported finding", severity: "warning", source: "trade_accounts[2]", evidence, detail: "Review the supplied fields." }], limitations: [], advisory: "Review before relying on this finding." };
  return renderToStaticMarkup(createElement(CreditRiskReview, { review }));
}

describe("credit review structured evidence", () => {
  it("retains nested reported records, arrays, zero and false values", () => {
    const html = render({ payment_history: [{ month: "2026-09", days_late: 30, balance: "1250" }, { month: "2026-10", days_late: 0, disputed: false }], notes: { reported_by: "Fictional Bureau", remarks: ["First reported note", "Second reported note"] } });
    for (const value of ["2026-09", "2026-10", "30", "$1,250", ">0<", "false", "Fictional Bureau", "First reported note", "Second reported note"]) expect(html).toContain(value);
    expect(html).not.toContain("[object Object]");
    expect(html).not.toContain("Not provided");
  });

  it("masks primitive identifier arrays using their parent field name", () => {
    const html = render({ account_numbers: ["123456789012", "ACCT(123).456/7890"], ssn: ["123-45-6789", "987654321"], related: { social_security_numbers: ["111.22.3333"], account_number: "555566667777" } });
    for (const raw of ["123456789012", "ACCT(123).456/7890", "123-45-6789", "987654321", "111.22.3333", "555566667777"]) expect(html).not.toContain(raw);
    for (const masked of ["••••9012", "••••7890", "••••6789", "••••4321", "••••3333", "••••7777"]) expect(html).toContain(masked);
  });

  it("escapes nested report text and field names without interpreting markup", () => {
    const html = render({ remarks: [{ '<img src=x onerror="alert(1)">': "<script>alert(2)</script>" }] });
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;script&gt;alert(2)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
  });

  it("distinguishes supplied empty structures from an unavailable value", () => {
    const html = render({ array: [], record: {}, missing: null });
    expect(html).toContain("No entries reported.");
    expect(html).toContain("No fields reported.");
    expect(html).toContain("Not provided");
  });

  it("bounds cyclic and excessively nested values with an explicit notice", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.reference = cyclic;
    let nested: unknown = "Beyond display depth";
    for (let depth = 0; depth < 20; depth += 1) nested = { child: nested };
    const html = render({ cyclic, nested });
    expect(html.match(/Further nested evidence exceeds this view’s display limit\./g)).toHaveLength(2);
    expect(html).not.toContain("[object Object]");
  });
});
