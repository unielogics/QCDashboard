import type { coverageReview } from "@/lib/coverageReview";
import styles from "./LoanScheduleReview.module.css";

type Review = ReturnType<typeof coverageReview>;
const money = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "Unavailable" : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const number = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);

export function CoverageFundingGap({ value, basis }: { value?: Review | null; basis: string }) {
  if (!value?.hasNonpositiveEarnings) return null;
  const reduction = value.shortfallReductionAnnual;
  const monthlyRelief = value.debtServiceSavingsAnnual == null ? null : value.debtServiceSavingsAnnual / 12;
  return <section className={styles.coverageGap} aria-label="Coverage with zero or negative earnings">
    <h4>{reduction == null ? "Review the coverage shortfall" : reduction > 0 ? "The plan reduces the funding shortfall" : reduction < 0 ? "The plan increases the funding shortfall" : "The funding shortfall is unchanged"}</h4>
    {reduction != null && reduction !== 0 ? <p className={styles.coverageGapChange} aria-live="polite">{money(Math.abs(reduction))} {reduction > 0 ? "less" : "more"} annual funding needed</p> : null}
    <dl><div><dt>Annual shortfall today</dt><dd>{money(value.before.cashShortfallAnnual)}</dd></div><div><dt>Annual shortfall with the plan</dt><dd>{money(value.after.cashShortfallAnnual)}</dd></div><div><dt>{monthlyRelief != null && monthlyRelief < 0 ? "Monthly debt-service increase (coverage basis)" : "Monthly debt-service relief (coverage basis)"}</dt><dd>{monthlyRelief == null ? "Unavailable" : money(Math.abs(monthlyRelief))}</dd></div></dl>
    {value.note ? <p>{value.note}</p> : null}
    <details><summary>How these figures are calculated</summary><p>Basis: {basis}. Annual earnings are {number(value.before.incomeAnnual)} today → {number(value.after.incomeAnnual)} with the plan; annual debt service is {money(value.before.debtServiceAnnual)} → {money(value.after.debtServiceAnnual)}. Funding shortfall = debt service minus earnings, with a minimum of zero. This uses the underwriting debt-service basis, including maturity principal where applicable. It is separate from bank balances and dated cash movements.</p></details>
  </section>;
}
