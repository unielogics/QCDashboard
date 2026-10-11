import { isVerifiedFinancialCitation } from "@/lib/financialCitations";
import type { CapitalReadinessProgramOpportunity } from "@/lib/capitalReadiness";

type Rule = NonNullable<CapitalReadinessProgramOpportunity["rule_results"]>[number];
type Locale = "en" | "es";
const FIELDS: Record<string, [string, string]> = {
  vertical: ["Business category", "Categoría de negocio"], intake_variant: ["Application type", "Tipo de solicitud"],
  intent: ["Funding intent", "Objetivo de financiamiento"], intent_kind: ["Funding intent", "Objetivo de financiamiento"],
  funding_category: ["Funding category", "Categoría de financiamiento"], entity_type: ["Entity type", "Tipo de entidad"],
  industry: ["Industry", "Industria"], subindustry: ["Industry specialty", "Especialidad de industria"], industry_key: ["Industry", "Industria"],
  naics_code: ["NAICS code", "Código NAICS"], loan_purpose: ["Loan purpose", "Propósito del préstamo"],
  requested_amount: ["Requested amount", "Importe solicitado"], use_of_funds_total: ["Use of funds total", "Total del uso de fondos"],
  real_estate_equipment_amount: ["Real estate and equipment allocation", "Asignación a inmuebles y equipo"], real_estate_equipment_pct: ["Real estate and equipment share", "Proporción de inmuebles y equipo"],
  use_of_funds_complete: ["Use of funds completion", "Uso de fondos completo"], business_age_years: ["Years in business", "Años en operación"],
  revenue: ["Revenue", "Ingresos"], annual_revenue: ["Annual revenue", "Ingresos anuales"],
  gross_margin_pct: ["Gross margin", "Margen bruto"], net_margin_pct: ["Net margin", "Margen neto"],
  annualized_deposits: ["Annualized deposits", "Depósitos anualizados"], deposits: ["Deposits", "Depósitos"],
  bank_statement_months: ["Bank statement months", "Meses de estados bancarios"], tax_return_years: ["Tax return years", "Años de declaraciones"],
  nsf_or_overdraft_count: ["Returned items and overdrafts", "Devoluciones y sobregiros"],
  credit_score: ["Credit score", "Puntaje crediticio"], estimated_credit_score: ["Estimated credit score", "Puntaje crediticio estimado"],
  dscr: ["DSCR", "DSCR"], cash_flow: ["Cash flow", "Flujo de caja"], debt_burden: ["Debt burden", "Carga de deuda"], liquid_assets: ["Liquid assets", "Activos líquidos"],
  tax_returns_available: ["Tax return evidence", "Evidencia de declaraciones"], bank_statements_available: ["Bank statement evidence", "Evidencia de estados bancarios"],
  evidence_count: ["Evidence files", "Archivos de evidencia"], evidence_available: ["Required evidence", "Evidencia requerida"],
  declared_collateral: ["Declared collateral", "Garantía declarada"], mca_obligations_present: ["Merchant cash advances", "Anticipos de efectivo"],
  floorplan_inventory_present: ["Floorplan and inventory", "Línea de inventario e inventario"], equipment_financing_intent: ["Equipment financing intent", "Objetivo de financiar equipo"],
  tax_return: ["Business tax return", "Declaración de impuestos empresarial"], bank_statement: ["Bank statement", "Estado bancario"],
  current_p_and_l: ["Profit and loss statement", "Estado de resultados"], balance_sheet: ["Balance sheet", "Balance general"], debt_schedule: ["Business debt schedule", "Relación de deudas empresariales"],
};

export function programCriterionLabel(field: string, locale: Locale): string {
  return FIELDS[field]?.[locale === "es" ? 1 : 0] || (locale === "es" ? "Criterio del programa" : field.replaceAll("_", " "));
}

export function programObservedValue(value: unknown, field: string, locale: Locale): string {
  if (value === null || value === undefined || value === "") return locale === "es" ? "Por confirmar" : "Unknown";
  if (typeof value === "boolean") return value ? locale === "es" ? "Sí" : "Yes" : locale === "es" ? "No" : "No";
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => programObservedValue(item, field, locale)).join(", ");
  if (typeof value === "object") return locale === "es" ? "Requiere revisión" : "Needs review";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return locale === "es" ? "Por confirmar" : "Unknown";
    return new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US", { maximumFractionDigits: 3 }).format(value) + (field.endsWith("_pct") ? "%" : field === "dscr" ? "x" : "");
  }
  return FIELDS[String(value)]?.[locale === "es" ? 1 : 0] || String(value).replaceAll("_", " ");
}

export function programRequiredValue(rule: Rule, locale: Locale): string {
  if (rule.operator === "present") return locale === "es" ? "Debe estar presente" : "Must be present";
  const operators: Record<string, string> = { gte: "≥", gt: ">", lte: "≤", lt: "<", eq: "=", in: locale === "es" ? "uno de" : "one of", evidence_available: locale === "es" ? "Documento recibido:" : "Document received:" };
  const required = `${operators[rule.operator] || ""} ${programObservedValue(rule.required, rule.field, locale)}`.trim();
  return rule.negated ? `${locale === "es" ? "No" : "Not"} (${required})` : required;
}

export function programRuleCitations(rule: Rule) {
  return (Array.isArray(rule.source_refs) ? rule.source_refs : []).flatMap((source) => Array.isArray(source?.fact_citations) ? source.fact_citations : []).filter(isVerifiedFinancialCitation);
}

export function programEvidenceGaps(program: CapitalReadinessProgramOpportunity, locale: Locale): string[] {
  const gaps = [...(program.evidence_gaps || []), ...(program.gaps || []), ...(program.verified_gaps || []).filter((gap) => !["verified", "waived", "not_applicable"].includes(gap.status)).map((gap) => gap.label || gap.requirement_key)];
  return Array.from(new Set(gaps.map((gap) => FIELDS[gap]?.[locale === "es" ? 1 : 0] || gap.replaceAll("_", " "))));
}
