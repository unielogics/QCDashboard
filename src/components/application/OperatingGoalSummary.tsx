"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { metricAmountLabel } from "@/lib/financialMetrics";
import { operatingWorkingFeedback } from "@/lib/operatingPlanFeedback";
import type { OperatingEvaluation } from "@/lib/operatingPlan";
import { operatingNumber } from "@/lib/operatingPlan";
import { operatingGoalAxis, operatingGoalReady, type OperatingGoalRead, type OperatingGoalProgress } from "@/lib/operatingGoal";
import { OperatingAmountInput } from "./OperatingAmountInput";
import styles from "./OperatingGoalSummary.module.css";
export function StaffOperatingGoal({ goal, currencySuggestion, disabled, saving, error, onSave, onCancel, onReload }: { onReload?: () => void; goal: OperatingGoalRead; currencySuggestion?: string | null; disabled?: boolean; saving?: boolean; error?: string; onSave: (amount: number, currency: string) => Promise<unknown>; onCancel?: () => void }) {
  const [amount, setAmount] = useState<string | number | null>(goal.amount), [currency, setCurrency] = useState(goal.currency || currencySuggestion || "");
  const seededCurrency = useRef(Boolean(goal.currency || currencySuggestion));
  useEffect(() => { if (!seededCurrency.current && currencySuggestion && !currency) { seededCurrency.current = true; setCurrency(currencySuggestion); } }, [currencySuggestion, currency]);
  const parsed = operatingNumber(amount), valid = parsed != null && parsed > 0 && /^[A-Z]{3}$/.test(currency);
  const dirty = String(amount ?? "") !== String(goal.amount ?? "") || currency !== (goal.currency || currencySuggestion || "");
  useEffect(() => { const guard = (event: BeforeUnloadEvent) => { if (dirty || saving) { event.preventDefault(); event.returnValue = ""; } }; window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard); }, [dirty, saving]);
  return <section className={styles.setup} aria-label="Staff annual NOI goal setup"><div><strong>{operatingGoalReady(goal) ? "Edit annual NOI goal" : "Set the annual NOI goal first"}</strong><small>Annual operating-plan NOI, before additional loan operating charges.</small></div><label>Annual NOI goal<OperatingAmountInput label="Annual NOI goal" value={amount} disabled={disabled || saving} onCommit={setAmount} invalid={amount != null && amount !== "" && (parsed == null || parsed <= 0)} /></label><label>Currency<input aria-label="Goal currency" maxLength={3} value={currency} disabled={disabled || saving} onChange={event => { seededCurrency.current = true; setCurrency(event.target.value.toUpperCase()); }} /></label><button type="button" disabled={disabled || saving || !valid} onClick={() => { if (valid) void onSave(parsed!, currency); }}>{saving ? "Saving goal…" : "Save annual NOI goal"}</button>{onCancel ? <button type="button" disabled={saving} onClick={onCancel}>Cancel</button> : null}{error ? <p className={styles.error} role="alert">{error} Your entry is retained. {onReload ? <button type="button" onClick={onReload}>Reload saved goal</button> : null}</p> : null}</section>;
}
export function OperatingGoalSummary({ goal, progress, baseline, pending, control, hasChanges = true, feedback, workingStep = false, onFix, fundingSummary }: { fundingSummary?: ReactNode; workingStep?: boolean; onFix?: () => void; feedback?: OperatingEvaluation | null; hasChanges?: boolean; goal?: OperatingGoalRead | null; progress?: OperatingGoalProgress | null; baseline?: OperatingGoalProgress | null; pending?: boolean; control?: ReactNode }) {
  if (!goal) return fundingSummary ? <section className={styles.summary} aria-label="Plan funding">{fundingSummary}</section> : null;
  const mismatch = Boolean(progress && progress.goal_revision !== goal.revision);
  const source = mismatch ? null : progress || (baseline?.goal_revision === goal.revision ? baseline : null);
  const working = !pending && progress?.goal_revision === goal.revision && !mismatch ? operatingWorkingFeedback(feedback) : null;
  const beforeSetup = working ? working.basis === "draft" : !mismatch && progress?.proposed_noi == null && progress?.draft_noi_before_implementation != null;
  const current = working ? working.current : source?.current_noi ?? null;
  const projected = pending || mismatch ? null : working ? working.after : source?.proposed_noi ?? source?.draft_noi_before_implementation ?? null;
  const currency = working ? working.currency : source?.currency || goal.currency;
  const comparable = operatingGoalReady(goal) && source?.status === "calculated" && source.currency === goal.currency && currency === goal.currency;
  const money = (amount?: number | null) => metricAmountLabel(amount, currency);
  const gap = mismatch ? null : hasChanges ? pending ? null : working ? working.gap : source?.proposed_gap ?? (beforeSetup ? source?.draft_gap : null) ?? null : source?.current_gap ?? null;
  const axis = operatingGoalAxis([current, workingStep ? projected : null, goal.amount]);
  const canPlot = comparable && current != null && goal.amount != null;
  const blocked = !pending && (!comparable || workingStep && hasChanges && projected == null);
  const issue = mismatch ? "Refresh the goal" : source?.status === "currency_mismatch" ? "Confirm source currency" : working?.sourceBlocked ? "Review source costs" : "Finish change inputs";
  return <section className={`${styles.summary} ${blocked ? styles.attention : ""}`} aria-label="Annual NOI goal progress" aria-busy={pending}>
    <div className={styles.figures}>
      <span><small>Current NOI / year</small><strong className={current != null && current < 0 ? styles.negative : undefined}>{comparable && current != null ? money(current) : <button type="button" onClick={onFix}>Confirm source</button>}</strong></span>
      {workingStep ? <span className={styles.planned}><small>Planned NOI / year</small><strong className={projected != null && projected < 0 ? styles.negative : styles.positive}>{pending ? "Updating…" : !hasChanges && current != null && comparable ? money(current) : comparable && projected != null ? money(projected) : <button type="button" onClick={onFix}>{issue}</button>}</strong>{working?.delta != null && comparable ? <small className={working.delta < 0 ? styles.negative : styles.positive}>Δ {working.delta > 0 ? "+" : ""}{money(working.delta)}</small> : null}</span> : <span className={styles.reviewHint}>Confirm the imported figures to start planning.</span>}
      <span><small>NOI goal / year</small><strong>{mismatch ? "Changed — refresh" : goal.amount == null ? "Set goal" : !goal.currency ? "Confirm currency" : metricAmountLabel(goal.amount, goal.currency)}</strong>{control}</span>
      {workingStep && gap != null && comparable ? <span><small>Gap to goal</small><strong className={gap > 0 ? styles.negative : styles.positive}>{money(gap)}</strong></span> : null}
    </div>
    {canPlot ? <svg className={styles.axis} viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label={`Annual NOI: current ${money(current)}, zero${workingStep && projected != null ? `, planned ${money(projected)}` : ""}, goal ${money(goal.amount)}`}>
      <line x1="8" y1="4" x2="92" y2="4" className={styles.track} />
      {workingStep && projected != null ? <line x1={axis.position(current!)} y1="4" x2={axis.position(projected)} y2="4" className={projected < current! ? styles.badPath : styles.goodPath} /> : null}
      <line x1={axis.position(0)} y1="1" x2={axis.position(0)} y2="7" className={styles.zero} />
      <circle cx={axis.position(current!)} cy="4" r="1.1" className={current! < 0 ? styles.badDot : styles.currentDot} />
      {workingStep && projected != null ? <circle cx={axis.position(projected)} cy="4" r="1.3" className={projected < 0 ? styles.badDot : styles.goodDot} /> : null}
      <line x1={axis.position(goal.amount!)} x2={axis.position(goal.amount!)} y1="0.5" y2="7.5" className={styles.target} />
    </svg> : null}
    {workingStep ? <small className={styles.legend}>{source?.status === "currency_mismatch" ? "Source and goal currencies differ; no conversion is applied." : beforeSetup ? "Draft—before setup/timing. Complete the highlighted change inputs." : "Annual run-rate assumptions · subject to review."}</small> : null}
    {fundingSummary ? <div className={styles.funding}>{fundingSummary}</div> : null}
  </section>;
}
