import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DebtScheduleForm, type DebtBody } from "../DebtScheduleForm";

const noop = () => undefined;
const render = (value: DebtBody, showProblems = false) =>
  renderToStaticMarkup(createElement(DebtScheduleForm, { value, onChange: noop, showProblems }));

describe("the debt schedule form", () => {
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
