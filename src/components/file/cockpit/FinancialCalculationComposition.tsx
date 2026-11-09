"use client";

import { useEffect, useState } from "react";
import { Btn, Callout, Input, Textarea } from "@/components/ds";
import { useAuthedApi } from "@/hooks/useApi";
import type { FinancialCockpit } from "@/lib/financialCockpit";
import { metricAmountLabel, metricCurrency, saveFinancialMetricComposition, type MetricCalculation, type MetricRecipe } from "@/lib/financialMetrics";
import { previewMetricComposition } from "@/lib/metricCompositionPreview";
import styles from "./FinancialMetricReview.module.css";

export type CompositionRecipe = MetricRecipe;
export type CompositionDraft = { calculationKey: string; revision: number; sourceStamp: string; action: "compose" | "restore"; components: Array<{ input_key: string; included: boolean }>; adjustments: Array<{ id: string; label: string; amount: string }>; reason: string; idempotencyKey: string };
export const calculationRecipe = (calculation?: MetricCalculation): CompositionRecipe | undefined => calculation?.recipe;
const calculationCurrency = (calculation: MetricCalculation) => metricCurrency(calculation.numerator_currency ?? calculation.currency, calculation.source_refs);
const money = (value: number | null | undefined, calculation: MetricCalculation) => (calculation.recipe?.unit ?? calculation.unit) === "ratio" || calculation.key.startsWith("dscr.") ? value == null ? "Unavailable" : `${value.toFixed(2)}x` : metricAmountLabel(value, calculationCurrency(calculation), 2);

