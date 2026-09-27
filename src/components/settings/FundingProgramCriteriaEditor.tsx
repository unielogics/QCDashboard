"use client";

import { useState } from "react";
import { Btn, Callout, Input, Select, Textarea } from "@/components/ds";
import { ValidatedField as Field, ValidationTarget } from "./FundingProgramValidation";
import { Icon } from "@/components/design-system/Icon";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
import type { FundingProgramReviewCheck } from "@/lib/fundingPrograms";
import { DOCUMENT_REVIEW_PRESETS, EVIDENCE_TEMPLATES, FIT_FIELDS, newCustomDocumentReviewCheck, newRequirement, objectValue, readDocumentReviewChecks, readSimpleFit, setRequirementCompletionMode, withDocumentReviewChecks, writeSimpleFit, type FitCondition } from "./fundingProgramEditorModel";
import styles from "./FundingProgramEditor.module.css";
import documentStyles from "./FundingProgramDocuments.module.css";
import { FundingProgramPreferencesEditor } from "./FundingProgramPreferencesEditor";

type Props = { rules: string; requirements: string; onRules: (value: string) => void; onRequirements: (value: string) => void };
const pretty = (value: unknown) => JSON.stringify(value, null, 2);

function EligibilityBuilder({ rules, onChange }: { rules: Record<string, unknown>; onChange: (rules: Record<string, unknown>) => void }) {
  const fit = readSimpleFit(rules);
  if (!fit) return <ValidationTarget target="Eligibility checks"><Callout tone="warn">This version has advanced conditions. They are preserved exactly. Use Advanced settings below to review or change the complete rule set.</Callout></ValidationTarget>;
  function update(index: number, patch: Partial<FitCondition>) {
    if (!fit) return;
    onChange(writeSimpleFit(rules, { ...fit, conditions: fit.conditions.map((row, i) => i === index ? { ...row, ...patch } : row) }));
  }
  return <ValidationTarget target="Eligibility checks"><div className={styles.stack}>
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
    <div className={styles.row}><Btn disabled={fit.conditions.length >= 99} onClick={() => onChange(writeSimpleFit(rules, { ...fit, conditions: [...fit.conditions, { field: "annual_revenue", op: "gte", value: "" }] }))}><Icon name="plus" size={15} />Add eligibility check</Btn><Btn disabled={fit.conditions.length >= 99 || fit.conditions.some((row) => row.field === "mca_obligations_present")} onClick={() => onChange(writeSimpleFit(rules, { ...fit, conditions: [...fit.conditions, { field: "mca_obligations_present", op: "eq", value: false }] }))}>Add “No outstanding MCA” check</Btn></div>
  </div></ValidationTarget>;
}

const CATEGORIES = { financials: "Financial documents", borrower_info: "Business / owner information", credit: "Credit", property_data: "Property", agreements: "Agreements", insurance: "Insurance", title_and_escrow: "Title and escrow", appraisal_and_inspection: "Appraisal / inspection", scheduling: "Scheduling", compliance: "Compliance", communication: "Communication", ai_internal: "Internal review" };

function contextualPresets(requirement: Record<string, unknown>) {
  const key = String(requirement.requirement_key || "").toLowerCase();
  const keys = /bank.*statement|statement.*bank/.test(key) ? ["no_mca_debits", "no_nsf", "positive_ending_balance"]
    : /tax.*return|return.*tax|p_and_l|profit.*loss|ytd.*financial/.test(key) ? ["net_income_nonnegative", "net_income_not_declining", "revenue_not_declining"] : [];
  return DOCUMENT_REVIEW_PRESETS.filter((preset) => keys.includes(preset.key));
}

