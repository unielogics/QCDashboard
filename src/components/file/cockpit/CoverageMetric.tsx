import { multiple } from "@/lib/financialCockpit";
import styles from "./CoverageMetric.module.css";

/** A loss has no positive coverage. Its signed quotient remains visible as context. */
export function CoverageMetric({ incomeAnnual, value, noDebt = false, pending = false, basis, compact = false }: {
  incomeAnnual: number | null; value: number | null; noDebt?: boolean; pending?: boolean; basis?: string; compact?: boolean;
}) {
  const loss = incomeAnnual != null && Number.isFinite(incomeAnnual) && incomeAnnual < 0;
  const zero = incomeAnnual === 0;
  const primary = pending ? "Needs review" : noDebt ? "No debt service" : loss ? "Negative earnings" : zero ? "Break-even earnings" : multiple(value);
  return <div className={compact ? styles.compact : styles.hero}>
    <strong>{primary}</strong>
    {basis ? <span>{basis}</span> : null}
    {!pending && (loss || zero) ? <small>{noDebt ? "DSCR not applicable · " : `Signed DSCR ${multiple(value)} · `}{loss ? "Operating loss remains" : "No earnings available for debt payments"}</small> : null}
  </div>;
}
