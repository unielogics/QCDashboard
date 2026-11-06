"use client";

import { useMemo, useState } from "react";
import { Btn, CellChip, Field, Input, Select } from "@/components/ds";
import { mortgageStatementStatus, type RealEstateEvidenceLink } from "@/lib/realEstateEvidence";
import {
  meaningfulRealEstateRow, realEstateMoney, realEstateOptionLabel, realEstatePropertyLabel, realEstateTotals,
  type RealEstateBody, type RealEstateField, type RealEstateRow, type RealEstateSchema,
} from "@/lib/realEstateSchedule";
import styles from "./RealEstateScheduleForm.module.css";

const text = (value: unknown) => value == null ? "" : String(value);
const SECTIONS = ["Properties", "Mortgages", "Portfolio totals"] as const;
const PROPERTY_GROUPS = [
  { label: "Property details", fields: ["address", "city", "state", "postal_code", "country", "property_type", "use", "units", "mortgage_status"] },
  { label: "Ownership and estimated value", fields: ["legal_owner", "ownership_type", "ownership_pct", "purchase_date", "purchase_cost", "estimated_value", "valuation_date", "valuation_basis"] },
  { label: "Monthly income and expenses", fields: ["monthly_gross_rent", "monthly_property_tax", "monthly_insurance", "monthly_hoa", "monthly_maintenance", "monthly_management", "monthly_utilities", "monthly_other_expenses"] },
];

