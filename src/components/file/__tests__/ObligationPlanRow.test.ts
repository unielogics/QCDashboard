import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ObligationPlanRow } from "../cockpit/ObligationRowEditor";
import type { Obligation } from "@/lib/financialCockpit";

const obligation = { id: "row:a", kind: "row", lender: "Oakwood", category: "term_loan", monthly: 1000, balance: 80000, payoff: 79000, in_debt_service: true, count_in_dscr: true, linked_payee: "Oakwood bank debits" } as Obligation;
const render = (canEdit: boolean, on: boolean) => renderToStaticMarkup(createElement(ObligationPlanRow, { o: obligation, canEdit, on, onToggleRetire: () => undefined }));

describe("financial coverage obligations", () => {
  it("shows saved figures with only the payoff plan checkbox editable", () => {
    const html = render(true, true);
    expect(html).toContain("Oakwood");
    expect(html).toContain("$1,000");
    expect(html).toContain("$80,000");
    expect(html).toContain("Payoff $79,000");
    expect(html.match(/<input/g)).toHaveLength(1);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked=""');
    expect(html).not.toContain("<select");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Oakwood bank debits");
  });
  it("disables payoff plan selection for a reader", () => {
    expect(render(false, false)).toContain('disabled=""');
  });
});
