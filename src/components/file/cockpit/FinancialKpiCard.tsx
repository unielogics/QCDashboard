import type { ReactNode } from "react";
import { cx, type ChipTone } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import styles from "./FinancialMetricReview.module.css";

export function FinancialKpiCard({ label, value, sub, projection, onClick, children, tone = "mut" }: { label: string; value: ReactNode; sub?: ReactNode; projection?: ReactNode; onClick: () => void; children?: ReactNode; tone?: ChipTone }) {
  return <button type="button" className={cx("kpi", styles.metricCard, `tone-${tone}`)} onClick={onClick} aria-label={`Review ${label}: calculation and source documents`}>
    <span className={styles.metricHeading}><span className="lbl">{label}</span><Icon name="external" size={13} /></span>
    <span className="knum num">{value}</span>
    {sub != null ? <span className="sub">{sub}</span> : null}
    {children}
    <span className={styles.projection}>{projection ?? <span className={styles.metricHint}>Sources and calculation details</span>}</span>
  </button>;
}
