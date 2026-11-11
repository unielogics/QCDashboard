import { documentListing } from "./investorDocumentCockpit";
import type { MarketplacePpm, PpmVersion } from "../../src/lib/marketplacePpm";

export const PPM_LISTING_ID = "93000000-0000-0000-0000-000000000001";
export const OTHER_PPM_LISTING_ID = "93000000-0000-0000-0000-000000000002";
export const PPM_REF = "CP-PPM-QA";

// This fixture contains fictional offering facts only; no client documents.
export function ppmListing(other = false) {
  return { ...documentListing(false), id: other ? OTHER_PPM_LISTING_ID : PPM_LISTING_ID,
    ref: other ? "CP-PPM-OTHER-QA" : PPM_REF, name: other ? "Other synthetic PPM offering" : "Synthetic PPM offering",
    valuation_source: "Saved synthetic appraisal", title_status: "Saved synthetic title review" };
}

export const ppmLegalFields = [
  ["issuer_legal_name", "Issuer legal name"], ["offering_structure", "Offering and investor interest structure"],
  ["offering_exemption", "Offering exemption and restrictions"], ["jurisdiction", "Governing law and offering jurisdictions"],
  ["investor_eligibility", "Investor eligibility requirements"], ["subscription_process", "Subscription, acceptance and funding process"],
  ["transfer_restrictions", "Transfer and liquidity restrictions"], ["conflicts_of_interest", "Conflicts of interest and compensation disclosures"],
].map(([key, label]) => ({ key, label, required: true }));
export const ppmNarrativeFields = [{ key: "overview", label: "Business and offering overview" }, { key: "risk_factors", label: "Additional offering-specific risk factors" }];
export const completeLegal = () => Object.fromEntries(ppmLegalFields.map(field => [field.key, `Synthetic staff confirmation: ${field.label}`]));

export function ppmVersion(version: number, fingerprint = "a".repeat(64), legal: Record<string, string> = { issuer_legal_name: "Example Lending LLC" }, narrative: Record<string, string> = {}, amount = 175000): PpmVersion {
  return { document_id: `synthetic-ppm-v${version}`, version, source: "generated_ppm", status: "draft", source_fingerprint: fingerprint,
    stale: false, created_at: "2026-11-11T14:00:00Z", reviewed_at: null, legal_inputs: { ...legal }, narrative_sections: { ...narrative },
    ai_sections: { overview: "This offering relates to financing an operating business." }, document: {
      title: "Private placement memorandum", listing_ref: PPM_REF, issuer: legal.issuer_legal_name || "Issuer not confirmed", source_fingerprint: fingerprint, missing: [], warnings: ["Staff review is required."],
      sections: [{ key: "terms", title: "Saved offering and financing terms", paragraphs: [], facts: [
        { label: "Loan principal", value: `${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD` },
        { label: "Expected funding", value: "2027-01-15" }, { label: "Maturity", value: "2028-01-15" },
      ] }, { key: "risk_factors", title: "Risk factors", paragraphs: ["Invested capital and expected payments are at risk."], facts: [] }],
    } };
}

export function ppmState(current: PpmVersion | null = null, history: PpmVersion[] = []): MarketplacePpm {
  const approved = current?.status === "approved" ? current : history.find(row => row.status === "approved") ?? null;
  return { managed: Boolean(current), auto_refresh: Boolean(current), status: current?.stale ? "stale" : current?.status === "approved" ? "approved" : current ? "draft" : "not_started", generation_status: current ? "ai_draft" : "not_generated", source_fingerprint: current?.source_fingerprint ?? "a".repeat(64),
    current_draft: current?.status === "draft" ? current : null, current_approved: approved, history: current ? [current, ...history.filter(row => row.document_id !== current.document_id)] : history,
    missing: ppmLegalFields.filter(field => !current?.legal_inputs[field.key]?.trim()).map(field => ({ ...field, section: "legal" as const })),
    warnings: ["AI drafting assists staff review; it does not establish legal compliance or approve an offering."], legal_fields: ppmLegalFields, narrative_fields: ppmNarrativeFields };
}
