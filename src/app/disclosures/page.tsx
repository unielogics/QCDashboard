"use client";

import { useSearchParams } from "next/navigation";
import { LegalDocumentView } from "@/components/LegalDocumentView";
import { FUNDING_AI_DISCLOSURE, FUNDING_AI_DISCLOSURE_ES } from "@/lib/legal";

export default function DisclosuresPage() {
  const params = useSearchParams();
  const lang = params.get("lang") === "es" ? "es" : "en";
  return (
    <LegalDocumentView
      doc={lang === "es" ? FUNDING_AI_DISCLOSURE_ES : FUNDING_AI_DISCLOSURE}
      peerHref={`/privacy${lang === "es" ? "?lang=es" : ""}`}
      peerLabel={lang === "es" ? "Leer la Política de Privacidad" : "Read the Privacy Policy"}
      language={lang}
    />
  );
}
