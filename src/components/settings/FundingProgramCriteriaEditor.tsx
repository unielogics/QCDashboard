"use client";

import { useState } from "react";
import { Btn, Callout, Field, Input, Select, Textarea } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { EVIDENCE_TEMPLATES, FIT_FIELDS, newRequirement, objectValue, readSimpleFit, setRequirementCompletionMode, writeSimpleFit, type FitCondition } from "./fundingProgramEditorModel";
import styles from "./FundingProgramEditor.module.css";

type Props = { rules: string; requirements: string; onRules: (value: string) => void; onRequirements: (value: string) => void };
const pretty = (value: unknown) => JSON.stringify(value, null, 2);

function EligibilityBuilder({ rules, onChange }: { rules: Record<string, unknown>; onChange: (rules: Record<string, unknown>) => void }) {
  const fit = readSimpleFit(rules);
  if (!fit) return <Callout tone="warn">This version has advanced conditions. They are preserved exactly. Use Advanced settings below to review or change the complete rule set.</Callout>;
  function update(index: number, patch: Partial<FitCondition>) {
    if (!fit) return;
    onChange(writeSimpleFit(rules, { ...fit, conditions: fit.conditions.map((row, i) => i === index ? { ...row, ...patch } : row) }));
  }
  return <div className={styles.stack}>
    <div className={styles.row}><h4>Eligibility checks</h4>{fit.conditions.length > 1 ? <Select aria-label="How eligibility checks combine" value={fit.mode} onChange={(event) => onChange(writeSimpleFit(rules, { ...fit, mode: event.target.value as "all" | "any" }))}><option value="all">Must meet every check</option><option value="any">Must meet at least one check</option></Select> : null}</div>
    <p className={styles.muted}>These checks compare the file’s data and accepted evidence with your limits. Missing data does not count as meeting a requirement.</p>
    {!fit.conditions.length ? <Callout tone="warn">No eligibility checks are configured. The system cannot recommend a fit from document requirements or a program description alone. Add the checks you actually require.</Callout> : null}
    {fit.conditions.map((condition, index) => {
      const field = FIT_FIELDS.find((row) => row.key === condition.field)!;
      const present = condition.op === "present";
      return <div key={index} className={styles.condition}>
        <Field label={`Check ${index + 1}`}><Select aria-label={`Check ${index + 1} metric`} value={condition.field} onChange={(event) => {
          const nextField = FIT_FIELDS.find((row) => row.key === event.target.value)!;
          const replacement: FitCondition = { field: nextField.key, op: nextField.type === "number" ? "gte" : "eq", value: nextField.type === "boolean" ? true : "" };
          onChange(writeSimpleFit(rules, { ...fit, conditions: fit.conditions.map((row, i) => i === index ? replacement : row) }));
        }}>{FIT_FIELDS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></Field>
        <Field label="Condition"><Select aria-label={`Check ${index + 1} condition`} value={condition.op} onChange={(event) => {
          const op = event.target.value;
          const next: FitCondition = { field: condition.field, op };
          if (op !== "present") next.value = condition.value ?? (field.type === "boolean" ? true : "");
          onChange(writeSimpleFit(rules, { ...fit, conditions: fit.conditions.map((row, i) => i === index ? next : row) }));
        }}>{field.type === "number" ? <><option value="gte">At least</option><option value="lte">At most</option><option value="gt">More than</option><option value="lt">Less than</option></> : null}<option value="eq">Equals</option><option value="present">Must be provided</option></Select></Field>
        <Field label={present ? "Value" : field.type === "boolean" ? "Required answer" : "Threshold"}>{present ? <Input aria-label={`Check ${index + 1} value`} disabled value="No threshold needed" /> : field.type === "boolean" ? <Select aria-label={`Check ${index + 1} required answer`} value={String(condition.value)} onChange={(event) => update(index, { value: event.target.value === "true" })}><option value="true">Yes</option><option value="false">No</option></Select> : condition.field === "vertical" ? <Select aria-label={`Check ${index + 1} workspace`} value={String(condition.value)} onChange={(event) => update(index, { value: event.target.value })}><option value="">Choose workspace</option><option value="dealer">Auto dealership</option><option value="main_street">Main Street business</option><option value="real_estate">Real estate</option><option value="mca">MCA refinance</option></Select> : <Input aria-label={`Check ${index + 1} threshold`} type={field.type === "number" ? "number" : "text"} step="any" placeholder={field.type === "number" ? "Enter threshold" : "Enter value"} value={String(condition.value ?? "")} onChange={(event) => update(index, { value: field.type === "number" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value })} />}</Field>
        <Btn aria-label={`Remove eligibility check ${index + 1}`} onClick={() => onChange(writeSimpleFit(rules, { ...fit, conditions: fit.conditions.filter((_, i) => i !== index) }))}><Icon name="x" size={16} /></Btn>
      </div>;
    })}
    <div><Btn disabled={fit.conditions.length >= 99} onClick={() => onChange(writeSimpleFit(rules, { ...fit, conditions: [...fit.conditions, { field: "annual_revenue", op: "gte", value: "" }] }))}><Icon name="plus" size={15} />Add eligibility check</Btn></div>
  </div>;
}

const CATEGORIES = { financials: "Financial documents", borrower_info: "Business / owner information", credit: "Credit", property_data: "Property", agreements: "Agreements", insurance: "Insurance", title_and_escrow: "Title and escrow", appraisal_and_inspection: "Appraisal / inspection", scheduling: "Scheduling", compliance: "Compliance", communication: "Communication", ai_internal: "Internal review" };

function EvidenceBuilder({ requirements, onChange }: { requirements: Array<Record<string, unknown>>; onChange: (rows: Array<Record<string, unknown>>) => void }) {
  const [template, setTemplate] = useState("");
  function update(index: number, patch: Record<string, unknown>) { onChange(requirements.map((row, i) => i === index ? { ...row, ...patch } : row)); }
  return <div className={styles.stack}>
    <div className={styles.row}><h4>Documents and information to collect</h4><span className={styles.muted}>{requirements.length} requirements</span></div>
    <p className={styles.muted}>Name each item and describe what makes it complete. Your published instructions guide AI document review. For requirements that need a person’s judgment, choose “Staff must verify” under review options.</p>
    {requirements.map((row, index) => <div key={`${String(row.requirement_key)}:${index}`} className={styles.evidence}>
      <div className={styles.evidenceHeader}>
        <Field label="Document / information"><Input aria-label={`Requirement ${index + 1} name`} value={String(row.label ?? "")} maxLength={200} placeholder="e.g. Last 6 months business bank statements" onChange={(event) => update(index, { label: event.target.value })} /></Field>
        <Field label="Importance"><Select aria-label={`Requirement ${index + 1} importance`} value={String(row.required_level ?? "required")} onChange={(event) => update(index, { required_level: event.target.value })}><option value="required">Required</option><option value="recommended">Recommended</option><option value="optional">Optional</option></Select></Field>
        <Btn aria-label={`Remove ${String(row.label || "requirement")}`} onClick={() => onChange(requirements.filter((_, i) => i !== index))}><Icon name="x" size={16} /></Btn>
      </div>
      <Field label="What should be checked?"><Textarea aria-label={`Requirement ${index + 1} completion criteria`} rows={2} maxLength={4000} value={String(row.completion_criteria ?? "")} placeholder="For example: six complete, consecutive months; all pages; account holder matches the business." onChange={(event) => update(index, { completion_criteria: event.target.value })} /></Field>
      <details className={styles.details}><summary>Review, visibility, and collection options</summary><div className={styles.stack}>
        <div className="fldgrid two"><Field label="Who can mark this complete?"><Select aria-label={`Requirement ${index + 1} completion permission`} value={String(row.completion_mode ?? "ai_can_complete")} onChange={(event) => update(index, setRequirementCompletionMode(row, event.target.value))}><option value="ai_can_complete">AI can complete when satisfied</option><option value="requires_human_verify">Staff must verify</option><option value="borrower_self_attest">Client can confirm</option></Select></Field><Field label="Category"><Select aria-label={`Requirement ${index + 1} category`} value={String(row.category ?? "financials")} onChange={(event) => update(index, { category: event.target.value })}>{Object.entries(CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field></div>
        <Field label="Visible to"><div className={styles.checks}>{[["borrower", "Client"], ["agent", "Agent"], ["underwriter", "Underwriter"]].map(([key, label]) => <label key={key}><input type="checkbox" checked={(Array.isArray(row.visibility) ? row.visibility : ["borrower", "underwriter"]).includes(key)} onChange={(event) => { const values = Array.isArray(row.visibility) ? row.visibility : ["borrower", "underwriter"]; update(index, { visibility: event.target.checked ? [...values, key] : values.filter((value) => value !== key) }); }} />{label}</label>)}</div></Field>
        <Field label="Review objective (optional)"><Textarea aria-label={`Requirement ${index + 1} review objective`} rows={2} maxLength={2000} value={String(row.objective_text ?? "")} onChange={(event) => update(index, { objective_text: event.target.value })} placeholder="Why this evidence is needed" /></Field>
        <Field label="Client request wording (optional)"><Textarea aria-label={`Requirement ${index + 1} client request wording`} rows={2} maxLength={4000} value={String(row.ai_request_message_template ?? "")} onChange={(event) => update(index, { ai_request_message_template: event.target.value || null })} placeholder="Wording to use when requesting this item" /></Field>
        <div className="fldgrid two"><Field label="Required before"><Select aria-label={`Requirement ${index + 1} required stage`} value={String(row.blocks_stage ?? "")} onChange={(event) => update(index, { blocks_stage: event.target.value || null })}><option value="">No stage restriction</option><option value="prequalification">Prequalification</option><option value="term_sheet">Term sheet</option><option value="underwriting">Underwriting</option><option value="closing">Closing</option><option value="showings">Showings</option><option value="listed">Listing</option></Select></Field><Field label="Expires after (days, optional)"><Input aria-label={`Requirement ${index + 1} expiration days`} type="number" min={1} max={3650} value={row.expiration_days == null ? "" : String(row.expiration_days)} onChange={(event) => update(index, { expiration_days: event.target.value ? Number(event.target.value) : null })} /></Field></div>
        <div className={styles.checks}><label><input type="checkbox" checked={row.verification_required === true || row.completion_mode === "requires_human_verify"} disabled={row.completion_mode === "requires_human_verify"} onChange={(event) => update(index, { verification_required: event.target.checked })} />Verification required</label><label><input type="checkbox" checked={row.can_underwriter_waive !== false} onChange={(event) => update(index, { can_underwriter_waive: event.target.checked })} />Underwriter may waive</label></div>
        {row.applies_when ? <Callout tone="warn">This requirement has a saved conditional rule. It remains in effect and is available under Advanced settings.</Callout> : null}
      </div></details>
    </div>)}
    {!requirements.length ? <p className={styles.muted}>No documents are required by this version yet.</p> : null}
    <div className={styles.row}><Select aria-label="Choose a common document requirement" value={template} onChange={(event) => setTemplate(event.target.value)}><option value="">Choose a common document…</option>{EVIDENCE_TEMPLATES.map((row) => <option key={row.key} value={row.key} disabled={requirements.some((requirement) => requirement.requirement_key === row.key)}>{row.label}{requirements.some((requirement) => requirement.requirement_key === row.key) ? " · already added" : ""}</option>)}</Select><Btn disabled={!template || requirements.length >= 100 || requirements.some((row) => row.requirement_key === template)} onClick={() => { const item = EVIDENCE_TEMPLATES.find((row) => row.key === template); if (!item || requirements.some((row) => row.requirement_key === item.key)) return; onChange([...requirements, newRequirement(item.label, requirements, item.key, item.category)]); setTemplate(""); }}><Icon name="plus" size={15} />Add document</Btn><Btn disabled={requirements.length >= 100} onClick={() => onChange([...requirements, newRequirement("", requirements)])}>Add custom item</Btn></div>
  </div>;
}

export function FundingProgramCriteriaEditor({ rules, requirements, onRules, onRequirements }: Props) {
  let parsedRules: Record<string, unknown> | null = null;
  let parsedRequirements: Array<Record<string, unknown>> | null = null;
  try { const value: unknown = JSON.parse(rules); if (objectValue(value)) parsedRules = value; } catch { /* Retain the user's raw advanced edit. */ }
  try { const value: unknown = JSON.parse(requirements); if (Array.isArray(value) && value.every(objectValue)) parsedRequirements = value; } catch { /* Retain the user's raw advanced edit. */ }
  return <div className={styles.stack}>
    {parsedRules ? <EligibilityBuilder rules={parsedRules} onChange={(value) => onRules(pretty(value))} /> : <Callout tone="bad">The eligibility rules need correction in Advanced settings.</Callout>}
    {parsedRequirements ? <EvidenceBuilder requirements={parsedRequirements} onChange={(value) => onRequirements(pretty(value))} /> : <Callout tone="bad">The document requirements need correction in Advanced settings.</Callout>}
    <details className={styles.details}><summary>Advanced settings · full rules and document configuration</summary><div className={styles.stack}><p className={styles.muted}>Existing nested rules and additional settings are preserved. Use this section only for configurations that need technical editing.</p><Field label="Eligibility rules JSON"><Textarea aria-label="Eligibility rules JSON" className="funding-program-json" rows={10} value={rules} onChange={(event) => onRules(event.target.value)} spellCheck={false} /></Field><Field label="Document requirements JSON"><Textarea aria-label="Document requirements JSON" className="funding-program-json" rows={10} value={requirements} onChange={(event) => onRequirements(event.target.value)} spellCheck={false} /></Field></div></details>
  </div>;
}
