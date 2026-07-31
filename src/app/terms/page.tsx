"use client";

import { useSearchParams } from "next/navigation";
import { LegalDocumentView } from "@/components/LegalDocumentView";
import { TERMS_AND_CONDITIONS, TERMS_AND_CONDITIONS_ES } from "@/lib/legal";

export default function TermsPage() {
  const params = useSearchParams();
  const lang = params.get("lang") === "es" ? "es" : "en";
  return (
    <LegalDocumentView
      doc={lang === "es" ? TERMS_AND_CONDITIONS_ES : TERMS_AND_CONDITIONS}
      peerHref={`/disclosures${lang === "es" ? "?lang=es" : ""}`}
      peerLabel={lang === "es" ? "Leer la Divulgación de Financiamiento / IA / Comunicaciones" : "Read the Funding / AI / Communications Disclosure"}
      language={lang}
    />
  );
}
