import type { OperatingBankReplay, OperatingEvaluation } from "@/lib/operatingPlan";
import { metricAmountLabel } from "@/lib/financialMetrics";
import styles from "./OperatingPlanComparison.module.css";

type ComparisonRow = {
  key: string;
  label: string;
  before: number | null | undefined;
  after: number | null | undefined;
  kind?: "ratio" | "count";
  currency?: string | null;
  lowerIsBetter?: boolean;
  originalNoDebt?: boolean;
  plannedNoDebt?: boolean;
  suppressChange?: boolean;
  changeUnavailable?: boolean;
  note?: string;
};

export type OperatingPlanComparisonProps = {
  evaluation?: OperatingEvaluation | null;
  baselineEvaluation?: OperatingEvaluation | null;
  pending?: boolean;
  currency?: string | null;
};

const known = (value: number | null | undefined): value is number =>
  value != null && Number.isFinite(value);

function observedMonths(bank: OperatingBankReplay, key: "net_months_observed" | "ending_months_observed" | "low_balance_months_observed") {
  const before = bank.before[key];
  const after = bank.after[key];
  if (!bank.month_count || before === bank.month_count && after === bank.month_count) return undefined;
  return `Observed months · original ${before} of ${bank.month_count}, with financing ${after} of ${bank.month_count}`;
}

