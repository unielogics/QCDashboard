"use client";

import { LegalDocumentView } from "@/components/LegalDocumentView";
import { FUNDING_AI_DISCLOSURE } from "@/lib/legal";

export default function DisclosuresPage() {
  return (
    <LegalDocumentView
      doc={FUNDING_AI_DISCLOSURE}
      peerHref="/privacy"
      peerLabel="Read the Privacy Policy"
    />
  );
}