/** Controlled across staff, borrower links, and the worksheet's phone renderer. */
export function RealEstateScheduleForm({ schema, value, onChange, disabled = false, initialSection = "Properties", onImportSchedule, onMortgageEvidence, mortgageEvidence }: {
  schema: RealEstateSchema; value: RealEstateBody; onChange: (next: RealEstateBody) => void; disabled?: boolean;
  initialSection?: typeof SECTIONS[number]; onImportSchedule?: () => void;
  onMortgageEvidence?: (mortgageId?: string, propertyId?: string) => void; mortgageEvidence?: RealEstateEvidenceLink[] | null;
}) {
  const [section, setSection] = useState<typeof SECTIONS[number]>(initialSection);
  const properties = value.properties ?? [];
  const mortgages = value.mortgages ?? [];
  const totals = useMemo(() => realEstateTotals(value), [value]);
  const propertiesById = new Map(properties.map((row, index) => [row.id, realEstatePropertyLabel(row, index)]));
  const hasEntries = properties.some(meaningfulRealEstateRow) || mortgages.some(meaningfulRealEstateRow);
  const setRow = (block: "properties" | "mortgages", index: number, key: string, next: string) => {
    const rows = [...(value[block] ?? [])];
    rows[index] = { ...rows[index], [key]: next };
    const changed = { ...value, [block]: rows };
    if (block === "mortgages" && (key === "status" || key === "property_row_id") && rows[index].status === "active") {
      changed.properties = properties.map((row) => row.id === rows[index].property_row_id ? { ...row, mortgage_status: "active" } : row);
    }
    onChange(changed);
  };
  const addProperty = () => {
    onChange({ ...value, no_real_estate: false, properties: [...properties, { id: crypto.randomUUID(), mortgage_status: "unknown" }] });
    setSection("Properties");
  };
  const addMortgage = () => {
    const property = properties.find(meaningfulRealEstateRow);
    if (!property?.id) return;
    onChange({ ...value, no_real_estate: false, properties: properties.map((row) => row.id === property.id ? { ...row, mortgage_status: "active" } : row), mortgages: [...mortgages, { id: crypto.randomUUID(), property_row_id: property.id, status: "active" }] });
    setSection("Mortgages");
  };
  const input = (field: RealEstateField, held: unknown, onEdit: (next: string) => void, labelPrefix = "") => {
    const propertyLink = field.key === "property_row_id";
    const options = propertyLink ? properties.filter((row) => row.id && meaningfulRealEstateRow(row)).map((row, index) => ({ value: row.id!, label: realEstatePropertyLabel(row, index) })) : field.options ?? [];
    const select = propertyLink || field.input === "select" || field.type === "select" || options.length > 0;
    return <Field key={field.key} label={field.label}>
      {select ? <Select aria-label={`${labelPrefix}${field.label}`} value={text(held)} disabled={disabled} onChange={(event) => onEdit(event.target.value)}>
        <option value="">Not stated</option>
        {options.map((option) => { const key = typeof option === "string" ? option : option.value; return <option key={key} value={key}>{propertyLink && typeof option !== "string" ? option.label : realEstateOptionLabel(field, key)}</option>; })}
      </Select> : <Input aria-label={`${labelPrefix}${field.label}`} type={field.input === "date" || field.type === "date" ? "date" : "text"} inputMode={["money", "rate", "percent", "number", "integer"].includes(field.type ?? field.input ?? "") ? "decimal" : undefined} value={text(held)} disabled={disabled} onChange={(event) => onEdit(event.target.value)} />}
      {field.hint ? <small className={styles.hint}>{field.hint}</small> : null}
    </Field>;
  };

  return <div className={styles.root}>
    <div className={styles.header}>
      {(schema.header ?? []).filter((field) => ["owner_name", "as_of"].includes(field.key)).map((field) => input(field, value[field.key as "owner_name" | "as_of"], (next) => onChange({ ...value, [field.key]: next })))}
    </div>
    {onImportSchedule ? <div className={styles.import}><span>Have an existing real estate schedule? Import its PDF or Excel file and review the proposed fields.</span><Btn size="sm" disabled={disabled} onClick={onImportSchedule}>Import existing schedule</Btn></div> : null}
    <p className={styles.note}>List real estate held personally or through an entity. Current values are your estimates; include the valuation date and basis. Enter 0 when an amount is zero and leave unknown amounts blank.</p>
    <label className={styles.none}><input type="checkbox" checked={value.no_real_estate === true} disabled={disabled || hasEntries} onChange={(event) => onChange({ ...value, no_real_estate: event.target.checked })} />I confirm this owner has no real estate assets.</label>
    {hasEntries ? <small className={styles.hint}>Remove listed properties and mortgages before declaring no real estate.</small> : null}
    <nav className={styles.tabs} aria-label="Real estate schedule sections" role="tablist">{SECTIONS.map((title) => <button type="button" key={title} data-res-section={title} role="tab" aria-selected={section === title} onClick={() => setSection(title)}>{title}</button>)}</nav>

    {section === "Properties" ? <section className={styles.section}>
      <div className={styles.sectionHead}><h4>Properties</h4><Btn size="sm" disabled={disabled || value.no_real_estate === true} onClick={addProperty}>Add property</Btn></div>
      {!properties.length ? <p className={styles.note}>{value.no_real_estate ? "No real estate declared." : "Add each property, including properties with no mortgage."}</p> : null}
      {properties.map((row, index) => {
        const linked = mortgages.filter((mortgage) => mortgage.property_row_id === row.id).length;
        return <details className={styles.row} key={row.id ?? index} open={properties.length === 1 || undefined}>
          <summary><b>{realEstatePropertyLabel(row, index)}</b><span>Estimated value {realEstateMoney(realEstateTotals({ properties: [row], mortgages }).estimated_value_total)}</span></summary>
          <div className={styles.rowBody}>
            {PROPERTY_GROUPS.map((group) => <fieldset key={group.label} className={styles.fieldset}><legend>{group.label}</legend><div className={styles.fields}>{group.fields.map((key) => schema.properties.find((field) => field.key === key)).filter((field): field is RealEstateField => Boolean(field)).map((field) => input(field, row[field.key], (next) => setRow("properties", index, field.key, next), `Property ${index + 1}: `))}</div></fieldset>)}
            {onMortgageEvidence && row.mortgage_status === "active" ? <div className={styles.documents}><span>{linked ? `${linked} mortgage${linked === 1 ? "" : "s"} recorded for this property` : "Mortgage details and statement still need review"}</span><Btn size="sm" disabled={disabled} onClick={() => onMortgageEvidence(undefined, row.id)}>Review mortgage statements</Btn></div> : null}
            <Btn size="sm" disabled={disabled} onClick={() => onChange({ ...value, properties: properties.filter((_, at) => at !== index), mortgages: mortgages.filter((mortgage) => mortgage.property_row_id !== row.id) })}>{linked ? `Remove property and ${linked} linked mortgage${linked === 1 ? "" : "s"}` : "Remove property"}</Btn>
          </div>
        </details>;
      })}
    </section> : null}

    {section === "Mortgages" ? <section className={styles.section}>
      <div className={styles.sectionHead}><h4>Mortgages</h4><Btn size="sm" disabled={disabled || value.no_real_estate === true || !properties.some(meaningfulRealEstateRow)} onClick={addMortgage}>Add active mortgage</Btn></div>
      <p className={styles.note}>Add each mortgage or lien separately and link it to its property. Saving a version creates a client to-do for the latest statement on each active mortgage. State whether payments include escrow so taxes and insurance are counted once.</p>
      {!mortgages.length ? <p className={styles.note}>No mortgage details entered. Mark properties as free and clear only when they have no mortgage.</p> : null}
      {mortgages.map((row, index) => {
        const evidence = mortgageStatementStatus(mortgageEvidence, row.id!, row, properties.find((property) => property.id === row.property_row_id));
        return <details key={row.id ?? index} className={styles.row} open={mortgages.length === 1 || undefined}>
          <summary><b>{text(row.lender) || `Mortgage ${index + 1}`}</b><span>{propertiesById.get(text(row.property_row_id)) || "Choose a property"}{onMortgageEvidence ? ` · ${evidence.label}` : ""}</span></summary>
          <div className={styles.rowBody}>{onMortgageEvidence ? <div className={styles.documents}><CellChip tone={evidence.tone}>{evidence.label}</CellChip><Btn size="sm" disabled={disabled} onClick={() => onMortgageEvidence(row.id, text(row.property_row_id))}>Statement documents</Btn></div> : null}<div className={styles.fields}>{(schema.mortgages ?? []).map((field) => input(field, row[field.key], (next) => setRow("mortgages", index, field.key, next), `Mortgage ${index + 1}: `))}</div><Btn size="sm" disabled={disabled} onClick={() => onChange({ ...value, mortgages: mortgages.filter((_, at) => at !== index) })}>Remove mortgage</Btn></div>
        </details>;
      })}
    </section> : null}

    {section === "Portfolio totals" ? <section className={styles.section}>
      <h4>Portfolio totals</h4><p className={styles.note}>Property values and mortgage balances are full property amounts. Ownership percentages are recorded separately. Missing balances, expenses, or mortgage status keep the related total incomplete.</p>
      <dl className={styles.totals}>{(schema.totals ?? []).map((total) => <div key={total.key}><dt>{total.label}</dt><dd>{total.key.endsWith("_count") ? totals[total.key] == null ? "Not fully stated" : totals[total.key] : realEstateMoney(totals[total.key])}</dd></div>)}</dl>
    </section> : null}
    <Field label="Notes"><Input aria-label="Real estate schedule notes" value={text(value.notes)} disabled={disabled} onChange={(event) => onChange({ ...value, notes: event.target.value })} /></Field>
  </div>;
}