/** The working operating comparison and the saved financing replay retain their own scopes. */
export function OperatingPlanComparison({ evaluation, baselineEvaluation, pending = false, currency }: OperatingPlanComparisonProps) {
  const comparison = evaluation?.comparison;
  const original = comparison?.baseline ?? baselineEvaluation?.comparison?.baseline;
  const source = evaluation?.baseline ?? baselineEvaluation?.baseline;
  const proposed = comparison?.proposed;
  const payment = comparison?.payment_breakdown ?? baselineEvaluation?.comparison?.payment_breakdown;
  const currentPayment = comparison?.payment_breakdown;
  const operatingCurrency = currency === undefined ? source?.currency : currency;
  const originalEarnings = original ? original.earnings : source?.earnings;
  const plannedEarnings = proposed?.earnings;
  const originalDebt = original ? original.debt_service : source?.annual_debt_service;
  const plannedDebt = proposed?.debt_service;
  const nonpositiveEarnings = known(originalEarnings) && originalEarnings <= 0 || known(plannedEarnings) && plannedEarnings <= 0;
  const earningsLabel = source?.earnings_kind?.toLowerCase().includes("ebitda") ? "EBITDA / year" : "Earnings available for debt service / year";
  const rows: ComparisonRow[] = [
    { key: "earnings", label: earningsLabel, before: originalEarnings, after: plannedEarnings, currency: operatingCurrency },
    { key: "noi", label: "Operating income (NOI) / year", before: original ? original.noi : source?.noi, after: proposed?.noi,
      currency: source?.noi_currency ?? source?.noi_governance?.currency ?? operatingCurrency },
    { key: "dscr", label: "Debt service coverage", before: original ? original.dscr : source?.dscr, after: proposed?.dscr,
      kind: "ratio", originalNoDebt: originalDebt === 0, plannedNoDebt: plannedDebt === 0, suppressChange: nonpositiveEarnings },
    { key: "regular_debt", label: "Regular debt payments / month", before: payment?.regular_before_monthly,
      after: currentPayment?.regular_after_monthly, lowerIsBetter: true, currency: "USD" },
    { key: "coverage_debt", label: "Annual debt used for DSCR", before: originalDebt, after: plannedDebt, lowerIsBetter: true, currency: "USD",
      note: comparison?.loan_basis === "saved_terms" ? "Uses the saved loan's coverage basis. See loan payment details for any principal due at maturity." : undefined },
    { key: "cash", label: "Cash after debt / month", before: known(original?.cash_after_debt) ? original.cash_after_debt / 12 : null,
      after: known(proposed?.cash_after_debt) ? proposed.cash_after_debt / 12 : null, currency: operatingCurrency,
      note: "Earnings less debt payments and modeled cash changes." },
  ];
  const bank = comparison?.bank_replay ?? baselineEvaluation?.comparison?.bank_replay;
  const currentBank = comparison?.bank_replay;
  const bankAfter = currentBank?.replay_available ? currentBank.after : undefined;
  const bankRows: ComparisonRow[] = bank ? [
    { key: "bank_net", label: "Average net cash flow / month", before: bank.before.net_monthly, after: bankAfter?.net_monthly,
      currency: bank.currency, changeUnavailable: !bank.complete, note: observedMonths(bank, "net_months_observed") },
    { key: "bank_ending", label: "Ending balance, last statement month", before: bank.before.ending_balance, after: bankAfter?.ending_balance,
      currency: bank.currency, changeUnavailable: !bank.complete, note: observedMonths(bank, "ending_months_observed") },
    { key: "bank_negative", label: "Months dipping below zero", before: bank.before.low_balance_months_observed > 0 ? bank.before.negative_months : null,
      after: bankAfter && bankAfter.low_balance_months_observed > 0 ? bankAfter.negative_months : null, kind: "count", lowerIsBetter: true,
      changeUnavailable: !bank.complete, note: observedMonths(bank, "low_balance_months_observed") },
  ] : [];
  const format = (row: ComparisonRow, amount: number | null | undefined, side?: "original" | "planned") => {
    if (row.kind === "ratio" && (side === "original" ? row.originalNoDebt : row.plannedNoDebt)) return "No debt service";
    if (!known(amount)) return "—";
    if (row.kind === "ratio") return `${amount.toFixed(2)}x`;
    if (row.kind === "count") return amount.toLocaleString();
    return metricAmountLabel(amount, row.currency);
  };
  const renderRow = (row: ComparisonRow) => {
    const delta = known(row.before) && known(row.after) ? row.after - row.before : null;
    const direction = delta == null || delta === 0 ? undefined : (row.lowerIsBetter ? delta < 0 : delta > 0) ? styles.improved : styles.worse;
    const undefinedRatio = row.kind === "ratio" && (row.originalNoDebt || row.plannedNoDebt);
    const change = pending ? "Calculating." : row.suppressChange ? "See funding shortfall" : undefinedRatio || row.changeUnavailable || delta == null ? "—" :
      `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${format(row, Math.abs(delta))}`;
    return <tr key={row.key}>
      <th scope="row">{row.label}{row.note ? <small>{row.note}</small> : null}</th>
      <td>{format(row, row.before, "original")}</td>
      <td className={styles.planned}>{pending ? "Calculating." : format(row, row.after, "planned")}</td>
      <td className={row.suppressChange || row.changeUnavailable || undefinedRatio || pending ? undefined : direction}>{change}</td>
    </tr>;
  };
  const bankReason = bank?.replay_reason === "no_bank_months" ? "Bank statements are needed for the financing replay." :
    bank?.replay_reason === "not_saved" ? "Save the financing plan to calculate its statement replay." :
    bank?.replay_reason === "currency_unconfirmed" ? "Confirm USD statement figures to compare the financing replay." :
    bank?.replay_reason === "financing_inputs_incomplete" ? "Complete the financing inputs to calculate the statement replay." : null;
  return <section className={styles.comparison} aria-label="Original and planned financial comparison" aria-busy={pending}>
    <header><div><h4>Original, with the plan, and the difference</h4><p>Operating plan changes and saved financing terms</p></div></header>
    <div className={styles.scroll} role="region" aria-label="Financial comparison table" tabIndex={0}>
      <table>
        <thead><tr><th scope="col">Figure</th><th scope="col">Original</th><th scope="col">With the plan</th><th scope="col">Change</th></tr></thead>
        <tbody>{rows.map(renderRow)}</tbody>
        {bank ? <tbody><tr className={styles.scope}><th colSpan={4}>Saved financing plan · bank replay
          <small>{bank.month_count} statement month{bank.month_count === 1 ? "" : "s"}{bank.complete ? "" : " · partial observations"} · operating changes appear in the comparison above</small>
        </th></tr>{bankRows.map(renderRow)}</tbody> : null}
      </table>
    </div>
    {bankReason ? <p className={styles.note}>{bankReason}</p> : null}
  </section>;
}