function DocumentChecks({ requirement, index, onChange }: { requirement: Record<string, unknown>; index: number; onChange: (checks: FundingProgramReviewCheck[]) => void }) {
  const [newSeverity, setNewSeverity] = useState<"review" | "block">("review");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const checks = readDocumentReviewChecks(requirement);
  if (!checks) return <Callout tone="warn">This requirement has document checks that need review in Advanced settings. They are preserved unchanged.</Callout>;
  const presets = contextualPresets(requirement);
  const available = presets.filter((preset) => !checks.some((check) => check.key === preset.key));
  const otherPresets = DOCUMENT_REVIEW_PRESETS.filter((preset) => !presets.includes(preset) && !checks.some((check) => check.key === preset.key));
  const blockers = checks.filter((check) => check.severity === "block").length;
  function update(key: string, patch: Partial<FundingProgramReviewCheck>) { if (checks) onChange(checks.map((row) => row.key === key ? { ...row, ...patch } : row)); }
  function addPreset(preset: FundingProgramReviewCheck) { if (checks && checks.length < 20) onChange([...checks, { ...preset, severity: newSeverity }]); }
  return <section className={documentStyles.concerns} aria-label={`Requirement ${index + 1} flags and blocking concerns`}>
    <div className={documentStyles.areaHeading}><h5>Flag for review / Do not accept</h5><small>{checks.length ? `${checks.length - blockers} review · ${blockers} must resolve` : "Optional"}</small></div>
    {checks.length ? <div className={documentStyles.checkList}>{checks.map((check, checkIndex) => <details key={check.key} className={documentStyles.check} open={expanded[check.key] ?? (!check.label.trim() || !check.instructions.trim())} onToggle={(event) => { const open = event.currentTarget.open; setExpanded((current) => current[check.key] === open ? current : { ...current, [check.key]: open }); }}>
      <summary><span className={documentStyles.checkTitle}><strong>{check.label || "Name this check"}</strong><small className={check.severity === "block" ? documentStyles.blockBadge : documentStyles.reviewBadge}>{check.severity === "block" ? "Must resolve if unmet" : "Staff review if unmet"}</small></span><span className={documentStyles.editHint}>Edit</span></summary>
      <div className={documentStyles.checkBody}>
        <Field label="Check name"><Input aria-label={`Requirement ${index + 1} check ${checkIndex + 1} name`} maxLength={160} value={check.label} placeholder="e.g. No unexplained related-party transfers" onChange={(event) => update(check.key, { label: event.target.value })} /></Field>
        <Field label="What should trigger a concern?"><Textarea aria-label={`Requirement ${index + 1} check ${checkIndex + 1} instructions`} rows={2} maxLength={2000} value={check.instructions} placeholder="Specify the evidence, figures, or pattern staff should verify." onChange={(event) => update(check.key, { instructions: event.target.value })} /></Field>
        <Field label="Review policy"><Select aria-label={`Requirement ${index + 1} check ${checkIndex + 1} severity`} value={check.severity} onChange={(event) => update(check.key, { severity: event.target.value as "review" | "block" })}><option value="review">Flag for staff review</option><option value="block">Must resolve before staff approval</option></Select></Field>
        <Btn aria-label={`Remove document check ${checkIndex + 1} from requirement ${index + 1}`} onClick={() => onChange(checks.filter((row) => row.key !== check.key))}><Icon name="x" size={15} />Remove check</Btn>
      </div>
    </details>)}</div> : <p className={documentStyles.help}>No extra restrictions. Add a check only when this document needs one.</p>}
    <div className={documentStyles.addChecks}>
      <Field label="New check policy"><Select aria-label={`Requirement ${index + 1} new check handling`} value={newSeverity} onChange={(event) => setNewSeverity(event.target.value as "review" | "block")}><option value="review">Flag for staff review</option><option value="block">Must resolve before staff approval</option></Select></Field>
      {available.length ? <div className={documentStyles.presets}>{available.map((preset) => <button type="button" key={preset.key} disabled={checks.length >= 20} onClick={() => addPreset(preset)}><Icon name="plus" size={14} />{preset.label}</button>)}</div> : null}
      <div className={documentStyles.checkActions}><Btn disabled={checks.length >= 20} onClick={() => onChange([...checks, { ...newCustomDocumentReviewCheck(checks), severity: newSeverity }])}><Icon name="plus" size={14} />Add custom document check</Btn>{otherPresets.length ? <details className={documentStyles.moreChecks}><summary>Other checks</summary><div className={documentStyles.presets}>{otherPresets.map((preset) => <button type="button" key={preset.key} disabled={checks.length >= 20} onClick={() => addPreset(preset)}><Icon name="plus" size={14} />{preset.label}</button>)}</div></details> : null}</div>
    </div>
    {checks.length ? <p className={documentStyles.safety}>AI highlights these conditions. Staff must resolve them before accepting the document. These settings do not automatically reject an upload.</p> : null}
  </section>;
}

