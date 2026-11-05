import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DebtScheduleForm, type DebtBody } from "../DebtScheduleForm";

const noop = () => undefined;
const render = (value: DebtBody, showProblems = false) =>
  renderToStaticMarkup(createElement(DebtScheduleForm, { value, onChange: noop, showProblems }));

describe("the debt schedule form", () => {
  it("retains MCA questions beside distinct factor and payment cadence fields", () => {
    const html = render({ debts: [{ lender: "Fundbox", debt_type: "mca", factor_rate: "1.375", payment_amount: "100", payment_frequency: "daily", monthly_payment: "2100", monthly_payment_source: "native_terms" }] });
    expect(html).toContain("Modified for lower sales?");
    expect(html).toContain("Factor rate (×)");
    expect(html).toContain('value="1.375"');
    expect(html).toContain("≈ Monthly: payment amount × 21.");
    const child = renderToStaticMarkup(createElement(DebtScheduleForm, { value: { debts: [] }, onChange: noop, singleRow: true }));
    expect(child).not.toContain("I confirm this business has no outstanding debt.");
    expect(child).not.toContain("Add an obligation");
  });
  it("marks only the staff completion minimum while retaining all borrower requirements", () => {
    const value = { debts: [{ lender: "Fundbox", debt_type: "mca" }] };
    const staff = renderToStaticMarkup(createElement(DebtScheduleForm, { value, onChange: noop, singleRow: true }));
    expect(staff.match(/class="fp-req"/g)).toHaveLength(4); // lender, balance, monthly plus legend
    expect(staff).toContain("Payment amount and frequency can calculate the monthly payment.");
    expect(render(value).match(/class="fp-req"/g)).toHaveLength(9); // seven, MCA question, legend
  });
  it("offers an explicit no-debt declaration only when the borrower has no obligations", () => {
    expect(render({ debts: [], no_debt: true })).toMatch(/type="checkbox"[^>]*checked=""/);
    expect(render({ debts: [{ lender: "Chase" }] })).not.toContain("I confirm this business has no outstanding debt.");
  });

  it("offers the type of debt as a list and marks the owner's required answers", () => {
    const html = render({ debts: [{ lender: "Newtek" }] });
    expect(html).toContain("Merchant cash advance (MCA)");
    expect(html).toContain("Line of credit");
    expect(html).toContain('id="type-0"');
    expect(html).toMatch(/<select[^>]*id="type-0"/);
    // Seven asterisks on the card (lender, type, original, balance, rate, monthly, status)
    // plus the one in the legend.
    expect(html.match(/class="fp-req"/g)?.length).toBe(8);
    // Optional fields carry none.
    expect(html).toMatch(/Origin date<\/label>/);
    expect(html).toMatch(/Type of collateral<\/label>/);
  });

  it("asks the advance question only when the row is a merchant cash advance", () => {
    expect(render({ debts: [{ lender: "Chase", debt_type: "term_loan" }] })).not.toContain("fp-mca");
    const html = render({ debts: [{ lender: "Fundbox", debt_type: "mca" }] });
    expect(html).toContain("fp-mca");
    expect(html).toContain("Modified for lower sales?");
    expect(html).toContain('id="mca-0"');
    expect(html).toContain("not the factor");
    // The "what changed" box appears once the answer is yes.
    expect(html).not.toContain('id="mca-note-0"');
    expect(render({ debts: [{ lender: "Fundbox", debt_type: "mca", mca_modified: "yes" }] })).toContain('id="mca-note-0"');
    // A value typed before the list existed still asks.
    expect(render({ debts: [{ lender: "Fundbox", debt_type: "Merchant Cash Advance" }] })).toContain("fp-mca");
  });

  it("keeps a type typed before the list existed as a selectable option, but not the old default", () => {
    const html = render({ debts: [{ lender: "Chase", debt_type: "Bridge note" }] });
    expect(html).toMatch(/<option value="Bridge note"[^>]*>Bridge note \(as typed\)<\/option>/);
    expect(render({ debts: [{ lender: "Chase", debt_type: "term_loan" }] })).not.toContain("(as typed)");
    expect(render({ debts: [{ lender: "Chase", debt_type: "loan" }] })).not.toContain("(as typed)");
  });

  it("outlines what is missing only once a submit has been tried", () => {
    const row = { lender: "Newtek", balance: "1000" };
    expect(render({ debts: [row] })).not.toContain("is-invalid");
    const html = render({ debts: [row] }, true);
    expect(html).toContain("is-invalid");
    expect(html.match(/fp-field-problem/g)?.length).toBe(5); // type, original, rate, monthly, status
    expect(html).toMatch(/<select[^>]*id="type-0"[^>]*aria-invalid="true"/);
    expect(html).not.toContain('role="alert"');
    // A locked row (another source's) is never outlined.
    expect(render({ debts: [{ ...row, editable: false }] }, true)).not.toContain("is-invalid");
  });

  it("shows the type beside the lender in the card title", () => {
    const html = render({ debts: [{ lender: "Fundbox", debt_type: "mca", balance: "12000" }] });
    expect(html).toContain("Merchant cash advance (MCA) · $12,000 owed");
  });
});
