import { describe, expect, it } from "vitest";
import { metricEntries, metricEntry, type FinancialKpiOptions } from "../financialKpiReview";
import type { FinancialCockpit, FinancialPlanWrite } from "../financialCockpit";
import type { MetricCalculation } from "../financialMetrics";

const empty: FinancialPlanWrite = { retire: [], exclude: [], new_payment_monthly: null, new_payment_source: null, new_loan_amount: null, new_loan_rate_pct: null, new_loan_term_months: null, new_loan_structure: null, new_loan_interest_only: false, new_loan_interest_only_months: null, new_loan_repayment_config: null, new_loan_payments_per_year: null, add_backs: [], overrides: null, terms_ref: null, note: null };
function setup() {
  const source = { file_id: "profit", file_name: "Profit.pdf", currency: "USD", pages: [2], citations: [{ page: 2, quote: "Net income 40,000" }] };
  const bankRefs = ["bank-one", "bank-two"].map((file_id) => ({ file_id, file_name: `${file_id}.pdf`, currency: "USD", pages: [1] }));
  const months = ["2026-01", "2026-02"].map((month, i) => ({ month, label: month, file_ids: [bankRefs[i].file_id], accounts: ["checking"], deposits: 10000, withdrawals: 7000, net: 3000, average_balance: 5000, beginning_balance: 4000, ending_balance: 7000, nsf: 1, returned_checks: 0, negative_days: 0, negative_dates: [], overdraft_items: [], low_balance: 1000 }));
  const summary = { avg_deposits: 10000, avg_withdrawals: 7000, avg_net: 3000, average_balance: 5000, average_balance_basis: "statement_average", first_month: "2026-01", last_month: "2026-02", months: 2 };
  const calc = (key: string, value: number, input: string, refs = bankRefs): MetricCalculation => ({ key, value, label: key, formula: key, input_keys: [input], source_refs: refs, currency: "USD", annualization_factor: 1, period: "2026", missing_inputs: [], notes: [] });
  const candidate = { key: "profit_and_loss", label: "P&L 2026", numerator: 120000, value: 3.33, annual_debt_service: 36000 };
  const cockpit = { profile_id: "fictional", bank: { months, summary, recurring: { payees: [], months_read: months.map((row) => row.month) } }, debt: { service: { monthly: 3000 }, obligations: [{ id: "old-loan", monthly: 2000, payoff: 10000, in_debt_service: true }] }, dscr: { headline: candidate, candidates: [candidate], annual_debt_service: 36000, no_debt: false }, net_profit: { conclusion: { key: "profit_and_loss", value: 40000, label: "Annual P&L net income", period: "2026" } }, ebitda: { headline: { key: "profit_and_loss", value: 60000, annualized_value: 60000, annualization_factor: 1, label: "EBITDA", period: "2026", kind: "computed_ebitda", currency: "USD", source_refs: [source], input_keys: ["profit_and_loss.net_income"] } }, plan: { record: { ...empty }, evaluation: {}, terms_link: null }, metric_review: { revision: 0, inputs: [{ key: "bank.avg_net", source_refs: bankRefs }], calculations: [calc("bank.deposits", 10000, "bank.avg_deposits"), calc("bank.net_cash_flow", 3000, "bank.avg_net"), calc("bank.average_balance", 5000, "bank.average_balance"), calc("net_profit.profit_and_loss", 40000, "profit_and_loss.net_income", [source])], history: [], stale_corrections: [] } } as unknown as FinancialCockpit;
  const options = { months, summary, accountKey: "counted", label: "Counted accounts", plan: { ...empty, new_loan_amount: 12000, new_loan_rate_pct: 12, new_loan_term_months: 12, new_loan_structure: "simple_interest", new_payment_source: "manual_terms", retire: ["old-loan"] }, dirty: true } as unknown as FinancialKpiOptions;
  return { cockpit, options };
}

