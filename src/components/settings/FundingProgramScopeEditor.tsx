"use client";

import { useEffect, useState } from "react";
import { Callout, Field, Input, Select } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import type { FundingProgramScope } from "@/lib/fundingPrograms";
import type { TaxonomyEntry, TaxonomySearch } from "@/lib/applicationProfile";
import { industryPrefixes, sharedIndustryExclusions } from "./fundingProgramEditorModel";
import styles from "./FundingProgramEditor.module.css";

export { industryPrefixes } from "./fundingProgramEditorModel";
const PURPOSES = [["working_capital", "Working capital"], ["equipment", "Equipment or vehicle"], ["refinance_debt", "Refinance debt"], ["not_sure", "Needs guidance"], ["merchant_services", "Card processing"], ["business_systems", "Business systems"]];
const FACTS = [["declared_collateral", "Must have real estate collateral"], ["mca_obligations_present", "Must have existing cash advances"], ["floorplan_inventory_present", "Must have floorplan / inventory"], ["equipment_financing_intent", "Must need equipment financing"]];
const WORKSPACES: Record<string, string> = { dealer: "Auto dealerships", main_street: "Main Street businesses", real_estate: "Real estate", mca: "MCA refinance" };
const INDUSTRY_LABELS: Record<string, string> = { trucking_logistics: "Trucking and logistics", grocery_commodities: "Grocery and commodities", restaurant_food_service: "Restaurants and food service", manufacturing: "Manufacturing", automotive: "Automotive", auto_dealer: "Auto dealerships", car_dealer: "Auto dealerships" };
const splitList = (value: string) => [...new Set(value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean))];
type Call = <T>(path: string) => Promise<T>;

function ListInput({ values, label, onChange }: { values: string[]; label: string; onChange: (values: string[]) => void }) {
  const serialized = values.join(", ");
  const [text, setText] = useState(serialized);
  useEffect(() => setText(serialized), [serialized]);
  return <Input aria-label={label} value={text} onChange={(event) => setText(event.target.value)} onBlur={() => onChange(splitList(text))} />;
}

