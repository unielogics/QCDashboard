import type { FinancialCitationStatus, FinancialFactCitation } from "@/lib/capitalReadiness";

/** A source action requires the server's verified reference and exact file version. */
export function isVerifiedFinancialCitation(value: unknown): value is FinancialFactCitation {
  if (!value || typeof value !== "object") return false;
  const citation = value as Partial<FinancialFactCitation>;
  return citation.verified === true && (!citation.status || citation.status === "verified")
    && typeof citation.file_id === "string" && Boolean(citation.file_id.trim())
    && typeof citation.page === "number" && Number.isInteger(citation.page) && citation.page > 0 && citation.page <= 10000
    && typeof citation.quote === "string" && Boolean(citation.quote.trim())
    && typeof citation.field === "string" && Boolean(citation.field.trim())
    && typeof citation.line_label === "string" && Boolean(citation.line_label.trim())
    && (typeof citation.value === "string" || (typeof citation.value === "number" && Number.isFinite(citation.value)))
    && String(citation.value).trim() !== ""
    && Number.isFinite(Number(citation.value))
    && typeof citation.content_hash === "string" && /^[a-f0-9]{64}$/i.test(citation.content_hash)
    && typeof citation.analysis_id === "string" && Boolean(citation.analysis_id.trim());
}

export function financialCitationReason(reason?: string | null, locale: "en" | "es" = "en"): string {
  if (!reason) return "";
  if (!reason.includes("_")) return reason;
  const labels: Record<string, [string, string]> = {
    legacy_analysis_requires_explicit_reanalysis: ["Run the analysis again to verify the source reference.", "Vuelva a ejecutar el análisis para verificar la referencia de origen."],
    citation_not_provided: ["The extracted figure has no verified quotation yet.", "La cifra extraída aún no tiene una cita verificada."],
    source_not_searchable: ["A searchable copy is needed to verify the quotation.", "Se necesita una copia con texto para verificar la cita."],
    page_not_searchable: ["The cited page could not be quoted reliably.", "No se pudo citar la página de origen con certeza."],
    page_invalid: ["The cited page needs confirmation.", "La página citada requiere confirmación."],
    source_hash_mismatch: ["The source file changed; review its current version.", "El archivo de origen cambió; revise su versión actual."],
    source_hash_or_identity_mismatch: ["The source file or analysis changed; review the current version.", "El archivo o análisis de origen cambió; revise la versión actual."],
    citation_no_longer_current: ["The reference needs to be checked against the current source.", "La referencia debe comprobarse con el archivo actual."],
    quote_not_found_on_page: ["The quoted text could not be verified on the cited page.", "No se pudo verificar el texto citado en la página indicada."],
    value_not_in_quote: ["The quotation does not verify the extracted amount.", "La cita no verifica el importe extraído."],
    extracted_value_mismatch: ["The quotation and extracted amount need reconciliation.", "La cita y el importe extraído requieren conciliación."],
    measure_label_mismatch: ["The figure's accounting label needs confirmation.", "La etiqueta contable de la cifra requiere confirmación."],
    tax_line_not_found_with_label: ["The tax line reference could not be verified.", "No se pudo verificar la línea de la declaración."],
    tax_form_not_found_on_page: ["The tax form reference could not be verified.", "No se pudo verificar el formulario tributario."],
  };
  return Array.from(new Set(reason.split(/[;,\s]+/).map((key) => labels[key]?.[locale === "es" ? 1 : 0]).filter(Boolean))).join(" ");
}

export function financialCitationStatus(citations: unknown, advertised?: FinancialCitationStatus | null): FinancialCitationStatus {
  if (!Array.isArray(citations) || !citations.length) return "unverified";
  const verifiedCount = citations.filter(isVerifiedFinancialCitation).length;
  if (!verifiedCount) return "unverified";
  return advertised === "verified" && verifiedCount === citations.length ? "verified" : "partial";
}
