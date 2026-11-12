// Fictional marketplace data for the real authenticated shell regression.
import type { MarketplacePpm } from "../../src/lib/marketplacePpm";
import { reviewListing, reviewState, reviewVersion } from "./ppmReviewFlow";
import { investorEconomicsCases } from "./investorEconomics";

export function shellListing() {
  return { ...reviewListing("none"), name: "Synthetic shell and fees offering", loan_amount: "100000", offered_amount: "100000", minimum_investment: "100000", note_rate_pct: "12", term_months: 12 };
}
export function shellPpm(): MarketplacePpm {
  const version = reviewVersion(4); version.document.sections[0].facts[0].value = "100,000.00 USD";
  version.document.sections.push(...Array.from({ length: 12 }, (_, index) => ({ key: `synthetic_disclosure_${index}`, title: `Synthetic disclosure ${index + 1}`, paragraphs: ["This fictional disclosure exercises native saved-text expansion and document scrolling. ".repeat(5)], facts: [] })));
  return { ...reviewState(version), active_version: null, working_draft_document_id: version.document_id, latest_version: 4 };
}
export function shellBudget(canEdit = true) {
  return { ...structuredClone(investorEconomicsCases.base.budget), profile_id: shellListing().profile_id, can_edit: canEdit, investor_funding_amount: null, minimum_investor_contribution: null, calculation: structuredClone(investorEconomicsCases.company.calculation) };
}
/** Two saved server-response snapshots; the UI does not calculate these figures. */
export function shellFeeCalculation(rate: number) {
  if (rate !== 1 && rate !== 2) throw new Error("Synthetic shell fixture supports the recorded 1% and 2% cases only.");
  const result = structuredClone(investorEconomicsCases.company.calculation);
  if (rate === 2) {
    result.investor_fees = 360; result.investor_net_income = 11640; result.investor_net_roi_pct = 11.64;
    result.rows[0].total_amount = 240; result.rows[0].recurring_total = 240;
    Object.assign(result.investor_scenarios.full_term, { total_fees: 360, known_fee_subtotal: 360, scheduled_net_income: 11640, net_income: 11640, net_roi_pct: 11.64, net_cash_profit: 11640, net_cash_received: 111640 });
    Object.assign(result.investor_scenarios.six_month_payoff, { total_fees: 180, known_fee_subtotal: 180, scheduled_net_income: 5820, net_income: 5820, net_roi_pct: 5.82, net_cash_profit: 5820, net_cash_received: 105820 });
  }
  return result;
}
