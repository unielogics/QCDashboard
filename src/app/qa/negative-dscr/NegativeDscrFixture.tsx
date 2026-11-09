"use client";

import { useMemo, useState } from "react";
import { Btn } from "@/components/ds";
import { CoverageCard } from "@/components/file/cockpit/CoverageCard";
import { EMPTY_SCHEDULE, type CockpitBankSummary, type CockpitDscrCandidate, type CockpitMonth, type FinancialCockpit, type FinancialPlanWrite, type Obligation } from "@/lib/financialCockpit";

const loan = (id: string, lender: string, monthly: number, payoff: number): Obligation => ({ id, lender, monthly, payoff, balance: payoff, original_amount: payoff * 2, originated_on: "2025-01-01", kind: "row", category: "term_loan", is_mca: false, in_debt_service: true, count_in_dscr: true, linked_payee_key: null, linked_payee: null, observed_monthly: null, cadence: "monthly", source: "debt_schedule", origin: "staff" });
const obligations = [loan("wayflyer", "Wayflyer", 3510.37, 15000), loan("specialty", "Specialty Capital", 2836.38, 20000), loan("ondeck-a", "OnDeck", 5253.34, 30644), loan("ondeck-b", "OnDeck", 3343.17, 18000), loan("other-term", "Other term loan", 2635, 12000)];
const months: CockpitMonth[] = Array.from({ length: 6 }, (_, index) => ({ month: `2026-${String(index + 1).padStart(2, "0")}`, label: `Month ${index + 1}`, accounts: ["qa-checking"], file_ids: [], accepted: true, deposits: 25000, withdrawals: 27447.5, net: -2447.5, beginning_balance: 4000, ending_balance: 1614, average_balance: 2000, low_balance: index < 2 ? -100 : 100, nsf: 0, returned_checks: 0, negative_days: 0, negative_dates: [], overdraft_items: [], deposit_count: 20, outflow_ratio: 1.1, fees: 0 }));
const summary: CockpitBankSummary = { months: 6, accepted_months: 6, required_months: 6, first_month: "2026-01", last_month: "2026-06", gaps: [], avg_deposits: 25000, avg_withdrawals: 27447.5, avg_net: -2447.5, annualized_deposits: 300000, annualized_withdrawals: 329370, annualized_net: -29370, deposit_trend_pct: 0, deposit_volatility_pct: 0, highest_month: "2026-01", lowest_month: "2026-01", beginning_balance: 4000, ending_balance: 1614, average_balance: 2000, average_balance_basis: "statement", lowest_balance: -100, avg_deposit_count: 20, nsf_total: 0, returned_checks_total: 0, negative_days_total: 0, avg_outflow_ratio: 1.1, estimates_available: true };
const record: FinancialPlanWrite = { retire: [], exclude: [], new_payment_monthly: null, new_payment_source: null, new_loan_amount: null, new_loan_rate_pct: null, new_loan_term_months: null, new_loan_interest_only: false, new_loan_structure: null, new_loan_interest_only_months: null, new_loan_repayment_config: null, new_loan_payments_per_year: null, add_backs: [], overrides: null, terms_ref: null, note: null };
const candidate: CockpitDscrCandidate = { key: "tax_return", label: "Tax return 2025", numerator: -54369, numerator_label: "Tax-derived earnings estimate", period: "2025", annual_debt_service: 210939.12, value: -0.26, status: "concerning", pro_forma_value: null, pro_forma_status: "unavailable", confidence: "filed", note: "Fictional regression fixture; not verified P&L EBITDA.", numerator_currency: "USD", denominator_currency: "USD", currency_comparable: true, currency_status: "comparable" };

function fixture(profileId: string): FinancialCockpit {
  return {
    profile_id: profileId, generated_at: "2026-11-09T12:00:00Z", requested_amount: 70000,
    coverage: { files_analyzed: 1, files_accepted: 1, bank_months: 6, bank_months_accepted: 6, bank_months_required: 6, bank_accounts: [], bank_gaps: [], first_month: "2026-01", last_month: "2026-06", tax_years: ["2025"], has_profit_and_loss: false, has_balance_sheet: false, has_debt_schedule_document: true, debt_schedule_status: "received", debt_rows: 5, documented_debts: 5, recurring_months_read: 6, statements_need_reread: 0, bank_files_need_reread: [] },
    bank: { months, summary, accounts: [], recurring: { payees: [], months_read: months.map((row) => row.month) }, counted_accounts: [], all_months: null, all_summary: null },
    tax: { years: [] }, profit_and_loss: null, balance_sheet: null,
    expenses: { lines: [], outflow_ratio: null, opex_ratio: null, cogs_ratio: null, debt_service_to_deposits: null },
    debt: { obligations, rows: [], documented: [], document: null, service: { monthly: 17578.26, source: "debt_schedule", annual: 210939.12 }, reconciliation: [], schedule: { ...EMPTY_SCHEDULE, status: "received", label: "Saved debt schedule", rows: 5 } },
    plan: { record: { ...record }, evaluation: { active: false }, levers: [], terms_link: null },
    dscr: { candidates: [candidate], headline: candidate, pro_forma_headline: null, annual_debt_service: 210939.12, debt_service_source: "debt_schedule", proposed: null, thresholds: { acceptable: 1, healthy: 1.25, very_strong: 1.5 }, reason: null, no_debt: false },
    net_profit: { candidates: [], conclusion: null, note: null }, notes: [],
  } as unknown as FinancialCockpit;
}

const COMPANIES = ["Example Wellness Studio LLC", "Example Therapy Services Incorporated and Affiliated Holdings LLC", ""];

export default function NegativeDscrFixture() {
  const [company, setCompany] = useState(0);
  const [reviewRequest, setReviewRequest] = useState(0);
  const profileId = `negative-dscr-qa-${company}`;
  const cockpit = useMemo(() => fixture(profileId), [profileId]);
  return <main className="content content--wide" style={{ padding: 16, maxWidth: 1500, margin: "0 auto", display: "grid", gap: 16 }}>
    <header><h1>Negative earnings QA</h1><p>Fictional comparison for UI regression checks. No live client records or messages are changed.</p></header>
    <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
      <label>Fictional file <select aria-label="Fictional file" value={company} onChange={(event) => setCompany(Number(event.target.value))}>{COMPANIES.map((name, index) => <option key={index} value={index}>{name || "Missing company identity"}</option>)}</select></label>
      <Btn onClick={() => setReviewRequest((value) => value + 1)}>Open coverage review</Btn>
    </div>
    <CoverageCard businessName={COMPANIES[company]} cockpit={cockpit} profileId={profileId} months={months} summary={summary} accountLabel="All counted accounts" accountKey="counted" canEdit canReviewDebt={false} canCorrectMetrics={false} canRecordTerms={false} termsKind="production" onRecordTerms={() => {}} reviewRequest={reviewRequest} />
  </main>;
}
