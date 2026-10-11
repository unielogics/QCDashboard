import React from "react";
import type { FinancialCitationStatus, FinancialFactCitation, FinancialSourcePreviewAction } from "@/lib/capitalReadiness";
import { financialCitationReason, financialCitationStatus, isVerifiedFinancialCitation } from "@/lib/financialCitations";

export function FinancialFactCitations({ citations, status, reason, locale = "en", onPreviewSource }: {
  citations?: FinancialFactCitation[] | null;
  status?: FinancialCitationStatus | null;
  reason?: string | null;
  locale?: "en" | "es";
  onPreviewSource?: FinancialSourcePreviewAction;
}) {
  const es = locale === "es";
  const state = financialCitationStatus(citations, status);
  const verified = Array.isArray(citations) ? citations.filter(isVerifiedFinancialCitation) : [];
  const detail = financialCitationReason(reason, locale);
  return <details className="capital-readiness-sources">
    <summary>{es ? "Referencia de origen" : "Source reference"} · {state === "verified" ? es ? "verificada" : "verified" : state === "partial" ? es ? "parcial" : "partial" : es ? "requiere revisión" : "needs review"}</summary>
    <div>
      {state !== "verified" ? <p>{es ? "La referencia de origen requiere revisión. Las cifras siguen disponibles." : "Source reference needs review. The figures remain available."}{detail ? ` ${detail}` : ""}</p> : null}
      {verified.map((citation, index) => <div key={`${citation.file_id}:${citation.page}:${citation.field}:${index}`} style={{ alignItems: "stretch", flexDirection: "column", gap: 6 }}>
        <b>{citation.file_name || (es ? "Documento de origen" : "Source document")} · {es ? "página" : "page"} {citation.page}</b>
        <small>{[citation.tax_form, citation.tax_line ? `${es ? "línea" : "line"} ${citation.tax_line}` : null, citation.line_label].filter(Boolean).join(" · ")} · {String(citation.value)}</small>
        <blockquote style={{ margin: 0, overflowWrap: "anywhere", fontSize: 12, lineHeight: 1.45 }}>{citation.quote}</blockquote>
        {onPreviewSource ? <button type="button" className="btn sm" style={{ alignSelf: "flex-start", minHeight: 44 }} onClick={() => onPreviewSource(citation.file_id, citation.page, citation.content_hash)}>{es ? "Abrir origen" : "Open source"} · {es ? "página" : "page"} {citation.page}</button> : null}
      </div>)}
    </div>
  </details>;
}
