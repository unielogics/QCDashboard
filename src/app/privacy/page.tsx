"use client";

import { useSearchParams } from "next/navigation";
import { LegalDocumentView } from "@/components/LegalDocumentView";
import { PRIVACY_POLICY, PRIVACY_POLICY_ES } from "@/lib/legal";

export default function PrivacyPage() {
  const params = useSearchParams();
  const lang = params.get("lang") === "es" ? "es" : "en";
  return (
    <LegalDocumentView
      doc={lang === "es" ? PRIVACY_POLICY_ES : PRIVACY_POLICY}
      peerHref={`/terms${lang === "es" ? "?lang=es" : ""}`}
      peerLabel={lang === "es" ? "Leer los Términos y Condiciones" : "Read the Terms & Conditions"}
      language={lang}
    />
  );
}
