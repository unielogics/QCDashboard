"use client";

import type { CSSProperties } from "react";
import { BUSINESS_STATES, DESCRIPTION_MAX, type Lang, type NewBusinessProfile } from "@/lib/businessProfile";
import { industryOptions } from "@/lib/intakeIndustries";
import { onboardingCopy } from "@/lib/onboardingCopy";

/** Same required business answers in public, staff, broker, and loan intakes.
 * Property addresses remain separate from this principal business location. */
export function BusinessProfileFields({ value, onChange, language = "en", includeWebsiteDescription = true, includeIndustry = true, disabled = false }: {
  value: NewBusinessProfile;
  onChange: (patch: Partial<NewBusinessProfile>) => void;
  language?: Lang;
  includeWebsiteDescription?: boolean;
  includeIndustry?: boolean;
  disabled?: boolean;
}) {
  const es = language === "es";
  const copy = onboardingCopy(language);
  const label: CSSProperties = { display: "grid", gap: 6, minWidth: 0, fontSize: 13, fontWeight: 600 };
  const input: CSSProperties = { width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid var(--line, #cbd5e1)", borderRadius: 8, background: "var(--surface, #fff)", color: "var(--ink, #142239)", padding: "11px 12px", font: "inherit", fontWeight: 400 };
  const hint: CSSProperties = { margin: 0, fontSize: 12, lineHeight: 1.5, fontWeight: 400, color: "var(--muted, #64748b)" };
  return <fieldset disabled={disabled} style={{ border: 0, margin: 0, padding: 0, display: "grid", gap: 14, minWidth: 0 }}>
    <legend style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{es ? "Perfil del negocio" : "Business profile"}</legend>
    <label style={label}>{es ? "Teléfono del negocio" : "Business phone"} *<input style={input} type="tel" required autoComplete="section-business tel" value={value.business_phone ?? ""} onChange={e => onChange({business_phone: e.target.value})} /></label>
    <label style={label}>{es ? "Número de empleados" : "Number of employees"} *<input style={input} type="number" required min={0} max={2147483647} step={1} value={value.employee_count ?? ""} onChange={event => onChange({employee_count: event.target.value})} /></label>
    <label style={label}>{es ? "Dirección del negocio" : "Business street address"} *
      <input style={input} required value={value.business_street} maxLength={255} autoComplete="section-business address-line1" onChange={(e) => onChange({ business_street: e.target.value })} />
    </label>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: 12 }}>
      <label style={label}>{es ? "Ciudad" : "City"} *<input style={input} required value={value.business_city} maxLength={120} autoComplete="section-business address-level2" onChange={(e) => onChange({ business_city: e.target.value })} /></label>
      <label style={label}>{es ? "Estado" : "State"} *<select style={input} required value={value.business_state} autoComplete="section-business address-level1" onChange={(e) => onChange({ business_state: e.target.value })}><option value="">{es ? "Seleccione estado" : "Select state"}</option>{BUSINESS_STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}</select></label>
      <label style={label}>{es ? "Código postal" : "ZIP code"} *<input style={input} required value={value.business_zip} maxLength={10} inputMode="numeric" autoComplete="section-business postal-code" placeholder="33101" onChange={(e) => onChange({ business_zip: e.target.value })} /></label>
    </div>
    {includeIndustry ? <label style={label}>{es ? "Industria del negocio" : "Business industry"} *<select style={input} required value={value.industry} onChange={(e) => onChange({ industry: e.target.value })}><option value="">{es ? "Seleccione industria" : "Select industry"}</option>{industryOptions(language).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><span style={hint}>{es ? "Su descripción nos ayuda a identificar el código NAICS específico." : "Your description helps identify the specific NAICS classification."}</span></label> : null}
    {includeWebsiteDescription ? <>
      <label style={label}>{copy.fieldWebsite} *<input style={input} required value={value.business_website} maxLength={255} inputMode="url" autoComplete="section-business url" placeholder={copy.fieldWebsitePlaceholder} onChange={(e) => onChange({ business_website: e.target.value })} /><span style={hint}>{copy.fieldWebsiteHint}</span></label>
      <label style={label}>{copy.fieldDescription} *<textarea style={{ ...input, resize: "vertical" }} required rows={3} value={value.business_description} maxLength={DESCRIPTION_MAX} placeholder={copy.fieldDescriptionPlaceholder} onChange={(e) => onChange({ business_description: e.target.value })} /><span style={hint}>{copy.fieldDescriptionHint}</span></label>
    </> : null}
  </fieldset>;
}
