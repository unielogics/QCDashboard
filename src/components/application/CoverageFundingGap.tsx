import type { coverageReview } from "@/lib/coverageReview";
import styles from "./LoanScheduleReview.module.css";

type Review = ReturnType<typeof coverageReview>;
const money = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "Unavailable" : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const number = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);

export function CoverageFundingGap({ value, basis }: { value?: Review | null; basis: string }) {
  if (!value?.hasNonpositiveEarnings) return null;
  return <section className={styles.coverageGap} aria-label="Coverage with zero or negative earnings">
    <h4>Coverage shortfall · annual earnings vs debt service</h4>
    <p>Basis: {basis}. Earnings are {number(value.before.incomeAnnual)} today → {number(value.after.incomeAnnual)} with the plan; annual debt service is {money(value.before.debtServiceAnnual)} → {money(value.after.debtServiceAnnual)}.</p>
    <dl><div><dt>Shortfall today</dt><dd>{money(value.before.cashShortfallAnnual)}</dd></div><div><dt>Shortfall with the plan</dt><dd>{money(value.after.cashShortfallAnnual)}</dd></div><div><dt>Annual payment savings</dt><dd>{value.debtServiceSavingsAnnual == null ? "—" : `${value.debtServiceSavingsAnnual > 0 ? "+" : ""}${money(value.debtServiceSavingsAnnual)}`}</dd></div></dl>
    {value.note ? <p>{value.note}</p> : null}
    <p>This compares the selected annual earnings basis with payments due. Bank balances and dated cash movements are reviewed separately.</p>
  </section>;
}
