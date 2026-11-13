"use client";

import type { ReactNode } from "react";
import { Field, Input, Select } from "@/components/ds";
import { businessProfileFieldProblem, readWebsite } from "@/lib/businessProfile";
import { MAIN_STREET_INDUSTRIES } from "@/lib/intakeIndustries";

export type BusinessContactValues = {
  business_phone?: string | null;
  employee_count?: number | null;
  business_street?: string | null;
  business_city?: string | null;
  business_state?: string | null;
  business_zip?: string | null;
  industry?: string | null;
  business_website?: string | null;
  business_website_none?: boolean;
  business_description?: string | null;
};

export type BusinessContactDraft = {
  business_street: string;
  business_city: string;
  business_state: string;
  business_zip: string;
  industry: string;
};

const clean = (value: string | null | undefined) => (value || "").trim();

export function businessContactDraft(values: BusinessContactValues): BusinessContactDraft {
  return {
    business_street: values.business_street || "",
    business_city: values.business_city || "",
    business_state: values.business_state || "",
    business_zip: values.business_zip || "",
    industry: values.industry || "",
  };
}

export function businessContactChanges(
  draft: BusinessContactDraft & { business_website: string; business_description: string },
  original: BusinessContactValues,
): { changes: Partial<Record<keyof typeof draft, string>>; problem: string | null } {
  const initial = {
    ...businessContactDraft(original),
    business_website: original.business_website || (original.business_website_none ? "N/A" : ""),
    business_description: original.business_description || "",
  };
  const fields = {
    business_street: "street", business_city: "city", business_state: "state", business_zip: "zip",
    industry: "industry", business_website: "website", business_description: "description",
  } as const;
  const changes: Partial<Record<keyof typeof draft, string>> = {};
  for (const key of Object.keys(fields) as Array<keyof typeof fields>) {
    const raw = draft[key].trim();
    // A phone/name correction must not turn untouched legacy values into new
    // business-profile assertions or require missing historical answers.
    if (raw === initial[key].trim()) continue;
    const value = key === "business_state" ? raw.toUpperCase() : raw;
    const problem = value ? businessProfileFieldProblem(fields[key], value) : null;
    if (problem) return { changes: {}, problem };
    changes[key] = value;
  }
  return { changes, problem: null };
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="kv"><span className="sub">{label}</span><b style={{ overflowWrap: "anywhere", minWidth: 0 }}>{children}</b></div>;
}

export function BusinessContactDetails({ values }: { values: BusinessContactValues }) {
  const cityState = [clean(values.business_city), [clean(values.business_state), clean(values.business_zip)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const address = [clean(values.business_street), cityState].filter(Boolean).join(", ");
  const website = readWebsite(values.business_website || "");
  const industry = MAIN_STREET_INDUSTRIES.find((option) => option.slug === values.industry)?.label || clean(values.industry);
  return <>
    <Detail label="Business phone">{values.business_phone || "Not provided"}</Detail>
    <Detail label="Number of employees">{values.employee_count ?? "Not provided"}</Detail>
    <Detail label="Business address">{address || "Not provided"}</Detail>
    <Detail label="Declared industry">{industry || "Not provided"}</Detail>
    <Detail label="Website">{website.kind === "site"
      ? <a href={website.website} target="_blank" rel="noopener noreferrer" title="Open the business website in a new tab">{website.website.replace(/^https?:\/\//, "")}</a>
      : website.kind === "none" || values.business_website_none ? "None (N/A)" : clean(values.business_website) || "Not provided"}</Detail>
    {clean(values.business_description) ? <details><summary className="sub">About the business</summary><p style={{ overflowWrap: "anywhere" }}>{values.business_description}</p></details> : null}
  </>;
}

/** Fits into the existing contact drawer's two-column field grid. */
export function BusinessContactFields({ value, onChange }: { value: BusinessContactDraft; onChange: (patch: Partial<BusinessContactDraft>) => void }) {
  const legacyIndustry = value.industry && !MAIN_STREET_INDUSTRIES.some((option) => option.slug === value.industry);
  return <>
    <Field label="Business street address"><Input aria-label="Business street address" autoComplete="section-business street-address" maxLength={255} value={value.business_street} onChange={(event) => onChange({ business_street: event.target.value })} /></Field>
    <Field label="Business city"><Input aria-label="Business city" autoComplete="section-business address-level2" maxLength={120} value={value.business_city} onChange={(event) => onChange({ business_city: event.target.value })} /></Field>
    <Field label="Business state"><Input aria-label="Business state" autoComplete="section-business address-level1" maxLength={2} value={value.business_state} onChange={(event) => onChange({ business_state: event.target.value.toUpperCase() })} placeholder="FL" /></Field>
    <Field label="Business ZIP code"><Input aria-label="Business ZIP code" autoComplete="section-business postal-code" inputMode="numeric" maxLength={10} value={value.business_zip} onChange={(event) => onChange({ business_zip: event.target.value })} placeholder="33101" /></Field>
    <Field label="Declared industry" hint="What the business does. Review its NAICS separately in Classification."><Select aria-label="Declared industry" value={value.industry} onChange={(event) => onChange({ industry: event.target.value })}><option value="">Not provided</option>{legacyIndustry ? <option value={value.industry}>{value.industry} (existing value)</option> : null}{MAIN_STREET_INDUSTRIES.map((option) => <option key={option.slug} value={option.slug}>{option.label}</option>)}</Select></Field>
  </>;
}