function EvidenceBuilder({ requirements, onChange }: { requirements: Array<Record<string, unknown>>; onChange: (rows: Array<Record<string, unknown>>) => void }) {
  const [template, setTemplate] = useState("");
  const [changedTypes, setChangedTypes] = useState<Set<string>>(new Set());
  const confirmAction = useConfirmAction();
  function savedDocumentType(row: Record<string, unknown>) { return !EVIDENCE_TEMPLATES.some((item) => item.key === row.requirement_key) && !String(row.requirement_key).startsWith("custom_requirement"); }
  function update(index: number, patch: Record<string, unknown>) { onChange(requirements.map((row, i) => { if (i !== index) return row; const next = { ...row, ...patch }; return setRequirementCompletionMode(next, String(next.completion_mode ?? "ai_can_complete")); })); }
  async function changeType(index: number, key: string) {
    const row = requirements[index];
    const selectedType = EVIDENCE_TEMPLATES.find((item) => item.key === key);
    if (key !== "__other" && !selectedType) return;
    if (!await confirmAction({ title: "Change required-document type?", body: "Existing AI instructions and document checks will be kept. Review them to make sure they apply to the new document type before saving. Existing files retain their previously selected criteria version.", confirmLabel: "Change document type" })) return;
    const nextKey = selectedType?.key || String(newRequirement("", requirements).requirement_key);
    update(index, { requirement_key: nextKey, label: selectedType?.label || "", category: selectedType?.category || row.category || "financials" });
    setChangedTypes((current) => new Set([...current, nextKey]));
  }
  return <div className={styles.stack}>
    <div className={styles.row}><h4>Documents and information to collect</h4><span className={styles.muted}>{requirements.length} requirements</span></div>
    <p className={styles.muted}>Choose the documents to collect. Under each one, tell the AI what to inspect and which findings need staff attention. Instructions and extra checks are optional.</p>
    <div className={documentStyles.addDocument}><Field label="Add a required document"><Select aria-label="Choose a common document requirement" value={template} onChange={(event) => setTemplate(event.target.value)}><option value="">Choose a document…</option>{EVIDENCE_TEMPLATES.map((row) => <option key={row.key} value={row.key} disabled={requirements.some((requirement) => requirement.requirement_key === row.key)}>{row.label}{requirements.some((requirement) => requirement.requirement_key === row.key) ? " · already added" : ""}</option>)}</Select></Field><Btn disabled={!template || requirements.length >= 100 || requirements.some((row) => row.requirement_key === template)} onClick={() => { const item = EVIDENCE_TEMPLATES.find((row) => row.key === template); if (!item || requirements.some((row) => row.requirement_key === item.key)) return; onChange([...requirements, newRequirement(item.label, requirements, item.key, item.category)]); setTemplate(""); }}><Icon name="plus" size={15} />Add document</Btn><Btn disabled={requirements.length >= 100} onClick={() => onChange([...requirements, newRequirement("", requirements)])}>Other document</Btn></div>
    {requirements.map((row, index) => <article key={`${String(row.requirement_key)}:${index}`} className={documentStyles.card} aria-label={`Document requirement ${index + 1}: ${String(row.label || "New document")}`}>
      <div className={documentStyles.cardHeader}>
        <Field label="Required document"><Select aria-label={`Requirement ${index + 1} document type`} value={EVIDENCE_TEMPLATES.some((item) => item.key === row.requirement_key) ? String(row.requirement_key) : savedDocumentType(row) ? "__saved" : "__other"} onChange={(event) => void changeType(index, event.target.value)}>{savedDocumentType(row) ? <option value="__saved">{String(row.label || row.requirement_key)} · saved type</option> : null}{EVIDENCE_TEMPLATES.map((item) => <option key={item.key} value={item.key} disabled={requirements.some((other, otherIndex) => otherIndex !== index && other.requirement_key === item.key)}>{item.label}</option>)}<option value="__other">Other required document · named below</option></Select></Field>
        <Field label="Importance"><Select aria-label={`Requirement ${index + 1} importance`} value={String(row.required_level ?? "required")} onChange={(event) => update(index, { required_level: event.target.value })}><option value="required">Required</option><option value="recommended">Recommended</option><option value="optional">Optional</option></Select></Field>
        <Btn aria-label={`Remove ${String(row.label || "requirement")}`} onClick={() => onChange(requirements.filter((_, i) => i !== index))}><Icon name="x" size={16} /></Btn>
      </div>
      {String(row.requirement_key).startsWith("custom_requirement") ? <Field label="Document name"><Input aria-label={`Requirement ${index + 1} name`} value={String(row.label ?? "")} maxLength={200} placeholder="Give this required document a clear name" onChange={(event) => update(index, { label: event.target.value })} /></Field> : null}
      <p className={documentStyles.binding}>Applies only to files assigned as <strong>{EVIDENCE_TEMPLATES.find((item) => item.key === row.requirement_key)?.label || String(row.label || "this document")}</strong>.</p>
      {changedTypes.has(String(row.requirement_key)) ? <Callout tone="warn">Document type changed. The existing instructions and traits were kept—review their relevance to this type before saving.</Callout> : null}
      <div className={documentStyles.reviewAreas}>
        <section className={documentStyles.lookFor} aria-label={`Requirement ${index + 1} AI document instructions`}><div className={documentStyles.areaHeading}><h5>What the AI should look for</h5><small>Optional</small></div><Field><Textarea aria-label={`Requirement ${index + 1} completion criteria`} rows={4} maxLength={4000} value={String(row.completion_criteria ?? "")} placeholder="Describe the pages, periods, figures, names, or patterns to inspect in this document." onChange={(event) => update(index, { completion_criteria: event.target.value })} /></Field><p className={documentStyles.help}>For example: all pages, consecutive periods, and a business name matching the file. Leave blank to use the standard document review.</p></section>
        <DocumentChecks requirement={row} index={index} onChange={(checks) => update(index, withDocumentReviewChecks(row, checks))} />
      </div>
      <details className={styles.details}><summary>Review, visibility, and collection options</summary><div className={styles.stack}>
        {!String(row.requirement_key).startsWith("custom_requirement") ? <Field label="Document display name"><Input aria-label={`Requirement ${index + 1} name`} value={String(row.label ?? "")} maxLength={200} onChange={(event) => update(index, { label: event.target.value })} /></Field> : null}
        <div className="fldgrid two"><Field label="Who can mark this complete?"><Select aria-label={`Requirement ${index + 1} completion permission`} disabled={Array.isArray(row.review_checks) && row.review_checks.length > 0} value={Array.isArray(row.review_checks) && row.review_checks.length > 0 ? "requires_human_verify" : String(row.completion_mode ?? "ai_can_complete")} onChange={(event) => update(index, setRequirementCompletionMode(row, event.target.value))}><option value="ai_can_complete">AI can complete when satisfied</option><option value="requires_human_verify">Staff must verify</option><option value="borrower_self_attest">Client can confirm</option></Select></Field><Field label="Category"><Select aria-label={`Requirement ${index + 1} category`} value={String(row.category ?? "financials")} onChange={(event) => update(index, { category: event.target.value })}>{Object.entries(CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field></div>
        <Field label="Visible to" target={`Requirement ${index + 1} audience`}><div role="group" aria-label={`Requirement ${index + 1} audience`} className={styles.checks}>{[["borrower", "Client"], ["agent", "Agent"], ["underwriter", "Underwriter"]].map(([key, label]) => <label key={key}><input type="checkbox" checked={(Array.isArray(row.visibility) ? row.visibility : ["borrower", "underwriter"]).includes(key)} onChange={(event) => { const values = Array.isArray(row.visibility) ? row.visibility : ["borrower", "underwriter"]; update(index, { visibility: event.target.checked ? [...values, key] : values.filter((value) => value !== key) }); }} />{label}</label>)}</div></Field>
        <Field label="Review objective (optional)"><Textarea aria-label={`Requirement ${index + 1} review objective`} rows={2} maxLength={2000} value={String(row.objective_text ?? "")} onChange={(event) => update(index, { objective_text: event.target.value })} placeholder="Why this evidence is needed" /></Field>
        <Field label="Client request wording (optional)"><Textarea aria-label={`Requirement ${index + 1} client request wording`} rows={2} maxLength={4000} value={String(row.ai_request_message_template ?? "")} onChange={(event) => update(index, { ai_request_message_template: event.target.value || null })} placeholder="Wording to use when requesting this item" /></Field>
        <div className="fldgrid two"><Field label="Required before"><Select aria-label={`Requirement ${index + 1} required stage`} value={String(row.blocks_stage ?? "")} onChange={(event) => update(index, { blocks_stage: event.target.value || null })}><option value="">No stage restriction</option><option value="prequalification">Prequalification</option><option value="term_sheet">Term sheet</option><option value="underwriting">Underwriting</option><option value="closing">Closing</option><option value="showings">Showings</option><option value="listed">Listing</option></Select></Field><Field label="Expires after (days, optional)"><Input aria-label={`Requirement ${index + 1} expiration days`} type="number" min={1} max={3650} value={row.expiration_days == null ? "" : String(row.expiration_days)} onChange={(event) => update(index, { expiration_days: event.target.value ? Number(event.target.value) : null })} /></Field></div>
        <div className={styles.checks}><label><input type="checkbox" checked={row.verification_required === true || row.completion_mode === "requires_human_verify" || (Array.isArray(row.review_checks) && row.review_checks.length > 0)} disabled={row.completion_mode === "requires_human_verify" || (Array.isArray(row.review_checks) && row.review_checks.length > 0)} onChange={(event) => update(index, { verification_required: event.target.checked })} />Verification required</label><label><input type="checkbox" checked={row.can_underwriter_waive !== false} onChange={(event) => update(index, { can_underwriter_waive: event.target.checked })} />Underwriter may waive</label></div>
        {row.applies_when ? <Callout tone="warn">This requirement has a saved conditional rule. It remains in effect and is available under Advanced settings.</Callout> : null}
      </div></details>
    </article>)}
    {!requirements.length ? <p className={styles.muted}>No documents are required by this version yet.</p> : null}
  </div>;
}

export function FundingProgramCriteriaEditor({ rules, requirements, onRules, onRequirements }: Props) {
  const confirmAction = useConfirmAction();
  let parsedRules: Record<string, unknown> | null = null;
  let parsedRequirements: Array<Record<string, unknown>> | null = null;
  try { const value: unknown = JSON.parse(rules); if (objectValue(value)) parsedRules = value; } catch { /* Retain the user's raw advanced edit. */ }
  try { const value: unknown = JSON.parse(requirements); if (Array.isArray(value) && value.every(objectValue)) parsedRequirements = value; } catch { /* Retain the user's raw advanced edit. */ }
  const unresolved = Array.isArray(parsedRules?.unresolved_review_items) ? parsedRules.unresolved_review_items : [];
  async function resolveImportedItem(index: number) {
    if (!parsedRules) return;
    if (!await confirmAction({ title: "Mark imported item resolved?", body: `Confirm that you reviewed this item and incorporated any required changes in the eligibility checks or documents. This only updates the unsaved draft; it does not publish the program.\n\n${String(unresolved[index])}`, confirmLabel: "Mark resolved" })) return;
    onRules(pretty({ ...parsedRules, unresolved_review_items: unresolved.filter((_, itemIndex) => itemIndex !== index) }));
  }
  return <div className={styles.stack}>
    {unresolved.length ? <ValidationTarget target="Imported items to resolve"><div className={styles.unresolved}><h4>Imported items to resolve · {unresolved.length}</h4><p className={styles.muted}>Publishing is blocked until staff review these imported items. Update the relevant checks or document instructions first, mark each item resolved, then save a new criteria draft.</p><ul>{unresolved.map((item, index) => <li key={index}><span>{String(item)}</span><Btn aria-label={`Mark imported item ${index + 1} resolved`} onClick={() => void resolveImportedItem(index)}>Mark resolved</Btn></li>)}</ul></div></ValidationTarget> : null}
    {parsedRules ? <EligibilityBuilder rules={parsedRules} onChange={(value) => onRules(pretty(value))} /> : <ValidationTarget target="Eligibility checks"><Callout tone="bad">The eligibility rules need correction in Advanced settings.</Callout></ValidationTarget>}
    {parsedRules ? <FundingProgramPreferencesEditor rules={parsedRules} onChange={(value) => onRules(pretty(value))} /> : null}
    {parsedRequirements ? <EvidenceBuilder requirements={parsedRequirements} onChange={(value) => onRequirements(pretty(value))} /> : <Callout tone="bad">The document requirements need correction in Advanced settings.</Callout>}
    <details className={styles.details}><summary>Advanced settings · full rules and document configuration</summary><div className={styles.stack}><p className={styles.muted}>Existing nested rules and additional settings are preserved. Use this section only for configurations that need technical editing.</p><Field label="Eligibility rules JSON"><Textarea aria-label="Eligibility rules JSON" className="funding-program-json" rows={10} value={rules} onChange={(event) => onRules(event.target.value)} spellCheck={false} /></Field><Field label="Document requirements JSON"><Textarea aria-label="Document requirements JSON" className="funding-program-json" rows={10} value={requirements} onChange={(event) => onRequirements(event.target.value)} spellCheck={false} /></Field></div></details>
  </div>;
}
