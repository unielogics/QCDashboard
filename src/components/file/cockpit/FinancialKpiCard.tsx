import type { ReactNode } from "react";
import { cx, type ChipTone } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import styles from "./FinancialMetricReview.module.css";

export function FinancialKpiCard({ label, value, sub, currencyNote, projection, onClick, children, tone = "mut" }: { label: string; value: ReactNode; sub?: ReactNode; currencyNote?: string; projection?: ReactNode; onClick: () => void; children?: ReactNode; tone?: ChipTone }) {
  return <button type="button" className={cx("kpi", styles.metricCard, `tone-${tone}`)} onClick={onClick} aria-label={`Review ${label}: calculation and source documents`}>
    <span className={styles.metricHeading}><span className="lbl">{label}</span><Icon name="external" size={13} /></span>
    <span className={cx("knum num", styles.metricValue, typeof value === "string" && !/\d/.test(value) && styles.metricProse)}>{value}</span>
    {currencyNote ? <span className={styles.currencyNote}>{currencyNote}</span> : null}
    {sub != null ? <span className="sub">{sub}</span> : null}
    {children}
    {projection != null ? <span className={styles.projection}>{projection}</span> : null}
  </button>;
}
