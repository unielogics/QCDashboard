"use client";

import { useEffect, useState } from "react";
import { Callout, Field, Input, Select } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import type { FundingProgramScope } from "@/lib/fundingPrograms";
import type { TaxonomyEntry, TaxonomySearch } from "@/lib/applicationProfile";
import styles from "./FundingProgramEditor.module.css";

const PURPOSES = [["working_capital", "Working capital"], ["equipment", "Equipment or vehicle"], ["refinance_debt", "Refinance debt"], ["not_sure", "Needs guidance"], ["merchant_services", "Card processing"], ["business_systems", "Business systems"]];
const FACTS = [["declared_collateral", "Real estate collateral"], ["mca_obligations_present", "Existing cash advances"], ["floorplan_inventory_present", "Floorplan / inventory"], ["equipment_financing_intent", "Equipment financing need"]];
const INDUSTRY_LABELS: Record<string, string> = { trucking_logistics: "Trucking and logistics", grocery_commodities: "Grocery and commodities", restaurant_food_service: "Restaurants and food service", manufacturing: "Manufacturing", automotive: "Automotive", auto_dealer: "Auto dealerships", car_dealer: "Auto dealerships" };
const list = (value: string) => [...new Set(value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean))];

export function industryPrefixes(code: string | null | undefined): string[] {
  if (!code) return [];
  if (/^\d{2,6}$/.test(code)) return [code];
  const range = /^(\d{2})-(\d{2})$/.exec(code);
  if (!range || Number(range[2]) < Number(range[1]) || Number(range[2]) - Number(range[1]) > 10) return [];
  return Array.from({ length: Number(range[2]) - Number(range[1]) + 1 }, (_, index) => String(Number(range[1]) + index));
}

type Props = { scope: FundingProgramScope; label: string; onChange: (patch: Partial<FundingProgramScope>) => void; call: <T>(path: string) => Promise<T> };

