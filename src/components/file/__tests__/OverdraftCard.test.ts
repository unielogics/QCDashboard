import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OverdraftCard } from "../cockpit/OverdraftCard";
import type { CockpitMonth } from "@/lib/financialCockpit";

const month: CockpitMonth = { month: "2026-10", label: "October 2026", accounts: ["Checking 1234"], file_ids: ["source-a"], accepted: true, deposits: null, withdrawals: null, beginning_balance: null, ending_balance: null, average_balance: null, low_balance: null, deposit_count: null, nsf: null, returned_checks: null, negative_days: null, net: null, outflow_ratio: null, negative_dates: [], overdraft_items: [], fees: null };
const render = (months: CockpitMonth[]) => renderToStaticMarkup(createElement(OverdraftCard, { months, accountLabel: "Checking 1234", needReread: 0 }));

describe("balance-risk calendar", () => {
  it("does not claim zero incidents or clean balances when statement facts are missing", () => {
    expect(render([])).toContain("Negative days and event counts are unknown");
    const html = render([month]);
    expect(html).toContain("Not reported");
    expect(html).toContain("Daily evidence incomplete");
    expect(html).not.toContain("Never below zero");
    expect(html).not.toContain('data-negative="true"');
  });
  it("renders an accessible real calendar and a bounded event page instead of an activity wall", () => {
    const html = render([{ ...month, negative_days: 1, negative_dates: ["2026-10-03"], overdraft_items: Array.from({ length: 15 }, (_, index) => ({ date: `2026-10-${String(index + 1).padStart(2, "0")}`, type: "nsf_fee", amount: 35, description: "NSF charge" })) }]);
    expect(html).toContain('role="grid"');
    expect(html).toContain('aria-label="October 2026 balance-risk calendar"');
    expect(html.match(/data-negative="true"/g)).toHaveLength(1);
    expect(html.match(/<li>/g)).toHaveLength(4);
    expect(html).toContain("1–4 of 15 entries");
    expect(html).toContain("Arrow keys move between days");
    expect(html).toContain('aria-label="Balance risk view"');
  });
  it("explains negative monthly lows without assigning an invented daily amount", () => {
    const html = render([{ ...month, negative_days: 0, low_balance: -700 }]);
    expect(html).toContain("Negative monthly low; day count needs review");
    expect(html).toContain("Monthly low; daily amount not supplied");
    expect(html).not.toContain('data-negative="true"');
  });
});
