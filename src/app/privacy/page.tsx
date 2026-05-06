"use client";

import { LegalDocumentView } from "@/components/LegalDocumentView";
import { PRIVACY_POLICY } from "@/lib/legal";

export default function PrivacyPage() {
  return (
    <LegalDocumentView
      doc={PRIVACY_POLICY}
      peerHref="/terms"
      peerLabel="Read the Terms & Conditions"
    />
  );
}