export function FundingProgramScopeEditor({ scope, label, onChange, call }: Props) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("6");
  const [items, setItems] = useState<TaxonomyEntry[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const codeKey = scope.naics_prefixes.join(",");
  useEffect(() => {
    let active = true;
    const codes = codeKey.split(",").filter(Boolean);
    if (!codes.length) return;
    void Promise.all(codes.map(async (code) => {
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
      void call<TaxonomySearch>(`/application-profiles/taxonomy/search?level=${level}&q=${encodeURIComponent(query.trim())}&page_size=30`).then((result) => { if (active) setItems(result.items.filter((item) => industryPrefixes(item.code).length > 0)); }).catch(() => { if (active) setError("Industry search is temporarily unavailable. Saved industries are unchanged."); }).finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [call, level, query]);
  function toggle(values: string[], key: string, enabled: boolean) { return enabled ? [...new Set([...values, key])] : values.filter((value) => value !== key); }
  return <div className={styles.scope}>
    <h4>{label}</h4>
    <Field label="Eligible industries"><div className={styles.stack}>
      <p className={styles.muted}>{scope.naics_prefixes.length || scope.industry_keys.length ? "The business may match any selected industry or saved industry group." : "All industries in this workspace. Add an industry only when this program has an industry restriction."}</p>
      <div className={styles.chips}>{scope.naics_prefixes.map((code) => <button type="button" key={code} title={`NAICS ${code} — remove restriction`} onClick={() => onChange({ naics_prefixes: scope.naics_prefixes.filter((value) => value !== code) })}><span>{labels[code] || `Industry group ${code}`}<small className={styles.muted}> · {code}</small></span><Icon name="x" size={14} /></button>)}{scope.industry_keys.map((key) => <button type="button" key={`legacy:${key}`} title="Remove saved industry group" onClick={() => onChange({ industry_keys: scope.industry_keys.filter((value) => value !== key) })}><span>{INDUSTRY_LABELS[key] || key.replaceAll("_", " ")}</span><Icon name="x" size={14} /></button>)}</div>
      <div className={styles.search}><Select aria-label={`${label} industry search level`} value={level} onChange={(event) => setLevel(event.target.value)}><option value="6">Specific activity</option><option value="3">Industry group</option><option value="2">Broad sector</option></Select><Input aria-label={`Search ${label} industries`} placeholder="Search an industry name or code, e.g. auto dealer" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      {loading ? <p role="status" className={styles.muted}>Searching industries…</p> : error ? <Callout tone="warn">{error}</Callout> : query.trim().length >= 2 ? items.length ? <div className={styles.results}>{items.map((item) => { const codes = industryPrefixes(item.code); const selected = codes.every((code) => scope.naics_prefixes.includes(code)); return <button key={item.id} type="button" disabled={selected || new Set([...scope.naics_prefixes, ...codes]).size > 30} onClick={() => { onChange({ naics_prefixes: [...new Set([...scope.naics_prefixes, ...codes])] }); setLabels((previous) => ({ ...previous, ...Object.fromEntries(codes.map((code) => [code, item.label])) })); setQuery(""); }}><span>{item.label}<small>{item.code}{item.path?.length ? ` · ${item.path.slice(0, -1).map((parent) => parent.label).join(" › ")}` : ""}</small></span><span>{selected ? "Added" : "Add"}</span></button>; })}</div> : <p className={styles.muted}>No matching industries. Try a broader term or another search level.</p> : null}
    </div></Field>
    {scope.vertical === "main_street" ? <details className={styles.details}><summary>Limit to specific funding needs {scope.intent_keys.length ? `(${scope.intent_keys.length})` : "(all needs allowed)"}</summary><div className={styles.checks}>{PURPOSES.map(([key, text]) => <label key={key}><input type="checkbox" checked={scope.intent_keys.includes(key)} onChange={(event) => onChange({ intent_keys: toggle(scope.intent_keys, key, event.target.checked) })} />{text}</label>)}</div></details> : null}
    <details className={styles.details}><summary>Required business circumstances {scope.required_fact_keys.length ? `(${scope.required_fact_keys.length})` : "(none)"}</summary><div className={styles.stack}><p className={styles.muted}>Only show this program when the file confirms all selected circumstances.</p><div className={styles.checks}>{FACTS.map(([key, text]) => <label key={key}><input type="checkbox" checked={scope.required_fact_keys.includes(key)} onChange={(event) => onChange({ required_fact_keys: toggle(scope.required_fact_keys, key, event.target.checked) })} />{text}</label>)}</div></div></details>
    <details className={styles.details}><summary>Advanced routing settings{scope.intake_variants.length || scope.intent_keys.some((key) => !PURPOSES.some(([value]) => value === key)) || scope.required_fact_keys.some((key) => !FACTS.some(([value]) => value === key)) ? " · saved restrictions" : ""}</summary><div className={styles.stack}><p className={styles.muted}>These saved routing identifiers are preserved. Most programs only need workspace and industry choices above.</p><div className="fldgrid two"><Field label="Routing reference"><Input value={scope.scope_key} onChange={(event) => onChange({ scope_key: event.target.value })} /></Field><Field label="Allowed intake variants"><Input value={scope.intake_variants.join(", ")} onChange={(event) => onChange({ intake_variants: list(event.target.value) })} /></Field><Field label="Funding intent identifiers"><Input value={scope.intent_keys.join(", ")} onChange={(event) => onChange({ intent_keys: list(event.target.value) })} /></Field><Field label="Industry identifiers"><Input value={scope.industry_keys.join(", ")} onChange={(event) => onChange({ industry_keys: list(event.target.value) })} /></Field><Field label="NAICS code restrictions"><Input value={scope.naics_prefixes.join(", ")} onChange={(event) => onChange({ naics_prefixes: list(event.target.value) })} /></Field><Field label="Required circumstance identifiers"><Input value={scope.required_fact_keys.join(", ")} onChange={(event) => onChange({ required_fact_keys: list(event.target.value) })} /></Field></div></div></details>
  </div>;
}