function IndustryPicker({ codes, label, onChange, call }: { codes: string[]; label: string; onChange: (codes: string[]) => void; call: Call }) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("6");
  const [items, setItems] = useState<TaxonomyEntry[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const codeKey = codes.join(",");
  useEffect(() => {
    let active = true;
    const selectedCodes = codeKey.split(",").filter(Boolean);
    if (!selectedCodes.length) return;
    void Promise.all(selectedCodes.map(async (code) => {
      try {
        const result = await call<TaxonomySearch>(`/application-profiles/taxonomy/search?q=${encodeURIComponent(code)}&page_size=30`);
        const exact = result.items.find((item) => item.code === code || industryPrefixes(item.code).includes(code));
        return exact ? [code, exact.label] as const : null;
      } catch { return null; }
    })).then((results) => { if (active) setLabels((previous) => ({ ...previous, ...Object.fromEntries(results.filter((item): item is readonly [string, string] => item !== null)) })); });
    return () => { active = false; };
  }, [call, codeKey]);
  useEffect(() => {
    let active = true;
    if (query.trim().length < 2) { setItems([]); setLoading(false); return; }
    setItems([]); setLoading(true); setError("");
    const timer = window.setTimeout(() => {
      void call<TaxonomySearch>(`/application-profiles/taxonomy/search?level=${level}&q=${encodeURIComponent(query.trim())}&page_size=30`).then((result) => { if (active) setItems(result.items.filter((item) => industryPrefixes(item.code).length > 0)); }).catch(() => { if (active) setError("Industry search is temporarily unavailable. Saved restrictions are unchanged."); }).finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [call, level, query]);
  return <div className={styles.stack}>
    {codes.length ? <div className={styles.chips}>{codes.map((code) => <button type="button" key={code} aria-label={`Remove ${label.toLowerCase()} ${labels[code] || code}`} onClick={() => onChange(codes.filter((value) => value !== code))}><span>{labels[code] || `Industry group ${code}`}<small className={styles.muted}> · {code}</small></span><Icon name="x" size={14} /></button>)}</div> : null}
    <div className={styles.search}><Select aria-label={`${label} search level`} value={level} onChange={(event) => setLevel(event.target.value)}><option value="6">Specific activity</option><option value="3">Industry group</option><option value="2">Broad sector</option></Select><Input aria-label={`Search ${label.toLowerCase()}`} placeholder="Search an industry name or code" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
    {loading ? <p role="status" className={styles.muted}>Searching industries…</p> : error ? <Callout tone="warn">{error}</Callout> : query.trim().length >= 2 ? items.length ? <div className={styles.results}>{items.map((item) => { const additions = industryPrefixes(item.code); const selected = additions.every((code) => codes.includes(code)); return <button key={item.id} type="button" disabled={selected || new Set([...codes, ...additions]).size > 30} onClick={() => { onChange([...new Set([...codes, ...additions])]); setLabels((previous) => ({ ...previous, ...Object.fromEntries(additions.map((code) => [code, item.label])) })); setQuery(""); }}><span>{item.label}<small>{item.code}{item.path?.length ? ` · ${item.path.slice(0, -1).map((parent) => parent.label).join(" › ")}` : ""}</small></span><span>{selected ? "Added" : "Add"}</span></button>; })}</div> : <p className={styles.muted}>No matching industries. Try a broader term or another search level.</p> : null}
  </div>;
}

type Props = { scopes: FundingProgramScope[]; onScopeChange: (index: number, patch: Partial<FundingProgramScope>) => void; onExclusionsChange: (codes: string[]) => void; call: Call };

export function FundingProgramScopeEditor({ scopes, onScopeChange, onExclusionsChange, call }: Props) {
  const [routeIndex, setRouteIndex] = useState(0);
  const index = Math.min(routeIndex, Math.max(0, scopes.length - 1));
  const scope = scopes[index];
  const exclusions = sharedIndustryExclusions(scopes);
  const specialized = scopes.filter((row) => row.naics_prefixes.length || row.industry_keys.length || row.intent_keys.length || row.required_fact_keys.length || row.intake_variants.length).length;
  function toggle(values: string[], key: string, enabled: boolean) { return enabled ? [...new Set([...values, key])] : values.filter((value) => value !== key); }
  if (!scope) return <p className={styles.muted}>Choose at least one workspace to configure availability.</p>;
  const label = WORKSPACES[scope.vertical];
  function update(patch: Partial<FundingProgramScope>) { onScopeChange(index, patch); }
  return <div className={styles.stack}>
    <div className={styles.scope}><h4>Prohibited industries</h4><p className={styles.muted}>Add industries this program must not serve. This list applies to every selected workspace. All other industries can be considered, subject to any specialized routing and eligibility checks.</p>
      {!exclusions.codes.length ? <p className={styles.muted}>No industries are excluded. Nothing is preselected.</p> : null}
      {exclusions.differs ? <Callout tone="warn">Some workspaces have different saved exclusions. They remain unchanged until you edit this list. Editing it applies the list shown here to every selected workspace.</Callout> : null}
      <IndustryPicker codes={exclusions.codes} label="Prohibited industries" onChange={onExclusionsChange} call={call} />
    </div>
    <details className={styles.details}><summary>Advanced routing{specialized ? ` · ${specialized} specialized ${specialized === 1 ? "route" : "routes"}` : " · optional"}</summary><div className={styles.stack}>
      <p className={styles.muted}>Routing controls where the program appears before financial eligibility is checked. Most programs need only workspace choices and prohibited industries above. Use these options for a specialized product—for example, equipment financing only when equipment is being purchased, or a transportation program only for trucking.</p>
      <Field label="Workspace route"><Select aria-label="Workspace routing configuration" value={String(index)} onChange={(event) => setRouteIndex(Number(event.target.value))}>{scopes.map((row, i) => <option key={`${row.vertical}:${i}`} value={i}>{WORKSPACES[row.vertical]}{scopes.filter((other) => other.vertical === row.vertical).length > 1 ? ` · route ${i + 1}` : ""}</option>)}</Select></Field>
      <div className={styles.scope} key={`${scope.vertical}:${index}`}>
        <h4>{label} · specialization</h4><p className={styles.muted}>Leave the allowed industry list empty for a general program. Adding an industry here narrows this route to matching businesses. Prohibited industries always take priority.</p>
        <IndustryPicker codes={scope.naics_prefixes} label={`${label} allowed industries`} onChange={(codes) => update({ naics_prefixes: codes })} call={call} />
        {scope.industry_keys.length ? <div className={styles.chips}>{scope.industry_keys.map((key) => <button type="button" key={key} aria-label={`Remove allowed industry ${INDUSTRY_LABELS[key] || key}`} onClick={() => update({ industry_keys: scope.industry_keys.filter((value) => value !== key) })}><span>{INDUSTRY_LABELS[key] || key.replaceAll("_", " ")}</span><Icon name="x" size={14} /></button>)}</div> : null}
        {scope.vertical === "main_street" ? <Field label="Only when the client needs"><div className={styles.checks}>{PURPOSES.map(([key, text]) => <label key={key}><input type="checkbox" checked={scope.intent_keys.includes(key)} onChange={(event) => update({ intent_keys: toggle(scope.intent_keys, key, event.target.checked) })} />{text}</label>)}</div><p className={styles.muted}>Leave all unchecked to allow every funding need.</p></Field> : null}
        <Field label="Required business circumstances"><div className={styles.checks}>{FACTS.map(([key, text]) => <label key={key}><input type="checkbox" checked={scope.required_fact_keys.includes(key)} onChange={(event) => update({ required_fact_keys: toggle(scope.required_fact_keys, key, event.target.checked) })} />{text}</label>)}</div><p className={styles.muted}>Checked means the circumstance must be present—not prohibited. Leave all unchecked when the program has no such restriction. To prohibit MCA balances, use “No outstanding MCA” under eligibility checks.</p></Field>
        <details className={styles.details}><summary>Technical references for this route</summary><div className={styles.stack}><p className={styles.muted}>Existing identifiers are preserved. Separate multiple entries with commas. These references are optional implementation settings; program requirements are edited in the next section.</p><div className="fldgrid two">
          <Field label="Route reference"><Input aria-label={`${label} route reference`} value={scope.scope_key} onChange={(event) => update({ scope_key: event.target.value })} /></Field>
          <Field label="Intake variants"><ListInput label={`${label} intake variants`} values={scope.intake_variants} onChange={(values) => update({ intake_variants: values })} /></Field>
          <Field label="Funding intent references"><ListInput label={`${label} funding intent references`} values={scope.intent_keys} onChange={(values) => update({ intent_keys: values })} /></Field>
          <Field label="Allowed industry references"><ListInput label={`${label} allowed industry references`} values={scope.industry_keys} onChange={(values) => update({ industry_keys: values })} /></Field>
          <Field label="Allowed NAICS prefixes"><ListInput label={`${label} allowed NAICS prefixes`} values={scope.naics_prefixes} onChange={(values) => update({ naics_prefixes: values })} /></Field>
          <Field label="Business circumstance references"><ListInput label={`${label} business circumstance references`} values={scope.required_fact_keys} onChange={(values) => update({ required_fact_keys: values })} /></Field>
        </div></div></details>
      </div>
    </div></details>
  </div>;
}
