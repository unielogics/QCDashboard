import { CellChip } from "@/components/ds";
import type { CreditRiskReview as Review } from "@/lib/types";

export function CreditRiskReview({ review }: { review: Review }) {
  return <section className="credit-risk-review" aria-label="Credit risk review">
    <header><div><h3>Credit review flags</h3><p>Report dated {review.as_of}</p></div><CellChip tone={review.high_count ? "bad" : review.flag_count ? "warn" : "mut"}>{review.flag_count} flags · {review.high_count} high priority</CellChip></header>
    {review.flags.length ? <div className="credit-risk-findings">{review.flags.map((flag) => <details key={flag.id} className={flag.severity === "high" ? "is-high" : ""}>
      <summary><span className="credit-risk-dot" /><strong>{flag.title}</strong><span>{flag.severity === "high" ? "High priority" : "Review"}</span></summary>
      <div><p>{flag.detail}</p><dl>{Object.entries(flag.evidence).map(([name, value]) => <div key={name}><dt>{name.replaceAll("_", " ")}</dt><dd>{String(value)}</dd></div>)}</dl><small>Source: {flag.source.replace(/trade_accounts\[(\d+)\]/, (_, index) => `Trade account ${Number(index) + 1}`).replace(/public_records\[(\d+)\]/, (_, index) => `Public record ${Number(index) + 1}`).replace(/collections\[(\d+)\]/, (_, index) => `Collection ${Number(index) + 1}`)}</small></div>
    </details>)}</div> : <p>No supported risk flags detected in the available report data.</p>}
    {review.limitations.length ? <ul className="credit-risk-limitations">{review.limitations.map((text) => <li key={text}>{text}</li>)}</ul> : null}
    <small>{review.advisory}</small>
  </section>;
}
