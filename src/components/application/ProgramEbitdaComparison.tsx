"use client";
import { Btn, CellChip } from "@/components/ds";
import type { ProgramFitCandidate } from "@/lib/applicationProfile";
import { metricAmountLabel } from "@/lib/financialMetrics";
import styles from "./FundingProgramPicker.module.css";
export function programEbitdaCheckOutcome(state: string | undefined, negated = false) {
  if (state !== "pass" && state !== "fail") return { label: "Needs evidence", tone: "warn" as const };
  if (negated) return state === "pass" ? { label: "Excluded condition matches", tone: "bad" as const } : { label: "Excluded condition does not match", tone: "ok" as const };
  return state === "pass" ? { label: "Meets this check", tone: "ok" as const } : { label: "Does not meet this check", tone: "bad" as const };
}

export function ProgramEbitdaComparison({ candidate, onPreviewSource, onRequestEvidence }: { candidate: ProgramFitCandidate; onPreviewSource?: (fileId: string, page?: number) => void; onRequestEvidence?: () => void }) {
  const rules = candidate.rule_results?.filter((rule) => rule.field === "annual_ebitda") ?? [];
  if (!rules.length) return null;
  const source = candidate.fact_sources?.annual_ebitda;
  const number = (value: unknown, currency: string | null | undefined) => typeof value === "number" && Number.isFinite(value) ? metricAmountLabel(value, currency, 0) : "Not established";
  const operators: Record<string, string> = { gte: "at least", gt: "more than", lte: "at most", lt: "less than", eq: "equal to", present: "must be provided" };
  return <div className={styles.financialCheck} aria-label={`Annual EBITDA qualification for ${candidate.program_name}`}>
    <strong>Factual annual EBITDA · criteria v{candidate.playbook_version ?? "unknown"}</strong>
    {rules.map((rule, index) => { const state = rule.status || rule.state; const operator = rule.operator || rule.op || ""; const outcome = programEbitdaCheckOutcome(state, rule.negated); return <div key={index}>
      <CellChip tone={outcome.tone}>{outcome.label}</CellChip>
      <p>{rule.negated ? "Excluded by NOT" : "Required"}: {operators[operator] || "review condition"}{operator !== "present" ? ` ${number(rule.required, "USD")}` : ""} · Observed: {number(rule.observed, source?.currency)}</p>
    </div>; })}
    <p>{source?.period || "Reporting period not established"}{source?.months_covered != null ? ` · ${source.months_covered} months` : ""}{source?.annualization_factor != null ? ` · annualization × ${source.annualization_factor}` : ""} · {source?.accounting_basis || "accounting basis unconfirmed"} · {source?.verification_status || "verification not established"}</p>
    {source?.corrected_inputs?.length ? <p>Includes reviewed staff corrections.</p> : null}{source?.reason ? <p>{source.reason}</p> : null}<p>Verified factual USD P&amp;L evidence only. Hypothetical refinance addbacks do not qualify. These are component checks; overall program fit includes all AND, OR and NOT conditions.</p>
    <div className="row">{source?.source_refs?.slice(0, 3).map((reference, index) => reference.file_id && onPreviewSource ? <Btn key={`${reference.file_id}:${index}`} size="sm" onClick={() => onPreviewSource(reference.file_id!, reference.pages?.[0])}>{reference.file_name || "Review P&L source"}</Btn> : null)}{source?.action === "request_or_review_profit_and_loss" && onRequestEvidence ? <Btn size="sm" onClick={onRequestEvidence}>Request P&amp;L evidence</Btn> : null}</div>
  </div>;
}