describe("financial KPI evidence and offer illustrations", () => {
  it("maps all eight cards and uses principal-plus-interest cash separately from underwriting", () => {
    const { cockpit, options } = setup();
    const entries = metricEntries(cockpit, options);
    expect(entries).toHaveLength(8);
    expect(entries.find((row) => row.key === "cash_flow")?.projection.value).toBe(3880);
    expect(entries.find((row) => row.key === "average_balance")?.projection.value).toBe(10280);
    expect(entries.find((row) => row.key === "dscr")?.projection.value).toBe(4.72);
    expect(entries.find((row) => row.key === "deposits")?.projection.value).toBe(10000);
    expect(entries.find((row) => row.key === "nsf_overdrafts")?.projection.status).toBe("unchanged");
    expect(entries.find((row) => row.key === "ebitda")?.projection.value).toBe(60000);
    expect(entries.find((row) => row.key === "noi")?.currentValue).toBeNull();
  });
  it("uses operating-income evidence for NOI and keeps financing out of its core value", () => {
    const { cockpit, options } = setup();
    cockpit.noi = { definition: { formula: "Revenue minus COGS minus operating expenses" }, headline: { key: "noi:current", value: 30000, annualized_value: 30000, currency: "USD", period: "2026", input_keys: ["profit_and_loss.gross_revenue"], source_refs: [{ file_id: "operating", file_name: "Operating.pdf", currency: "USD", pages: [3] }], notes: [] } } as unknown as FinancialCockpit["noi"];
    const entry = metricEntry(cockpit, "noi", options);
    expect(entry.currentValue).toBe(30000);
    expect(entry.projection.value).toBe(30000);
    expect(entry.projection.status).toBe("unchanged");
    expect(entry.sourceRefs.map((row) => row.file_id)).toEqual(["operating"]);
    expect(entry.calculationKeys).toEqual(["noi:current"]);
    expect(entry.formula).toContain("Revenue minus COGS");
  });
  it("does not put retired principal into profit or invent old interest", () => {
    const { cockpit, options } = setup();
    const profit = metricEntry(cockpit, "net_profit", options);
    expect(profit.currentValue).toBe(40000);
    expect(profit.projection.value).toBe(38560);
    expect(profit.projection.status).toBe("partial");
    expect(profit.projection.inputs.find((row) => row.label.includes("removed"))?.value).toBeNull();
    const additive = metricEntry(cockpit, "net_profit", { ...options, plan: { ...options.plan!, retire: [] } });
    expect(additive.projection.value).toBe(38560);
    expect(additive.projection.status).toBe("projected");
  });
  it("uses actual first-year payments rather than spreading a later balloon across every month", () => {
    const { cockpit, options } = setup();
    const plan = { ...options.plan!, retire: [], new_loan_amount: 262529, new_loan_rate_pct: 29.99, new_loan_term_months: 24, new_loan_structure: "amortizing" as const, new_loan_interest_only_months: 6, new_loan_repayment_config: { amortization_months: 60 } };
    const entry = metricEntry(cockpit, "cash_flow", { ...options, plan });
    expect(entry.projection.inputs.find((row) => row.label.includes("first-year"))?.value).toBe(90318.78);
    expect(entry.projection.value).toBeGreaterThan(-5000);
    expect(entry.projection.value).toBeLessThan(-4000);
  });
  it("keeps account effects unallocated and shows only that account's document evidence", () => {
    const { cockpit, options } = setup();
    const entry = metricEntry(cockpit, "cash_flow", { ...options, accountKey: "checking-one", label: "Account one", months: options.months.slice(0, 1) });
    expect(entry.projection.value).toBeNull();
    expect(entry.canEditScope).toBe(false);
    expect(entry.sourceRefs.map((source) => source.file_id)).toEqual(["bank-one"]);
  });
  it("keeps explicit unknown currency and unknown selected payments unknown", () => {
    const { cockpit, options } = setup();
    cockpit.metric_review!.calculations.find((row) => row.key === "bank.net_cash_flow")!.currency = null;
    expect(metricEntry(cockpit, "cash_flow", options).projection.value).toBeNull();
    expect(metricEntry(cockpit, "cash_flow", options).currency).toBeNull();
    cockpit.debt.obligations[0].monthly = null;
    expect(metricEntry(cockpit, "average_balance", options).projection.value).toBeNull();
  });
  it("uses full-month changes for an ending-balance proxy and a fixed first-year horizon", () => {
    const { cockpit, options } = setup();
    const entry = metricEntry(cockpit, "average_balance", { ...options, months: Array.from({ length: 18 }, (_, i) => options.months[i % 2]), summary: { ...options.summary, average_balance_basis: "ending_balance" } });
    expect(entry.projection.value).toBe(10720);
    expect(entry.projection.formula).toContain("ending-balance proxy");
  });
  it("does not substitute a filed offer for an explicitly cleared working scenario", () => {
    const { cockpit, options } = setup();
    cockpit.proposed_terms = { amount: 12000, rate_pct: 12, term_months: 12, monthly_payment: 1120, structure: "simple_interest", interest_only: false, interest_only_months: 0, payments_per_year: 12 } as FinancialCockpit["proposed_terms"];
    expect(metricEntry(cockpit, "cash_flow", { ...options, plan: empty, dirty: false }).projection.source).toBe("filed_offer");
    expect(metricEntry(cockpit, "cash_flow", { ...options, plan: empty, dirty: true }).projection.source).toBe("none");
  });
  it("keeps field-specific PDF locators separate even for a combined document", () => {
    const { cockpit, options } = setup();
    cockpit.metric_review!.inputs.push({ key: "unrelated", source_refs: [{ file_id: "bank-one", file_name: "Combined.pdf", currency: "USD", pages: [9], citations: [{ page: 9, quote: "Unrelated income 999" }] }] } as never);
    const cash = metricEntry(cockpit, "cash_flow", options);
    expect(cash.sourceRefs.some((row) => row.citations?.some((citation) => citation.quote?.includes("Unrelated")))).toBe(false);
  });
  it("retains partial NSF counts and version-only debt evidence", () => {
    const { cockpit, options } = setup();
    cockpit.metric_review!.calculations.push({ key: "bank.nsf_overdrafts", value: 2, details: { complete: false } } as MetricCalculation);
    expect(metricEntry(cockpit, "nsf_overdrafts", options).valueLabel).toBe("2+");
    cockpit.metric_review!.inputs.push({ key: "debt.annual", source_refs: [{ file_id: null, file_name: "Saved schedule.pdf", version_id: "immutable-v2" }] } as never);
    cockpit.metric_review!.calculations.push({ key: "dscr.profit_and_loss", value: 3.33, input_keys: [], source_refs: [], recipe: { denominator: { input_key: "debt.annual" } } } as unknown as MetricCalculation);
    expect(metricEntry(cockpit, "dscr", options).sourceRefs.some((ref) => ref.version_id === "immutable-v2")).toBe(true);
  });
  it("does not turn a reviewed tax estimate into verified EBITDA", () => {
    const { cockpit, options } = setup();
    cockpit.ebitda!.headline!.kind = "tax_estimate";
    cockpit.metric_review!.calculations.push({ key: "profit_and_loss", value: 60000, input_keys: [], source_refs: [], recipe: { reviewed_value: 65000, current_event: { action: "compose" } } } as unknown as MetricCalculation);
    const entry = metricEntry(cockpit, "ebitda", options);
    expect(entry.title).toBe("Staff-adjusted tax earnings estimate");
    expect(entry.currentValue).toBe(65000);
    expect(cockpit.ebitda!.headline!.value).toBe(60000);
  });
  it("uses the matching server's solved loan, fee-inclusive coverage and cost-adjusted earnings once", () => {
    const { cockpit, options } = setup();
    cockpit.noi = { headline: { key: "noi", annualized_value: 30000, currency: "USD", source_refs: [], input_keys: [] }, definition: {} } as unknown as FinancialCockpit["noi"];
    const budgetEvaluation = { headline_after: 2.2, income_after_annual: 118000, debt_service_after_annual: 53636.36, debt_service_after_monthly: 4469.7, new_payment_monthly: 2240, no_debt_left: false,
      loan_terms: { amount: 24000, rate_pct: 12, term_months: 12, structure: "simple_interest", payments_per_year: 12 }, annual_new_operating_expenses: 2000,
      ebitda: { annual_after: 58000, adjusted_annual: { after: 58000 } }, noi_scenario: { current: 30000, plan: 28000 },
      financing_budget_calculation: { borrower_fee_cash_flows: [{month: 1, amount: 1000}], borrower_operating_expense_cash_flows: [{month: 1, amount: 200}] } } as unknown as NonNullable<FinancialKpiOptions["budgetEvaluation"]>;
    const entries = metricEntries(cockpit, { ...options, budgetEvaluation });
    expect(entries.find(row => row.key === "dscr")?.projection.value).toBe(2.2);
    expect(entries.find(row => row.key === "ebitda")?.projection.value).toBe(58000);
    expect(entries.find(row => row.key === "noi")?.projection.value).toBe(28000);
    expect(entries.find(row => row.key === "cash_flow")?.projection.value).toBe(2660);
    expect(entries.find(row => row.key === "net_profit")?.projection.value).toBe(35920);
    expect(cockpit.ebitda?.headline?.annualized_value).toBe(60000);
    expect(cockpit.noi?.headline?.annualized_value).toBe(30000);
  });
  it("withholds old scenario results immediately while a changed budget is calculating", () => {
    const { cockpit, options } = setup();
    const entries = metricEntries(cockpit, { ...options, budgetPending: true });
    for (const key of ["dscr", "ebitda", "noi", "cash_flow", "average_balance", "net_profit"]) {
      expect(entries.find(row => row.key === key)?.projection.value).toBeNull();
      expect(entries.find(row => row.key === key)?.projection.formula).toContain("Calculating current");
    }
    expect(entries.find(row => row.key === "deposits")?.currentValue).toBe(10000);
  });

  it("keeps unknown recurring charges and explicit unknown NOI projections unavailable", () => {
    const { cockpit, options } = setup();
    cockpit.noi = { headline: { key: "noi", annualized_value: 30000, currency: "USD", source_refs: [], input_keys: [] }, definition: {} } as unknown as FinancialCockpit["noi"];
    const budgetEvaluation = { annual_new_financing_fees: null, annual_new_operating_expenses: null, noi_scenario: { current: 30000, plan: null } } as unknown as NonNullable<FinancialKpiOptions["budgetEvaluation"]>;
    const entries = metricEntries(cockpit, { ...options, budgetEvaluation });
    for (const key of ["cash_flow", "average_balance", "net_profit", "noi"]) expect(entries.find(row => row.key === key)?.projection.value).toBeNull();
  });

});
