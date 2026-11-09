import { Callout, CellChip } from "@/components/ds";
import { evidenceIdentityWarningLabel } from "@/lib/evidenceDecision";
import { DocumentIdentityReview } from "./DocumentIdentityReview";

type Props = { reasonCode?: string | null; decision?: string | null; locale?: "en" | "es"; detail?: boolean; review?: Parameters<typeof DocumentIdentityReview>[0] };

/** Acceptance and identity review are separate: the green acceptance stays. */
export function EvidenceIdentityWarning({ reasonCode, decision, locale = "en", detail = false, review }: Props) {
  const label = evidenceIdentityWarningLabel(reasonCode, locale);
  const reviewed = review?.initialRecord?.status;
  const identityExcluded = review?.initialRecord?.allows_financial_use === false;
  const warning = !!label && decision === "accepted" && reviewed !== "accepted" && reviewed !== "matched" && reviewed !== "denied";
  if (!warning && !review) return null;
  if (!review && !detail) return <CellChip tone="warn">{label}</CellChip>;
  return <div className="grid g8">{warning ? detail ? <Callout tone="warn"><div className="grid g4"><b>{label}</b><span>{identityExcluded ? locale === "es" ? "La decisión del checklist y la vinculación al negocio son distintas. Revise el nombre original antes de usar este documento en el análisis financiero de esta solicitud." : "The checklist decision and business association are separate. Review the original business name before using this document in this application's financial analysis." : locale === "es"
    ? "El documento fue aceptado y sus cifras siguen disponibles para análisis provisional. Revise la vinculación al negocio; no combine resultados de negocios distintos."
    : "The document is accepted and its figures remain available for provisional analysis. Review its business association; do not combine financial results from different businesses."}</span></div></Callout> : <CellChip tone="warn">{label}</CellChip> : null}{review ? <DocumentIdentityReview key={`${review.profileId}:${review.fileId}`} {...review} /> : null}</div>;
}
