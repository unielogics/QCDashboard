"use client";

import { LegalDocumentView } from "@/components/LegalDocumentView";
import { TERMS_AND_CONDITIONS } from "@/lib/legal";

export default function TermsPage() {
  return (
    <LegalDocumentView
      doc={TERMS_AND_CONDITIONS}
      peerHref="/privacy"
      peerLabel="Read the Privacy Policy"
    />
  );
}
