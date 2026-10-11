import { Callout, CellChip } from "@/components/ds";
import { evidenceIdentityWarningLabel } from "@/lib/evidenceDecision";

type Props = { reasonCode?: string | null; decision?: string | null; locale?: "en" | "es"; detail?: boolean };

/** Acceptance and identity review are separate: the green acceptance stays. */
export function EvidenceIdentityWarning({ reasonCode, decision, locale = "en", detail = false }: Props) {
  const label = evidenceIdentityWarningLabel(reasonCode, locale);
  if (!label || decision !== "accepted") return null;
  if (!detail) return <CellChip tone="warn">{label}</CellChip>;
  return <Callout tone="warn"><div className="grid g4"><b>{label}</b><span>{locale === "es"
    ? "El documento fue aceptado y sus cifras siguen disponibles para análisis provisional. Revise la vinculación al negocio; no combine resultados de negocios distintos."
    : "The document is accepted and its figures remain available for provisional analysis. Review its business association; do not combine financial results from different businesses."}</span></div></Callout>;
}