export function FinancialCalculationComposition({ profileId, calculation, revision, canEdit, draft, onDraft, onPending, onSaved, onOpenDebt, onConflict, externallyBusy = false }: {
  profileId: string; calculation: MetricCalculation; revision: number; canEdit: boolean; draft?: CompositionDraft;
  onDraft: (draft: CompositionDraft | undefined) => void; onPending: (pending: boolean) => void;
  onSaved: (cockpit: FinancialCockpit) => Promise<unknown> | void; onOpenDebt: () => void;
  externallyBusy?: boolean;
  onConflict?: () => Promise<unknown> | void;
}) {
  const api = useAuthedApi();
  const recipe = calculationRecipe(calculation);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const locked = busy || externallyBusy;
  const create = (): CompositionDraft | undefined => recipe ? { calculationKey: calculation.key, revision, sourceStamp: recipe.source_stamp, action: "compose", components: recipe.components.map(({ input_key, included }) => ({ input_key, included })), adjustments: (recipe.adjustments ?? []).map((row) => ({ ...row, amount: String(row.amount) })), reason: "", idempotencyKey: crypto.randomUUID() } : undefined;
  useEffect(() => { setError(""); setNotice(""); }, [calculation.key]);
  const current = draft ?? create();
  const stale = !!draft && (draft.revision !== revision || draft.sourceStamp !== recipe?.source_stamp);
  const patch = (change: Partial<CompositionDraft>) => { if (!current || busy || !canEdit) return; onDraft({ ...current, ...change, idempotencyKey: crypto.randomUUID() }); setError(""); setNotice(""); };
  const selected = current?.components.filter((row) => row.included).map((row) => row.input_key) ?? [];
  const reported = selected.some((key) => key.endsWith(".reported_ebitda"));
  const invalidAlternative = reported && selected.length !== 1;
  const toggle = (inputKey: string, included: boolean) => {
    if (!current || !recipe) return;
    const isReported = inputKey.endsWith(".reported_ebitda");
    patch({ action: "compose", components: current.components.map((row) => ({ ...row, included: isReported && included ? row.input_key === inputKey
      : row.input_key === inputKey ? included
        : included && !isReported && row.input_key.endsWith(".reported_ebitda") ? false
          : included && !isReported && recipe.components.find((component) => component.input_key === row.input_key)?.required ? true : row.included })) });
  };
  const invalidAdjustment = current?.adjustments.some((row) => !row.label.trim() || !row.amount.trim() || !Number.isFinite(Number(row.amount))) ?? false;
  const preview = recipe && current ? previewMetricComposition(recipe, current.components, current.adjustments.map((row) => ({ ...row, amount: Number(row.amount) }))) : null;
  const save = async () => {
    if (!current || !recipe || !canEdit || !recipe.can_edit || stale || current.action !== "restore" && (invalidAlternative || invalidAdjustment || !preview?.valid) || current.reason.trim().length < 8 || locked) return;
    setBusy(true); onPending(true); setError(""); setNotice("");
    try {
      const next = await saveFinancialMetricComposition(api, profileId, { calculation_key: calculation.key, action: current.action, components: current.action === "restore" ? [] : current.components, adjustments: current.action === "restore" ? [] : current.adjustments.map((row) => ({ ...row, label: row.label.trim(), amount: Number(row.amount) })), reason: current.reason.trim(), expected_revision: current.revision, source_stamp: current.sourceStamp, idempotency_key: current.idempotencyKey });
      onDraft(undefined); await onSaved(next); setNotice(current.action === "restore" ? "Original calculation restored. Source evidence and review history are preserved." : "Reviewed calculation saved. Current figures and their history have been refreshed.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The calculation review could not be saved."); if (reason && typeof reason === "object" && "status" in reason && reason.status === 409) await onConflict?.(); }
    finally { setBusy(false); onPending(false); }
  };
  if (!recipe) return <p className={styles.note}>A component recipe is not supplied for this metric. Review its formula and source inputs below.</p>;
  return <section className={styles.section} aria-label={`Review calculation components for ${calculation.label}`}>
    <div className={styles.heading}><h3>Reviewed calculation</h3><strong>{money(recipe.reviewed_value ?? calculation.value, calculation)}</strong></div>
    <p className={styles.note}>Include the reviewed source components, then add or deduct identified amounts. Adjustments use the same reporting period as these inputs{calculation.period ? ` (${calculation.period})` : ""}; they are not monthly amounts unless the source period is one month. Source documents and original figures stay intact.</p>
    {!recipe.can_edit || !canEdit ? <Callout tone="acc">Component adjustments are read only for this metric or access level. Use the source input correction or linked workspace where available.</Callout> : null}
    {recipe.current_event ? <p className={styles.note}>Current review: {recipe.current_event.actor_name || "Staff"}{recipe.current_event.at ? ` · ${new Date(recipe.current_event.at).toLocaleString()}` : ""} · {recipe.current_event.reason}</p> : null}
    {current ? <>
      <div className={styles.section}>{recipe.components.map((component) => {
        const included = current.components.find((row) => row.input_key === component.input_key)?.included ?? false;
        return <label className={styles.component} key={component.input_key}><input type="checkbox" checked={included} disabled={locked || !canEdit || !recipe.can_edit || !!component.required && included && !reported} onChange={(event) => toggle(component.input_key, event.target.checked)} /><span><b>{component.label}</b><small>{component.required ? component.input_key === recipe.required_anchor ? "Source income anchor · correct the input to change a loss" : component.role === "deduction" || (component.coefficient ?? 1) < 0 ? "Required deduction · review the evidence to change it" : "Required source component · review the evidence to change it" : included ? component.role === "deduction" || (component.coefficient ?? 1) < 0 ? "Deducted from reviewed numerator" : "Included in reviewed numerator" : "Excluded from reviewed numerator; source value retained"}</small></span><strong>{metricAmountLabel(component.value, calculationCurrency(calculation))}</strong></label>;
      })}</div>
      {invalidAlternative && current.action !== "restore" ? <Callout tone="warn">Choose source-reported EBITDA or its net-income reconciliation components. Combining both would count the same earnings twice.</Callout> : null}
      <div className={styles.intro}><div><span className="sub">Accepted current result</span><strong>{money(recipe.reviewed_value ?? calculation.value, calculation)}</strong></div><div><span className="sub">Working review result · awaiting Save</span><strong>{money(current.action === "restore" ? recipe.base_value : invalidAlternative || invalidAdjustment ? null : preview?.value, calculation)}</strong>{preview?.subtotal != null && current.action !== "restore" ? <small>Source-period numerator {metricAmountLabel(preview.subtotal, calculationCurrency(calculation))}{recipe.annualization_factor != null && recipe.annualization_factor !== 1 ? ` × ${recipe.annualization_factor}` : ""}</small> : null}</div></div>
      {preview?.error && current.action !== "restore" ? <p className={styles.note}>{preview.error}</p> : null}
      {recipe.annualization_factor != null && recipe.annualization_factor !== 1 ? <p className={styles.note}>The reviewed source-period numerator is annualized × {recipe.annualization_factor} before calculating DSCR.</p> : null}
      {recipe.annualize_before_rounding ? <p className={styles.note}>Annualization uses full-precision source amounts; the displayed period subtotal is rounded to cents.</p> : null}
      {recipe.denominator ? <p className={styles.note}>{recipe.denominator.label}: {metricAmountLabel(recipe.denominator.value, "USD")}. <button type="button" className="linky" disabled={locked} onClick={onOpenDebt}>Review debt-service obligations</button>. Debt is adjusted through the shared schedule rather than removed from this denominator with an earnings checkbox.</p> : null}
      <div className={styles.section}>{current.adjustments.map((row, index) => <div className={styles.adjustment} key={row.id}><label>Adjustment label<Input aria-label={`Calculation adjustment ${index + 1} label`} value={row.label} disabled={locked || !canEdit || !recipe.can_edit} maxLength={120} onChange={(event) => patch({ action: "compose", adjustments: current.adjustments.map((item) => item.id === row.id ? { ...item, label: event.target.value } : item) })} /></label><label>Signed period amount<Input aria-label={`Calculation adjustment ${index + 1} amount`} inputMode="decimal" value={row.amount} disabled={locked || !canEdit || !recipe.can_edit} placeholder="-500 or 500" onChange={(event) => patch({ action: "compose", adjustments: current.adjustments.map((item) => item.id === row.id ? { ...item, amount: event.target.value } : item) })} /></label><Btn size="sm" disabled={locked || !canEdit || !recipe.can_edit} onClick={() => patch({ action: "compose", adjustments: current.adjustments.filter((item) => item.id !== row.id) })}>Remove</Btn></div>)}</div>
      {canEdit && recipe.can_edit ? <><Btn size="sm" disabled={locked || current.adjustments.length >= 20} onClick={() => patch({ action: "compose", adjustments: [...current.adjustments, { id: crypto.randomUUID(), label: "", amount: "" }] })}>Add or deduct an amount</Btn><label className={styles.reviewReason}>Review reason<Textarea aria-label="Calculation review reason" rows={3} value={current.reason} disabled={locked} onChange={(event) => patch({ reason: event.target.value })} placeholder="Explain the reviewed inclusion, exclusion or adjustment" /></label></> : null}
      {stale ? <Callout tone="warn">The evidence or another financial review changed. Your working adjustments are retained. Reload the current recipe before submitting a new review.</Callout> : null}
      {error ? <Callout tone="bad">{error}</Callout> : null}{notice ? <p className={styles.note} role="status">{notice}</p> : null}
      {canEdit && recipe.can_edit ? <div className={styles.actions}><Btn size="sm" disabled={locked} onClick={() => { onDraft(undefined); setError(""); setNotice(""); }}>Reload current recipe</Btn>{recipe.current_event ? <Btn size="sm" disabled={locked} onClick={() => patch({ action: "restore", adjustments: [] })}>Restore original calculation</Btn> : null}<Btn variant="pri" size="sm" disabled={locked || !draft || stale || current.action !== "restore" && (invalidAlternative || invalidAdjustment || !preview?.valid) || current.reason.trim().length < 8} onClick={() => void save()}>{busy ? "Saving review…" : current.action === "restore" ? "Save original calculation restoration" : "Save reviewed calculation"}</Btn></div> : null}
      {current.action === "restore" ? <p className={styles.note}>Save will restore the original source-bound calculation. Its prior reviews remain in history.</p> : null}
    </> : null}
  </section>;
}
