"use client";

import { useMemo, useState } from "react";
import { Btn } from "@/components/ds";
import { CoverageCard } from "@/components/file/cockpit/CoverageCard";
import { PAYOFF_REPLAY_REVIEW_REQUIRED } from "@/lib/cockpitSimulation";
import { EMPTY_SCHEDULE, type CockpitBankSummary, type CockpitDscrCandidate, type CockpitMonth, type FinancialCockpit, type FinancialPlanWrite, type Obligation } from "@/lib/financialCockpit";

const months: CockpitMonth[] = [{ month: "2026-01", label: "January 2026", accounts: ["qa-checking"], file_ids: [], accepted: true, deposits: 30000, withdrawals: 28000, net: 2000, beginning_balance: 1000, ending_balance: 3000, average_balance: 2000, low_balance: -100, nsf: 0, returned_checks: 0, negative_days: 1, negative_dates: [], overdraft_items: [], deposit_count: 20, outflow_ratio: 0.93, fees: 0 }];
const summary: CockpitBankSummary = { months: 1, accepted_months: 1, required_months: 1, first_month: "2026-01", last_month: "2026-01", gaps: [], avg_deposits: 30000, avg_withdrawals: 28000, avg_net: 2000, annualized_deposits: 360000, annualized_withdrawals: 336000, annualized_net: 24000, deposit_trend_pct: 0, deposit_volatility_pct: 0, highest_month: "2026-01", lowest_month: "2026-01", beginning_balance: 1000, ending_balance: 3000, average_balance: 2000, average_balance_basis: "statement", lowest_balance: -100, avg_deposit_count: 20, nsf_total: 0, returned_checks_total: 0, negative_days_total: 1, avg_outflow_ratio: 0.93, estimates_available: true };
const record: FinancialPlanWrite = { retire: [], exclude: [], new_payment_monthly: null, new_payment_source: null, new_loan_amount: null, new_loan_rate_pct: null, new_loan_term_months: null, new_loan_interest_only: false, new_loan_structure: null, new_loan_interest_only_months: null, add_backs: [], overrides: null, terms_ref: null, note: null };
const candidate: CockpitDscrCandidate = { key: "tax_return", label: "Tax return 2025", numerator: 120000, numerator_label: "Fictional tax earnings", period: "2025", annual_debt_service: 120000, value: 1, status: "acceptable", pro_forma_value: null, pro_forma_status: "unavailable", confidence: "filed", note: "Fictional UI regression evidence.", numerator_currency: "USD", denominator_currency: "USD", currency_comparable: true, currency_status: "comparable" };
const loan = (id: string, lender: string, monthly: number, reviewed: boolean): Obligation => ({ id, lender, monthly, payoff: 10000, balance: 10000, original_amount: 20000, originated_on: "2025-01-01", kind: "row", category: "term_loan", is_mca: false, in_debt_service: true, count_in_dscr: true, linked_payee_key: reviewed ? id : null, linked_payee: reviewed ? `${lender} ${id}` : null, observed_monthly: reviewed ? monthly : null, cadence: "monthly", source: "debt_schedule", origin: "staff", replay_requires_review: lender === "OnDeck" && !reviewed, replay_review_reason: lender === "OnDeck" && !reviewed ? PAYOFF_REPLAY_REVIEW_REQUIRED : null, candidate_payee_keys: lender === "OnDeck" && !reviewed ? ["shared"] : [] });
function fixture(reviewed: boolean): FinancialCockpit {
  const obligations = [loan("first-loan", "OnDeck", 5000, reviewed), loan("second-loan", "OnDeck", 3000, reviewed), loan("other-loan", "Other lender", 2000, true)];
  const payees = reviewed ? [{ key: "first-loan", payee: "OnDeck loan A", monthly: { "2026-01": 5100 }, monthly_average: 5100 }, { key: "second-loan", payee: "OnDeck loan B", monthly: { "2026-01": 3100 }, monthly_average: 3100 }] : [{ key: "shared", payee: "OnDeck aggregate", monthly: { "2026-01": 9000 }, monthly_average: 9000 }];
  return {
    profile_id: `payoff-replay-${reviewed}`, generated_at: "2026-11-09T12:00:00Z", requested_amount: 20000,
    coverage: { files_analyzed: 1, files_accepted: 1, bank_months: 1, bank_months_accepted: 1, bank_months_required: 1, bank_accounts: [], bank_gaps: [], first_month: "2026-01", last_month: "2026-01", tax_years: ["2025"], has_profit_and_loss: false, has_balance_sheet: false, has_debt_schedule_document: true, debt_schedule_status: "received", debt_rows: 3, documented_debts: 3, recurring_months_read: 1, statements_need_reread: 0, bank_files_need_reread: [] },
    bank: { months, summary, accounts: [], recurring: { payees, months_read: ["2026-01"] }, counted_accounts: [], all_months: null, all_summary: null },
    tax: { years: [] }, profit_and_loss: null, balance_sheet: null,
    expenses: { lines: [], outflow_ratio: null, opex_ratio: null, cogs_ratio: null, debt_service_to_deposits: null },
    debt: { obligations, rows: [], documented: [], document: null, service: { monthly: 10000, source: "debt_schedule", annual: 120000 }, reconciliation: [], schedule: { ...EMPTY_SCHEDULE, status: "received", label: "Saved debt schedule", rows: 3 } },
    plan: { record: { ...record }, evaluation: { active: false }, levers: [], terms_link: null },
    dscr: { candidates: [candidate], headline: candidate, pro_forma_headline: null, annual_debt_service: 120000, debt_service_source: "debt_schedule", proposed: null, thresholds: { acceptable: 1, healthy: 1.25, very_strong: 1.5 }, reason: null, no_debt: false },
    net_profit: { candidates: [], conclusion: null, note: null }, notes: [],
  } as unknown as FinancialCockpit;
}

export default function PayoffReplayFixture() {
  const [reviewed, setReviewed] = useState(false);
  const [reviewRequest, setReviewRequest] = useState(0);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const cockpit = useMemo(() => fixture(reviewed), [reviewed]);
  return <main className="content content--wide" style={{ padding: 16, maxWidth: 1500, margin: "0 auto", display: "grid", gap: 16 }}>
    <header><h1>Payoff replay evidence QA</h1><p>Fictional company and statement figures. No client records or messages are changed.</p></header>
    <div className="row" style={{ flexWrap: "wrap", gap: 12 }}><label>Statement evidence <select aria-label="Statement evidence" value={reviewed ? "reviewed" : "ambiguous"} onChange={(event) => setReviewed(event.target.value === "reviewed")}><option value="ambiguous">Unallocated lender aggregate</option><option value="reviewed">Separate loan-level payment links</option></select></label><Btn onClick={() => setReviewRequest((value) => value + 1)}>Open coverage review</Btn></div>
    {evidenceOpen ? <section aria-label="Evidence and banking review"><h2>Evidence &amp; banking</h2><p>Review each loan's statement payment links before using a bank-balance projection.</p></section> : null}
    <CoverageCard key={reviewed ? "reviewed" : "ambiguous"} businessName="Example Wellness Studio LLC" cockpit={cockpit} profileId={cockpit.profile_id} months={months} summary={summary} accountLabel="All counted accounts" accountKey="counted" canEdit canReviewDebt={false} canCorrectMetrics={false} canRecordTerms={false} termsKind="production" onRecordTerms={() => {}} reviewRequest={reviewRequest} onOpenEvidence={() => setEvidenceOpen(true)} />
  </main>;
}
