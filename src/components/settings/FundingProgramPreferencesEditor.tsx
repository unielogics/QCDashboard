"use client";

import { Btn, Callout, Input, Select } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { ValidatedField as Field, ValidationTarget } from "./FundingProgramValidation";
import { FIT_FIELDS, readSimpleFit, type FitCondition } from "./fundingProgramEditorModel";
import { newRecommendationPreference, preferenceCondition, readRecommendationPreferences, type RecommendationPreference } from "./fundingProgramPreferenceModel";
import styles from "./FundingProgramPreferences.module.css";

export function FundingProgramPreferencesEditor({ rules, onChange }: { rules: Record<string, unknown>; onChange: (rules: Record<string, unknown>) => void }) {
  const rows = readRecommendationPreferences(rules);
  function replace(next: RecommendationPreference[]) { onChange({ ...rules, recommendation_preferences: next }); }
  function update(index: number, patch: Partial<RecommendationPreference>) { if (rows) replace(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row)); }
  return <ValidationTarget target="Recommendation preferences"><details className={styles.root}><summary>Recommendation preferences <span>{rows?.length ? `${rows.length} configured` : "Optional"}</span></summary><div className={styles.body}>
    <p>Prefer this program only after its eligibility checks pass. These settings influence ranking; they do not approve financing or replace a manual or existing program selection.</p>
    {!rows ? <Callout tone="warn">Advanced preference settings are preserved. Review their full configuration in Advanced settings.</Callout> : <>
      {rows.map((row, index) => {
        const condition = preferenceCondition(row);
        const field = FIT_FIELDS.find((item) => item.key === condition?.field);
        const editable = condition && field && readSimpleFit({ fit: row.when }) !== null;
        function updateCondition(patch: Partial<FitCondition>) { if (condition) update(index, { when: { ...condition, ...patch } }); }
        return <div className={styles.card} key={row.key}>
          <div className={styles.heading}><Field label="Preference name"><Input aria-label={`Preference ${index + 1} name`} value={row.label} maxLength={200} placeholder="Describe when this program should rank higher" onChange={(event) => update(index, { label: event.target.value })} /></Field><Btn aria-label={`Remove preference ${index + 1}`} onClick={() => replace(rows.filter((_, rowIndex) => rowIndex !== index))}><Icon name="x" size={16} /></Btn></div>
          <ValidationTarget target={`Preference ${index + 1} condition`}>
            {editable ? <div className={styles.condition}>
              <Field label="Prefer when"><Select aria-label={`Preference ${index + 1} metric`} value={condition.field} onChange={(event) => { const next = FIT_FIELDS.find((item) => item.key === event.target.value)!; update(index, { when: { field: next.key, op: next.type === "number" ? "gte" : "eq", value: next.type === "boolean" ? true : "" } }); }}>{FIT_FIELDS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field>
              <Field label="Condition"><Select aria-label={`Preference ${index + 1} operator`} value={condition.op} onChange={(event) => { const op = event.target.value; update(index, { when: { field: condition.field, op, ...(op !== "present" ? { value: condition.value ?? (field.type === "boolean" ? true : "") } : {}) } }); }}>{field.type === "number" ? <><option value="gte">At least</option><option value="lte">At most</option><option value="gt">More than</option><option value="lt">Less than</option></> : null}<option value="eq">Equals</option><option value="present">Must be provided</option></Select></Field>
              <Field label="Value" target={`Preference ${index + 1} threshold`}>{condition.op === "present" ? <Input disabled value="No value needed" aria-label={`Preference ${index + 1} threshold`} /> : field.type === "boolean" ? <Select aria-label={`Preference ${index + 1} threshold`} value={String(condition.value)} onChange={(event) => updateCondition({ value: event.target.value === "true" })}><option value="true">Yes</option><option value="false">No</option></Select> : <Input aria-label={`Preference ${index + 1} threshold`} type={field.type === "number" ? "number" : "text"} step="any" value={String(condition.value ?? "")} onChange={(event) => updateCondition({ value: field.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value })} />}</Field>
            </div> : <p className={styles.note}>This preference has advanced conditions. They are preserved unchanged; edit them in Advanced settings.</p>}
          </ValidationTarget>
          <Field label="Ranking points (1–100)"><Input aria-label={`Preference ${index + 1} ranking points`} type="number" min={1} max={100} step={1} value={String(row.score)} onChange={(event) => update(index, { score: event.target.value === "" ? "" : Number(event.target.value) })} /></Field>
          {condition?.field === "real_estate_equipment_pct" ? <p className={styles.note}>This is a QC ranking heuristic, not an SBA eligibility rule. It uses a complete funding-use breakdown; missing information does not earn preference points.</p> : null}
        </div>;
      })}
      <div className={styles.actions}><Btn disabled={rows.length >= 10 || rows.some((row) => row.key === "real_estate_equipment_majority")} onClick={() => replace([...rows, newRecommendationPreference(rows, true)])}>Prefer real estate / equipment majority</Btn><Btn disabled={rows.length >= 10} onClick={() => replace([...rows, newRecommendationPreference(rows)])}><Icon name="plus" size={15} />Add preference</Btn></div>
      <p className={styles.note}>The majority shortcut suggests 51% and 10 ranking points; review and adjust both. No amount limit is added automatically.</p>
    </>}
  </div></details></ValidationTarget>;
}
